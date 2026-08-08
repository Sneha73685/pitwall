"""Synthetic Parquet session cache, matching the layout
pipeline/pitwall_pipeline/cache_writer.py writes (docs/data-model.md).
Hand-built DataFrames -- no FastF1 or pipeline package involved.
"""

from pathlib import Path

import pandas as pd

from app.models.race_context import PitStop, Stint
from app.repositories.race_context import RaceContextRepository

SESSION_ID = "2023_monza_race"


def write_session_cache(base_dir: Path) -> Path:
    """Write one synthetic session's cache under base_dir. Returns the session directory."""
    session_dir = base_dir / "2023" / "monza" / "race"
    session_dir.mkdir(parents=True, exist_ok=True)

    pd.DataFrame(
        [
            {
                "session_id": SESSION_ID,
                "season": 2023,
                "event_name": "Italian Grand Prix",
                "round_number": 16,
                "location": "Monza",
                "country": "Italy",
                "session_type": "race",
                "session_date": "2023-09-03T13:00:00+00:00",
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
                "driver_id": "LEC",
                "driver_number": 16,
                "full_name": "Charles Leclerc",
                "team_name": "Ferrari",
            },
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 1,
                "lap_time_seconds": 95.123,
                "sector_1_seconds": 30.1,
                "sector_2_seconds": 35.0,
                "sector_3_seconds": 30.023,
                "is_personal_best": True,
                "is_accurate": True,
                "compound": "SOFT",
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 2,
                "lap_time_seconds": None,
                "sector_1_seconds": None,
                "sector_2_seconds": None,
                "sector_3_seconds": None,
                "is_personal_best": False,
                "is_accurate": False,
                "compound": None,
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "LEC",
                "lap_number": 1,
                "lap_time_seconds": 96.456,
                "sector_1_seconds": 30.5,
                "sector_2_seconds": 35.2,
                "sector_3_seconds": 30.756,
                "is_personal_best": True,
                "is_accurate": True,
                "compound": "MEDIUM",
            },
        ]
    ).to_parquet(session_dir / "laps.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 1,
                "distance_m": 100.0,
                "time_seconds": 2.5,
                "speed_kph": 250.0,
                "throttle_pct": 100.0,
                "brake_active": False,
                "rpm": 11000.0,
                "gear": 6,
                "drs_active": False,
                "x": 10.0,
                "y": 20.0,
                "z": 0.0,
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "VER",
                "lap_number": 1,
                "distance_m": 50.0,
                "time_seconds": 1.0,
                "speed_kph": 200.0,
                "throttle_pct": 80.0,
                "brake_active": False,
                "rpm": 10000.0,
                "gear": 5,
                "drs_active": True,
                "x": 5.0,
                "y": 10.0,
                "z": 0.0,
            },
            # LEC/lap 1: same distance points as VER/lap 1, slightly slower
            # at each -- consistent with LEC's own lap_time_seconds (96.456)
            # being ~1.3s slower than VER's (95.123) above. Added for M6's
            # /laps/compare integration test, which needs two drivers with
            # real (not just metadata-only) telemetry to compare.
            {
                "session_id": SESSION_ID,
                "driver_id": "LEC",
                "lap_number": 1,
                "distance_m": 100.0,
                "time_seconds": 2.65,
                "speed_kph": 245.0,
                "throttle_pct": 100.0,
                "brake_active": False,
                "rpm": 10800.0,
                "gear": 6,
                "drs_active": False,
                "x": 10.0,
                "y": 20.0,
                "z": 0.0,
            },
            {
                "session_id": SESSION_ID,
                "driver_id": "LEC",
                "lap_number": 1,
                "distance_m": 50.0,
                "time_seconds": 1.1,
                "speed_kph": 195.0,
                "throttle_pct": 80.0,
                "brake_active": False,
                "rpm": 9800.0,
                "gear": 5,
                "drs_active": False,
                "x": 5.0,
                "y": 10.0,
                "z": 0.0,
            },
        ]
    ).to_parquet(session_dir / "telemetry.parquet", index=False)

    pd.DataFrame(
        [
            {"session_id": SESSION_ID, "distance_m": 100.0, "x": 10.0, "y": 20.0},
            {"session_id": SESSION_ID, "distance_m": 50.0, "x": 5.0, "y": 10.0},
        ]
    ).to_parquet(session_dir / "track.parquet", index=False)

    return session_dir


class FakeRaceContextRepository(RaceContextRepository):
    """In-memory `RaceContextRepository` for route tests (M10, Phase 4) --
    no real Postgres needed at this layer, matching
    test_laps_compare_route.py/test_session_analytics_route.py's existing
    precedent of overriding `TelemetryRepository` with a fixture instead of
    a live backing store (ADR-0006's stated fakeability benefit for
    repository interfaces).

    `Stint`/`PitStop` (the API models) don't carry `session_id`/`driver_id`
    themselves (those are URL-implied, see app/models/race_context.py), so
    this fake keys its seed data by them externally instead.
    """

    def __init__(
        self,
        stints_by_driver: dict[tuple[str, str], list[Stint]] | None = None,
        pit_stops_by_session: dict[str, list[PitStop]] | None = None,
    ) -> None:
        self._stints_by_driver = stints_by_driver or {}
        self._pit_stops_by_session = pit_stops_by_session or {}

    def list_stints(self, session_id: str, driver_id: str | None = None) -> list[Stint]:
        if driver_id is not None:
            return self._stints_by_driver.get((session_id, driver_id), [])
        return [
            stint
            for (stint_session_id, _), stints in self._stints_by_driver.items()
            if stint_session_id == session_id
            for stint in stints
        ]

    def list_pit_stops(self, session_id: str, driver_id: str | None = None) -> list[PitStop]:
        pit_stops = self._pit_stops_by_session.get(session_id, [])
        if driver_id is not None:
            pit_stops = [p for p in pit_stops if p.driver_id == driver_id]
        return pit_stops
