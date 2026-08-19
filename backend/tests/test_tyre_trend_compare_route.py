"""Integration tests for GET /drivers/tyre-trend/compare (M26,
docs/m26-design-review.md).

Against real fixture Parquet data (ParquetRepository) plus an in-memory
FakeRaceContextRepository -- mirrors test_driver_tyre_trend_route.py's own
fixture architecture exactly (docs/m26-design-review.md §2.5), not
test_pace_trend_compare_route.py's laps-focused one: this route family
never calls list_laps, so no laps.parquet content is written. Two seasons
(2023, 2024) so same-season and cross-season pairings are both directly
exercisable within one fixture, mirroring test_pace_trend_compare_route.py's
own two-season shape.
"""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.main import app
from app.models.race_context import Stint
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import FakeRaceContextRepository


def _write_session(
    base_dir: Path,
    *,
    season: int,
    session_id: str,
    event_slug: str,
    session_type: str,
    event_name: str,
    round_number: int,
    session_date: str,
    drivers: list[tuple[str, int, str, str]],
) -> None:
    session_dir = base_dir / str(season) / event_slug / session_type
    session_dir.mkdir(parents=True)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "season": season,
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

    # No laps.parquet content: this route never calls list_laps() (mirrors
    # test_driver_tyre_trend_route.py's own precedent exactly). An empty
    # telemetry.parquet is still required -- _iter_session_dirs()'s
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


def _write_fixture(base_dir: Path) -> None:
    """2024: VER + HAM race two rounds, plus a round-1 qualifying session
    where VER is on the roster but has zero recorded stints (session_type
    filtering + roster-present-zero-stints). 2023: VER + HAM race one round
    only, with a different strategy shape -- a genuinely different season,
    not a copy. HAM is absent from 2023's roster entirely, to exercise the
    roster-absent side independently of season length (mirrors
    test_pace_trend_compare_route.py's own fixture shape)."""
    _write_session(
        base_dir,
        season=2024,
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
        season=2024,
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
        season=2024,
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
        season=2023,
        session_id="2023_round_1_race",
        event_slug="round_1",
        session_type="race",
        event_name="Round 1 Grand Prix",
        round_number=1,
        session_date="2023-03-05T15:00:00+00:00",
        drivers=[("VER", 1, "Max Verstappen", "Red Bull Racing")],  # HAM not entered
    )


def _race_context_repository() -> FakeRaceContextRepository:
    return FakeRaceContextRepository(
        stints_by_driver={
            ("2024_round_1_race", "VER"): [
                _stint("VER", 1, "SOFT", 1, 20),
                _stint("VER", 2, "HARD", 21, 55),
            ],
            ("2024_round_1_race", "HAM"): [
                _stint("HAM", 1, "MEDIUM", 1, 55),
            ],
            # Round 1 qualifying: VER on the roster, zero recorded stints.
            ("2024_round_1_qualifying", "VER"): [],
            ("2024_round_2_race", "VER"): [
                _stint("VER", 1, "MEDIUM", 1, 30),
                _stint("VER", 2, "SOFT", 31, 58),
            ],
            ("2024_round_2_race", "HAM"): [
                _stint("HAM", 1, "HARD", 1, 58),
            ],
            ("2023_round_1_race", "VER"): [
                _stint("VER", 1, "SOFT", 1, 60),
            ],
        },
        pit_stops_by_session={},
    )


@pytest.fixture
def compare_client(tmp_path: Path) -> Iterator[TestClient]:
    _write_fixture(tmp_path)
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    app.dependency_overrides[get_race_context_repository] = _race_context_repository
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- Contract shape / same-season -----------------------------------------


def test_tyre_trend_compare_returns_the_full_contract_shape(compare_client: TestClient) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "HAM", "season_b": 2024},
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"a", "b"}
    assert body["a"]["driver_id"] == "VER"
    assert body["a"]["season"] == 2024
    assert body["b"]["driver_id"] == "HAM"
    assert body["b"]["season"] == 2024


def test_tyre_trend_compare_same_season_two_drivers(compare_client: TestClient) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "HAM", "season_b": 2024},
    )

    body = response.json()
    assert [p["session_id"] for p in body["a"]["points"]] == [
        "2024_round_1_race",
        "2024_round_2_race",
    ]
    assert [p["session_id"] for p in body["b"]["points"]] == [
        "2024_round_1_race",
        "2024_round_2_race",
    ]
    round_1_a = body["a"]["points"][0]
    assert round_1_a["strategy"]["stint_count"] == 2
    assert round_1_a["strategy"]["compound_sequence"] == ["SOFT", "HARD"]


def test_tyre_trend_compare_response_never_includes_warnings_or_computed_fields(
    compare_client: TestClient,
) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "HAM", "season_b": 2024},
    )

    assert "warnings" not in response.json()


# --- Cross-season --------------------------------------------------------


def test_tyre_trend_compare_cross_season_two_drivers(compare_client: TestClient) -> None:
    """VER 2024 vs VER 2023 -- same driver, different season, no cross-side
    interaction: each side reflects its own season only."""
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "VER", "season_b": 2023},
    )

    body = response.json()
    assert body["a"]["season"] == 2024
    assert [p["session_id"] for p in body["a"]["points"]] == [
        "2024_round_1_race",
        "2024_round_2_race",
    ]
    assert body["b"]["season"] == 2023
    assert [p["session_id"] for p in body["b"]["points"]] == ["2023_round_1_race"]


def test_tyre_trend_compare_identical_driver_and_season_on_both_sides_is_not_rejected(
    compare_client: TestClient,
) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "VER", "season_b": 2024},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["a"] == body["b"]


# --- session_type filtering (shared across both sides) --------------------


def test_tyre_trend_compare_session_type_filters_both_sides(compare_client: TestClient) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={
            "driver_a": "VER",
            "season_a": 2024,
            "driver_b": "VER",
            "season_b": 2024,
            "session_type": "qualifying",
        },
    )

    body = response.json()
    assert body["a"]["session_type"] == "qualifying"
    assert body["b"]["session_type"] == "qualifying"
    assert [p["session_id"] for p in body["a"]["points"]] == ["2024_round_1_qualifying"]
    assert [p["session_id"] for p in body["b"]["points"]] == ["2024_round_1_qualifying"]
    # Roster-present, zero recorded stints -- still a point, not omitted
    # (docs/m21-design-review.md §3, reused unchanged by this route).
    assert body["a"]["points"][0]["strategy"]["stint_count"] == 0
    assert body["a"]["points"][0]["strategy"]["compound_sequence"] == []


def test_tyre_trend_compare_defaults_to_race_session_type(compare_client: TestClient) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "HAM", "season_b": 2024},
    )

    body = response.json()
    assert body["a"]["session_type"] == "race"
    assert body["b"]["session_type"] == "race"


# --- Independent ordering ---------------------------------------------------


def test_tyre_trend_compare_each_side_ordered_independently(compare_client: TestClient) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "HAM", "season_a": 2024, "driver_b": "VER", "season_b": 2024},
    )

    body = response.json()
    assert [p["session_id"] for p in body["a"]["points"]] == [
        "2024_round_1_race",
        "2024_round_2_race",
    ]
    assert [p["session_id"] for p in body["b"]["points"]] == [
        "2024_round_1_race",
        "2024_round_2_race",
    ]


# --- Non-404 / independence between sides -----------------------------------


def test_tyre_trend_compare_unknown_driver_b_returns_200_with_empty_points_on_that_side_only(
    compare_client: TestClient,
) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "ZZZ", "season_b": 2024},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["a"]["points"]) == 2
    assert body["b"]["points"] == []


def test_tyre_trend_compare_unknown_season_on_one_side_returns_200_with_empty_points(
    compare_client: TestClient,
) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "VER", "season_b": 2099},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["a"]["points"]) == 2
    assert body["b"]["points"] == []


def test_tyre_trend_compare_roster_absent_side_does_not_affect_the_other_side(
    compare_client: TestClient,
) -> None:
    """HAM isn't entered in 2023 at all (§ fixture) -- side B is empty, but
    side A (VER 2024, a real driver/season with real data) is completely
    unaffected, proving there is no shared computation between sides."""
    response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "HAM", "season_b": 2023},
    )

    body = response.json()
    assert len(body["a"]["points"]) == 2
    assert body["b"]["points"] == []


def test_tyre_trend_compare_missing_required_query_params_returns_422(
    compare_client: TestClient,
) -> None:
    response = compare_client.get(
        "/drivers/tyre-trend/compare", params={"driver_a": "VER", "season_a": 2024}
    )

    assert response.status_code == 422


# --- No shared/duplicated computation (no N² fan-out) ------------------------


def test_tyre_trend_compare_matches_the_two_single_driver_endpoints_exactly(
    compare_client: TestClient,
) -> None:
    """Direct proof of reuse (docs/m26-design-review.md §4): the comparison
    route's own sides must be byte-identical in content to the existing,
    independently-verified single-driver endpoint's real response for the
    same driver/season/session_type -- not a reimplementation that could
    silently diverge."""
    compare_response = compare_client.get(
        "/drivers/tyre-trend/compare",
        params={"driver_a": "VER", "season_a": 2024, "driver_b": "HAM", "season_b": 2024},
    )
    ver_response = compare_client.get("/drivers/VER/seasons/2024/tyre-trend")
    ham_response = compare_client.get("/drivers/HAM/seasons/2024/tyre-trend")

    assert compare_response.json()["a"] == ver_response.json()
    assert compare_response.json()["b"] == ham_response.json()


# --- OpenAPI schema -----------------------------------------------------------


def test_openapi_includes_the_tyre_trend_compare_path(compare_client: TestClient) -> None:
    schema = compare_client.get("/openapi.json").json()

    assert "/drivers/tyre-trend/compare" in schema["paths"]


def test_openapi_tyre_trend_comparison_schema_has_no_warnings_or_computed_fields(
    compare_client: TestClient,
) -> None:
    schema = compare_client.get("/openapi.json").json()
    comparison_schema = schema["components"]["schemas"]["SeasonTyreTrendComparisonResponse"][
        "properties"
    ]

    assert set(comparison_schema.keys()) == {"a", "b"}
