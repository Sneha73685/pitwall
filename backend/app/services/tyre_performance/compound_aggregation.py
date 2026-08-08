"""Session-wide, per-compound descriptive aggregation (M11 §4.1 #10,
docs/m11-design-review.md §4.2, §5.1/§5.3).

Grouping, counts, medians, and quartiles only. There is deliberately no
regression, slope, coefficient, polynomial fit, or any other fitted
parameter anywhere in this module -- `numpy` is not imported, and no
function here accepts or returns anything shaped like a trend line.
`docs/m11-design-review.md` §4.2 explains why: within one stint, lap time
is simultaneously affected by fuel burn, track evolution, and tyre wear,
with no data available to separate them, so a fitted "degradation" number
would silently net together three unmeasured, opposite-signed effects.
These functions instead return raw/grouped data for a human to look at.

Callers must pass already trend-eligible positions (see
`stint_eligibility.trend_eligible_by_stint`/`trend_eligible_positions`) --
this module does not itself apply lap-validity or in/out-lap filtering, to
keep that rule defined in exactly one place.
"""

import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.services.tyre_performance.stint_join import LapStintPosition

_MIN_VALUES_FOR_QUARTILES = 2


@dataclass(frozen=True)
class CompoundAggregate:
    """One compound's session-wide descriptive summary, pooled across every
    driver/stint that ran it. `lap_times_ms` is the raw, sorted population
    behind the other fields -- present so a caller can build its own
    chart-side distribution (e.g. a boxplot) rather than trusting only the
    backend's own summary numbers, the same "raw array, chart does the
    transform" posture M8 established."""

    compound: str
    lap_count: int
    driver_count: int
    lap_times_ms: list[float]
    median_lap_time_ms: float | None
    p25_lap_time_ms: float | None
    p75_lap_time_ms: float | None


@dataclass(frozen=True)
class CompoundLapIndexAggregate:
    """One compound's trend-eligible laps at one lap-in-stint index, pooled
    across every driver/stint that reached that index -- the raw building
    block for a "shape across the stint" view. No curve is fitted through
    these rows across index values; reading the shape is left to whoever
    looks at the chart."""

    compound: str
    lap_in_stint_index: int
    lap_count: int
    lap_times_ms: list[float]
    median_lap_time_ms: float | None


def _quartiles(lap_times_ms: Sequence[float]) -> tuple[float | None, float | None]:
    """(p25, p75); `None`/`None` below 2 values, matching M8's own
    `fewer than 2 -> None` convention (`consistency.py`) rather than
    raising `statistics.StatisticsError`."""
    if len(lap_times_ms) < _MIN_VALUES_FOR_QUARTILES:
        return None, None
    q1, _, q3 = statistics.quantiles(lap_times_ms, n=4, method="inclusive")
    return q1, q3


def _eligible_lap_time_ms(position: LapStintPosition) -> float | None:
    if position.lap.lap_time_seconds is None:
        return None
    return position.lap.lap_time_seconds * 1000.0


def aggregate_by_compound(
    eligible_positions_by_driver: Mapping[str, Sequence[LapStintPosition]],
) -> list[CompoundAggregate]:
    """One `CompoundAggregate` per compound present in the input, sorted
    alphabetically by compound name -- not by any statistic, so list order
    never implies a ranking."""
    lap_times_by_compound: dict[str, list[float]] = {}
    drivers_by_compound: dict[str, set[str]] = {}

    for driver_id, positions in eligible_positions_by_driver.items():
        for position in positions:
            lap_time_ms = _eligible_lap_time_ms(position)
            if position.compound is None or lap_time_ms is None:
                continue
            lap_times_by_compound.setdefault(position.compound, []).append(lap_time_ms)
            drivers_by_compound.setdefault(position.compound, set()).add(driver_id)

    aggregates = []
    for compound in sorted(lap_times_by_compound):
        lap_times_ms = sorted(lap_times_by_compound[compound])
        p25, p75 = _quartiles(lap_times_ms)
        aggregates.append(
            CompoundAggregate(
                compound=compound,
                lap_count=len(lap_times_ms),
                driver_count=len(drivers_by_compound[compound]),
                lap_times_ms=lap_times_ms,
                median_lap_time_ms=statistics.median(lap_times_ms) if lap_times_ms else None,
                p25_lap_time_ms=p25,
                p75_lap_time_ms=p75,
            )
        )
    return aggregates


def aggregate_by_compound_and_lap_index(
    eligible_positions_by_driver: Mapping[str, Sequence[LapStintPosition]],
) -> list[CompoundLapIndexAggregate]:
    """One `CompoundLapIndexAggregate` per (compound, lap-in-stint-index)
    pair present in the input, sorted by (compound, lap_in_stint_index)."""
    lap_times_by_key: dict[tuple[str, int], list[float]] = {}

    for positions in eligible_positions_by_driver.values():
        for position in positions:
            lap_time_ms = _eligible_lap_time_ms(position)
            if (
                position.compound is None
                or position.lap_in_stint_index is None
                or lap_time_ms is None
            ):
                continue
            key = (position.compound, position.lap_in_stint_index)
            lap_times_by_key.setdefault(key, []).append(lap_time_ms)

    aggregates = []
    for key in sorted(lap_times_by_key):
        compound, lap_in_stint_index = key
        lap_times_ms = sorted(lap_times_by_key[key])
        aggregates.append(
            CompoundLapIndexAggregate(
                compound=compound,
                lap_in_stint_index=lap_in_stint_index,
                lap_count=len(lap_times_ms),
                lap_times_ms=lap_times_ms,
                median_lap_time_ms=statistics.median(lap_times_ms) if lap_times_ms else None,
            )
        )
    return aggregates
