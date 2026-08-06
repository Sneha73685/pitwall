import pandas as pd
import pytest

from pitwall_pipeline.normalize import normalize_pit_stops
from tests.fixtures import build_laps_df, build_laps_df_with_pit_stop


def test_normalize_pit_stops_no_pit_stops() -> None:
    pit_stops = normalize_pit_stops(build_laps_df(), session_id="2023_monza_race")

    assert pit_stops == []


def test_normalize_pit_stops_computes_pit_lane_time_across_two_rows() -> None:
    """FastF1 splits one pit stop across two adjacent lap rows (verified,
    docs/m10-implementation-plan.md Phase 2 §2.0): PitInTime on the in-lap,
    PitOutTime on the following out-lap. pit_lane_time_seconds must be
    derived across both rows, not a same-row subtraction.
    """
    pit_stops = normalize_pit_stops(build_laps_df_with_pit_stop(), session_id="2023_monza_race")

    assert len(pit_stops) == 1
    stop = pit_stops[0]
    assert stop.session_id == "2023_monza_race"
    assert stop.driver_id == "VER"
    assert stop.stop_number == 1
    assert stop.lap_number == 2  # the in-lap, not the out-lap
    assert stop.pit_lane_time_seconds == pytest.approx(25.088)


def test_normalize_pit_stops_no_matching_out_lap_yields_null_duration() -> None:
    """A driver who pits on the session's final lap (or retires in the pits)
    has no following lap to read PitOutTime from -- the stop is still
    recorded, but pit_lane_time_seconds must be None, not fabricated.
    """
    laps_df = build_laps_df_with_pit_stop()
    # Drop the out-lap (lap 3) entirely, so lap 2's PitInTime has no
    # lap 2 + 1 = lap 3 row to pair with.
    laps_df = laps_df[laps_df["LapNumber"] != 3]

    pit_stops = normalize_pit_stops(laps_df, session_id="2023_monza_race")

    assert len(pit_stops) == 1
    assert pit_stops[0].lap_number == 2
    assert pit_stops[0].pit_lane_time_seconds is None


def test_normalize_pit_stops_out_lap_missing_pit_out_time_yields_null_duration() -> None:
    """The following lap exists but FastF1 didn't record a PitOutTime for it
    (a data-quality gap, design review §7) -- still None, not fabricated.
    """
    laps_df = build_laps_df_with_pit_stop()
    laps_df.loc[laps_df["LapNumber"] == 3, "PitOutTime"] = pd.NaT

    pit_stops = normalize_pit_stops(laps_df, session_id="2023_monza_race")

    assert len(pit_stops) == 1
    assert pit_stops[0].pit_lane_time_seconds is None


def test_normalize_pit_stops_counts_multiple_stops_in_order() -> None:
    laps_df = build_laps_df_with_pit_stop()
    extra_stop_lap = pd.DataFrame(
        [
            {
                "Driver": "VER",
                "LapNumber": 4,
                "LapTime": pd.Timedelta(seconds=92.0),
                "Sector1Time": pd.Timedelta(seconds=30.5),
                "Sector2Time": pd.Timedelta(seconds=31.0),
                "Sector3Time": pd.Timedelta(seconds=30.5),
                "IsPersonalBest": False,
                "IsAccurate": True,
                "Stint": 2.0,
                "Compound": "HARD",
                "TyreLife": 2.0,
                "PitInTime": pd.Timedelta(hours=2, minutes=0, seconds=0),
                "PitOutTime": pd.NaT,
            },
            {
                "Driver": "VER",
                "LapNumber": 5,
                "LapTime": pd.Timedelta(seconds=91.0),
                "Sector1Time": pd.Timedelta(seconds=30.0),
                "Sector2Time": pd.Timedelta(seconds=31.0),
                "Sector3Time": pd.Timedelta(seconds=30.0),
                "IsPersonalBest": False,
                "IsAccurate": True,
                "Stint": 3.0,
                "Compound": "SOFT",
                "TyreLife": 1.0,
                "PitInTime": pd.NaT,
                "PitOutTime": pd.Timedelta(hours=2, minutes=0, seconds=25),
            },
        ]
    )
    laps_df = pd.concat([laps_df, extra_stop_lap], ignore_index=True)

    pit_stops = normalize_pit_stops(laps_df, session_id="2023_monza_race")

    assert [p.stop_number for p in pit_stops] == [1, 2]
    assert [p.lap_number for p in pit_stops] == [2, 4]
