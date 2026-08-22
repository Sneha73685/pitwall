import pandas as pd

from pitwall_pipeline.models import SessionType
from pitwall_pipeline.normalize import (
    normalize_drivers,
    normalize_laps,
    normalize_session,
    normalize_telemetry,
)
from tests.fixtures import (
    build_laps_df,
    build_practice_laps_df,
    build_practice_results_df,
    build_qualifying_results_df,
    build_results_df,
    build_telemetry_df,
)


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


def test_normalize_drivers_maps_classification_fields() -> None:
    """M34 (docs/m34-design-review.md §2/§4/§9)."""
    drivers = normalize_drivers(build_results_df(), session_id="2023_monza_race")

    ver, ham = drivers
    assert ver.classified_position == "1"
    assert ver.grid_position == 1
    assert ver.status == "Finished"
    assert ver.points == 25.0
    assert ham.classified_position == "2"
    assert ham.grid_position == 3
    assert ham.points == 18.0


def test_normalize_drivers_handles_non_applicable_classification_fields() -> None:
    """Practice sessions: FastF1 still returns the classification columns,
    but NaN, not absent (docs/m34-design-review.md §4) -- must normalize to
    None, not raise or default to a misleading value.
    """
    drivers = normalize_drivers(build_practice_results_df(), session_id="2023_monza_practice_1")

    ver = drivers[0]
    assert ver.classified_position is None
    assert ver.grid_position is None
    assert ver.status is None
    assert ver.points is None


def test_normalize_drivers_maps_qualifying_segment_times() -> None:
    """M42 (docs/m42-design-review.md). VER advances through all three
    segments -- exact seconds conversion proves `_timedelta_to_seconds`
    reuse is correct."""
    drivers = normalize_drivers(build_qualifying_results_df(), session_id="2023_monza_qualifying")

    ver = drivers[0]
    assert ver.q1_seconds == 78.241
    assert ver.q2_seconds == 77.593
    assert ver.q3_seconds == 76.982


def test_normalize_drivers_handles_partial_qualifying_segment_times() -> None:
    """M42: a driver eliminated after Q1 has Q2/Q3 as `NaT` -- must
    normalize to None independently per segment, not raise, and must not
    be conflated with Q1 also being absent."""
    drivers = normalize_drivers(build_qualifying_results_df(), session_id="2023_monza_qualifying")

    ham = drivers[1]
    assert ham.q1_seconds == 79.104
    assert ham.q2_seconds is None
    assert ham.q3_seconds is None


def test_normalize_drivers_handles_non_applicable_qualifying_segment_times() -> None:
    """Practice sessions: FastF1 still returns the Q1/Q2/Q3 columns, but
    NaT, not absent (M42, mirroring M34's own non-applicable-fields case
    above) -- must normalize to None, not raise or fabricate a value."""
    drivers = normalize_drivers(build_practice_results_df(), session_id="2023_monza_practice_1")

    ver = drivers[0]
    assert ver.q1_seconds is None
    assert ver.q2_seconds is None
    assert ver.q3_seconds is None


def test_normalize_drivers_handles_missing_qualifying_columns() -> None:
    """A results frame that lacks Q1/Q2/Q3 entirely (e.g. a pre-M42
    hand-built fixture, or -- for real data -- any session ingested before
    M42) must normalize to None, not raise (`.get()`, not bracket access,
    mirroring every other additive Driver field's own precedent)."""
    drivers = normalize_drivers(build_results_df(), session_id="2023_monza_race")

    ver = drivers[0]
    assert ver.q1_seconds is None
    assert ver.q2_seconds is None
    assert ver.q3_seconds is None


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


def test_normalize_laps_maps_position() -> None:
    """M35 (docs/m35-design-review.md §3/§4)."""
    laps = normalize_laps(build_laps_df(), session_id="2023_monza_race")

    assert laps[0].position == 1
    assert laps[1].position == 2


def test_normalize_laps_handles_non_applicable_position() -> None:
    """Practice sessions: FastF1 still returns the Position column, but NaN
    for every lap (docs/m35-design-review.md §3) -- must normalize to None,
    not raise or fabricate a value.
    """
    laps = normalize_laps(build_practice_laps_df(), session_id="2023_monza_practice_1")

    assert laps[0].position is None


def test_normalize_laps_maps_track_status() -> None:
    """M36 (docs/m36-design-review.md §2/§4). Includes a combined-code
    value (a lap spanning yellow then Safety Car) -- TrackStatus is a
    concatenated string, not a single code, per FastF1's own
    `_add_track_status_to_laps` algorithm."""
    laps_df = build_laps_df()
    laps_df.loc[1, "TrackStatus"] = "24"

    laps = normalize_laps(laps_df, session_id="2023_monza_race")

    assert laps[0].track_status == "1"
    assert laps[1].track_status == "24"


def test_normalize_laps_handles_missing_track_status_column() -> None:
    """Unlike Position, TrackStatus is never session-type-gated (§2) -- the
    only genuine "missing" case is a DataFrame that lacks the column
    entirely (e.g. an older hand-built fixture), which must normalize to
    None, not raise."""
    laps_df = build_laps_df().drop(columns=["TrackStatus"])

    laps = normalize_laps(laps_df, session_id="2023_monza_race")

    assert laps[0].track_status is None


def test_normalize_laps_maps_deleted() -> None:
    """M40 (docs/m40-design-review.md §17/§20). A non-deleted lap normalizes
    `deleted` to False and `deleted_reason` to None (FastF1 uses "", not
    NaN, for a non-deleted lap's reason -- must not leak as an empty
    string)."""
    laps_df = build_laps_df()
    laps_df.loc[1, "Deleted"] = True
    laps_df.loc[1, "DeletedReason"] = "TRACK LIMITS AT TURN 10 (NEXT LAP)"

    laps = normalize_laps(laps_df, session_id="2023_monza_race")

    assert laps[0].deleted is False
    assert laps[0].deleted_reason is None
    assert laps[1].deleted is True
    assert laps[1].deleted_reason == "TRACK LIMITS AT TURN 10 (NEXT LAP)"


def test_normalize_laps_handles_missing_deleted_columns() -> None:
    """Not session-type-gated, same as TrackStatus -- the only genuine
    "missing" case is a DataFrame that lacks the columns entirely (e.g. an
    older hand-built fixture, or any real session ingested before M40),
    which must normalize to None, not raise."""
    laps_df = build_laps_df().drop(columns=["Deleted", "DeletedReason"])

    laps = normalize_laps(laps_df, session_id="2023_monza_race")

    assert laps[0].deleted is None
    assert laps[0].deleted_reason is None


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
