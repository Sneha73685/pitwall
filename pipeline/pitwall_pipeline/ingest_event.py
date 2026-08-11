"""Event-level discovery and ingestion orchestration (M12 Phase 2).

Run as `python -m pitwall_pipeline.ingest_event --season 2024 --event Bahrain`
to discover and ingest every real, available session for one event -- the
single-event ceiling `docs/m12-implementation-plan.md`'s Tier C describes.
Season-wide (Tier D) and historical (Tier E) ingestion are explicitly out of
scope for this module; see that document's Phase 6/non-goals.

Architecture (docs/m12-design-review.md §9, this milestone's Phase 2 brief):

    discover_event()      -- FastF1Provider.discover_event()   (schedule-only)
        |
    discover_sessions()   -- FastF1Provider.discover_sessions() (+ which types exist)
        |
    resolve_session_identifier()  -- reused from normalize.py (M12 Phase 1)
        |
    ingest_session()      -- reused, unmodified, from ingest.py (M1)
        |
    per-session result    -- SessionIngestOutcome, below

This module never re-implements provider loading, normalization, or
repository writing -- `ingest_session()` remains the single source of truth
for actual ingestion (docs/m12-implementation-plan.md's own architectural
boundary); this module only discovers what's available and loops over it
with per-session failure isolation.
"""

import argparse
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from pitwall_pipeline.ingest import DEFAULT_FASTF1_CACHE_DIR, DEFAULT_PROCESSED_DIR, ingest_session
from pitwall_pipeline.models import Event, EventDiscovery, SessionType
from pitwall_pipeline.providers import FastF1Provider

logger = logging.getLogger(__name__)


class SessionIngestStatus(str, Enum):
    """Per-session outcome of an event-level ingestion attempt.

    Deliberately not collapsed into a generic success/failure
    (docs/m12-design-review.md's Phase 2 brief -- "do not collapse these
    into a generic failed state"):

    - NOT_AVAILABLE: this canonical SessionType does not exist for this
      event (a real, expected outcome -- e.g. SPRINT_QUALIFYING on a
      2021/2022 sprint-format event, design review §3.2). Never attempted;
      never a failure.
    - SUCCESS: laps/stints/pit-stops and telemetry were all ingested.
    - SUCCESS_NO_TELEMETRY: the session had laps but zero telemetry
      samples across the whole session -- the real, verified 2018 finding
      (design review §19.2: `lap.get_telemetry()` failed for every driver
      tried, in two different 2018 events, while lap/stint/compound data
      loaded correctly). Usable for everything except telemetry/track-map
      views; not a failure.
    - LOAD_FAILED: the session should be ingestable but `ingest_session()`
      raised (e.g. the real, reproducible 2018 Monza case, design review
      §3.5, or a mismatched/garbage identifier).
    """

    SUCCESS = "success"
    SUCCESS_NO_TELEMETRY = "success_no_telemetry"
    NOT_AVAILABLE = "not_available"
    LOAD_FAILED = "load_failed"


@dataclass(frozen=True)
class SessionIngestOutcome:
    """One requested SessionType's result within one ingest_event() call."""

    session_type: SessionType
    status: SessionIngestStatus
    session_id: str | None = None
    output_dir: Path | None = None
    detail: str | None = None


@dataclass(frozen=True)
class EventIngestResult:
    """The full, structured result of one ingest_event() call -- every
    requested session's outcome, never silently dropped (docs/m12-design-
    review.md's Phase 2 brief: "produce an explicit, inspectable result for
    every requested/attempted session")."""

    event: Event
    outcomes: list[SessionIngestOutcome]

    @property
    def succeeded(self) -> list[SessionIngestOutcome]:
        return [
            o
            for o in self.outcomes
            if o.status in (SessionIngestStatus.SUCCESS, SessionIngestStatus.SUCCESS_NO_TELEMETRY)
        ]

    @property
    def failed(self) -> list[SessionIngestOutcome]:
        return [o for o in self.outcomes if o.status == SessionIngestStatus.LOAD_FAILED]

    @property
    def not_available(self) -> list[SessionIngestOutcome]:
        return [o for o in self.outcomes if o.status == SessionIngestStatus.NOT_AVAILABLE]


def discover_event(
    season: int, event_query: str, *, fastf1_cache_dir: Path = DEFAULT_FASTF1_CACHE_DIR
) -> Event:
    """Tier A: resolve one event's identity/metadata for a season, safely
    (docs/m12-design-review.md §19.3's CRITICAL FUZZY-MATCHING SAFETY
    RULE) -- no session enumeration, no `.load()`."""
    return FastF1Provider(fastf1_cache_dir).discover_event(season, event_query)


def discover_sessions(
    season: int, event_query: str, *, fastf1_cache_dir: Path = DEFAULT_FASTF1_CACHE_DIR
) -> EventDiscovery:
    """Tier A: `discover_event()` plus which canonical SessionTypes are
    actually available for this event."""
    return FastF1Provider(fastf1_cache_dir).discover_sessions(season, event_query)


def ingest_event(
    season: int,
    event_query: str,
    *,
    session_types: Sequence[SessionType] | None = None,
    fastf1_cache_dir: Path = DEFAULT_FASTF1_CACHE_DIR,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
) -> EventIngestResult:
    """Tier C: ingest one event's sessions.

    `event_query` is resolved exactly once here, safely (never FastF1's own
    fuzzy matching -- docs/m12-design-review.md §19.3), via
    `discover_sessions()`. Every subsequent call to `ingest_session()` below
    passes `discovery.event.event_name` -- the exact, already-verified real
    event name -- never the caller's original `event_query` again. This is
    the fix for the exact risk this milestone's brief names as a hard
    correctness requirement: if the raw query were re-resolved independently
    inside each `ingest_session()` call, FastF1's own internal fuzzy
    `get_event()` lookup (which `FastF1Provider.load_session()` still uses,
    unchanged from M12 Phase 1) would get another, separate opportunity to
    silently substitute a different event. Passing the exact matched name
    instead means that lookup always resolves to itself, with zero
    ambiguity, every time.

    `session_types=None` (default) means "every canonical SessionType this
    event actually has" (discovered, never assumed). Passing an explicit
    subset ingests only those types that are available; a requested type
    that isn't available for this event is still reported, as
    NOT_AVAILABLE, not silently skipped.

    One session's failure never aborts the rest (docs/m12-design-review.md
    §9/§10's identified gap, closed here): each `ingest_session()` call is
    individually isolated.
    """
    provider = FastF1Provider(fastf1_cache_dir)
    discovery = provider.discover_sessions(season, event_query)
    requested = list(session_types) if session_types is not None else list(SessionType)

    outcomes: list[SessionIngestOutcome] = []
    for session_type in requested:
        if session_type not in discovery.available_sessions:
            logger.info(
                "%s is not available for %s (this event's sessions: %s)",
                session_type.value,
                discovery.event.event_id,
                [name for name in discovery.session_names if name],
            )
            outcomes.append(
                SessionIngestOutcome(
                    session_type=session_type,
                    status=SessionIngestStatus.NOT_AVAILABLE,
                    detail=(
                        "not available for this event "
                        f"(sessions: {[n for n in discovery.session_names if n]})"
                    ),
                )
            )
            continue

        try:
            # The exact, already-safely-matched event name -- not
            # event_query -- per this function's own docstring above.
            result = ingest_session(
                season,
                discovery.event.event_name,
                session_type,
                fastf1_cache_dir=fastf1_cache_dir,
                processed_dir=processed_dir,
            )
        except Exception as exc:
            # Per-session failure isolation is this module's central
            # purpose (docs/m12-design-review.md §9/§10). Every exception
            # type is caught deliberately -- not narrowed to one class --
            # because FastF1 itself raises a variety of them for a
            # session-load failure (DataNotLoadedError, KeyError, the
            # real, reproduced 2018 Monza and 2018-telemetry cases, design
            # review §3.5/§19.2); this boundary's job is to isolate ANY of
            # them, loudly logged (never a bare except / swallow), not to
            # enumerate every FastF1-internal failure type in advance.
            logger.warning(
                "Session %s failed to ingest for event %s: %s",
                session_type.value,
                discovery.event.event_id,
                exc,
                exc_info=True,
            )
            outcomes.append(
                SessionIngestOutcome(
                    session_type=session_type,
                    status=SessionIngestStatus.LOAD_FAILED,
                    detail=str(exc),
                )
            )
            continue

        # Hard safety check (M12 Phase 2's CRITICAL FUZZY-MATCHING SAFETY
        # RULE): the session actually written must belong to the exact
        # event this call discovered -- defense in depth on top of the
        # exact-name-passing fix above, since this is a correctness
        # requirement this milestone's brief calls "hard", not merely
        # best-effort. If this ever fails, something is seriously wrong
        # (a regression reintroducing raw-query resolution somewhere, or
        # FastF1 itself behaving unexpectedly) and must not be reported as
        # a successful outcome.
        if not result.session_id.startswith(discovery.event.event_id + "_"):
            raise RuntimeError(
                f"Safety check failed: ingesting {session_type.value} for "
                f"{event_query!r} (season {season}) produced session_id "
                f"{result.session_id!r}, which does not belong to the "
                f"discovered event {discovery.event.event_id!r}. Refusing "
                "to report this as a successful outcome."
            )

        status = SessionIngestStatus.SUCCESS
        if result.lap_count > 0 and result.telemetry_sample_count == 0:
            status = SessionIngestStatus.SUCCESS_NO_TELEMETRY

        outcomes.append(
            SessionIngestOutcome(
                session_type=session_type,
                status=status,
                session_id=result.session_id,
                output_dir=result.output_dir,
            )
        )

    return EventIngestResult(event=discovery.event, outcomes=outcomes)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Discover and ingest every available session for one F1 event. "
            "Single-event scope only -- never a season or historical range "
            "(docs/m12-implementation-plan.md's Tier C ceiling)."
        )
    )
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument(
        "--event",
        required=True,
        help=(
            "Event name (unambiguous substring match against EventName/Location/"
            "Country -- no fuzzy matching, docs/m12-design-review.md §19.3) or "
            "round number"
        ),
    )
    parser.add_argument("--fastf1-cache-dir", type=Path, default=DEFAULT_FASTF1_CACHE_DIR)
    parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO)
    args = _parse_args(argv)
    result = ingest_event(
        args.season,
        args.event,
        fastf1_cache_dir=args.fastf1_cache_dir,
        processed_dir=args.processed_dir,
    )
    logger.info("Event: %s", result.event.event_name)
    for outcome in result.outcomes:
        suffix = f" ({outcome.detail})" if outcome.detail else ""
        logger.info("  %-20s %s%s", outcome.session_type.value, outcome.status.value, suffix)


if __name__ == "__main__":
    main()
