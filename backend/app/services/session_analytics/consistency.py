"""Per-driver lap-time consistency and IQR outlier detection (M8 §8.1).

Population standard deviation (not sample stddev) is used throughout: a
driver's aggregate-eligible laps in one session are the *entire*
population of interest here, not a sample drawn from some larger
population, so `statistics.pstdev`, not `statistics.stdev`, is the correct
choice. The design doc's `consistency_ms = stddev(valid_lap_times_ms)`
leaves this unstated, so it's called out explicitly here -- the same
instinct as M6's sign-convention documentation.
"""

import statistics
from collections.abc import Sequence


def consistency_ms(lap_times_ms: Sequence[float]) -> float | None:
    """`None` (not `0`) for 0- or 1-lap drivers: a single point has no
    defined spread, and reporting `0` would misleadingly read as
    "perfectly consistent" rather than "not enough data" (design doc §10).
    """
    if len(lap_times_ms) < 2:
        return None
    return statistics.pstdev(lap_times_ms)


def consistency_cv(lap_times_ms: Sequence[float]) -> float | None:
    """Coefficient of variation: `consistency_ms / mean(lap_times_ms)`.
    Same "`None`, not `0`, for fewer than 2 laps" rule as `consistency_ms`.
    """
    if len(lap_times_ms) < 2:
        return None
    mean = statistics.fmean(lap_times_ms)
    return statistics.pstdev(lap_times_ms) / mean


def detect_outliers(lap_times_ms: Sequence[float]) -> list[bool]:
    """One bool per input lap time, `True` where that lap is an IQR
    outlier (§8.1): outside `[Q1 - 1.5*IQR, Q3 + 1.5*IQR]`. Two-sided by
    construction -- both unusually fast and unusually slow laps can be
    flagged, since both bounds are checked independently.

    Quartiles use `statistics.quantiles(..., method="inclusive")` (linear
    interpolation between ranks -- the same convention numpy's default
    `percentile` uses): a standard, well-documented method, matching the
    design doc's own reasoning for IQR over z-score (no ad-hoc modeling
    judgment call). This does not need to agree with whatever quartile
    convention the frontend's ECharts boxplot uses internally for box/
    whisker rendering (plan §0.1 B5): outlier flagging here and the box
    shape there are independently sourced by design.

    Fewer than 2 lap times can't support a quartile split -- returns all
    `False` rather than raising.
    """
    if len(lap_times_ms) < 2:
        return [False] * len(lap_times_ms)
    q1, _, q3 = statistics.quantiles(lap_times_ms, n=4, method="inclusive")
    iqr = q3 - q1
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr
    return [time < lower_bound or time > upper_bound for time in lap_times_ms]
