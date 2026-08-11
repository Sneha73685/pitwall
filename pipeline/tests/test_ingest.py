"""Tests for pitwall_pipeline.ingest.ingest_session's IngestResult return
value (M12 Phase 2 -- widened from a bare Path; no existing caller relied
on the old return type, see ingest.py's IngestResult docstring).
"""

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

from pitwall_pipeline import ingest as ingest_module
from pitwall_pipeline.ingest import ingest_session
from pitwall_pipeline.models import (
    Driver,
    Lap,
    NormalizedSessionData,
    Session,
    SessionType,
    TelemetrySample,
    TrackPoint,
)


def _session_data(*, lap_count: int, telemetry_sample_count: int) -> NormalizedSessionData:
    session = Session(
        session_id="2024_bahrain_grand_prix_race",
        season=2024,
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_type=SessionType.RACE,
    )
    laps = [
        Lap(
            session_id=session.session_id,
            driver_id="VER",
            lap_number=n + 1,
            lap_time_seconds=90.0,
            sector_1_seconds=30.0,
            sector_2_seconds=30.0,
            sector_3_seconds=30.0,
            is_personal_best=False,
            is_accurate=True,
        )
        for n in range(lap_count)
    ]
    telemetry = [
        TelemetrySample(
            session_id=session.session_id,
            driver_id="VER",
            lap_number=1,
            distance_m=float(n),
            time_seconds=float(n),
            speed_kph=300.0,
            throttle_pct=100.0,
            brake_active=False,
            rpm=11000.0,
            gear=8,
            drs_active=False,
            x=0.0,
            y=0.0,
            z=0.0,
        )
        for n in range(telemetry_sample_count)
    ]
    return NormalizedSessionData(
        session=session,
        drivers=[
            Driver(
                session_id=session.session_id,
                driver_id="VER",
                driver_number=1,
                full_name="Max Verstappen",
                team_name="Red Bull",
            )
        ],
        laps=laps,
        telemetry=telemetry,
        track_points=[TrackPoint(session_id=session.session_id, distance_m=0.0, x=0.0, y=0.0)],
    )


@patch.object(ingest_module, "write_pit_stops")
@patch.object(ingest_module, "write_stints")
@patch.object(ingest_module, "get_connection")
@patch.object(ingest_module, "write_session_cache")
@patch.object(ingest_module, "FastF1Provider")
def test_ingest_session_returns_ingest_result_with_counts(
    mock_provider_cls: Any,
    mock_write_cache: Any,
    mock_get_connection: Any,
    mock_write_stints: Any,
    mock_write_pit_stops: Any,
    tmp_path: Path,
) -> None:
    data = _session_data(lap_count=57, telemetry_sample_count=1000)
    mock_provider_cls.return_value.load_session.return_value = data
    mock_write_cache.return_value = tmp_path / "output"
    mock_get_connection.return_value.__enter__ = MagicMock(return_value=MagicMock())
    mock_get_connection.return_value.__exit__ = MagicMock(return_value=False)

    result = ingest_session(2024, "Bahrain", SessionType.RACE, processed_dir=tmp_path)

    assert result.session_id == "2024_bahrain_grand_prix_race"
    assert result.output_dir == tmp_path / "output"
    assert result.lap_count == 57
    assert result.telemetry_sample_count == 1000


@patch.object(ingest_module, "write_pit_stops")
@patch.object(ingest_module, "write_stints")
@patch.object(ingest_module, "get_connection")
@patch.object(ingest_module, "write_session_cache")
@patch.object(ingest_module, "FastF1Provider")
def test_ingest_session_result_reflects_zero_telemetry(
    mock_provider_cls: Any,
    mock_write_cache: Any,
    mock_get_connection: Any,
    mock_write_stints: Any,
    mock_write_pit_stops: Any,
    tmp_path: Path,
) -> None:
    """The real, verified 2018 case (docs/m12-design-review.md §19.2):
    laps present, zero telemetry -- ingest_session() must report this
    honestly via the returned counts, not hide it."""
    data = _session_data(lap_count=57, telemetry_sample_count=0)
    mock_provider_cls.return_value.load_session.return_value = data
    mock_write_cache.return_value = tmp_path / "output"
    mock_get_connection.return_value.__enter__ = MagicMock(return_value=MagicMock())
    mock_get_connection.return_value.__exit__ = MagicMock(return_value=False)

    result = ingest_session(2018, "Bahrain", SessionType.RACE, processed_dir=tmp_path)

    assert result.lap_count == 57
    assert result.telemetry_sample_count == 0
