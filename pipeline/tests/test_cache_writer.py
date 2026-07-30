from pathlib import Path

import pandas as pd

from pitwall_pipeline.cache_writer import session_cache_dir, write_session_cache
from pitwall_pipeline.models import (
    Driver,
    Lap,
    NormalizedSessionData,
    Session,
    SessionType,
    TelemetrySample,
    TrackPoint,
)


def _session_data(*, with_telemetry: bool = True) -> NormalizedSessionData:
    session = Session(
        session_id="2023_italian_grand_prix_race",
        season=2023,
        event_name="Italian Grand Prix",
        round_number=16,
        location="Monza",
        country="Italy",
        session_type=SessionType.RACE,
        session_date="2023-09-03T13:00:00+00:00",
    )
    drivers = [
        Driver(
            session_id=session.session_id,
            driver_id="VER",
            driver_number=1,
            full_name="Max Verstappen",
            team_name="Red Bull Racing",
        )
    ]
    laps = [
        Lap(
            session_id=session.session_id,
            driver_id="VER",
            lap_number=1,
            lap_time_seconds=91.234,
            sector_1_seconds=30.1,
            sector_2_seconds=31.0,
            sector_3_seconds=30.134,
            is_personal_best=True,
            is_accurate=True,
        )
    ]
    telemetry = (
        [
            TelemetrySample(
                session_id=session.session_id,
                driver_id="VER",
                lap_number=1,
                distance_m=0.0,
                time_seconds=0.0,
                speed_kph=300.0,
                throttle_pct=100.0,
                brake_active=False,
                rpm=11000.0,
                gear=7,
                drs_active=True,
                x=100.0,
                y=200.0,
                z=1.0,
            )
        ]
        if with_telemetry
        else []
    )
    track_points = (
        [TrackPoint(session_id=session.session_id, distance_m=0.0, x=100.0, y=200.0)]
        if with_telemetry
        else []
    )
    return NormalizedSessionData(
        session=session, drivers=drivers, laps=laps, telemetry=telemetry, track_points=track_points
    )


def test_session_cache_dir_matches_data_model_layout(tmp_path: Path) -> None:
    output_dir = session_cache_dir(_session_data(), base_dir=tmp_path)

    assert output_dir == tmp_path / "2023" / "italian_grand_prix" / "race"


def test_write_session_cache_writes_all_five_files_and_round_trips(tmp_path: Path) -> None:
    data = _session_data()

    output_dir = write_session_cache(data, base_dir=tmp_path)

    assert output_dir == tmp_path / "2023" / "italian_grand_prix" / "race"
    expected_files = {
        "session.parquet",
        "drivers.parquet",
        "laps.parquet",
        "telemetry.parquet",
        "track.parquet",
    }
    assert {p.name for p in output_dir.iterdir()} == expected_files

    session_df = pd.read_parquet(output_dir / "session.parquet")
    assert session_df.iloc[0]["session_id"] == "2023_italian_grand_prix_race"

    telemetry_df = pd.read_parquet(output_dir / "telemetry.parquet")
    assert len(telemetry_df) == 1
    assert telemetry_df.iloc[0]["x"] == 100.0


def test_write_session_cache_writes_empty_parquet_with_columns_when_no_telemetry(
    tmp_path: Path,
) -> None:
    data = _session_data(with_telemetry=False)

    output_dir = write_session_cache(data, base_dir=tmp_path)

    telemetry_df = pd.read_parquet(output_dir / "telemetry.parquet")
    track_df = pd.read_parquet(output_dir / "track.parquet")

    assert len(telemetry_df) == 0
    assert set(telemetry_df.columns) == set(TelemetrySample.model_fields.keys())
    assert len(track_df) == 0
    assert set(track_df.columns) == set(TrackPoint.model_fields.keys())
