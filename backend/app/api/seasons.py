"""Season / event / session discovery endpoints (M12 Phase 4).

    GET /seasons                                    -- Season
    GET /seasons/{season}/events                     -- -> Event
    GET /seasons/{season}/events/{event_id}/sessions  -- -> Session

Every route reads `TelemetryRepository.list_sessions()` (already exists,
unchanged) and groups/orders it in `app.services.session_discovery` -- no
new repository method beyond `Session.has_telemetry` (a field, not a new
read pattern), no new store, no FastF1 call at request time
(docs/m12-design-review.md's Phase 4 brief §6/§23). Reflects what PitWall
actually has locally ingested; never what FastF1's upstream schedule
theoretically offers (§7 of that brief).

404 vs. 200 []: `season` and `event_id` are never independently checked for
existence, because neither is a persisted resource -- both are aggregation
keys computed over `list_sessions()`, not rows in a catalogue (Phase 0's
explicit decision not to persist an Event table, design review §7, upheld
here). There is no way to distinguish "this season/event doesn't exist" from
"it exists but nothing is ingested for it yet" without such a catalogue, so
both cases return `200` with an empty list -- the same "absence is data, not
failure" posture ADR-0011 already established for `stints`/`pit_stops`. This
is a deliberate, audited choice: 404 stays reserved for `session_id`, the one
identity in this API a repository can actually check against a real,
individually-stored Parquet directory (`TelemetryRepository.get_session`) --
not extended here to identities with no such backing store.
"""

from fastapi import APIRouter, Depends

from app.dependencies import get_telemetry_repository
from app.models.discovery import EventSummary, SeasonSummary
from app.models.telemetry import Session
from app.repositories import TelemetryRepository
from app.services.session_discovery import (
    list_events_for_season,
    list_seasons,
    list_sessions_for_event,
)

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get(
    "", response_model=list[SeasonSummary], summary="List seasons PitWall has ingested data for"
)
def list_seasons_route(
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[SeasonSummary]:
    return list_seasons(repository.list_sessions())


@router.get(
    "/{season}/events",
    response_model=list[EventSummary],
    summary="List events PitWall has ingested sessions for, within one season",
)
def list_events_route(
    season: int,
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[EventSummary]:
    return list_events_for_season(repository.list_sessions(), season)


@router.get(
    "/{season}/events/{event_id}/sessions",
    response_model=list[Session],
    summary="List sessions PitWall has ingested for one event",
)
def list_sessions_for_event_route(
    season: int,
    event_id: str,
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[Session]:
    return list_sessions_for_event(repository.list_sessions(), season, event_id)
