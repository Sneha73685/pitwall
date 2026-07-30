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
    """The full output of ingesting one session -- what TelemetryProvider returns."""

    session: Session
    drivers: list[Driver]
    laps: list[Lap]
    telemetry: list[TelemetrySample]
    track_points: list[TrackPoint]
