"""Season/event discovery response models (M12 Phase 4).

Anti-corruption boundary, same as every other model in this package
(docs/adr/0009-internal-api-schema-boundary.md): these describe the HTTP
contract, not any storage shape. Neither is persisted anywhere -- both are
computed on read from `TelemetryRepository.list_sessions()`, grouped in
`app.services.session_discovery` (docs/m12-design-review.md §7: "do not
persist an Event table yet unless... genuinely required" -- nothing here
changes that decision, these are response models, not a new store).

Reflects what PitWall actually has locally ingested, never what FastF1's
upstream schedule theoretically offers (docs/m12-design-review.md's Phase 4
brief §7) -- there is no FastF1 call anywhere behind these models.
"""

from app.models.telemetry import ApiModel, SessionType


class SeasonSummary(ApiModel):
    """One season PitWall has at least one locally ingested session for."""

    season: int
    event_count: int


class EventSummary(ApiModel):
    """One event (race weekend) PitWall has at least one locally ingested
    session for. `event_id` is `(season, event slug)` -- see
    `app.utils.ids.make_event_id` -- the same identity
    `Session.event_id` already carries; every session in this event has
    that `event_id`, not a separately stored relationship.
    """

    event_id: str
    season: int
    event_name: str
    round_number: int
    location: str
    country: str
    # Canonical types this event has at least one locally ingested session
    # for, in SessionType's own stable declaration order (a compact
    # summary -- the real per-session chronology, where it matters, is on
    # the individual Session objects a session-list read returns, ordered
    # by their own session_date; see app.services.session_discovery).
    session_types: list[SessionType]
    session_count: int
