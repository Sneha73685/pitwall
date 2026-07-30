"""Normalization: FastF1-shaped pandas data -> PitWall's internal domain model.

Kept separate from FastF1Provider (see docs/architecture.md's data-flow
diagram, which shows Provider and Normalization as distinct steps) so the
mapping logic can be unit-tested against hand-built DataFrames without a real
fastf1.core.Session. This is the one place allowed to know FastF1's column
names and unit quirks (ADR-0005) -- nothing downstream may.
"""

import pandas as pd

from pitwall_pipeline.models import (
    Driver,
    Lap,
    Session,
    SessionType,
    TelemetrySample,
    make_session_id,
)

# FastF1 reports position channels in 1/10 metre units; the internal schema
# standardizes on metres so nothing downstream has to know this quirk.
_POSITION_UNITS_TO_METERS = 0.1

# FastF1's DRS channel is a status code, not a boolean: values 10/12/14
# indicate DRS is actually open, lower values mean available-but-closed or
# not detected. See fastf1.api.car_data for the full code table.
_DRS_ACTIVE_THRESHOLD = 10


def _timedelta_to_seconds(value: pd.Timedelta | None) -> float | None:
    """Convert a (possibly missing) pandas Timedelta to seconds."""
    if value is None or pd.isna(value):
        return None
    return float(value.total_seconds())


def normalize_session(
    *,
    season: int,
    event_name: str,
    round_number: int,
    location: str,
    country: str,
    session_type: SessionType,
    session_date: str | None = None,
) -> Session:
    """Build the normalized Session record for one ingested session."""
    return Session(
        session_id=make_session_id(season, event_name, session_type),
        season=season,
        event_name=event_name,
        round_number=round_number,
        location=location,
        country=country,
        session_type=session_type,
        session_date=session_date,
    )


def normalize_drivers(results: pd.DataFrame, *, session_id: str) -> list[Driver]:
    """Normalize a FastF1 SessionResults-shaped DataFrame into Driver records.

    Expected columns: DriverNumber, Abbreviation, FullName, FirstName,
    LastName, TeamName (see fastf1.core.SessionResults._COLUMNS).
    """
    drivers = []
    for _, row in results.iterrows():
        full_name = str(row.get("FullName") or "").strip()
        if not full_name:
            full_name = f"{row.get('FirstName', '')} {row.get('LastName', '')}".strip()
        drivers.append(
            Driver(
                session_id=session_id,
                driver_id=str(row["Abbreviation"]),
                driver_number=int(row["DriverNumber"]),
                full_name=full_name,
                team_name=str(row["TeamName"]),
            )
        )
    return drivers


def normalize_laps(laps: pd.DataFrame, *, session_id: str) -> list[Lap]:
    """Normalize a FastF1 Laps-shaped DataFrame (all drivers) into Lap records.

    Expected columns: Driver, LapNumber, LapTime, Sector1Time, Sector2Time,
    Sector3Time, IsPersonalBest, IsAccurate (see fastf1.core.Laps._COLUMNS).
    """
    result = []
    for _, row in laps.iterrows():
        result.append(
            Lap(
                session_id=session_id,
                driver_id=str(row["Driver"]),
                lap_number=int(row["LapNumber"]),
                lap_time_seconds=_timedelta_to_seconds(row.get("LapTime")),
                sector_1_seconds=_timedelta_to_seconds(row.get("Sector1Time")),
                sector_2_seconds=_timedelta_to_seconds(row.get("Sector2Time")),
                sector_3_seconds=_timedelta_to_seconds(row.get("Sector3Time")),
                is_personal_best=bool(row.get("IsPersonalBest", False)),
                is_accurate=bool(row.get("IsAccurate", False)),
            )
        )
    return result


def normalize_telemetry(
    telemetry: pd.DataFrame,
    *,
    session_id: str,
    driver_id: str,
    lap_number: int,
) -> list[TelemetrySample]:
    """Normalize one driver/lap's FastF1 Telemetry-shaped DataFrame.

    Expected columns: Distance, Time, Speed, Throttle, Brake, RPM, nGear,
    DRS, X, Y, Z (see fastf1.core.Telemetry._COLUMNS). `telemetry` must
    already be sliced to a single driver and lap.
    """
    samples = []
    for _, row in telemetry.iterrows():
        samples.append(
            TelemetrySample(
                session_id=session_id,
                driver_id=driver_id,
                lap_number=lap_number,
                distance_m=float(row["Distance"]),
                time_seconds=float(pd.Timedelta(row["Time"]).total_seconds()),
                speed_kph=float(row["Speed"]),
                throttle_pct=float(row["Throttle"]),
                brake_active=bool(row["Brake"]),
                rpm=float(row["RPM"]),
                gear=int(row["nGear"]),
                drs_active=bool(int(row["DRS"]) >= _DRS_ACTIVE_THRESHOLD),
                x=float(row["X"]) * _POSITION_UNITS_TO_METERS,
                y=float(row["Y"]) * _POSITION_UNITS_TO_METERS,
                z=float(row["Z"]) * _POSITION_UNITS_TO_METERS,
            )
        )
    return samples
