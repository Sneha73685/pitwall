"""Integration tests for GET /sessions/{session_id}/analytics/drivers and
GET /sessions/{session_id}/analytics/drivers/{driver}/laps (M8 Phase 2).

Against real fixture Parquet data via a dedicated session -- not
tests/fixtures.py's shared "2023_monza_race", whose exactly-two-drivers
shape other tests rely on (e.g. test_sessions_api.py's
"...returns_both_drivers"), so this module writes its own small
multi-driver session rather than extending a shared fixture other tests'
assertions depend on staying fixed. Matches the pattern
test_laps_compare_route.py's `_write_non_monotonic_session` established
for the same reason.

Covers the Phase 2 exit criteria (plan's Phase 2 section): a full roster
including a 0-valid-lap driver (B1) and a 1-valid-lap driver (null
consistency, `warnings` populated). The third exit-criteria case -- a
yellow-flag-affected lap showing `exclusion_reason: "yellow_flag"` -- is
not covered: Q3 confirmed no track-status data exists anywhere in the
schema (plan §0.2), so there is no real data to build such a fixture from,
and it is skipped rather than fabricated, matching M6's own
documented-follow-up precedent for the same gap
(docs/releases/m6-summary.md's "Known limitations").
"""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_telemetry_repository
from app.main import app
from app.repositories.parquet_repository import ParquetRepository

SESSION_ID = "2024_testcircuit_race"


def _write_session_analytics_fixture(base_dir: Path) -> None:
    """A dedicated three-driver session:
    - VER: 2 accurate laps + 1 inaccurate lap -- exercises the aggregate
      math, the invalid-lap-still-listed behavior, and per-lap deltas.
    - HAM: exactly 1 accurate lap -- exercises the `insufficient_laps`
      warning and null consistency.
    - PER: 0 laps at all (a driver row with no laps.parquet entries) --
      exercises B1: still listed in the roster with all-null fields.
    """
    session_dir = base_dir / "2024" / "testcircuit" / "race"
    session_dir.mkdir(parents=True)

    pd.DataFrame(
        [
            {
                "session_id": SESSION_ID,
                "season": 2024,
                "event_name": "Test Circuit",
                "round_number": 1,
                "location": "Testville",
                "country": "Testland",
                "session_type": "race",
                "session_date": None,
            }
        ]
    ).to_parquet(session_dir / "session.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Max Verstappen",
                "team_name": "Red Bull Racing",
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "HAM",
                "driver_number": 44,
                "full_name": "Lewis Hamilton",
                "team_name": "Mercedes",
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "PER",
                "driver_number": 11,
                "full_name": "Sergio Perez",
                "team_name": "Red Bull Racing",
            },
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 1,
                "lap_time_seconds": 90.0,
                "sector_1_seconds": 30.0,
                "sector_2_seconds": 29.0,
                "sector_3_seconds": 31.0,
                "is_personal_best": False,
                "is_accurate": True,
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 2,
                "lap_time_seconds": 89.5,
                "sector_1_seconds": 29.5,
                "sector_2_seconds": 30.0,
                "sector_3_seconds": 30.0,
                "is_personal_best": True,
                "is_accurate": True,
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 3,
                "lap_time_seconds": 95.0,
                "sector_1_seconds": 32.0,
                "sector_2_seconds": 32.0,
                "sector_3_seconds": 31.0,
                "is_personal_best": False,
                "is_accurate": False,  # inaccurate -- excluded from aggregate stats
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "HAM",
                "lap_number": 1,
                "lap_time_seconds": 95.0,
                "sector_1_seconds": 31.0,
                "sector_2_seconds": 32.0,
                "sector_3_seconds": 32.0,
                "is_personal_best": True,
                "is_accurate": True,
            },
            # PER has no rows here at all -- 0 laps.
        ]
    ).to_parquet(session_dir / "laps.parquet", index=False)

    pd.DataFrame(
        [
            # VER lap 1: 4 samples, all full throttle (100%).
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 1,
                "distance_m": distance_m,
                "time_seconds": distance_m / 50.0,
                "speed_kph": 250.0,
                "throttle_pct": 100.0,
                "brake_active": False,
                "rpm": 11000.0,
                "gear": 7,
                "drs_active": False,
                "x": 0.0,
                "y": 0.0,
                "z": 0.0,
            }
            for distance_m in (0.0, 50.0, 100.0, 150.0)
        ]
        + [
            # VER lap 2: 4 samples, half full throttle (50%).
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 2,
                "distance_m": distance_m,
                "time_seconds": distance_m / 50.0,
                "speed_kph": 250.0,
                "throttle_pct": throttle_pct,
                "brake_active": False,
                "rpm": 11000.0,
                "gear": 7,
                "drs_active": False,
                "x": 0.0,
                "y": 0.0,
                "z": 0.0,
            }
            for distance_m, throttle_pct in [
                (0.0, 100.0),
                (50.0, 100.0),
                (100.0, 40.0),
                (150.0, 40.0),
            ]
        ]
        + [
            # VER lap 3 (inaccurate) deliberately has no telemetry at all.
            # HAM lap 1: 2 samples, all full throttle.
            {
                "session_id": SESSION_ID,
                "driver_id": "HAM",
                "lap_number": 1,
                "distance_m": distance_m,
                "time_seconds": distance_m / 50.0,
                "speed_kph": 250.0,
                "throttle_pct": 100.0,
                "brake_active": False,
                "rpm": 11000.0,
                "gear": 7,
                "drs_active": False,
                "x": 0.0,
                "y": 0.0,
                "z": 0.0,
            }
            for distance_m in (0.0, 50.0)
        ]
    ).to_parquet(session_dir / "telemetry.parquet", index=False)


@pytest.fixture
def analytics_client(tmp_path: Path) -> Iterator[TestClient]:
    _write_session_analytics_fixture(tmp_path)
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_get_session_analytics_returns_full_roster_including_zero_lap_driver(
    analytics_client: TestClient,
) -> None:
    response = analytics_client.get(f"/sessions/{SESSION_ID}/analytics/drivers")

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == SESSION_ID
    assert {driver["driver"] for driver in body["drivers"]} == {"VER", "HAM", "PER"}

    per = next(driver for driver in body["drivers"] if driver["driver"] == "PER")
    assert per["valid_lap_count"] == 0
    assert per["best_lap_ms"] is None
    assert per["theoretical_best_lap_ms"] is None
    assert per["theoretical_best_delta_ms"] is None
    assert per["median_lap_ms"] is None
    assert per["consistency_ms"] is None
    assert per["consistency_cv"] is None
    assert per["full_throttle_pct"] is None
    assert per["outlier_lap_count"] == 0


def test_get_session_analytics_computes_the_two_valid_lap_driver_s_summary(
    analytics_client: TestClient,
) -> None:
    response = analytics_client.get(f"/sessions/{SESSION_ID}/analytics/drivers")
    body = response.json()
    ver = next(driver for driver in body["drivers"] if driver["driver"] == "VER")

    # Best-of-each-sector across VER's 2 accurate laps: sector 1 = 29.5
    # (lap 2), sector 2 = 29.0 (lap 1), sector 3 = 30.0 (lap 2) ->
    # theoretical best = 88.5s = 88500ms. The inaccurate lap 3 (95.0s) must
    # not affect any of this.
    assert ver["valid_lap_count"] == 2
    assert ver["best_lap_ms"] == pytest.approx(89500.0)
    assert ver["theoretical_best_lap_ms"] == pytest.approx(88500.0)
    assert ver["theoretical_best_delta_ms"] == pytest.approx(1000.0)
    assert ver["median_lap_ms"] == pytest.approx(89750.0)
    assert ver["consistency_ms"] == pytest.approx(250.0)
    assert ver["consistency_cv"] == pytest.approx(250.0 / 89750.0)
    assert ver["outlier_lap_count"] == 0
    # Pooled: lap 1 = 4/4 full-throttle samples, lap 2 = 2/4 -> 6/8 = 75%.
    assert ver["full_throttle_pct"] == pytest.approx(75.0)


def test_get_session_analytics_flags_the_one_valid_lap_driver_with_a_warning(
    analytics_client: TestClient,
) -> None:
    response = analytics_client.get(f"/sessions/{SESSION_ID}/analytics/drivers")
    body = response.json()
    ham = next(driver for driver in body["drivers"] if driver["driver"] == "HAM")

    assert ham["valid_lap_count"] == 1
    assert ham["best_lap_ms"] == pytest.approx(95000.0)
    assert ham["theoretical_best_delta_ms"] == pytest.approx(0.0)
    assert ham["consistency_ms"] is None
    assert ham["consistency_cv"] is None

    assert body["warnings"] == [
        {
            "code": "insufficient_laps",
            "driver": "HAM",
            "detail": "1 valid lap; consistency metrics omitted",
        }
    ]


def test_get_session_analytics_session_lap_count_is_the_max_not_the_sum(
    analytics_client: TestClient,
) -> None:
    # VER reaches lap 3 (its highest lap_number, even though invalid); HAM
    # only reaches lap 1; PER has none. Summing driver lap counts would
    # give 3+1+0=4 -- the correct answer is max(lap_number)=3, not that sum.
    response = analytics_client.get(f"/sessions/{SESSION_ID}/analytics/drivers")

    assert response.json()["session_lap_count"] == 3


def test_get_session_analytics_session_not_found_returns_404(
    analytics_client: TestClient,
) -> None:
    response = analytics_client.get("/sessions/2099_nowhere_race/analytics/drivers")

    assert response.status_code == 404


def test_get_driver_lap_metrics_lists_every_lap_valid_or_not(
    analytics_client: TestClient,
) -> None:
    response = analytics_client.get(f"/sessions/{SESSION_ID}/analytics/drivers/VER/laps")

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == SESSION_ID
    assert body["driver"] == "VER"
    assert [lap["lap_number"] for lap in body["laps"]] == [1, 2, 3]

    invalid_lap = body["laps"][2]
    assert invalid_lap["is_valid"] is False
    assert invalid_lap["exclusion_reason"] is None
    assert invalid_lap["lap_time_ms"] == pytest.approx(95000.0)
    # theoretical_best=88500ms, median=89750ms (VER's 2 valid laps).
    assert invalid_lap["delta_to_theoretical_best_ms"] == pytest.approx(6500.0)
    assert invalid_lap["delta_to_own_median_ms"] == pytest.approx(5250.0)
    assert body["warnings"] == []


def test_get_driver_lap_metrics_populates_warnings_for_the_one_valid_lap_driver(
    analytics_client: TestClient,
) -> None:
    response = analytics_client.get(f"/sessions/{SESSION_ID}/analytics/drivers/HAM/laps")

    body = response.json()
    assert body["warnings"] == [
        {
            "code": "insufficient_laps",
            "driver": "HAM",
            "detail": "1 valid lap; consistency metrics omitted",
        }
    ]


def test_get_driver_lap_metrics_unknown_driver_returns_empty_laps_not_404(
    analytics_client: TestClient,
) -> None:
    """An unknown `driver` path segment isn't a 404: it matches the
    existing `/laps?driver_id=` convention (empty list, not an error, for
    a filter that matches nothing -- docs/api-model.md).
    """
    response = analytics_client.get(f"/sessions/{SESSION_ID}/analytics/drivers/XXX/laps")

    assert response.status_code == 200
    body = response.json()
    assert body["driver"] == "XXX"
    assert body["laps"] == []


def test_get_driver_lap_metrics_session_not_found_returns_404(
    analytics_client: TestClient,
) -> None:
    response = analytics_client.get("/sessions/2099_nowhere_race/analytics/drivers/VER/laps")

    assert response.status_code == 404
