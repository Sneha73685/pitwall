"""PitWall API response models for two-lap comparison (M6, generalized to
cross-session in M13).

Anti-corruption boundary, same as telemetry.py (docs/adr/0009). No request
model here: like every other multi-parameter GET in this API (sessions.py,
telemetry.py), query params are typed directly on the route function via
FastAPI's Query() -- see app/api/laps_compare.py.

Scope note: this ships PRD §3's M6 exactly -- two-lap telemetry overlay,
sector time table, cumulative delta chart. Synced cursor, track-map delta
coloring, and click-drag zoom are V2 per docs/success-metrics.md and are
not modeled here (see docs/m6-design-review.md's Phase 0 findings).

M13 (docs/m13-design-review.md) generalizes the two compared laps to come
from two independent sessions -- `session_id` becomes `session_id_a`/
`session_id_b` below, and `WarningCode` gains `DIFFERENT_CIRCUIT`. Nothing
else here changes: the alignment/delta/sector shapes are unaffected,
per that design's §5 service-boundary decision.
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
    # M13: session A and session B have different Session.location values.
    # Computed at the API layer (app/api/laps_compare.py), not here or in
    # app/services/lap_comparison/ -- circuit identity is a session-level
    # concept the comparison engine must stay ignorant of
    # (docs/m13-design-review.md §5/§9). Comparison is still allowed and
    # still computed; this only tells the frontend to hide TrackMapDelta
    # (docs/m13-design-review.md §9 reverses M6 design review §10's
    # original "reject on mismatch" plan in favor of "warn, don't block",
    # consistent with how compound/fuel/track-evolution differences are
    # already handled -- disclosed, not blocked).
    DIFFERENT_CIRCUIT = "different_circuit"


class ComparisonWarning(ApiModel):
    """One reason this comparison may be misleading. Non-blocking."""

    code: WarningCode
    detail: str | None = None


class LapComparisonResponse(ApiModel):
    """Distance-aligned comparison of two laps, each independently resolved
    from its own session (M13, docs/m13-design-review.md §4) -- may be the
    same session on both sides (the M6-era case) or two different ones.
    """

    session_id_a: str
    session_id_b: str
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
