"""Integration tests for GET /drivers/{driver_id}/seasons/{season}/tyre-trend
(M21, docs/m21-design-review.md).

Against real fixture Parquet data (ParquetRepository) plus an in-memory
FakeRaceContextRepository (no real Postgres needed at this layer, matching
test_stints_compare_route.py's own precedent) via a dedicated multi-session
season fixture -- same "own fixture, not tests/fixtures.py's single-fixed-
session shape" precedent test_driver_trends_route.py already established
for M17, re-scoped from laps to stints. This route never calls
`list_laps`/`get_telemetry`, so the fixture writes no `laps.parquet`
content at all (docs/m21-design-review.md §5 -- the route only ever reads
`drivers.parquet` for the roster check and Postgres for stints).
"""

from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.main import app
from app.models.race_context import Stint
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import FakeRaceContextRepository

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

    # No laps.parquet content: this route never calls list_laps(). An
    # empty telemetry.parquet is still required -- _iter_session_dirs()'s
    # _telemetry_row_count check reads the file's footer metadata
    # regardless of whether this route ever reads telemetry data itself.
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


def _stint(driver_id: str, stint_number: int, compound: str, start_lap: int, end_lap: int) -> Stint:
    return Stint(
        driver_id=driver_id,
        stint_number=stint_number,
        compound=compound,
        start_lap=start_lap,
        end_lap=end_lap,
        tyre_life_at_start=0,
    )


def _write_season_fixture(base_dir: Path) -> None:
    """Round 1 race: VER has 3 stints (SOFT/MEDIUM/HARD), HAM has 1 stint.
    Round 1 also has a qualifying session (session_type filtering) where
    VER is on the roster but has zero recorded stints -- the "roster-
    present, zero stints" case. Round 2 race: VER + HAM race, VER has 2
    stints. Round 3 race: only HAM races -- VER isn't on the roster at all
    (a real mid-season-substitution shape, matching
    test_driver_trends_route.py's own round 3)."""
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
    )


def _race_context_repository() -> FakeRaceContextRepository:
    return FakeRaceContextRepository(
        stints_by_driver={
            ("2024_round_1_race", "VER"): [
                _stint("VER", 1, "SOFT", 1, 15),
                _stint("VER", 2, "MEDIUM", 16, 35),
                _stint("VER", 3, "HARD", 36, 55),
            ],
            ("2024_round_1_race", "HAM"): [
                _stint("HAM", 1, "MEDIUM", 1, 55),
            ],
            # Round 1 qualifying: VER on the roster, zero recorded stints.
            ("2024_round_1_qualifying", "VER"): [],
            ("2024_round_2_race", "VER"): [
                _stint("VER", 1, "MEDIUM", 1, 30),
                _stint("VER", 2, "HARD", 31, 58),
            ],
            ("2024_round_2_race", "HAM"): [
                _stint("HAM", 1, "SOFT", 1, 58),
            ],
            ("2024_round_3_race", "HAM"): [
                _stint("HAM", 1, "HARD", 1, 50),
            ],
        },
        pit_stops_by_session={},
    )


@pytest.fixture
def tyre_trend_client(tmp_path: Path) -> Iterator[TestClient]:
    _write_season_fixture(tmp_path)
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    app.dependency_overrides[get_race_context_repository] = _race_context_repository
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- Normal successful trend, default filter ---------------------------------


def test_tyre_trend_returns_the_full_contract_shape(tyre_trend_client: TestClient) -> None:
    response = tyre_trend_client.get(f"/drivers/VER/seasons/{SEASON}/tyre-trend")

    assert response.status_code == 200
    body = response.json()
    assert body["driver_id"] == "VER"
    assert body["season"] == SEASON
    assert body["session_type"] == "race"


def test_tyre_trend_defaults_to_race_session_type(tyre_trend_client: TestClient) -> None:
    """Round 1's qualifying session must not appear -- the default filter
    is race-only."""
    response = tyre_trend_client.get(f"/drivers/VER/seasons/{SEASON}/tyre-trend")

    session_ids = [p["session_id"] for p in response.json()["points"]]
    assert "2024_round_1_qualifying" not in session_ids


def test_tyre_trend_explicit_session_type_filters_to_qualifying(
    tyre_trend_client: TestClient,
) -> None:
    response = tyre_trend_client.get(
        f"/drivers/VER/seasons/{SEASON}/tyre-trend", params={"session_type": "qualifying"}
    )

    body = response.json()
    assert body["session_type"] == "qualifying"
    assert [p["session_id"] for p in body["points"]] == ["2024_round_1_qualifying"]


# --- Aggregation correctness: multiple compounds/stints -----------------------


def test_tyre_trend_reuses_driver_strategy_summary_fields_exactly(
    tyre_trend_client: TestClient,
) -> None:
    response = tyre_trend_client.get(f"/drivers/VER/seasons/{SEASON}/tyre-trend")

    round_1 = next(p for p in response.json()["points"] if p["session_id"] == "2024_round_1_race")
    strategy = round_1["strategy"]
    assert strategy["driver_id"] == "VER"
    assert strategy["stint_count"] == 3
    assert strategy["compound_sequence"] == ["SOFT", "MEDIUM", "HARD"]
    # stint_lengths = end_lap - start_lap + 1 per stint, driver_strategy_summary's
    # own arithmetic, not re-derived here.
    assert strategy["stint_lengths"] == [15, 20, 20]


def test_tyre_trend_multiple_stints_second_round_correct(tyre_trend_client: TestClient) -> None:
    response = tyre_trend_client.get(f"/drivers/VER/seasons/{SEASON}/tyre-trend")

    round_2 = next(p for p in response.json()["points"] if p["session_id"] == "2024_round_2_race")
    strategy = round_2["strategy"]
    assert strategy["stint_count"] == 2
    assert strategy["compound_sequence"] == ["MEDIUM", "HARD"]
    assert strategy["stint_lengths"] == [30, 28]


def test_tyre_trend_response_never_includes_consistency_laps_or_pit_stop_fields(
    tyre_trend_client: TestClient,
) -> None:
    """Decision (docs/m21-design-review.md §3): no per-stint consistency,
    no raw laps, no pit-stop timing, anywhere in a point."""
    response = tyre_trend_client.get(f"/drivers/VER/seasons/{SEASON}/tyre-trend")

    for point in response.json()["points"]:
        assert "consistency_ms" not in point["strategy"]
        assert "eligible_lap_count" not in point["strategy"]
        assert "laps" not in point
        assert "pit_stops" not in point
        assert "stints" not in point


# --- Ordering -----------------------------------------------------------------


def test_tyre_trend_orders_by_session_date_ascending(tyre_trend_client: TestClient) -> None:
    response = tyre_trend_client.get(f"/drivers/HAM/seasons/{SEASON}/tyre-trend")

    session_ids = [p["session_id"] for p in response.json()["points"]]
    assert session_ids == ["2024_round_1_race", "2024_round_2_race", "2024_round_3_race"]


# --- Missing/incomplete session behavior (§3) ----------------------------------


def test_tyre_trend_omits_rounds_the_driver_did_not_compete_in(
    tyre_trend_client: TestClient,
) -> None:
    """VER isn't on round 3's roster at all -- omitted entirely, not a
    zero-stint point."""
    response = tyre_trend_client.get(f"/drivers/VER/seasons/{SEASON}/tyre-trend")

    session_ids = [p["session_id"] for p in response.json()["points"]]
    assert "2024_round_3_race" not in session_ids
    assert len(session_ids) == 2  # round 1 and round 2 races only


def test_tyre_trend_roster_present_zero_stints_is_an_included_point_with_empty_arrays(
    tyre_trend_client: TestClient,
) -> None:
    """VER is on the roster for round 1 qualifying but has zero recorded
    stints -- the point is still present, self-evident from the empty
    arrays, distinct from the round-3 omission case above."""
    response = tyre_trend_client.get(
        f"/drivers/VER/seasons/{SEASON}/tyre-trend", params={"session_type": "qualifying"}
    )

    body = response.json()
    assert len(body["points"]) == 1
    strategy = body["points"][0]["strategy"]
    assert strategy["stint_count"] == 0
    assert strategy["compound_sequence"] == []
    assert strategy["stint_lengths"] == []


# --- Non-404 behavior -----------------------------------------------------------


def test_tyre_trend_unknown_driver_returns_200_with_empty_points(
    tyre_trend_client: TestClient,
) -> None:
    response = tyre_trend_client.get(f"/drivers/ZZZ/seasons/{SEASON}/tyre-trend")

    assert response.status_code == 200
    assert response.json()["points"] == []


def test_tyre_trend_unknown_season_returns_200_with_empty_points(
    tyre_trend_client: TestClient,
) -> None:
    response = tyre_trend_client.get("/drivers/VER/seasons/2099/tyre-trend")

    assert response.status_code == 200
    assert response.json()["points"] == []


def test_tyre_trend_malformed_session_type_returns_422(tyre_trend_client: TestClient) -> None:
    response = tyre_trend_client.get(
        f"/drivers/VER/seasons/{SEASON}/tyre-trend", params={"session_type": "nonsense"}
    )

    assert response.status_code == 422


# --- N-session access pattern: no N^2 repository/database calls ----------------


def test_tyre_trend_calls_list_stints_exactly_once_per_roster_present_session(
    tyre_trend_client: TestClient,
) -> None:
    """3 roster-present race-session/driver combinations exist for VER
    across the whole season fixture (round 1, round 2 -- round 3 is
    roster-absent and must not call list_stints at all). Proves the O(N)
    access pattern design (docs/m21-design-review.md §5): one
    RaceContextRepository call per roster-present session, never more,
    never one per stint or one per compound."""
    repo = _race_context_repository()
    with patch.object(FakeRaceContextRepository, "list_stints", wraps=repo.list_stints) as spy:
        app.dependency_overrides[get_race_context_repository] = lambda: repo
        response = tyre_trend_client.get(f"/drivers/VER/seasons/{SEASON}/tyre-trend")

        assert response.status_code == 200
        # Round 1 race + round 2 race = 2 roster-present race sessions for VER.
        assert spy.call_count == 2


# --- OpenAPI schema --------------------------------------------------------------


def test_openapi_includes_the_tyre_trend_path(tyre_trend_client: TestClient) -> None:
    schema = tyre_trend_client.get("/openapi.json").json()

    assert "/drivers/{driver_id}/seasons/{season}/tyre-trend" in schema["paths"]


def test_openapi_tyre_trend_point_schema_has_no_extra_fields(
    tyre_trend_client: TestClient,
) -> None:
    schema = tyre_trend_client.get("/openapi.json").json()
    point_schema = schema["components"]["schemas"]["SeasonTyreTrendPoint"]["properties"]

    assert set(point_schema.keys()) == {
        "session_id",
        "event_id",
        "event_name",
        "round_number",
        "session_date",
        "strategy",
    }


def test_openapi_tyre_trend_strategy_schema_matches_driver_strategy_summary(
    tyre_trend_client: TestClient,
) -> None:
    """The nested `strategy` field is DriverStrategySummary (M11) reused
    unchanged -- no extra field bolted on for this endpoint."""
    schema = tyre_trend_client.get("/openapi.json").json()
    strategy_schema = schema["components"]["schemas"]["DriverStrategySummary"]["properties"]

    assert set(strategy_schema.keys()) == {
        "driver_id",
        "stint_count",
        "compound_sequence",
        "stint_lengths",
    }
