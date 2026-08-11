"""FastF1Provider: the sole V1 TelemetryProvider implementation.

This is the only module allowed to call FastF1's live/cached API directly
(ADR-0005). It fetches raw session data and delegates all shape conversion
to pitwall_pipeline.normalize and pitwall_pipeline.track.
"""

import logging
from pathlib import Path
from typing import Any

import fastf1
import pandas as pd

from pitwall_pipeline.models import (
    Event,
    EventDiscovery,
    NormalizedSessionData,
    SessionType,
    TelemetrySample,
    TrackPoint,
)
from pitwall_pipeline.normalize import (
    available_session_types,
    find_event_row,
    normalize_drivers,
    normalize_event,
    normalize_laps,
    normalize_pit_stops,
    normalize_session,
    normalize_stints,
    normalize_telemetry,
    resolve_session_identifier,
)
from pitwall_pipeline.providers.base import TelemetryProvider
from pitwall_pipeline.track import derive_track_points

logger = logging.getLogger(__name__)

_NUM_SCHEDULE_SESSION_SLOTS = 5


def _optional_isoformat(value: Any) -> str | None:
    """Convert a (possibly missing) FastF1 schedule Timestamp to an ISO
    string, or None -- same nullability convention as Session.session_date."""
    if value is None or pd.isna(value):
        return None
    return str(value.isoformat())


def _event_session_names(row: Any) -> list[str | None]:
    """One event's real Session1..5 display names, read directly from its
    schedule row's `SessionN` columns -- verified byte-identical to
    `Event.get_session_name(n)`'s output against real data
    (docs/m12-design-review.md §3.2/§3.4, Phase 2 audit), and simpler:
    plain column access needs no method call, works identically whether
    `row` came from `fastf1.get_event()` or a
    `fastf1.get_event_schedule()` row (both the same `fastf1.events.Event`
    type), and is trivially fakeable in tests with a plain DataFrame row.
    An event may have fewer than five real sessions (e.g. testing), so a
    missing/NaN slot is `None`, not an error.
    """
    names: list[str | None] = []
    for slot in range(1, _NUM_SCHEDULE_SESSION_SLOTS + 1):
        value = row.get(f"Session{slot}")
        names.append(None if value is None or pd.isna(value) else str(value))
    return names


def _event_from_row(season: int, row: Any) -> Event:
    """Build a normalized Event from one matched schedule row -- shared by
    load_session(), discover_event(), and discover_sessions() so the
    field-mapping (which real schedule columns feed which Event field)
    exists in exactly one place."""
    return normalize_event(
        season=season,
        round_number=int(row["RoundNumber"]),
        event_name=str(row["EventName"]),
        event_format=str(row["EventFormat"]),
        location=str(row["Location"]),
        country=str(row["Country"]),
        event_date=_optional_isoformat(row.get("EventDate")),
    )


class FastF1Provider(TelemetryProvider):
    """Fetches and normalizes one FastF1 session."""

    def __init__(self, cache_dir: Path) -> None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        fastf1.Cache.enable_cache(str(cache_dir))

    def load_session(
        self, season: int, event: str, session_type: SessionType
    ) -> NormalizedSessionData:
        # Resolve the canonical SessionType against this specific event's
        # real schedule (M12 Phase 1, docs/m12-design-review.md §5/§9) --
        # never a static abbreviation table. get_event() is a cheap,
        # schedule-only call (confirmed, design review §3.4/§19.3), fetched
        # before the heavier get_session().load() below so a
        # SessionNotAvailableError (e.g. SPRINT_QUALIFYING requested for a
        # 2021/2022 sprint-format event) surfaces without ever attempting a
        # full session load.
        ff1_event = fastf1.get_event(season, event)
        session_names = _event_session_names(ff1_event)
        identifier = resolve_session_identifier(session_names, session_type)
        event_record = _event_from_row(season, ff1_event)

        ff1_session = fastf1.get_session(season, event, identifier)
        ff1_session.load()

        session_date = None
        if ff1_session.date is not None and not pd.isna(ff1_session.date):
            session_date = ff1_session.date.isoformat()

        session = normalize_session(
            season=season,
            event_name=str(ff1_session.event["EventName"]),
            round_number=int(ff1_session.event["RoundNumber"]),
            location=str(ff1_session.event["Location"]),
            country=str(ff1_session.event["Country"]),
            session_type=session_type,
            session_date=session_date,
        )
        logger.info(
            "Resolved event %s -> session %s (FastF1 identifier %r)",
            event_record.event_id,
            session.session_id,
            identifier,
        )

        drivers = normalize_drivers(ff1_session.results, session_id=session.session_id)
        laps = normalize_laps(ff1_session.laps, session_id=session.session_id)
        # Stint/pit-stop data is read from the same Laps frame already
        # fetched above -- no new FastF1 call (M10, ADR-0011).
        stints = normalize_stints(ff1_session.laps, session_id=session.session_id)
        pit_stops = normalize_pit_stops(ff1_session.laps, session_id=session.session_id)

        telemetry: list[TelemetrySample] = []
        for driver in drivers:
            driver_laps = ff1_session.laps.pick_drivers(driver.driver_id)
            for _, lap in driver_laps.iterlaps():
                lap_number = int(lap["LapNumber"])
                try:
                    lap_telemetry = lap.get_telemetry()
                except Exception:
                    logger.warning(
                        "Skipping telemetry for %s lap %d in %s: could not be loaded",
                        driver.driver_id,
                        lap_number,
                        session.session_id,
                        exc_info=True,
                    )
                    continue
                telemetry.extend(
                    normalize_telemetry(
                        lap_telemetry,
                        session_id=session.session_id,
                        driver_id=driver.driver_id,
                        lap_number=lap_number,
                    )
                )

        track_points = self._derive_track_points(ff1_session, session_id=session.session_id)

        return NormalizedSessionData(
            session=session,
            drivers=drivers,
            laps=laps,
            telemetry=telemetry,
            track_points=track_points,
            stints=stints,
            pit_stops=pit_stops,
        )

    def _find_event_row(self, season: int, event_query: str) -> Any:
        """One season's real, non-testing event schedule, safely matched
        against `event_query` (M12 Phase 2). Testing events are excluded
        at the source (`include_testing=False`) per
        docs/m12-design-review.md §5's "exclude testing from ingestion by
        default" decision -- they are never candidates for discovery or
        ingestion, and (per design review §19.3) can't be reliably
        addressed by name via FastF1's own matching anyway.
        """
        schedule = fastf1.get_event_schedule(season, include_testing=False)
        return find_event_row(schedule, event_query)

    def discover_event(self, season: int, event_query: str) -> Event:
        """Tier A (docs/m12-implementation-plan.md §0): resolve one
        event's identity/metadata for a season -- schedule-only, no
        session enumeration, no `.load()`. Uses the same safe,
        non-fuzzy event matching `load_session()`'s `ingest_session()`
        callers must also go through (M12 Phase 2's "CRITICAL
        FUZZY-MATCHING SAFETY RULE") -- never FastF1's own fuzzy
        `get_event()`/`get_session()` resolution on a raw, unvetted query.
        """
        row = self._find_event_row(season, event_query)
        return _event_from_row(season, row)

    def discover_sessions(self, season: int, event_query: str) -> EventDiscovery:
        """Tier A: `discover_event()` plus which canonical `SessionType`s
        are actually available for this event and the literal FastF1
        identifier each resolves to -- the "which sessions does this
        event actually have" read `ingest_event()`'s orchestration
        (`pitwall_pipeline/ingest_event.py`) needs before attempting any
        session ingestion.
        """
        row = self._find_event_row(season, event_query)
        session_names = _event_session_names(row)
        return EventDiscovery(
            event=_event_from_row(season, row),
            session_names=session_names,
            available_sessions=available_session_types(session_names),
        )

    def discover_season(self, season: int) -> list[EventDiscovery]:
        """M12 Phase 3: `discover_sessions()` for every real, non-testing
        event in a season -- one `fastf1.get_event_schedule()` call total
        (schedule-only, no `.load()`; `Session1..5` names are already
        columns on every returned row, so no per-event follow-up call is
        needed -- verified, docs/m12-design-review.md §19/Phase 2 audit).
        The foundation `pitwall_pipeline/ingest_plan.py`'s
        `build_ingestion_plan()` uses -- no FastF1 fuzzy matching is
        involved here at all, since every event is returned, not queried.
        """
        schedule = fastf1.get_event_schedule(season, include_testing=False)
        discoveries = []
        for _, row in schedule.iterrows():
            session_names = _event_session_names(row)
            discoveries.append(
                EventDiscovery(
                    event=_event_from_row(season, row),
                    session_names=session_names,
                    available_sessions=available_session_types(session_names),
                )
            )
        return discoveries

    @staticmethod
    def _derive_track_points(
        ff1_session: fastf1.core.Session, *, session_id: str
    ) -> list[TrackPoint]:
        fastest = ff1_session.laps.pick_fastest()
        if fastest is None:
            logger.warning("No fastest lap found for %s; track points will be empty", session_id)
            return []
        try:
            fastest_telemetry = fastest.get_telemetry()
        except Exception:
            logger.warning(
                "Could not load fastest-lap telemetry for %s; track points will be empty",
                session_id,
                exc_info=True,
            )
            return []
        reference_samples = normalize_telemetry(
            fastest_telemetry,
            session_id=session_id,
            driver_id=str(fastest["Driver"]),
            lap_number=int(fastest["LapNumber"]),
        )
        return derive_track_points(reference_samples, session_id=session_id)
