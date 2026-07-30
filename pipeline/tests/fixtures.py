"""Hand-built, FastF1-shaped test data.

CLAUDE.md requires tests to run against recorded fixtures without touching FastF1 or the
network. These builders reproduce the exact column names/shapes FastF1's Session.results,
Session.laps, and Lap.get_telemetry() return (see normalize.py's docstrings for the
source-of-truth column list for each) so normalize.py and FastF1Provider can be exercised
without a live fastf1.core.Session.
"""

import pandas as pd


def build_results_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "DriverNumber": "1",
                "Abbreviation": "VER",
                "FullName": "Max Verstappen",
                "FirstName": "Max",
                "LastName": "Verstappen",
                "TeamName": "Red Bull Racing",
            },
            {
                "DriverNumber": "44",
                "Abbreviation": "HAM",
                "FullName": "Lewis Hamilton",
                "FirstName": "Lewis",
                "LastName": "Hamilton",
                "TeamName": "Mercedes",
            },
        ]
    )


def build_laps_df() -> pd.DataFrame:
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
