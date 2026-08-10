"""Tyre & stint performance domain logic (M11): stint join, in/out-lap
boundary detection, trend/consistency eligibility, per-stint consistency,
per-compound aggregation, raw cross-driver compound comparison, and
strategy summaries. Pure functions only, no FastAPI/route imports, no
Parquet/PostgreSQL dependency -- matching the existing app/services/
boundary (app/services/session_analytics/, M8).

Descriptive only: no regression, curve fitting, slope/coefficient,
degradation rate, fuel correction, safety-car/weather/traffic adjustment,
undercut/overcut conclusion, or driver ranking anywhere in this package.
See docs/m11-design-review.md for the full audit and non-goals.

Phase 2 adds `orchestration.py` (composes the above for the two API routes)
and, outside this package, `app/api/tyre_performance.py`,
`app/models/tyre_performance.py`, and the `RaceContextRepository.list_stints`
widening -- see docs/m11-implementation-plan.md.
"""

from app.services.tyre_performance.boundary_laps import (
    StintBoundaryLaps,
    identify_boundary_laps,
)
from app.services.tyre_performance.compound_aggregation import (
    CompoundAggregate,
    CompoundLapIndexAggregate,
    aggregate_by_compound,
    aggregate_by_compound_and_lap_index,
)
from app.services.tyre_performance.driver_compound_comparison import (
    RawLapTimeByCompound,
    raw_lap_times_by_compound,
)
from app.services.tyre_performance.orchestration import (
    AnnotatedLap,
    DriverStintPace,
    SessionTyrePerformance,
    build_driver_stint_pace,
    build_session_tyre_performance,
)
from app.services.tyre_performance.stint_consistency import (
    StintConsistency,
    stint_consistency,
    stint_consistency_by_stint,
)
from app.services.tyre_performance.stint_eligibility import (
    has_trend_shape,
    trend_eligible_by_stint,
    trend_eligible_positions,
    valid_positions,
)
from app.services.tyre_performance.stint_join import (
    LapStintPosition,
    join_laps_to_stints,
)
from app.services.tyre_performance.strategy_summary import (
    CompoundUsageCount,
    DriverStrategySummary,
    driver_strategy_summary,
    session_compound_usage,
)

__all__ = [
    "StintBoundaryLaps",
    "identify_boundary_laps",
    "CompoundAggregate",
    "CompoundLapIndexAggregate",
    "aggregate_by_compound",
    "aggregate_by_compound_and_lap_index",
    "RawLapTimeByCompound",
    "raw_lap_times_by_compound",
    "AnnotatedLap",
    "DriverStintPace",
    "SessionTyrePerformance",
    "build_driver_stint_pace",
    "build_session_tyre_performance",
    "StintConsistency",
    "stint_consistency",
    "stint_consistency_by_stint",
    "has_trend_shape",
    "trend_eligible_by_stint",
    "trend_eligible_positions",
    "valid_positions",
    "LapStintPosition",
    "join_laps_to_stints",
    "CompoundUsageCount",
    "DriverStrategySummary",
    "driver_strategy_summary",
    "session_compound_usage",
]
