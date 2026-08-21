"""Normalized internal domain model for the ingestion pipeline.

See docs/data-model.md for the design rationale. Nothing in this module may
depend on FastF1's types -- that boundary is exactly what
docs/adr/0005-telemetry-provider-abstraction.md exists to protect. FastF1
Session/Laps/Telemetry objects are converted into these models in
normalize.py and never passed through directly.
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict

from pitwall_pipeline.utils.ids import slugify


class SessionType(str, Enum):
    """Stable session vocabulary, decoupled from FastF1's session-name strings."""

    PRACTICE_1 = "practice_1"
    PRACTICE_2 = "practice_2"
    PRACTICE_3 = "practice_3"
    QUALIFYING = "qualifying"
    SPRINT_QUALIFYING = "sprint_qualifying"
    SPRINT = "sprint"
    RACE = "race"


class DomainModel(BaseModel):
    """Base class for the normalized schema: immutable, no unexpected fields."""

    model_config = ConfigDict(frozen=True, extra="forbid")


def make_session_id(season: int, event_name: str, session_type: SessionType) -> str:
    """Build a stable, filesystem- and Parquet-partition-safe session identifier."""
    return f"{season}_{slugify(event_name)}_{session_type.value}"


def make_event_id(season: int, event_name: str) -> str:
    """Build a stable event identifier: (season, event slug) -- the identity
    promoted above Session, per docs/m12-design-review.md §6. `round_number`
    is deliberately excluded: it collides within a season for non-championship
    (testing) events and is metadata, not identity (design review §3.7, §6).
    Shares its two components, in the same order, with `make_session_id`'s
    own prefix -- an `Event`'s sessions are exactly the sessions whose
    `session_id` starts with this `event_id`."""
    return f"{season}_{slugify(event_name)}"


class Event(DomainModel):
    """One F1 event (race weekend) within a season -- the grouping identity
    above Session (docs/m12-design-review.md §6, M12 Phase 1).

    Event identity is `(season, event slug)` -- see `make_event_id`. Not
    written to Parquet or Postgres by this phase; a provider/discovery-layer
    concept only, promoted to a typed model because both `FastF1Provider`
    (this phase) and Phase 2's future discovery step need to construct and
    reason about it, not because it has a store of its own yet (ADR-0006's
    "grows when a second real implementation forces it" principle applied to
    a data shape, not just an interface).
    """

    event_id: str
    season: int
    round_number: int
    event_name: str
    # FastF1's own vocabulary (conventional/sprint/sprint_shootout/
    # sprint_qualifying/testing) -- kept verbatim as metadata, not
    # re-canonicalized into a PitWall enum, since it is consumed (e.g. to
    # exclude testing events) rather than persisted or exposed as a stable
    # PitWall-owned taxonomy the way SessionType is (design review §6).
    event_format: str
    location: str
    country: str
    event_date: str | None = None  # ISO 8601 UTC date; not all events report one


class EventDiscovery(DomainModel):
    """The result of resolving and enumerating one event's real sessions
    (M12 Phase 2) -- `Event` identity/metadata plus which canonical
    `SessionType`s are actually available for it and the literal FastF1
    display name each resolves to. Not persisted -- a discovery-time
    result only, matching `Event`'s own status (docs/m12-design-review.md
    §7: "do not persist an Event table yet unless... genuinely required").
    """

    event: Event
    # This event's real Session1..5 display names, in schedule order, for
    # display/debugging -- entries are None for a slot the event doesn't
    # have (e.g. testing events, though those are excluded before this
    # model is ever built -- see find_event_row's include_testing=False).
    session_names: list[str | None]
    # Canonical SessionType -> the literal FastF1 identifier to pass to
    # fastf1.get_session() for it. Absent keys mean "not available for
    # this event" (docs/m12-design-review.md §3.2/§3.3) -- never a
    # misresolved or substituted session.
    available_sessions: dict[SessionType, str]


class Session(DomainModel):
    """One ingested session (e.g. 2023 Italian GP Race)."""

    session_id: str
    season: int
    event_name: str
    round_number: int
    location: str
    country: str
    session_type: SessionType
    session_date: str | None = None  # ISO 8601 UTC timestamp; not all events report one


class Driver(DomainModel):
    """A driver as they competed in one specific session."""

    session_id: str
    driver_id: str  # FastF1 3-letter Abbreviation, e.g. "VER"
    driver_number: int
    full_name: str
    team_name: str
    # M34 additions: session-result/classification fields (source:
    # ff1_session.results, docs/m34-design-review.md §2). None for session
    # types FastF1 doesn't populate these for (e.g. Practice), and for any
    # session ingested before M34 (Option B, docs/m34-design-review.md §6 --
    # no historical backfill).
    classified_position: str | None = None
    grid_position: int | None = None
    status: str | None = None
    points: float | None = None


class Lap(DomainModel):
    """One driver's one timed lap within a session."""

    session_id: str
    driver_id: str
    lap_number: int
    lap_time_seconds: float | None
    sector_1_seconds: float | None
    sector_2_seconds: float | None
    sector_3_seconds: float | None
    is_personal_best: bool
    is_accurate: bool
    # None where FastF1 doesn't report it (older seasons, some session types)
    compound: str | None = None
    # M35 addition: lap-by-lap running-order position (source:
    # ff1_session.laps' Position column, docs/m35-design-review.md §3). A
    # FastF1-derived rank, only populated for Race/Sprint/pre-2024 Sprint
    # Qualifying sessions; None for Qualifying/Practice and for any session
    # ingested before M35 (Option B -- no historical backfill,
    # docs/m35-design-review.md §7).
    position: int | None = None
    # M36 addition: FastF1's per-lap track-status code(s) (source:
    # ff1_session.laps' TrackStatus column, docs/m36-design-review.md §2).
    # A concatenated string of every status code active during the lap
    # (e.g. "1", "2", "241") -- not session-type-restricted, unlike
    # `position`. None for any session ingested before M36 (Option B -- no
    # historical backfill, docs/m36-design-review.md §7).
    track_status: str | None = None


class Stint(DomainModel):
    """One driver's one stint: a contiguous run of laps on one tyre set.

    See docs/adr/0011-hybrid-storage-architecture.md -- this is genuinely
    relational (a range of laps bounded by pit events), which is why it's
    written to PostgreSQL (postgres_writer.py) rather than Parquet, unlike
    every other model in this file.
    """

    session_id: str
    driver_id: str
    stint_number: int
    compound: str
    start_lap: int
    end_lap: int
    tyre_life_at_start: int | None  # laps already on this tyre set when the stint began


class PitStop(DomainModel):
    """One pit stop.

    `pit_lane_time_seconds` measures pit-lane entry-to-exit time (FastF1's
    `PitOutTime` on the following lap minus `PitInTime` on this lap -- see
    normalize.py's `normalize_pit_stops` docstring for why these two values
    never coexist on one row), not stationary box time -- it includes
    driving through the pit lane, not just the tyre change itself.
    """

    session_id: str
    driver_id: str
    stop_number: int
    lap_number: int
    pit_lane_time_seconds: float | None


class TelemetrySample(DomainModel):
    """One time/distance-aligned telemetry sample for one driver's one lap."""

    session_id: str
    driver_id: str
    lap_number: int
    distance_m: float
    time_seconds: float
    speed_kph: float
    throttle_pct: float
    brake_active: bool
    rpm: float
    gear: int
    drs_active: bool
    x: float
    y: float
    z: float


class TrackPoint(DomainModel):
    """A point of track geometry, derived from a reference lap's telemetry."""

    session_id: str
    distance_m: float
    x: float
    y: float


class NormalizedSessionData(DomainModel):
    """The full output of ingesting one session -- what TelemetryProvider returns.

    `stints`/`pit_stops` are written to PostgreSQL (ingest.py, via
    postgres_writer.py), never to Parquet -- cache_writer.py's
    `write_session_cache` does not read these two fields, by design
    (ADR-0011: Parquet remains the source of truth for laps/telemetry/
    sessions/drivers/track; these two are the only relational entities).
    Defaulted to empty (unlike `telemetry`/`track_points`, which are
    required) so existing callers/fixtures that only care about the
    Parquet-backed fields -- e.g. test_cache_writer.py's `_session_data()`
    helper -- don't need to change just because this model grew two new
    fields; `FastF1Provider` always passes both explicitly regardless.
    """

    session: Session
    drivers: list[Driver]
    laps: list[Lap]
    telemetry: list[TelemetrySample]
    track_points: list[TrackPoint]
    stints: list[Stint] = []
    pit_stops: list[PitStop] = []
