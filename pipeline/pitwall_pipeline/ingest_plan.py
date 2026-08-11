"""Multi-event / multi-season ingestion planning and controlled execution
(M12 Phase 3).

Infrastructure for eventual historical backfill -- NOT the backfill itself
(docs/m12-implementation-plan.md's Tier D ceiling; Tier E, multi-season bulk
backfill, remains unscheduled). Establishes a strict, reviewable separation:

    build_ingestion_plan()   -- DISCOVER + PLAN: season(s) -> a deterministic,
                                 inspectable IngestionPlan. Zero ingestion,
                                 zero writes, zero database access.
        |
    execute_ingestion_plan() -- EXECUTE: consumes a previously built plan,
                                 sequentially, reusing ingest_event()/
                                 ingest_session() unchanged.

This module never re-implements provider loading, normalization, or
repository writing -- it only plans over `FastF1Provider.discover_season()`
(M12 Phase 2's per-event discovery, generalized to a whole season) and
executes by calling `ingest_event()` (M12 Phase 2, unmodified) once per
planned event. See docs/m12-design-review.md's Phase 3 brief for the
"discover -> plan -> reviewable plan -> execute" principle this module
exists to enforce.
"""

import argparse
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

from pitwall_pipeline.ingest import DEFAULT_FASTF1_CACHE_DIR, DEFAULT_PROCESSED_DIR
from pitwall_pipeline.ingest_event import (
    EventIngestResult,
    SessionIngestOutcome,
    ingest_event,
)
from pitwall_pipeline.models import SessionType
from pitwall_pipeline.normalize import select_events
from pitwall_pipeline.providers import FastF1Provider

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlannedSession:
    """One session `execute_ingestion_plan()` will attempt to ingest --
    confirmed available for its event at plan-build time via
    `FastF1Provider.discover_season()`, never invented or assumed."""

    season: int
    event_id: str
    event_name: str
    session_type: SessionType
    fastf1_identifier: str


@dataclass(frozen=True)
class PlanDiagnostic:
    """One requested session that this plan will NOT attempt -- e.g.
    NOT_AVAILABLE for its event. Represented explicitly rather than
    silently disappearing from the plan (docs/m12-design-review.md's Phase
    3 brief §5)."""

    season: int
    event_id: str
    event_name: str
    session_type: SessionType
    reason: str


@dataclass(frozen=True)
class IngestionPlan:
    """A deterministic, inspectable, immutable plan -- the "reviewable
    plan" step between discovery and execution
    (docs/m12-design-review.md's Phase 3 brief).

    Ordering (docs/m12-design-review.md's Phase 3 brief §6, "the canonical
    session ordering must be explicit and documented"):
      - Events: `(season, round_number, event_id)` ascending -- never by
        anything performance-related.
      - Sessions within one event: by that event's own real weekend
        chronology -- i.e. each resolved session's position in the
        event's actual `Session1..5` schedule slots, NOT a fixed global
        `SessionType` order. Weekend session order itself varies by
        era/format (a sprint weekend's Sprint Qualifying/Shootout can sit
        before or after Qualifying depending on the year -- design review
        §3.2), so a single global order would misrepresent the real
        schedule; ordering by each event's own discovered slot position is
        still fully deterministic, since a fixed discovered schedule never
        changes its own slot order.
      - Diagnostics (not-available types) have no real weekend position and
        are listed in the order they were requested (or `SessionType`'s own
        declaration order, when no explicit selection was given).
    """

    event_order: list[tuple[int, str, str]] = field(
        default_factory=list
    )  # (season, event_id, event_name)
    sessions: list[PlannedSession] = field(default_factory=list)
    diagnostics: list[PlanDiagnostic] = field(default_factory=list)
    requested_session_types: list[SessionType] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.sessions)

    def describe(self) -> str:
        """Human-readable, deterministic preview -- what `--dry-run`
        prints. Never itself triggers ingestion."""
        lines: list[str] = []
        for season, event_id, event_name in self.event_order:
            lines.append(f"{season} {event_name}")
            for planned in self.sessions:
                if planned.event_id == event_id:
                    lines.append(f"    {planned.session_type.value}")
            missing = [d.session_type.value for d in self.diagnostics if d.event_id == event_id]
            if missing:
                lines.append(f"    (not available: {', '.join(missing)})")
            lines.append("")
        if not self.event_order:
            return "(empty plan -- no events selected)"
        return "\n".join(lines).rstrip()


def build_ingestion_plan(
    seasons: Sequence[int],
    *,
    event_queries: Sequence[str] | None = None,
    session_types: Sequence[SessionType] | None = None,
    fastf1_cache_dir: Path = DEFAULT_FASTF1_CACHE_DIR,
) -> IngestionPlan:
    """DISCOVER + PLAN. Zero ingestion, zero Parquet/Postgres writes --
    only `fastf1.get_event_schedule()` calls (one per season, schedule-only,
    docs/m12-design-review.md §3.4/§19.3).

    `event_queries=None` means every event in each season (`--all-events`);
    otherwise each query is resolved safely against that season's
    already-discovered event list (`select_events`, M12 Phase 3 -- never
    FastF1's own fuzzy matching, docs/m12-design-review.md §19.3) and a
    non-matching or ambiguous query raises immediately, before any other
    season is even discovered -- planning is exactly where a bad query
    should fail loudly, since nothing has been ingested yet.

    `session_types=None` means every canonical SessionType; a type that
    doesn't exist for a given event becomes a `PlanDiagnostic`, never a
    silently dropped entry.
    """
    provider = FastF1Provider(fastf1_cache_dir)
    requested_types = list(session_types) if session_types is not None else list(SessionType)

    event_order: list[tuple[int, str, str]] = []
    sessions: list[PlannedSession] = []
    diagnostics: list[PlanDiagnostic] = []

    for season in sorted(set(seasons)):
        discoveries = provider.discover_season(season)
        selected = select_events(discoveries, event_queries)  # already round_number-sorted

        for discovery in selected:
            event = discovery.event
            event_order.append((season, event.event_id, event.event_name))

            available_types = [t for t in requested_types if t in discovery.available_sessions]
            # Chronological within this event's own real schedule -- see
            # IngestionPlan's own docstring for why this isn't a fixed
            # global SessionType order.
            available_types.sort(
                key=lambda t: discovery.session_names.index(discovery.available_sessions[t])
            )
            for session_type in available_types:
                sessions.append(
                    PlannedSession(
                        season=season,
                        event_id=event.event_id,
                        event_name=event.event_name,
                        session_type=session_type,
                        fastf1_identifier=discovery.available_sessions[session_type],
                    )
                )

            for session_type in requested_types:
                if session_type not in discovery.available_sessions:
                    diagnostics.append(
                        PlanDiagnostic(
                            season=season,
                            event_id=event.event_id,
                            event_name=event.event_name,
                            session_type=session_type,
                            reason=(
                                "not available for this event "
                                f"(sessions: {[n for n in discovery.session_names if n]})"
                            ),
                        )
                    )

    return IngestionPlan(
        event_order=event_order,
        sessions=sessions,
        diagnostics=diagnostics,
        requested_session_types=requested_types,
    )


@dataclass(frozen=True)
class EventLevelFailure:
    """One selected event where the whole per-event ingestion call failed
    before it could even isolate individual sessions -- distinct from a
    session-level LOAD_FAILED, which lives inside an EventIngestResult's
    own outcomes (docs/m12-design-review.md's Phase 3 brief §9: two
    separate levels of failure isolation, never collapsed into one).
    A real but rare case: the event vanished from the schedule between
    plan-build and execute time, or `ingest_event()`'s own hard
    fuzzy-matching safety check tripped (M12 Phase 2) -- both indicate
    something genuinely exceptional, not a normal per-session failure.
    """

    season: int
    event_id: str
    event_name: str
    detail: str


@dataclass(frozen=True)
class MultiEventIngestResult:
    """The full, structured result of executing one IngestionPlan --
    preserving both event-level and session-level failure isolation
    (docs/m12-design-review.md's Phase 3 brief §9): one `EventIngestResult`
    per event that was attempted (itself already carrying every
    SUCCESS/SUCCESS_NO_TELEMETRY/NOT_AVAILABLE/LOAD_FAILED session outcome,
    M12 Phase 2, unchanged), plus a separate list for the rarer case of an
    entire event-level call failing (`EventLevelFailure`, above)."""

    plan: IngestionPlan
    event_results: list[EventIngestResult]
    event_failures: list[EventLevelFailure]

    @property
    def succeeded(self) -> list[SessionIngestOutcome]:
        return [o for r in self.event_results for o in r.succeeded]

    @property
    def failed(self) -> list[SessionIngestOutcome]:
        return [o for r in self.event_results for o in r.failed]

    @property
    def not_available(self) -> list[SessionIngestOutcome]:
        return [o for r in self.event_results for o in r.not_available]


def execute_ingestion_plan(
    plan: IngestionPlan,
    *,
    fastf1_cache_dir: Path = DEFAULT_FASTF1_CACHE_DIR,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
) -> MultiEventIngestResult:
    """EXECUTE. Consumes a previously built `IngestionPlan` -- never builds
    one itself, never re-derives what should be ingested; sequential only
    (docs/m12-design-review.md's Phase 3 brief §13: "no multiprocessing, no
    asyncio fan-out, no thread pool, no concurrent event ingestion").

    Reuses `ingest_event()` (M12 Phase 2) unchanged, once per planned
    event, passing `plan.requested_session_types` -- the exact selection
    the plan was built with, so execution ingests exactly what the
    plan/dry-run already showed, never more. `ingest_event()`'s own
    per-session failure isolation (Phase 2) and CRITICAL FUZZY-MATCHING
    SAFETY RULE safety check are inherited unchanged; this function adds
    the event-level isolation layer on top (`EventLevelFailure`, above) so
    one event's total failure never stops the rest
    (docs/m12-design-review.md's Phase 3 brief §9).
    """
    event_results: list[EventIngestResult] = []
    event_failures: list[EventLevelFailure] = []

    for season, event_id, event_name in plan.event_order:
        try:
            result = ingest_event(
                season,
                event_name,
                session_types=plan.requested_session_types,
                fastf1_cache_dir=fastf1_cache_dir,
                processed_dir=processed_dir,
            )
        except Exception as exc:
            # Event-level isolation (docs/m12-design-review.md's Phase 3
            # brief §9) -- deliberately broad, same rationale as Phase 2's
            # per-session catch: this boundary's job is to isolate ANY
            # failure of the whole event-level call, loudly logged, not to
            # enumerate every possible cause in advance.
            logger.warning(
                "Event %s (%s) failed entirely: %s", event_id, event_name, exc, exc_info=True
            )
            event_failures.append(
                EventLevelFailure(
                    season=season, event_id=event_id, event_name=event_name, detail=str(exc)
                )
            )
            continue
        event_results.append(result)

    return MultiEventIngestResult(
        plan=plan, event_results=event_results, event_failures=event_failures
    )


def _parse_session_types(raw: str | None) -> list[SessionType] | None:
    if raw is None:
        return None
    return [SessionType(part.strip()) for part in raw.split(",") if part.strip()]


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build (and optionally execute) a multi-event/season ingestion plan. "
            "Narrow by default: selecting every event in a season requires "
            "--all-events, and more than one --season requires "
            "--confirm-multi-season (docs/m12-design-review.md's Phase 3 brief §12)."
        )
    )
    parser.add_argument(
        "--season",
        type=int,
        action="append",
        required=True,
        dest="seasons",
        help="Repeatable. One season is the normal case.",
    )
    event_group = parser.add_mutually_exclusive_group(required=True)
    event_group.add_argument(
        "--event",
        action="append",
        dest="events",
        help="Repeatable. Event name (substring match, no fuzzy matching) or round number.",
    )
    event_group.add_argument(
        "--all-events",
        action="store_true",
        help="Explicitly select every event in each --season.",
    )
    parser.add_argument(
        "--session",
        dest="sessions",
        help=(
            "Comma-separated canonical session types "
            f"({', '.join(member.value for member in SessionType)}). "
            "Default: every canonical type."
        ),
    )
    parser.add_argument(
        "--confirm-multi-season",
        action="store_true",
        help="Required when more than one --season is given.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and print the plan; perform zero ingestion, zero writes.",
    )
    parser.add_argument("--fastf1-cache-dir", type=Path, default=DEFAULT_FASTF1_CACHE_DIR)
    parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    args = parser.parse_args(argv)

    if len(args.seasons) > 1 and not args.confirm_multi_season:
        parser.error("more than one --season requires --confirm-multi-season")
    return args


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO)
    args = _parse_args(argv)

    plan = build_ingestion_plan(
        args.seasons,
        event_queries=None if args.all_events else args.events,
        session_types=_parse_session_types(args.sessions),
        fastf1_cache_dir=args.fastf1_cache_dir,
    )
    print(plan.describe())
    logger.info(
        "%d session(s) planned, %d not available across %d event(s).",
        len(plan.sessions),
        len(plan.diagnostics),
        len(plan.event_order),
    )

    if args.dry_run:
        logger.info("Dry run: no ingestion performed.")
        return

    result = execute_ingestion_plan(
        plan, fastf1_cache_dir=args.fastf1_cache_dir, processed_dir=args.processed_dir
    )
    logger.info(
        "Done: %d succeeded, %d failed, %d not available, %d event(s) failed entirely.",
        len(result.succeeded),
        len(result.failed),
        len(result.not_available),
        len(result.event_failures),
    )
    for failure in result.event_failures:
        logger.warning(
            "  event failed: %s (%s): %s", failure.event_id, failure.event_name, failure.detail
        )


if __name__ == "__main__":
    main()
