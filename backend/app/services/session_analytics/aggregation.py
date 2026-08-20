"""Rolls per-lap metrics (filtering, theoretical-best, consistency,
driving-style) up into per-driver summary and per-driver lap-list shapes
(M8 §3/§8/§10).

Returns plain frozen dataclasses, not Pydantic models: `app/models/
session_analytics.py` (the API response schema) doesn't exist yet -- that
is Phase 2 (plan §0.1 B4, §0.4a). Phase 2's Pydantic models are expected to
mirror these fields field-for-field, not the other way around.
"""

import statistics
from dataclasses import dataclass, field

from app.models.telemetry import Lap, TelemetrySample
from app.services.session_analytics.consistency import (
    consistency_cv as _consistency_cv,
)
from app.services.session_analytics.consistency import (
    consistency_ms as _consistency_ms,
)
from app.services.session_analytics.consistency import detect_outliers
from app.services.session_analytics.driving_style import (
    brake_event_count,
    full_throttle_pct,
    pooled_full_throttle_pct,
)
from app.services.session_analytics.filtering import (
    ExclusionReason,
    classify_lap,
    filter_for_aggregate_stats,
    filter_valid_laps,
)
from app.services.session_analytics.theoretical_best import (
    theoretical_best_delta_ms as _theoretical_best_delta_ms,
)
from app.services.session_analytics.theoretical_best import (
    theoretical_best_lap_ms as _theoretical_best_lap_ms,
)


@dataclass(frozen=True)
class DriverLapMetrics:
    """One driver's one lap's session-analytics metrics (M8 §3/§10)."""

    lap_number: int
    lap_time_ms: float | None
    is_valid: bool
    exclusion_reason: ExclusionReason | None
    is_outlier: bool
    delta_to_theoretical_best_ms: float | None
    delta_to_own_median_ms: float | None
    full_throttle_pct: float | None
    brake_event_count: int


@dataclass(frozen=True)
class LapPosition:
    """One lap's running-order position (M35, docs/m35-design-review.md
    §5). A plain passthrough of `Lap.position`, not a computed analytics
    value -- deliberately not part of `DriverLapMetrics`, which the M35
    design review found is never reached by the full-grid response
    `SessionAnalyticsPage` actually consumes.
    """

    lap_number: int
    position: int | None


@dataclass(frozen=True)
class DriverSummary:
    """One driver's session-wide summary row plus its full per-lap list
    (M8 §3). `laps` includes every lap the driver has, valid or not (§3's
    `/drivers/{driver}/laps` schema note: "Returns ALL laps for the
    driver").

    `lap_times_ms` is the same `aggregate_lap_times_ms` population that
    feeds `best_lap_ms`/`median_lap_ms`/`consistency_ms` below -- added in
    Phase 4 (not the Phase 0 schema draft, which omitted it) because
    `PaceDistributionChart` needs each driver's raw lap-time distribution
    to build its boxplot, and the design doc's B5 decision explicitly
    calls for "ECharts' own quartile transform over raw arrays" rather
    than a backend-computed five-number summary. Not the same population
    as `valid_lap_count` (which stays `is_accurate`-only, per the note
    below).

    `positions` (M35, docs/m35-design-review.md §5) is built from every lap
    the driver has -- not the yellow-flag-excluded `aggregate_laps`
    population `best_lap_ms`/etc. use -- since a position trend's most
    informative moments (a pit stop, a lap under yellow) are exactly what
    that filter would remove.
    """

    driver_id: str
    valid_lap_count: int
    best_lap_ms: float | None
    theoretical_best_lap_ms: float | None
    theoretical_best_delta_ms: float | None
    median_lap_ms: float | None
    consistency_ms: float | None
    consistency_cv: float | None
    full_throttle_pct: float | None
    outlier_lap_count: int
    lap_times_ms: list[float] = field(default_factory=list)
    laps: list[DriverLapMetrics] = field(default_factory=list)
    positions: list[LapPosition] = field(default_factory=list)


def _lap_time_ms(lap: Lap) -> float | None:
    if lap.lap_time_seconds is None:
        return None
    return lap.lap_time_seconds * 1000.0


def _lap_metrics(
    lap: Lap,
    samples: list[TelemetrySample],
    *,
    is_outlier: bool,
    theoretical_best_ms: float | None,
    median_lap_ms: float | None,
) -> DriverLapMetrics:
    lap_time_ms = _lap_time_ms(lap)
    validity = classify_lap(lap)
    delta_to_theoretical_best = (
        lap_time_ms - theoretical_best_ms
        if lap_time_ms is not None and theoretical_best_ms is not None
        else None
    )
    delta_to_own_median = (
        lap_time_ms - median_lap_ms
        if lap_time_ms is not None and median_lap_ms is not None
        else None
    )
    return DriverLapMetrics(
        lap_number=lap.lap_number,
        lap_time_ms=lap_time_ms,
        is_valid=validity.is_valid,
        exclusion_reason=validity.exclusion_reason,
        is_outlier=is_outlier,
        delta_to_theoretical_best_ms=delta_to_theoretical_best,
        delta_to_own_median_ms=delta_to_own_median,
        full_throttle_pct=full_throttle_pct(samples) if samples else None,
        brake_event_count=brake_event_count(samples) if samples else 0,
    )


def summarize_driver(
    driver_id: str,
    laps: list[Lap],
    telemetry_by_lap: dict[int, list[TelemetrySample]],
) -> DriverSummary:
    """Build one driver's `DriverSummary` (with its nested per-lap metrics)
    from that driver's raw laps and per-lap telemetry, keyed by
    `lap_number`. `telemetry_by_lap` may omit laps with no telemetry --
    those laps still appear in the per-lap list, with `full_throttle_pct`
    `None` and `brake_event_count` `0`.

    Headline pace statistics (best/median/theoretical-best/consistency/
    outliers) are computed over `filter_for_aggregate_stats(laps)`, not
    just `filter_valid_laps(laps)` -- §10's yellow-flag exclusion is meant
    to keep a single distorted lap from corrupting these aggregate
    numbers, and that reasoning applies to best/median/theoretical-best
    just as much as to consistency (the design doc names consistency and
    theoretical-best explicitly but the same logic clearly extends to
    best-lap and median, which are equally aggregate pace statistics).
    `valid_lap_count` itself stays keyed to `filter_valid_laps` alone,
    matching §10's "out-lap/in-lap excluded from valid_lap_count" wording,
    which doesn't mention yellow-flag laps.
    """
    valid_laps = filter_valid_laps(laps)
    aggregate_laps = filter_for_aggregate_stats(laps)

    aggregate_lap_times_ms = [t for lap in aggregate_laps if (t := _lap_time_ms(lap)) is not None]
    best_lap_ms = min(aggregate_lap_times_ms) if aggregate_lap_times_ms else None
    median_lap_ms = statistics.median(aggregate_lap_times_ms) if aggregate_lap_times_ms else None
    theoretical_best_ms = _theoretical_best_lap_ms(aggregate_laps)
    theoretical_delta_ms = _theoretical_best_delta_ms(best_lap_ms, theoretical_best_ms)
    consistency_ms_value = _consistency_ms(aggregate_lap_times_ms)
    consistency_cv_value = _consistency_cv(aggregate_lap_times_ms)

    outlier_flags = detect_outliers(aggregate_lap_times_ms)
    outlier_lap_numbers = {
        lap.lap_number
        for lap, is_outlier in zip(aggregate_laps, outlier_flags, strict=True)
        if is_outlier
    }

    driver_full_throttle_pct = pooled_full_throttle_pct(
        [
            telemetry_by_lap[lap.lap_number]
            for lap in aggregate_laps
            if lap.lap_number in telemetry_by_lap
        ]
    )

    lap_metrics = [
        _lap_metrics(
            lap,
            telemetry_by_lap.get(lap.lap_number, []),
            is_outlier=lap.lap_number in outlier_lap_numbers,
            theoretical_best_ms=theoretical_best_ms,
            median_lap_ms=median_lap_ms,
        )
        for lap in laps
    ]

    positions = [LapPosition(lap_number=lap.lap_number, position=lap.position) for lap in laps]

    return DriverSummary(
        driver_id=driver_id,
        valid_lap_count=len(valid_laps),
        best_lap_ms=best_lap_ms,
        theoretical_best_lap_ms=theoretical_best_ms,
        theoretical_best_delta_ms=theoretical_delta_ms,
        median_lap_ms=median_lap_ms,
        consistency_ms=consistency_ms_value,
        consistency_cv=consistency_cv_value,
        full_throttle_pct=driver_full_throttle_pct,
        outlier_lap_count=len(outlier_lap_numbers),
        lap_times_ms=aggregate_lap_times_ms,
        laps=lap_metrics,
        positions=positions,
    )
