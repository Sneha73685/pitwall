"""PitWall API response models for tyre & stint performance analytics (M11).

Anti-corruption boundary, same as telemetry.py/lap_comparison.py/
session_analytics.py/race_context.py (docs/adr/0009): independently defined
from `app.services.tyre_performance`'s internal dataclasses, never imported
from them. The route layer (`app/api/tyre_performance.py`) maps between the
two explicitly -- there is no shortcut where a service dataclass is returned
or serialized directly.

Descriptive only (docs/m11-design-review.md §4, §8): nothing here may be
named or shaped like a degradation rate, slope, coefficient, regression
fit, pace/performance score, rank, or any driver/compound comparative
verdict. See `raw_lap_times_by_compound`'s docstring in
`app/services/tyre_performance/driver_compound_comparison.py` for the
non-goal this boundary exists to enforce end-to-end, API included.

These are wrapper responses (multiple fields/lists bundled under one
object), the same shape as `SessionAnalyticsResponse`/`DriverLapsResponse`
(M8) -- not a bare list like `Stint`/`PitStop` (M10). Following that closer
precedent, `session_id`/`driver_id` are kept on the top-level responses
despite being URL-implied, the same choice M8 made for its own wrapper
responses. Nested per-item models drop whatever the wrapper already
carries (e.g. `StintPaceLap` has no `driver_id`, since
`DriverStintPaceResponse` already scopes the whole response to one driver);
items that span multiple drivers within a session-wide response (
`DriverStrategySummary`, `RawLapTimeByCompound`) keep `driver_id`, matching
`PitStop`'s existing "response can span multiple drivers" reasoning.
"""

from app.models.telemetry import ApiModel


class StintPaceLap(ApiModel):
    """One raw lap, annotated with its stint context and eligibility.

    Every lap a driver has appears here, including in-laps, out-laps, and
    invalid laps -- excluded observations are flagged (`is_valid`,
    `is_in_lap`, `is_out_lap`, `is_trend_eligible`), never omitted
    (docs/m11-design-review.md §5.1/§5.2/§11's success criteria).
    """

    lap_number: int
    lap_time_seconds: float | None
    compound: str | None
    stint_number: int | None
    lap_in_stint_index: int | None
    is_valid: bool
    is_in_lap: bool
    is_out_lap: bool
    is_trend_eligible: bool


class StintPace(ApiModel):
    """One stint's identity plus its trend-eligible-lap consistency summary.

    Every stint the driver had appears here, even one with zero
    trend-eligible laps (e.g. a one-lap stint that is itself the pit-in lap
    -- the real `HUL`/Bahrain case, docs/m11-design-review.md §3.2/§5.2) --
    `eligible_lap_count` is `0` and `consistency_ms`/`consistency_cv` are
    `None` in that case, not an absent stint.
    """

    stint_number: int
    compound: str
    start_lap: int
    end_lap: int
    tyre_life_at_start: int | None
    eligible_lap_count: int
    consistency_ms: float | None
    consistency_cv: float | None


class DriverStintPaceResponse(ApiModel):
    """`GET /sessions/{session_id}/drivers/{driver_id}/stint-pace`."""

    session_id: str
    driver_id: str
    laps: list[StintPaceLap]
    stints: list[StintPace]


class DriverStrategySummary(ApiModel):
    """One driver's stint sequence and compound choices for this session --
    a factual strategy shape (e.g. `compound_sequence=["SOFT","HARD","HARD"]`),
    never a judgement of whether it was a good strategy
    (docs/m11-design-review.md §5.1)."""

    driver_id: str
    stint_count: int
    compound_sequence: list[str]
    stint_lengths: list[int]


class CompoundUsageCount(ApiModel):
    """Session-wide usage of one compound across every driver's stints --
    counts only, no ranking of compounds against each other."""

    compound: str
    stint_count: int
    driver_count: int
    total_laps: int


class CompoundAggregate(ApiModel):
    """One compound's session-wide descriptive summary, pooled across every
    driver/stint that ran it -- raw values plus standard descriptive
    statistics (median, quartiles), never a fitted parameter
    (docs/m11-design-review.md §4.2)."""

    compound: str
    lap_count: int
    driver_count: int
    lap_times_ms: list[float]
    median_lap_time_ms: float | None
    p25_lap_time_ms: float | None
    p75_lap_time_ms: float | None


class CompoundLapIndexAggregate(ApiModel):
    """One compound's trend-eligible laps at one lap-in-stint index, pooled
    across every driver/stint that reached that index -- the raw building
    block for a "shape across the stint" view. No curve is fitted across
    index values; that reading is left entirely to whoever looks at the
    chart (docs/m11-design-review.md §4.2)."""

    compound: str
    lap_in_stint_index: int
    lap_count: int
    lap_times_ms: list[float]
    median_lap_time_ms: float | None


class RawLapTimeByCompound(ApiModel):
    """One driver's raw lap times on one compound within this session.

    Deliberately NOT a "driver pace comparison," "driver ranking," or any
    normalized performance claim (docs/m11-design-review.md §4.3): raw
    lap-time differences between drivers are confounded by fuel load, track
    position/traffic, session conditions, and driver/team/car differences,
    none of which this data model controls for. This model has no `rank`,
    `position`, `faster_than`, `pace_score`, `normalized_pace`,
    `performance_score`, or `degradation_rate` field, and never will --
    a consumer with a legitimate need for one of those concepts must build
    it outside this API, with its own explicit normalization assumptions.
    """

    driver_id: str
    compound: str
    lap_count: int
    lap_times_ms: list[float]
    lap_in_stint_indices: list[int]
    median_lap_time_ms: float | None


class TyrePerformanceResponse(ApiModel):
    """`GET /sessions/{session_id}/tyre-performance`. Session-wide,
    descriptive only -- see this module's docstring and
    docs/m11-design-review.md §8 for the full non-goal list this response
    is bound by (no "fastest compound," no "best driver," no degradation
    number, no cross-session aggregation)."""

    session_id: str
    driver_strategies: list[DriverStrategySummary]
    compound_usage: list[CompoundUsageCount]
    compound_aggregates: list[CompoundAggregate]
    compound_lap_index_aggregates: list[CompoundLapIndexAggregate]
    raw_lap_times_by_compound: list[RawLapTimeByCompound]
