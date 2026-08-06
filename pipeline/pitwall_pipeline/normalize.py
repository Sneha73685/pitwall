"""Normalization: FastF1-shaped pandas data -> PitWall's internal domain model.

Kept separate from FastF1Provider (see docs/architecture.md's data-flow
diagram, which shows Provider and Normalization as distinct steps) so the
mapping logic can be unit-tested against hand-built DataFrames without a real
fastf1.core.Session. This is the one place allowed to know FastF1's column
names and unit quirks (ADR-0005) -- nothing downstream may.
"""

from typing import Any

import pandas as pd

from pitwall_pipeline.models import (
    Driver,
    Lap,
    PitStop,
    Session,
    SessionType,
    Stint,
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


def _optional_str(value: Any) -> str | None:
    """Convert a (possibly missing) FastF1 field to a string, or None."""
    if value is None or pd.isna(value):
        return None
    return str(value)


def _optional_int(value: Any) -> int | None:
    """Convert a (possibly missing) FastF1 numeric field to an int, or None."""
    if value is None or pd.isna(value):
        return None
    return int(value)


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
    Sector3Time, IsPersonalBest, IsAccurate, Compound (see
    fastf1.core.Laps._COLUMNS; Compound verified present -- M10, see
    docs/m10-implementation-plan.md Phase 2 §2.0).
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
                compound=_optional_str(row.get("Compound")),
            )
        )
    return result


def normalize_stints(laps: pd.DataFrame, *, session_id: str) -> list[Stint]:
    """Normalize a FastF1 Laps-shaped DataFrame (all drivers) into Stint records.

    A stint is a contiguous run of laps one driver spends on one tyre set,
    reported directly by FastF1 via the `Stint` column (an integer per
    driver, restarting at 1 for each driver -- verified against a real 2024
    Bahrain GP Race session, docs/m10-implementation-plan.md Phase 2 §2.0)
    rather than derived by detecting compound changes ourselves.

    Expected columns: Driver, LapNumber, Stint, Compound, TyreLife. `Stint`
    and `LapNumber` are `float64` at the pandas level (the same "may contain
    NaN" convention that already requires `int(row["LapNumber"])` in
    `normalize_laps`), even though their real values are always whole
    numbers. A lap missing any of Stint/LapNumber/Compound is skipped
    (defensive: FastF1 data-quality gaps around formation laps/red flags are
    a known risk, design review §7) rather than raising.
    """
    grouped: dict[tuple[str, int], list[dict[str, Any]]] = {}
    order: list[tuple[str, int]] = []

    for _, row in laps.iterrows():
        stint_raw = row.get("Stint")
        lap_number_raw = row.get("LapNumber")
        compound = row.get("Compound")
        if (
            stint_raw is None
            or pd.isna(stint_raw)
            or lap_number_raw is None
            or pd.isna(lap_number_raw)
            or compound is None
            or pd.isna(compound)
        ):
            continue

        key = (str(row["Driver"]), int(stint_raw))
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        grouped[key].append(
            {
                "lap_number": int(lap_number_raw),
                "compound": str(compound),
                "tyre_life": row.get("TyreLife"),
            }
        )

    stints = []
    for driver_id, stint_number in order:
        rows = sorted(grouped[(driver_id, stint_number)], key=lambda r: int(r["lap_number"]))
        first, last = rows[0], rows[-1]
        stints.append(
            Stint(
                session_id=session_id,
                driver_id=driver_id,
                stint_number=stint_number,
                compound=str(first["compound"]),
                start_lap=int(first["lap_number"]),
                end_lap=int(last["lap_number"]),
                tyre_life_at_start=_optional_int(first["tyre_life"]),
            )
        )
    return stints


def normalize_pit_stops(laps: pd.DataFrame, *, session_id: str) -> list[PitStop]:
    """Normalize a FastF1 Laps-shaped DataFrame (all drivers) into PitStop records.

    FastF1 splits one physical pit stop across two adjacent lap rows for the
    same driver -- verified against a real 2024 Bahrain GP Race session
    (docs/m10-implementation-plan.md Phase 2 §2.0), not assumed: the "in lap"
    (the lap on which the car crosses the pit entry line) has `PitInTime` set
    and `PitOutTime` null; the very next lap (the "out lap") has `PitOutTime`
    set and `PitInTime` null. The two values never coexist on one row, so
    `pit_lane_time_seconds` cannot be a single-row subtraction -- it is
    computed across the in-lap and the immediately following lap
    (`LapNumber + 1`) for the same driver. If no matching out-lap exists
    (e.g. a driver retires while in the pits, or pits on the session's final
    lap), `pit_lane_time_seconds` is `None` rather than fabricated.

    Expected columns: Driver, LapNumber, PitInTime, PitOutTime.
    """
    laps_by_driver: dict[str, dict[int, dict[str, Any]]] = {}
    for _, row in laps.iterrows():
        lap_number_raw = row.get("LapNumber")
        if lap_number_raw is None or pd.isna(lap_number_raw):
            continue
        driver_id = str(row["Driver"])
        laps_by_driver.setdefault(driver_id, {})[int(lap_number_raw)] = {
            "pit_in_time": row.get("PitInTime"),
            "pit_out_time": row.get("PitOutTime"),
        }

    pit_stops: list[PitStop] = []
    for driver_id, driver_laps in laps_by_driver.items():
        stop_number = 0
        for lap_number in sorted(driver_laps):
            pit_in_time = driver_laps[lap_number]["pit_in_time"]
            if pit_in_time is None or pd.isna(pit_in_time):
                continue
            stop_number += 1

            pit_lane_time_seconds: float | None = None
            next_lap = driver_laps.get(lap_number + 1)
            if next_lap is not None:
                pit_out_time = next_lap["pit_out_time"]
                if pit_out_time is not None and not pd.isna(pit_out_time):
                    pit_lane_time_seconds = float((pit_out_time - pit_in_time).total_seconds())

            pit_stops.append(
                PitStop(
                    session_id=session_id,
                    driver_id=driver_id,
                    stop_number=stop_number,
                    lap_number=lap_number,
                    pit_lane_time_seconds=pit_lane_time_seconds,
                )
            )
    return pit_stops


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
