"""Hand-built, FastF1-shaped test data.

CLAUDE.md requires tests to run against recorded fixtures without touching FastF1 or the
network. These builders reproduce the exact column names/shapes FastF1's Session.results,
Session.laps, and Lap.get_telemetry() return (see normalize.py's docstrings for the
source-of-truth column list for each) so normalize.py and FastF1Provider can be exercised
without a live fastf1.core.Session.
"""

import pandas as pd


def build_results_df() -> pd.DataFrame:
    """Race-classification-shaped: mirrors a real Race session's results
    frame, where ClassifiedPosition/GridPosition/Status/Points (M34,
    docs/m34-design-review.md §2) are populated. See build_practice_results_df
    below for the "columns present but not applicable" (Practice) shape.
    """
    return pd.DataFrame(
        [
            {
                "DriverNumber": "1",
                "Abbreviation": "VER",
                "FullName": "Max Verstappen",
                "FirstName": "Max",
                "LastName": "Verstappen",
                "TeamName": "Red Bull Racing",
                "ClassifiedPosition": "1",
                "GridPosition": 1.0,
                "Status": "Finished",
                "Points": 25.0,
            },
            {
                "DriverNumber": "44",
                "Abbreviation": "HAM",
                "FullName": "Lewis Hamilton",
                "FirstName": "Lewis",
                "LastName": "Hamilton",
                "TeamName": "Mercedes",
                "ClassifiedPosition": "2",
                "GridPosition": 3.0,
                "Status": "Finished",
                "Points": 18.0,
            },
        ]
    )


def build_practice_results_df() -> pd.DataFrame:
    """Practice-shaped: FastF1 populates ClassifiedPosition/GridPosition/
    Status/Points columns for every session type (SessionResults' own
    "all dataframe columns will always exist" guarantee), but leaves them
    NaN for session types it doesn't compute a classification for -- e.g.
    Practice (M34, docs/m34-design-review.md §4).
    """
    return pd.DataFrame(
        [
            {
                "DriverNumber": "1",
                "Abbreviation": "VER",
                "FullName": "Max Verstappen",
                "FirstName": "Max",
                "LastName": "Verstappen",
                "TeamName": "Red Bull Racing",
                "ClassifiedPosition": float("nan"),
                "GridPosition": float("nan"),
                "Status": float("nan"),
                "Points": float("nan"),
            },
        ]
    )


def build_laps_df() -> pd.DataFrame:
    # Stint/Compound/TyreLife/PitInTime/PitOutTime column names and dtypes
    # (Stint, TyreLife float64; Compound object/str; PitInTime/PitOutTime
    # timedelta64[ns]) verified against a real FastF1 session -- see
    # docs/m10-implementation-plan.md Phase 2 §2.0. Both rows here are lap 1
    # of stint 1 with no pit stop (PitInTime/PitOutTime both NaT); the
    # multi-lap/stint-transition/pit-stop scenarios this single-lap-per-
    # driver fixture can't represent live in build_laps_df_with_pit_stop()
    # below, used only by the dedicated stint/pit-stop normalization tests.
    return pd.DataFrame(
        [
            {
                "Driver": "VER",
                "LapNumber": 1,
                "LapTime": pd.Timedelta(seconds=91.234),
                "Sector1Time": pd.Timedelta(seconds=30.1),
                "Sector2Time": pd.Timedelta(seconds=31.0),
                "Sector3Time": pd.Timedelta(seconds=30.134),
                "IsPersonalBest": True,
                "IsAccurate": True,
                "Stint": 1.0,
                "Compound": "SOFT",
                "TyreLife": 2.0,
                "PitInTime": pd.NaT,
                "PitOutTime": pd.NaT,
                "Position": 1.0,
            },
            {
                "Driver": "HAM",
                "LapNumber": 1,
                "LapTime": pd.Timedelta(seconds=92.5),
                "Sector1Time": pd.Timedelta(seconds=30.5),
                "Sector2Time": pd.Timedelta(seconds=31.2),
                "Sector3Time": pd.Timedelta(seconds=30.8),
                "IsPersonalBest": False,
                "IsAccurate": True,
                "Stint": 1.0,
                "Compound": "MEDIUM",
                "TyreLife": 1.0,
                "PitInTime": pd.NaT,
                "PitOutTime": pd.NaT,
                "Position": 2.0,
            },
        ]
    )


def build_practice_laps_df() -> pd.DataFrame:
    """Practice-shaped: FastF1 leaves `Position` NaN for every lap in a
    session type outside `_RACE_LIKE_SESSIONS` (M35,
    docs/m35-design-review.md §3) -- the column is present, not absent.
    """
    return pd.DataFrame(
        [
            {
                "Driver": "VER",
                "LapNumber": 1,
                "LapTime": pd.Timedelta(seconds=91.234),
                "Sector1Time": pd.Timedelta(seconds=30.1),
                "Sector2Time": pd.Timedelta(seconds=31.0),
                "Sector3Time": pd.Timedelta(seconds=30.134),
                "IsPersonalBest": True,
                "IsAccurate": True,
                "Position": float("nan"),
            },
        ]
    )


def build_laps_df_with_pit_stop() -> pd.DataFrame:
    """One driver (VER), three laps, one pit stop between stint 1 and stint 2.

    Dedicated to the stint/pit-stop normalization tests -- `build_laps_df()`
    above is shared by many pre-existing single-lap-per-driver tests and
    deliberately isn't reshaped to also carry a multi-lap stint transition.
    Mirrors the real pattern verified against FastF1 (Phase 2 §2.0):
    PitInTime is set on the in-lap (lap 2) with PitOutTime null; PitOutTime
    is set on the very next lap (lap 3) with PitInTime null.
    """
    return pd.DataFrame(
        [
            {
                "Driver": "VER",
                "LapNumber": 1,
                "LapTime": pd.Timedelta(seconds=91.0),
                "Sector1Time": pd.Timedelta(seconds=30.0),
                "Sector2Time": pd.Timedelta(seconds=31.0),
                "Sector3Time": pd.Timedelta(seconds=30.0),
                "IsPersonalBest": False,
                "IsAccurate": True,
                "Stint": 1.0,
                "Compound": "SOFT",
                "TyreLife": 4.0,
                "PitInTime": pd.NaT,
                "PitOutTime": pd.NaT,
            },
            {
                "Driver": "VER",
                "LapNumber": 2,
                "LapTime": pd.Timedelta(seconds=91.5),
                "Sector1Time": pd.Timedelta(seconds=30.2),
                "Sector2Time": pd.Timedelta(seconds=31.1),
                "Sector3Time": pd.Timedelta(seconds=30.2),
                "IsPersonalBest": False,
                "IsAccurate": True,
                "Stint": 1.0,
                "Compound": "SOFT",
                "TyreLife": 5.0,
                "PitInTime": pd.Timedelta(hours=1, minutes=27, seconds=30.291),
                "PitOutTime": pd.NaT,
            },
            {
                "Driver": "VER",
                "LapNumber": 3,
                "LapTime": pd.Timedelta(seconds=95.0),
                "Sector1Time": pd.Timedelta(seconds=32.0),
                "Sector2Time": pd.Timedelta(seconds=32.5),
                "Sector3Time": pd.Timedelta(seconds=30.5),
                "IsPersonalBest": False,
                "IsAccurate": True,
                "Stint": 2.0,
                "Compound": "HARD",
                "TyreLife": 1.0,
                "PitInTime": pd.NaT,
                "PitOutTime": pd.Timedelta(hours=1, minutes=27, seconds=55.379),
            },
        ]
    )


def build_telemetry_df(*, num_samples: int = 3, drs_active: bool = True) -> pd.DataFrame:
    drs_value = 12 if drs_active else 8
    return pd.DataFrame(
        [
            {
                "Distance": float(i * 100),
                "Time": pd.Timedelta(seconds=i * 1.5),
                "Speed": 250.0 + i,
                "Throttle": 100.0,
                "Brake": False,
                "RPM": 11000.0,
                "nGear": 7,
                "DRS": drs_value,
                "X": 1000.0 + i,
                "Y": 2000.0 + i,
                "Z": 10.0,
            }
            for i in range(num_samples)
        ]
    )
