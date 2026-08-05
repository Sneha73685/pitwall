"""PitWall API response models for session analytics (M8).

Anti-corruption boundary, same as telemetry.py/lap_comparison.py
(docs/adr/0009): independently defined, not imported from
app/services/session_analytics/ (that package's dataclasses are an
internal domain shape, not the API contract -- the API route layer maps
between the two). Field names and shapes mirror `docs/m8-implementation-
plan.md` §0.4 (the Phase-0-corrected response schema draft), not the
design doc's original examples verbatim -- see that plan section for the
`code`-not-`warning_code` and dropped-`compound` corrections.
"""

from enum import Enum
from typing import Literal

from app.models.telemetry import ApiModel

ExclusionReason = Literal["yellow_flag"]
"""Only `"yellow_flag"` (and `None`) can ever actually be populated today:
`"out_lap"`/`"in_lap"` have no backing data anywhere in the schema (plan
§0.1 B4 correction). The wider `"out_lap" | "in_lap" | "yellow_flag"`
literal from the design doc's example is deliberately not modeled here --
declaring two values this API can never emit would be a schema that lies,
not forward-compatibility.
"""


class SessionAnalyticsWarningCode(str, Enum):
    """Stable vocabulary for `SessionAnalyticsWarning.code`, matching M6's
    `WarningCode` convention (`app/models/lap_comparison.py`): the frontend
    renders its own copy/iconography per code rather than displaying
    backend prose directly.
    """

    INSUFFICIENT_LAPS = "insufficient_laps"


class SessionAnalyticsWarning(ApiModel):
    """One reason a driver's session-analytics figures may be incomplete.
    Non-blocking, and driver-scoped: unlike M6's lap-A/lap-B-scoped
    `ComparisonWarning`, this milestone's warnings are about one driver in
    a roster of many, so `driver` identifies which one (plan §0.4).
    """

    code: SessionAnalyticsWarningCode
    driver: str
    detail: str | None = None


class DriverSummary(ApiModel):
    """One driver's session-wide summary row (plan §0.4)."""

    driver: str
    valid_lap_count: int
    best_lap_ms: float | None
    theoretical_best_lap_ms: float | None
    theoretical_best_delta_ms: float | None
    median_lap_ms: float | None
    consistency_ms: float | None
    consistency_cv: float | None
    full_throttle_pct: float | None
    outlier_lap_count: int


class SessionAnalyticsResponse(ApiModel):
    """`GET /sessions/{session_id}/analytics/drivers` (plan §0.4). Lists
    every driver in the session regardless of valid lap count (plan §0.1
    B1) -- a 0-valid-lap driver still gets a row, with the nullable fields
    above all `None`.
    """

    session_id: str
    session_lap_count: int
    drivers: list[DriverSummary]
    warnings: list[SessionAnalyticsWarning]


class DriverLapMetrics(ApiModel):
    """One driver's one lap's session-analytics metrics (plan §0.4)."""

    lap_number: int
    lap_time_ms: float | None
    is_valid: bool
    exclusion_reason: ExclusionReason | None
    is_outlier: bool
    delta_to_theoretical_best_ms: float | None
    delta_to_own_median_ms: float | None
    full_throttle_pct: float | None
    brake_event_count: int


class DriverLapsResponse(ApiModel):
    """`GET /sessions/{session_id}/analytics/drivers/{driver}/laps` (plan
    §0.4). Returns ALL of the driver's laps, valid and invalid alike --
    not just the ones counted toward `valid_lap_count`.
    """

    session_id: str
    driver: str
    laps: list[DriverLapMetrics]
    warnings: list[SessionAnalyticsWarning]
