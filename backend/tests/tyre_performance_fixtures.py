"""Shared synthetic Stint/PitStop builders for the M11 domain-logic test
suite (test_tyre_performance_*.py), plus a Parquet+fake-repository scenario
for the M11 route tests (test_tyre_performance_route.py, Phase 2). Pure
in-memory Pydantic objects and a synthetic Parquet cache -- no real
PostgreSQL, no network, matching `tests/fixtures.py`'s own pattern.
`lap()` is reused from lap_comparison_fixtures.py rather than duplicated,
the same cross-feature reuse `test_session_analytics_filtering.py` already
established.
"""

from pathlib import Path

import pandas as pd

from app.models.race_context import PitStop, Stint
from tests.fixtures import FakeRaceContextRepository

STINT_PACE_SESSION_ID = "2024_test_grand_prix_race"
"""A dedicated synthetic session, independent of tests/fixtures.py's
'2023_monza_race' -- that fixture only has 2 laps for VER and 1 for LEC,
not enough laps to exercise multiple stints/in-laps/out-laps/consistency,
so this module writes its own richer cache instead of stretching the
shared one to cover a shape it wasn't designed for."""


def stint(**overrides: object) -> Stint:
    defaults: dict[str, object] = {
        "driver_id": "VER",
        "stint_number": 1,
        "compound": "SOFT",
        "start_lap": 1,
        "end_lap": 15,
        "tyre_life_at_start": 1,
    }
    defaults.update(overrides)
    return Stint(**defaults)  # type: ignore[arg-type]


def pit_stop(**overrides: object) -> PitStop:
    defaults: dict[str, object] = {
        "driver_id": "VER",
        "stop_number": 1,
        "lap_number": 15,
        "pit_lane_time_seconds": 24.5,
    }
    defaults.update(overrides)
    return PitStop(**defaults)  # type: ignore[arg-type]


def _lap_row(
    *, driver_id: str, lap_number: int, compound: str, base_time: float
) -> dict[str, object]:
    return {
        "session_id": STINT_PACE_SESSION_ID,
        "driver_id": driver_id,
        "lap_number": lap_number,
        "lap_time_seconds": base_time + lap_number * 0.15,
        "sector_1_seconds": None,
        "sector_2_seconds": None,
        "sector_3_seconds": None,
        "is_personal_best": False,
        "is_accurate": True,
        "compound": compound,
    }


def write_stint_pace_session_cache(base_dir: Path) -> Path:
    """Write a synthetic session cache for the M11 route tests: two
    drivers, three compounds combined (SOFT/HARD for VER, MEDIUM/HARD for
    HAM), a 3-stint driver (VER) and a 2-stint driver (HAM), including a
    stint with exactly one trend-eligible lap (VER's stint 2, laps 5-7 with
    pit stops at 4 and 7 -- lap 5 is an out-lap, lap 7 is an in-lap, only
    lap 6 remains) so route tests can assert `consistency_ms is None` for
    it, alongside stints with >= 2 eligible laps for the `is not None` case.
    """
    session_dir = base_dir / "2024" / "test_grand_prix" / "race"
    session_dir.mkdir(parents=True, exist_ok=True)

    pd.DataFrame(
        [
            {
                "session_id": STINT_PACE_SESSION_ID,
                "season": 2024,
                "event_name": "Test Grand Prix",
                "round_number": 1,
                "location": "Testville",
                "country": "Testland",
                "session_type": "race",
                "session_date": "2024-01-01T13:00:00+00:00",
            }
        ]
    ).to_parquet(session_dir / "session.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": STINT_PACE_SESSION_ID,
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Test Driver VER",
                "team_name": "Test Team A",
            },
            {
                "session_id": STINT_PACE_SESSION_ID,
                "driver_id": "HAM",
                "driver_number": 44,
                "full_name": "Test Driver HAM",
                "team_name": "Test Team B",
            },
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)

    ver_soft_1 = [
        _lap_row(driver_id="VER", lap_number=n, compound="SOFT", base_time=90.0)
        for n in range(1, 5)
    ]
    ver_hard = [
        _lap_row(driver_id="VER", lap_number=n, compound="HARD", base_time=90.0)
        for n in range(5, 8)
    ]
    ver_soft_2 = [
        _lap_row(driver_id="VER", lap_number=n, compound="SOFT", base_time=90.0)
        for n in range(8, 11)
    ]
    ham_medium = [
        _lap_row(driver_id="HAM", lap_number=n, compound="MEDIUM", base_time=91.0)
        for n in range(1, 6)
    ]
    ham_hard = [
        _lap_row(driver_id="HAM", lap_number=n, compound="HARD", base_time=91.0)
        for n in range(6, 11)
    ]
    all_rows = ver_soft_1 + ver_hard + ver_soft_2 + ham_medium + ham_hard

    pd.DataFrame(all_rows).to_parquet(session_dir / "laps.parquet", index=False)

    return session_dir


def stint_pace_race_context_repository() -> FakeRaceContextRepository:
    """The `stints`/`pit_stops` counterpart to
    `write_stint_pace_session_cache`'s Parquet laps, matching driver-for-
    driver, lap-for-lap."""
    return FakeRaceContextRepository(
        stints_by_driver={
            (STINT_PACE_SESSION_ID, "VER"): [
                stint(
                    driver_id="VER",
                    stint_number=1,
                    compound="SOFT",
                    start_lap=1,
                    end_lap=4,
                    tyre_life_at_start=1,
                ),
                stint(
                    driver_id="VER",
                    stint_number=2,
                    compound="HARD",
                    start_lap=5,
                    end_lap=7,
                    tyre_life_at_start=2,
                ),
                stint(
                    driver_id="VER",
                    stint_number=3,
                    compound="SOFT",
                    start_lap=8,
                    end_lap=10,
                    tyre_life_at_start=1,
                ),
            ],
            (STINT_PACE_SESSION_ID, "HAM"): [
                stint(
                    driver_id="HAM",
                    stint_number=1,
                    compound="MEDIUM",
                    start_lap=1,
                    end_lap=5,
                    tyre_life_at_start=1,
                ),
                stint(
                    driver_id="HAM",
                    stint_number=2,
                    compound="HARD",
                    start_lap=6,
                    end_lap=10,
                    tyre_life_at_start=1,
                ),
            ],
        },
        pit_stops_by_session={
            STINT_PACE_SESSION_ID: [
                pit_stop(driver_id="VER", stop_number=1, lap_number=4, pit_lane_time_seconds=24.5),
                pit_stop(driver_id="VER", stop_number=2, lap_number=7, pit_lane_time_seconds=23.9),
                pit_stop(driver_id="HAM", stop_number=1, lap_number=5, pit_lane_time_seconds=25.0),
            ],
        },
    )
