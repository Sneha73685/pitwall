"""PitWall API response models: sessions, drivers, laps, telemetry samples.

This is the anti-corruption boundary described in
docs/adr/0009-internal-api-schema-boundary.md: independently defined from
pitwall_pipeline.models (see docs/api-model.md), not imported from it -- the
backend has no dependency on the pipeline package. See docs/data-model.md
for the pipeline-side schema these mirror the fields of.
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict


class SessionType(str, Enum):
    """Stable session vocabulary -- matches pitwall_pipeline.models.SessionType's values."""

    PRACTICE_1 = "practice_1"
    PRACTICE_2 = "practice_2"
    PRACTICE_3 = "practice_3"
    QUALIFYING = "qualifying"
    SPRINT_QUALIFYING = "sprint_qualifying"
    SPRINT = "sprint"
    RACE = "race"


class ApiModel(BaseModel):
    """Base class for API response models: immutable, no unexpected fields."""

    model_config = ConfigDict(frozen=True, extra="forbid")


class Session(ApiModel):
    """One ingested session (e.g. 2023 Italian GP Race)."""

    session_id: str
    season: int
    event_name: str
    # M12 Phase 4, additive: (season, event slug) -- the identity Season/
    # Event discovery groups by (docs/m12-design-review.md §6). Computed
    # from season/event_name via app.utils.ids.make_event_id, matching
    # pitwall_pipeline.models.make_event_id's formula; never persisted.
    event_id: str
    round_number: int
    location: str
    country: str
    session_type: SessionType
    session_date: str | None = None
    # M12 Phase 4, additive: whether this session's telemetry is actually
    # available in PitWall's Parquet cache -- not always true even for a
    # successfully ingested session (the real, verified 2018 finding,
    # docs/m12-design-review.md §19.2: lap/stint/compound data can load
    # while telemetry access fails). A client must check this before
    # assuming a track-map/telemetry view has data to show.
    has_telemetry: bool


class Driver(ApiModel):
    """A driver as they competed in one specific session."""

    driver_id: str
    driver_number: int
    full_name: str
    team_name: str
    # M34 additions: session-result/classification fields (source:
    # ff1_session.results, docs/m34-design-review.md §2/§7). None for
    # session types FastF1 doesn't populate these for (e.g. Practice), and
    # for any session ingested before M34 (Option B -- no historical
    # backfill, docs/m34-design-review.md §6).
    classified_position: str | None = None
    grid_position: int | None = None
    status: str | None = None
    points: float | None = None


class Lap(ApiModel):
    """One driver's one timed lap within a session."""

    driver_id: str
    lap_number: int
    lap_time_seconds: float | None
    sector_1_seconds: float | None
    sector_2_seconds: float | None
    sector_3_seconds: float | None
    is_personal_best: bool
    is_accurate: bool
    # Additive M10 field (docs/adr/0011-hybrid-storage-architecture.md):
    # None for pre-M10 ingested sessions, or where FastF1 doesn't report it.
    compound: str | None = None
    # M35 addition: lap-by-lap running-order position (source:
    # ff1_session.laps' Position column, docs/m35-design-review.md §3). None
    # for session types FastF1 doesn't populate it for (Qualifying/
    # Practice), and for any session ingested before M35 (Option B -- no
    # historical backfill, docs/m35-design-review.md §7).
    position: int | None = None
    # M36 addition: FastF1's per-lap track-status code(s) (source:
    # ff1_session.laps' TrackStatus column, docs/m36-design-review.md §2).
    # A concatenated string of every status code active during the lap
    # (e.g. "1", "2", "241") -- not session-type-restricted, unlike
    # `position`. None for any session ingested before M36 (Option B -- no
    # historical backfill, docs/m36-design-review.md §7). Consumed by
    # app/services/session_analytics/filtering.py's yellow-flag exclusion;
    # exposed on this shared model rather than hidden since there is only
    # one `Lap` model in this backend (docs/m36-design-review.md §4).
    track_status: str | None = None


class TelemetrySample(ApiModel):
    """One time/distance-aligned telemetry sample for one driver's one lap."""

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


class TrackPoint(ApiModel):
    """A point of track geometry, derived from a reference lap's telemetry."""

    distance_m: float
    x: float
    y: float
