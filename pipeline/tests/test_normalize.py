import pandas as pd

from pitwall_pipeline.models import SessionType
from pitwall_pipeline.normalize import (
    normalize_drivers,
    normalize_laps,
    normalize_session,
    normalize_telemetry,
)
from tests.fixtures import build_laps_df, build_results_df, build_telemetry_df


def test_normalize_session_builds_stable_session_id() -> None:
    session = normalize_session(
        season=2023,
        event_name="Italian Grand Prix",
        round_number=16,
        location="Monza",
        country="Italy",
        session_type=SessionType.RACE,
        session_date="2023-09-03T13:00:00+00:00",
    )

    assert session.session_id == "2023_italian_grand_prix_race"
    assert session.season == 2023
    assert session.round_number == 16
    assert session.session_date == "2023-09-03T13:00:00+00:00"


def test_normalize_drivers_maps_expected_fields() -> None:
    drivers = normalize_drivers(build_results_df(), session_id="2023_monza_race")

    assert [d.driver_id for d in drivers] == ["VER", "HAM"]
    ver = drivers[0]
    assert ver.session_id == "2023_monza_race"
    assert ver.driver_number == 1
    assert ver.full_name == "Max Verstappen"
    assert ver.team_name == "Red Bull Racing"


def test_normalize_drivers_falls_back_to_first_last_name() -> None:
    results = build_results_df()
    results.loc[0, "FullName"] = ""

    drivers = normalize_drivers(results, session_id="2023_monza_race")

    assert drivers[0].full_name == "Max Verstappen"


def test_normalize_laps_maps_times_and_flags() -> None:
    laps = normalize_laps(build_laps_df(), session_id="2023_monza_race")

    ver_lap = laps[0]
    assert ver_lap.driver_id == "VER"
    assert ver_lap.lap_number == 1
    assert ver_lap.lap_time_seconds == 91.234
    assert ver_lap.sector_1_seconds == 30.1
    assert ver_lap.is_personal_best is True
    assert ver_lap.is_accurate is True


def test_normalize_laps_handles_missing_lap_time() -> None:
    laps_df = build_laps_df()
    laps_df.loc[0, "LapTime"] = pd.NaT

    laps = normalize_laps(laps_df, session_id="2023_monza_race")

    assert laps[0].lap_time_seconds is None


def test_normalize_telemetry_converts_units_and_drs() -> None:
    samples = normalize_telemetry(
        build_telemetry_df(num_samples=2, drs_active=True),
        session_id="2023_monza_race",
        driver_id="VER",
        lap_number=1,
    )

    assert len(samples) == 2
    first = samples[0]
    assert first.session_id == "2023_monza_race"
    assert first.driver_id == "VER"
    assert first.lap_number == 1
    assert first.distance_m == 0.0
    assert first.time_seconds == 0.0
    assert first.drs_active is True
    # FastF1 reports X/Y/Z in 1/10 metre units; normalize converts to metres.
    assert first.x == 100.0
    assert first.y == 200.0
    assert first.z == 1.0


def test_normalize_telemetry_drs_inactive_below_threshold() -> None:
    samples = normalize_telemetry(
        build_telemetry_df(num_samples=1, drs_active=False),
        session_id="2023_monza_race",
        driver_id="VER",
        lap_number=1,
    )

    assert samples[0].drs_active is False
