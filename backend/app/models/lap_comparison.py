"""PitWall API response models for two-lap comparison (M6).

Anti-corruption boundary, same as telemetry.py (docs/adr/0009). No request
model here: like every other multi-parameter GET in this API (sessions.py,
telemetry.py), query params are typed directly on the route function via
FastAPI's Query() -- see app/api/laps_compare.py.

Scope note: this ships PRD §3's M6 exactly -- two-lap telemetry overlay,
sector time table, cumulative delta chart. Synced cursor, track-map delta
coloring, and click-drag zoom are V2 per docs/success-metrics.md and are
not modeled here (see docs/m6-design-review.md's Phase 0 findings).
"""

from enum import Enum
from typing import Literal

from pydantic import Field

from app.models.telemetry import ApiModel, Lap

MAX_COMPARE_RESOLUTION = 2000
DEFAULT_COMPARE_RESOLUTION = 1000

# Fixed channel set, matching TelemetrySample's fields exactly (excluding
# x/y/z, which are position, not a telemetry trace) and matching the M5
# frontend's existing six-channel TelemetryCharts view -- no per-request
# channel selection in M6, consistent with /telemetry (M2) never having one.
COMPARE_CHANNELS = ("speed_kph", "throttle_pct", "brake_active", "rpm", "gear", "drs_active")


class ChannelSeries(ApiModel):
    """One telemetry channel's two-lap values on the shared distance grid.

    `a[i]`/`b[i]` correspond to `LapComparisonResponse.distance_m[i]`.
    """

    a: list[float]
    b: list[float]


class SectorDelta(ApiModel):
    """Delta between the two compared laps over one sector."""

    sector: Literal[1, 2, 3]
    delta_ms: float
    faster: Literal["a", "b"]


class WarningCode(str, Enum):
    """Stable vocabulary for `ComparisonWarning.code` -- the frontend renders
    its own copy/iconography per code rather than displaying backend prose
    directly (docs/m6-implementation-plan.md §0.4).
    """

    INVALID_LAP_A = "invalid_lap_a"
    INVALID_LAP_B = "invalid_lap_b"


class ComparisonWarning(ApiModel):
    """One reason this comparison may be misleading. Non-blocking."""

    code: WarningCode
    detail: str | None = None


class LapComparisonResponse(ApiModel):
    """Distance-aligned comparison of two laps within one session."""

    session_id: str
    lap_a: Lap
    lap_b: Lap
    compared_distance_m: float
    distance_m: list[float]
    delta_ms: list[float] = Field(
        description=(
            "Cumulative time delta at each distance_m grid point, in "
            "milliseconds. Sign convention: positive means lap A is faster "
            "(ahead) at that distance -- lap B has taken more time to reach "
            "the same point. delta_ms[i] corresponds to distance_m[i]."
        )
    )
    channels: dict[str, ChannelSeries]
    sectors: list[SectorDelta]
    warnings: list[ComparisonWarning]
