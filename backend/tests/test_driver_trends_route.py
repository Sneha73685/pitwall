"""Integration tests for GET /drivers/{driver_id}/seasons/{season}/pace-trend
(M17, docs/m17-design-review.md).

Against real fixture Parquet data via a dedicated multi-session season
(own fixture, not stretching tests/fixtures.py's single-fixed-session
shape -- same "build a dedicated fixture for a genuinely multi-session
case" precedent test_stints_compare_route.py already established for M15).
"""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_telemetry_repository
from app.main import app
from app.repositories.parquet_repository import ParquetRepository

SEASON = 2024


def _write_session(
    base_dir: Path,
    *,
    session_id: str,
    event_slug: str,
    session_type: str,
    event_name: str,
    round_number: int,
    session_date: str,
    drivers: list[tuple[str, int, str, str]],
    laps_by_driver: dict[str, list[dict[str, object]]],
) -> None:
    session_dir = base_dir / str(SEASON) / event_slug / session_type
    session_dir.mkdir(parents=True)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "season": SEASON,
                "event_name": event_name,
                "round_number": round_number,
                "location": "Testville",
                "country": "Testland",
                "session_type": session_type,
                "session_date": session_date,
            }
        ]
    ).to_parquet(session_dir / "session.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "driver_id": driver_id,
                "driver_number": number,
                "full_name": full_name,
                "team_name": team_name,
            }
            for driver_id, number, full_name, team_name in drivers
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)

    lap_rows = [
        {
            "session_id": session_id,
            "driver_id": driver_id,
            "lap_number": lap["lap_number"],
            "lap_time_seconds": lap["lap_time_seconds"],
            "sector_1_seconds": lap.get("lap_time_seconds"),
            "sector_2_seconds": lap.get("lap_time_seconds"),
            "sector_3_seconds": lap.get("lap_time_seconds"),
            "is_personal_best": False,
            "is_accurate": lap["is_accurate"],
        }
        for driver_id, laps in laps_by_driver.items()
        for lap in laps
    ]
    pd.DataFrame(lap_rows).to_parquet(session_dir / "laps.parquet", index=False)

    pd.DataFrame(
        columns=[
            "session_id",
            "driver_id",
            "lap_number",
            "distance_m",
            "time_seconds",
            "speed_kph",
            "throttle_pct",
            "brake_active",
            "rpm",
            "gear",
            "drs_active",
            "x",
            "y",
            "z",
        ]
    ).to_parquet(session_dir / "telemetry.parquet", index=False)


def _write_season_fixture(base_dir: Path) -> None:
    """Round 1: VER + HAM race, VER has 2 valid laps. Round 1 also has a
    qualifying session (session_type filtering). Round 2: VER + HAM race,
    but VER's laps are all invalid -- roster-present, zero valid laps.
    Round 3: only HAM races -- VER isn't on the roster at all (a real
    mid-season-substitution shape)."""
    valid_laps: dict[str, list[dict[str, object]]] = {
        "VER": [
            {"lap_number": 1, "lap_time_seconds": 90.0, "is_accurate": True},
            {"lap_number": 2, "lap_time_seconds": 91.0, "is_accurate": True},
        ],
        "HAM": [
            {"lap_number": 1, "lap_time_seconds": 92.0, "is_accurate": True},
        ],
    }
    _write_session(
        base_dir,
        session_id="2024_round_1_race",
        event_slug="round_1",
        session_type="race",
        event_name="Round 1 Grand Prix",
        round_number=1,
        session_date="2024-03-02T15:00:00+00:00",
        drivers=[
            ("VER", 1, "Max Verstappen", "Red Bull Racing"),
            ("HAM", 44, "Lewis Hamilton", "Mercedes"),
        ],
        laps_by_driver=valid_laps,
    )
    _write_session(
        base_dir,
        session_id="2024_round_1_qualifying",
        event_slug="round_1",
        session_type="qualifying",
        event_name="Round 1 Grand Prix",
        round_number=1,
        session_date="2024-03-01T18:00:00+00:00",
        drivers=[("VER", 1, "Max Verstappen", "Red Bull Racing")],
        laps_by_driver={"VER": [{"lap_number": 1, "lap_time_seconds": 88.0, "is_accurate": True}]},
    )
    _write_session(
        base_dir,
        session_id="2024_round_2_race",
        event_slug="round_2",
        session_type="race",
        event_name="Round 2 Grand Prix",
        round_number=2,
        session_date="2024-03-09T15:00:00+00:00",
        drivers=[
            ("VER", 1, "Max Verstappen", "Red Bull Racing"),
            ("HAM", 44, "Lewis Hamilton", "Mercedes"),
        ],
        laps_by_driver={
            "VER": [{"lap_number": 1, "lap_time_seconds": None, "is_accurate": False}],
            "HAM": [{"lap_number": 1, "lap_time_seconds": 93.0, "is_accurate": True}],
        },
    )
    _write_session(
        base_dir,
        session_id="2024_round_3_race",
        event_slug="round_3",
        session_type="race",
        event_name="Round 3 Grand Prix",
        round_number=3,
        session_date="2024-03-24T15:00:00+00:00",
        drivers=[("HAM", 44, "Lewis Hamilton", "Mercedes")],  # VER not entered
        laps_by_driver={"HAM": [{"lap_number": 1, "lap_time_seconds": 94.0, "is_accurate": True}]},
    )


@pytest.fixture
def trend_client(tmp_path: Path) -> Iterator[TestClient]:
    _write_season_fixture(tmp_path)
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- Normal successful trend, default filter ---------------------------------


def test_pace_trend_returns_the_full_contract_shape(trend_client: TestClient) -> None:
    response = trend_client.get(f"/drivers/VER/seasons/{SEASON}/pace-trend")

    assert response.status_code == 200
    body = response.json()
    assert body["driver_id"] == "VER"
    assert body["season"] == SEASON
    assert body["session_type"] == "race"


def test_pace_trend_defaults_to_race_session_type(trend_client: TestClient) -> None:
    """Round 1's qualifying session (VER's fastest lap, 88.0s) must not
    appear -- the default filter is race-only."""
    response = trend_client.get(f"/drivers/VER/seasons/{SEASON}/pace-trend")

    session_ids = [p["session_id"] for p in response.json()["points"]]
    assert "2024_round_1_qualifying" not in session_ids


def test_pace_trend_explicit_session_type_filters_to_qualifying(trend_client: TestClient) -> None:
    response = trend_client.get(
        f"/drivers/VER/seasons/{SEASON}/pace-trend", params={"session_type": "qualifying"}
    )

    body = response.json()
    assert body["session_type"] == "qualifying"
    assert [p["session_id"] for p in body["points"]] == ["2024_round_1_qualifying"]


def test_pace_trend_reuses_summarize_driver_pace_fields(trend_client: TestClient) -> None:
    response = trend_client.get(f"/drivers/VER/seasons/{SEASON}/pace-trend")

    round_1 = next(p for p in response.json()["points"] if p["session_id"] == "2024_round_1_race")
    assert round_1["valid_lap_count"] == 2
    assert round_1["best_lap_ms"] == pytest.approx(90000.0)
    assert round_1["median_lap_ms"] == pytest.approx(90500.0)


def test_pace_trend_response_never_includes_full_throttle_pct_or_per_lap_data(
    trend_client: TestClient,
) -> None:
    """Decision (docs/m17-design-review.md §2): the response stays
    intentionally small -- no telemetry-derived field, no per-lap list,
    anywhere in a point."""
    response = trend_client.get(f"/drivers/VER/seasons/{SEASON}/pace-trend")

    for point in response.json()["points"]:
        assert "full_throttle_pct" not in point
        assert "laps" not in point
        assert "lap_times_ms" not in point
        assert "outlier_lap_count" not in point


# --- Ordering -----------------------------------------------------------------


def test_pace_trend_orders_by_session_date_ascending(trend_client: TestClient) -> None:
    response = trend_client.get(f"/drivers/HAM/seasons/{SEASON}/pace-trend")

    session_ids = [p["session_id"] for p in response.json()["points"]]
    assert session_ids == ["2024_round_1_race", "2024_round_2_race", "2024_round_3_race"]


# --- Missing/incomplete session behavior (§5.1) -------------------------------


def test_pace_trend_omits_rounds_the_driver_did_not_compete_in(trend_client: TestClient) -> None:
    """VER isn't on round 3's roster at all -- omitted entirely, not a null point."""
    response = trend_client.get(f"/drivers/VER/seasons/{SEASON}/pace-trend")

    session_ids = [p["session_id"] for p in response.json()["points"]]
    assert "2024_round_3_race" not in session_ids
    assert len(session_ids) == 2  # round 1 and round 2 only


def test_pace_trend_represents_roster_present_zero_laps_as_an_explicit_null_point(
    trend_client: TestClient,
) -> None:
    """VER is entered in round 2 but every lap is invalid -- the round
    still appears, with null pace fields, matching SessionAnalyticsResponse's
    own "0-valid-lap driver still gets a row" convention."""
    response = trend_client.get(f"/drivers/VER/seasons/{SEASON}/pace-trend")

    round_2 = next(p for p in response.json()["points"] if p["session_id"] == "2024_round_2_race")
    assert round_2["valid_lap_count"] == 0
    assert round_2["best_lap_ms"] is None
    assert round_2["median_lap_ms"] is None
    assert round_2["consistency_ms"] is None


# --- Non-404 behavior (§5.2) ---------------------------------------------------


def test_pace_trend_unknown_driver_returns_200_with_empty_points(trend_client: TestClient) -> None:
    response = trend_client.get(f"/drivers/ZZZ/seasons/{SEASON}/pace-trend")

    assert response.status_code == 200
    assert response.json()["points"] == []


def test_pace_trend_unknown_season_returns_200_with_empty_points(trend_client: TestClient) -> None:
    response = trend_client.get("/drivers/VER/seasons/2099/pace-trend")

    assert response.status_code == 200
    assert response.json()["points"] == []


def test_pace_trend_malformed_session_type_returns_422(trend_client: TestClient) -> None:
    response = trend_client.get(
        f"/drivers/VER/seasons/{SEASON}/pace-trend", params={"session_type": "nonsense"}
    )

    assert response.status_code == 422


# --- OpenAPI schema -------------------------------------------------------------


def test_openapi_includes_the_pace_trend_path(trend_client: TestClient) -> None:
    schema = trend_client.get("/openapi.json").json()

    assert "/drivers/{driver_id}/seasons/{season}/pace-trend" in schema["paths"]


def test_openapi_pace_trend_point_schema_has_no_telemetry_derived_fields(
    trend_client: TestClient,
) -> None:
    schema = trend_client.get("/openapi.json").json()
    point_schema = schema["components"]["schemas"]["SeasonPaceTrendPoint"]["properties"]

    assert set(point_schema.keys()) == {
        "session_id",
        "event_id",
        "event_name",
        "round_number",
        "session_date",
        "valid_lap_count",
        "best_lap_ms",
        "median_lap_ms",
        "theoretical_best_lap_ms",
        "consistency_ms",
        "consistency_cv",
    }
