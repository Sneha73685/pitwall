"""Season/event/session discovery (M12 Phase 4): pure functions grouping
`TelemetryRepository.list_sessions()`'s existing flat output into
Season -> Event -> Session, entirely in application code -- no new store,
no Event table (docs/m12-design-review.md §7), matching the existing
`app/services/session_analytics/`/`app/services/tyre_performance/`
convention of pure, repository-agnostic domain logic kept separate from
FastAPI route handlers.
"""

from app.services.session_discovery.grouping import (
    list_events_for_season,
    list_seasons,
    list_sessions_for_driver_season,
    list_sessions_for_event,
)

__all__ = [
    "list_seasons",
    "list_events_for_season",
    "list_sessions_for_event",
    "list_sessions_for_driver_season",
]
