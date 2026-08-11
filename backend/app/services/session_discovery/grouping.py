"""Pure grouping/ordering logic behind `app/api/seasons.py` (M12 Phase 4).

Everything here operates on an already-fetched `list[Session]` -- no
repository, no I/O, unit-testable against hand-built `Session` objects, the
same separation `app/services/session_analytics/aggregation.py` and
`app/services/tyre_performance/` already established for this codebase.

Deterministic ordering throughout (docs/m12-design-review.md's Phase 4
brief §9), documented at each function:
  - Seasons: descending (newest first) -- matches the existing frontend
    convention already in production (`SessionListPage.tsx`'s season
    filter: `[...new Set(...)].sort((a, b) => b - a)`), not invented fresh
    here.
  - Events: `(round_number, event_id)` ascending -- never by anything
    performance-derived, matching the identical rule
    `pitwall_pipeline/ingest_plan.py`'s `IngestionPlan` already applies on
    the pipeline side (M12 Phase 3).
  - Sessions within one event: `session_date` ascending (the real
    chronological signal already on every `Session`), falling back to
    `SessionType`'s own stable declaration order for the rare session with
    no recorded date -- see `list_sessions_for_event`'s own docstring for
    why this differs from the pipeline's slot-position approach.
"""

from collections.abc import Sequence

from app.models.discovery import EventSummary, SeasonSummary
from app.models.telemetry import Session, SessionType

# SessionType's own declaration order -- the fallback used only when a
# session has no `session_date` to sort by (rare; every real ingested
# session observed so far has one). Not an attempt to reconstruct real
# weekend chronology (unlike the pipeline's Session1..5-slot-based
# ordering, M12 Phase 3) -- the backend has no access to that schedule
# data and must not call FastF1 to get it (docs/m12-design-review.md's
# Phase 4 brief §6/§23).
_SESSION_TYPE_FALLBACK_ORDER = {
    session_type: index for index, session_type in enumerate(SessionType)
}


def list_seasons(sessions: Sequence[Session]) -> list[SeasonSummary]:
    """Every season with at least one locally ingested session, newest
    first, each with its distinct ingested-event count."""
    events_by_season: dict[int, set[str]] = {}
    for session in sessions:
        events_by_season.setdefault(session.season, set()).add(session.event_id)
    return [
        SeasonSummary(season=season, event_count=len(event_ids))
        for season, event_ids in sorted(
            events_by_season.items(), key=lambda kv: kv[0], reverse=True
        )
    ]


def list_events_for_season(sessions: Sequence[Session], season: int) -> list[EventSummary]:
    """Events PitWall actually has at least one locally ingested session
    for, within one season -- never an event FastF1's schedule merely
    knows about (docs/m12-design-review.md's Phase 4 brief §7). Empty if
    the season has no ingested sessions at all -- there is no persisted
    season/event catalogue to 404 against (§6/§7 of that same brief; see
    `app/api/seasons.py`'s own docstring for the full reasoning)."""
    sessions_by_event: dict[str, list[Session]] = {}
    for session in sessions:
        if session.season == season:
            sessions_by_event.setdefault(session.event_id, []).append(session)

    summaries = []
    for event_id, event_sessions in sessions_by_event.items():
        first = event_sessions[0]
        session_types = sorted(
            {s.session_type for s in event_sessions},
            key=lambda st: _SESSION_TYPE_FALLBACK_ORDER[st],
        )
        summaries.append(
            EventSummary(
                event_id=event_id,
                season=season,
                event_name=first.event_name,
                round_number=first.round_number,
                location=first.location,
                country=first.country,
                session_types=session_types,
                session_count=len(event_sessions),
            )
        )
    return sorted(summaries, key=lambda e: (e.round_number, e.event_id))


def list_sessions_for_event(
    sessions: Sequence[Session], season: int, event_id: str
) -> list[Session]:
    """Sessions PitWall actually has ingested for one event, ordered by
    real weekend chronology (`session_date` ascending) -- the genuine
    timestamp already on every `Session`, not a schedule-slot-position
    proxy (the pipeline's `IngestionPlan` ordering, M12 Phase 3, uses slot
    position because it has the real `Session1..5` schedule to hand; the
    backend only has whatever sessions are actually ingested, so the
    timestamp each already carries is the more direct, and only available,
    signal here). A session with no recorded `session_date` sorts by
    `SessionType`'s own declaration order instead, after every dated
    session -- a documented, stable fallback, not an attempt to guess the
    real chronology.

    Empty if no sessions match `(season, event_id)` -- same "absence is
    data, not failure" reasoning as `list_events_for_season` (there is no
    persisted event to 404 against).
    """
    matching = [s for s in sessions if s.season == season and s.event_id == event_id]
    return sorted(
        matching,
        key=lambda s: (
            s.session_date is None,
            s.session_date or "",
            _SESSION_TYPE_FALLBACK_ORDER[s.session_type],
        ),
    )
