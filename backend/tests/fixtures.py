"""Synthetic Parquet session cache, matching the layout
pipeline/pitwall_pipeline/cache_writer.py writes (docs/data-model.md).
Hand-built DataFrames -- no FastF1 or pipeline package involved.
"""

from pathlib import Path

import pandas as pd

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
        ]
    ).to_parquet(session_dir / "telemetry.parquet", index=False)

    return session_dir
