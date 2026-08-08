"""Trend/consistency-eligible lap population for M11 (M11 §4.1 #8,
docs/m11-design-review.md §5.2).

There is no invented minimum-stint-length constant. A stint's eligible
population is simply whatever laps remain after applying, in order:

1. M8's existing lap-validity rule (`is_accurate`, via
   `session_analytics.filtering.classify_lap` -- reused unmodified, no new
   validity signal is introduced here);
2. membership in a known stint (`LapStintPosition.in_known_stint`);
3. in-lap/out-lap exclusion (`boundary_laps.StintBoundaryLaps`).

This mirrors M8's `filter_valid_laps` vs. `filter_for_aggregate_stats`
two-population pattern: nothing is ever deleted from the raw
`LapStintPosition` list a caller already has -- these functions only ever
return filtered *subsets*, so a caller that wants the raw/unfiltered view
still has it.
"""

from collections.abc import Sequence

from app.services.session_analytics.filtering import classify_lap
from app.services.tyre_performance.boundary_laps import StintBoundaryLaps
from app.services.tyre_performance.stint_join import LapStintPosition

_MIN_POINTS_FOR_A_TRACE = 2
"""The minimum number of points needed to draw a connected line at all --
a geometric fact about line-drawing, not a statistical significance
threshold. Two eligible laps are not claimed to be a sufficient sample to
draw a tyre-behavior conclusion from; see docs/m11-design-review.md §5.2's
"what this threshold does not mean"."""


def valid_positions(positions: Sequence[LapStintPosition]) -> list[LapStintPosition]:
    """Positions whose lap is valid per M8's `is_accurate`-based rule,
    regardless of stint membership or in/out-lap status."""
    return [position for position in positions if classify_lap(position.lap).is_valid]


def trend_eligible_positions(
    positions: Sequence[LapStintPosition], boundary: StintBoundaryLaps
) -> list[LapStintPosition]:
    """Valid positions that belong to a known stint and are not an in-lap
    or out-lap -- the population trend/consistency computations should use.

    A stint whose every lap is excluded by this filter (e.g. a one-lap
    stint that is itself the pit-in lap, as with the real `HUL` case in
    docs/m11-design-review.md §3.2) simply contributes zero laps here; no
    separate short-stint check exists or is needed.
    """
    return [
        position
        for position in valid_positions(positions)
        if position.in_known_stint and not boundary.is_boundary_lap(position.lap.lap_number)
    ]


def trend_eligible_by_stint(
    positions: Sequence[LapStintPosition], boundary: StintBoundaryLaps
) -> dict[int, list[LapStintPosition]]:
    """`trend_eligible_positions`, grouped by `stint_number`. A stint with
    no eligible laps at all is simply absent from the returned mapping,
    not present with an empty list -- callers that need every stint
    represented (e.g. to show "no eligible laps" explicitly) should iterate
    the driver's own stint list separately and default missing keys.
    """
    grouped: dict[int, list[LapStintPosition]] = {}
    for position in trend_eligible_positions(positions, boundary):
        assert position.stint_number is not None  # guaranteed by in_known_stint, above
        grouped.setdefault(position.stint_number, []).append(position)
    return grouped


def has_trend_shape(positions: Sequence[LapStintPosition]) -> bool:
    """Whether `positions` has enough points to draw a connected trace
    (>= 2). Purely geometric -- see `_MIN_POINTS_FOR_A_TRACE`'s docstring."""
    return len(positions) >= _MIN_POINTS_FOR_A_TRACE
