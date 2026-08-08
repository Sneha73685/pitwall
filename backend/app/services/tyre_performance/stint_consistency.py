"""Per-stint pace consistency (M11 §4.1 #9, docs/m11-design-review.md
§5.1). Reuses `session_analytics.consistency`'s `consistency_ms`/
`consistency_cv` directly -- no second implementation of standard
deviation/coefficient-of-variation exists here. Those functions' own
`fewer than 2 values -> None` convention is inherited unmodified: it is
not restated or re-thresholded for stints.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.services.session_analytics.consistency import consistency_cv, consistency_ms
from app.services.tyre_performance.boundary_laps import StintBoundaryLaps
from app.services.tyre_performance.stint_eligibility import trend_eligible_by_stint
from app.services.tyre_performance.stint_join import LapStintPosition


@dataclass(frozen=True)
class StintConsistency:
    """One stint's pace consistency, over its trend-eligible laps only."""

    stint_number: int
    eligible_lap_count: int
    consistency_ms: float | None
    consistency_cv: float | None


def _eligible_lap_times_ms(positions: Sequence[LapStintPosition]) -> list[float]:
    return [
        position.lap.lap_time_seconds * 1000.0
        for position in positions
        if position.lap.lap_time_seconds is not None
    ]


def stint_consistency(stint_number: int, positions: Sequence[LapStintPosition]) -> StintConsistency:
    """`positions` must already be the stint's trend-eligible population
    (see `stint_eligibility.trend_eligible_by_stint`) -- this function does
    not itself apply validity or in/out-lap filtering."""
    lap_times_ms = _eligible_lap_times_ms(positions)
    return StintConsistency(
        stint_number=stint_number,
        eligible_lap_count=len(lap_times_ms),
        consistency_ms=consistency_ms(lap_times_ms),
        consistency_cv=consistency_cv(lap_times_ms),
    )


def stint_consistency_by_stint(
    positions: Sequence[LapStintPosition], boundary: StintBoundaryLaps
) -> dict[int, StintConsistency]:
    """One `StintConsistency` per stint that has at least one trend-eligible
    lap. A stint with zero eligible laps is absent, matching
    `trend_eligible_by_stint`'s own convention."""
    grouped = trend_eligible_by_stint(positions, boundary)
    return {
        stint_number: stint_consistency(stint_number, stint_positions)
        for stint_number, stint_positions in grouped.items()
    }
