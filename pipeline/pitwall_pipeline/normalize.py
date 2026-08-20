"""Normalization: FastF1-shaped pandas data -> PitWall's internal domain model.

Kept separate from FastF1Provider (see docs/architecture.md's data-flow
diagram, which shows Provider and Normalization as distinct steps) so the
mapping logic can be unit-tested against hand-built DataFrames without a real
fastf1.core.Session. This is the one place allowed to know FastF1's column
names and unit quirks (ADR-0005) -- nothing downstream may.
"""

from collections.abc import Sequence
from typing import Any

import pandas as pd

from pitwall_pipeline.models import (
    Driver,
    Event,
    EventDiscovery,
    Lap,
    PitStop,
    Session,
    SessionType,
    Stint,
    TelemetrySample,
    make_event_id,
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


def _optional_float(value: Any) -> float | None:
    """Convert a (possibly missing) FastF1 numeric field to a float, or None."""
    if value is None or pd.isna(value):
        return None
    return float(value)


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


def normalize_event(
    *,
    season: int,
    round_number: int,
    event_name: str,
    event_format: str,
    location: str,
    country: str,
    event_date: str | None = None,
) -> Event:
    """Build the normalized Event record for one race weekend (M12 Phase 1).

    Mirrors normalize_session's shape and calling convention -- primitive
    fields in, one identity field (event_id) derived, same as session_id.
    """
    return Event(
        event_id=make_event_id(season, event_name),
        season=season,
        round_number=round_number,
        event_name=event_name,
        event_format=event_format,
        location=location,
        country=country,
        event_date=event_date,
    )


class SessionNotAvailableError(ValueError):
    """A canonical SessionType has no corresponding session for a specific
    event -- e.g. SPRINT_QUALIFYING requested for a 2021/2022 sprint-format
    event, which has no such session at all (docs/m12-design-review.md
    §3.2/§3.3). This is a real, expected outcome ("not applicable to this
    event"), distinct from a session that exists but fails to load
    (FastF1's own errors from `Session.load()`) -- callers must not treat
    the two the same way (design review §10).
    """


# Real FastF1 SessionN display-name strings observed for each canonical
# SessionType, across every EventFormat era verified in
# docs/m12-design-review.md §3.2/§3.3/§4/§19. Resolution (below) always
# reads an event's *own* schedule row and matches by literal display name --
# never a static season-range table and never FastF1's short abbreviations
# ("SQ"/"SS"), which docs/m12-design-review.md §3.3 proved are empirically
# unsafe: "SQ" silently resolves to the Sprint session itself for
# 2021-2022 events (no distinct sprint-qualifying session exists that era)
# and raises for 2023 events (whose real session is named "Sprint
# Shootout", not reachable via "SQ" at all). "Sprint Qualifying" (2024+)
# and "Sprint Shootout" (2023) are two real, different FastF1 display names
# for the one canonical SPRINT_QUALIFYING slot PitWall's taxonomy treats as
# stable; 2021-2022 sprint-format events simply have no session matching
# any SPRINT_QUALIFYING alias, which resolve_session_identifier reports as
# SessionNotAvailableError, not a misresolution.
_CANONICAL_SESSION_NAME_ALIASES: dict[SessionType, frozenset[str]] = {
    SessionType.PRACTICE_1: frozenset({"Practice 1"}),
    SessionType.PRACTICE_2: frozenset({"Practice 2"}),
    SessionType.PRACTICE_3: frozenset({"Practice 3"}),
    SessionType.QUALIFYING: frozenset({"Qualifying"}),
    SessionType.SPRINT_QUALIFYING: frozenset({"Sprint Qualifying", "Sprint Shootout"}),
    SessionType.SPRINT: frozenset({"Sprint"}),
    SessionType.RACE: frozenset({"Race"}),
}


def resolve_session_identifier(
    session_names: Sequence[str | None], session_type: SessionType
) -> str:
    """Resolve `session_type` to the real FastF1 session-name identifier to
    pass to `fastf1.get_session()`, given one event's actual Session1..5
    name strings (any order, entries may be `None` for an event with fewer
    than five sessions, e.g. testing).

    Matches by literal display name (always unambiguous once matched --
    docs/m12-design-review.md §3.3/§19.3 confirmed full names and
    abbreviations resolve identically for every non-ambiguous session type,
    and the one ambiguous case, sprint-qualifying, is exactly what this
    alias-based approach fixes).

    Raises SessionNotAvailableError if none of `session_names` matches
    `session_type`'s canonical aliases -- a real, expected outcome for
    e.g. SPRINT_QUALIFYING on a 2021/2022 sprint-format event.
    """
    aliases = _CANONICAL_SESSION_NAME_ALIASES[session_type]
    for name in session_names:
        if name is not None and name in aliases:
            return name
    known = [name for name in session_names if name is not None]
    raise SessionNotAvailableError(
        f"{session_type.value!r} is not available for this event "
        f"(this event's sessions are: {known})"
    )


def available_session_types(
    session_names: Sequence[str | None],
) -> dict[SessionType, str]:
    """Every canonical SessionType one event's real session names resolve
    to, mapped to the literal FastF1 identifier for each -- "which sessions
    does this event actually have," the read Phase 2's discovery layer will
    need (docs/m12-implementation-plan.md Phase 2), exposed here so it is
    tested against real, verified session-name shapes now (design review
    §4's matrix) rather than invented fresh when that phase starts.
    """
    resolved: dict[SessionType, str] = {}
    for session_type in SessionType:
        try:
            resolved[session_type] = resolve_session_identifier(session_names, session_type)
        except SessionNotAvailableError:
            continue
    return resolved


class EventNotFoundError(ValueError):
    """No event in one season's schedule matches the given query.

    Raised instead of ever falling through to FastF1's own fuzzy/edit-
    distance event matching, which docs/m12-design-review.md §19.3 proved
    can silently substitute an unrelated real event for a garbage query
    (e.g. `"xyz nonsense event"` silently resolving to `"Chinese Grand
    Prix"`, with only a WARNING log, never an exception). M12 Phase 2's
    "CRITICAL FUZZY-MATCHING SAFETY RULE": PitWall must fail loudly here
    rather than let FastF1 guess.
    """


class AmbiguousEventError(ValueError):
    """More than one event in one season's schedule matches the given
    query -- callers must disambiguate (e.g. use the round number, or a
    longer/more specific name) rather than have one silently chosen. Same
    safety rule as EventNotFoundError.
    """


def _event_name_query_matches(query: str, *, event_name: str, location: str, country: str) -> bool:
    """Shared predicate behind both `find_event_row` (matches against a raw
    FastF1 schedule row) and `select_events` (M12 Phase 3, matches against
    already-discovered `Event` objects) -- one definition of "does this
    free-text query match this event" so the two can never silently drift
    apart. `query` is already lowercased by the caller.
    """
    return query in event_name.lower() or query in location.lower() or query in country.lower()


def find_event_row(schedule: pd.DataFrame, event_query: str | int) -> "pd.Series[Any]":
    """Safely resolve a free-text or round-number event query against one
    season's real event schedule -- exact round-number match, or
    unambiguous case-insensitive substring match against `EventName`,
    `Location`, or `Country`.

    Deliberately stricter than FastF1's own fuzzy/edit-distance event
    matching (docs/m12-design-review.md §19.3): typo tolerance is traded
    for the guarantee that a bad or ambiguous query fails loudly rather
    than silently resolving to a real but unintended event. `schedule` is
    expected to already exclude testing events (docs/m12-design-review.md
    §5's "exclude testing from ingestion by default" -- the caller passes
    `fastf1.get_event_schedule(season, include_testing=False)`'s result,
    not this function's job to filter).

    Raises EventNotFoundError if nothing matches, AmbiguousEventError if
    more than one event matches.
    """
    query_str = str(event_query).strip()
    if not query_str:
        raise EventNotFoundError("Event query must not be empty")

    if query_str.isdigit():
        round_number = int(query_str)
        by_round = schedule[schedule["RoundNumber"] == round_number]
        if by_round.empty:
            raise EventNotFoundError(
                f"No event with round number {round_number} in this season's schedule"
            )
        return by_round.iloc[0]

    query = query_str.lower()

    def _matches(row: "pd.Series[Any]") -> bool:
        return _event_name_query_matches(
            query,
            event_name=str(row["EventName"]),
            location=str(row["Location"]),
            country=str(row["Country"]),
        )

    candidates = schedule[schedule.apply(_matches, axis=1)]
    if len(candidates) == 0:
        raise EventNotFoundError(
            f"No event matching {event_query!r} in this season's schedule "
            "(exact substring match against EventName/Location/Country only -- "
            "no fuzzy matching, per docs/m12-design-review.md §19.3)"
        )
    if len(candidates) > 1:
        names = candidates["EventName"].tolist()
        raise AmbiguousEventError(
            f"{event_query!r} matches multiple events this season: {names} -- "
            "be more specific, or use the round number"
        )
    return candidates.iloc[0]


def select_events(
    discoveries: Sequence[EventDiscovery], event_queries: Sequence[str] | None
) -> list[EventDiscovery]:
    """M12 Phase 3: select a subset of one season's already-discovered
    events by query, against the in-memory list `discover_season()`
    already fetched -- no new FastF1 call per query, unlike repeated calls
    to `find_event_row`. Same safe, non-fuzzy matching semantics as
    `find_event_row` (`_event_name_query_matches`), applied to `Event`
    objects instead of DataFrame rows.

    `event_queries=None` means "every discovered event" (`--all-events`).
    Otherwise each query is resolved independently (raising
    EventNotFoundError/AmbiguousEventError exactly as find_event_row does)
    and the results are deduplicated by `event_id` (a query list with
    overlapping matches, e.g. "Bahrain" and "Sakhir" both matching the same
    event, must not produce a duplicate plan entry).

    Output is always sorted by `(round_number, event_id)` regardless of
    query order or `discoveries`' input order -- the deterministic
    ordering docs/m12-design-review.md's Phase 3 brief §6 requires.
    """
    if event_queries is None:
        selected = list(discoveries)
    else:
        selected_by_id: dict[str, EventDiscovery] = {}
        for query in event_queries:
            match = _select_one_event(discoveries, query)
            selected_by_id[match.event.event_id] = match
        selected = list(selected_by_id.values())
    return sorted(selected, key=lambda d: (d.event.round_number, d.event.event_id))


def _select_one_event(discoveries: Sequence[EventDiscovery], query: str) -> EventDiscovery:
    query_str = str(query).strip()
    if not query_str:
        raise EventNotFoundError("Event query must not be empty")

    if query_str.isdigit():
        round_number = int(query_str)
        by_round = [d for d in discoveries if d.event.round_number == round_number]
        if not by_round:
            raise EventNotFoundError(
                f"No event with round number {round_number} in this season's schedule"
            )
        return by_round[0]

    query_lower = query_str.lower()
    candidates = [
        d
        for d in discoveries
        if _event_name_query_matches(
            query_lower,
            event_name=d.event.event_name,
            location=d.event.location,
            country=d.event.country,
        )
    ]
    if not candidates:
        raise EventNotFoundError(
            f"No event matching {query!r} in this season's schedule "
            "(exact substring match against EventName/Location/Country only -- "
            "no fuzzy matching, per docs/m12-design-review.md §19.3)"
        )
    if len(candidates) > 1:
        names = [d.event.event_name for d in candidates]
        raise AmbiguousEventError(
            f"{query!r} matches multiple events this season: {names} -- "
            "be more specific, or use the round number"
        )
    return candidates[0]


def normalize_drivers(results: pd.DataFrame, *, session_id: str) -> list[Driver]:
    """Normalize a FastF1 SessionResults-shaped DataFrame into Driver records.

    Expected columns: DriverNumber, Abbreviation, FullName, FirstName,
    LastName, TeamName (see fastf1.core.SessionResults._COLUMNS).

    M34 (docs/m34-design-review.md §2/§4) additionally reads
    ClassifiedPosition/GridPosition/Status/Points from the same DataFrame --
    no new FastF1 call, since `results` is already loaded for every session.
    These four columns are only populated by FastF1 for Race/Sprint/
    Qualifying-family sessions; for Practice (and any other session type
    FastF1 doesn't populate them for) they're present but NaN, which
    normalizes to None like any other missing value here -- never an error.
    `.get()`, not bracket access, so a results frame that lacks these
    columns entirely (e.g. a hand-built test fixture) also normalizes to
    None rather than raising, matching this file's own `Compound` precedent
    (docs/m10-implementation-plan.md).
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
                classified_position=_optional_str(row.get("ClassifiedPosition")),
                grid_position=_optional_int(row.get("GridPosition")),
                status=_optional_str(row.get("Status")),
                points=_optional_float(row.get("Points")),
            )
        )
    return drivers


def normalize_laps(laps: pd.DataFrame, *, session_id: str) -> list[Lap]:
    """Normalize a FastF1 Laps-shaped DataFrame (all drivers) into Lap records.

    Expected columns: Driver, LapNumber, LapTime, Sector1Time, Sector2Time,
    Sector3Time, IsPersonalBest, IsAccurate, Compound (see
    fastf1.core.Laps._COLUMNS; Compound verified present -- M10, see
    docs/m10-implementation-plan.md Phase 2 §2.0).

    M35 (docs/m35-design-review.md §3/§4) additionally reads Position from
    the same DataFrame -- no new FastF1 call. Position is a FastF1-derived
    running-order rank, populated only for Race/Sprint/pre-2024 Sprint
    Qualifying sessions (FastF1's own `_RACE_LIKE_SESSIONS`, resolved
    entirely internally); NaN for Qualifying/Practice, which normalizes to
    None like any other missing value here -- never fabricated.
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
                position=_optional_int(row.get("Position")),
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
