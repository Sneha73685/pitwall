"""Session analytics domain logic (M8): valid-lap filtering, theoretical-best
lap, consistency/outlier detection, driving-style metrics, and per-driver
aggregation. Pure functions only, no FastAPI/route imports, no Parquet
dependency -- matching the existing app/services/ boundary
(app/services/lap_comparison/, M6).

Phase 1 only: no API surface yet (app/api/session_analytics.py and
app/models/session_analytics.py are Phase 2 -- plan docs/m8-implementation-
plan.md).
"""

from app.services.session_analytics.aggregation import (
    DriverLapMetrics,
    DriverSummary,
    summarize_driver,
)
from app.services.session_analytics.consistency import (
    consistency_cv,
    consistency_ms,
    detect_outliers,
)
from app.services.session_analytics.driving_style import (
    FULL_THROTTLE_THRESHOLD_PCT,
    brake_event_count,
    full_throttle_pct,
    pooled_full_throttle_pct,
)
from app.services.session_analytics.filtering import (
    ExclusionReason,
    LapValidity,
    classify_lap,
    filter_for_aggregate_stats,
    filter_valid_laps,
)
from app.services.session_analytics.theoretical_best import (
    theoretical_best_delta_ms,
    theoretical_best_lap_ms,
)

__all__ = [
    "DriverLapMetrics",
    "DriverSummary",
    "summarize_driver",
    "consistency_cv",
    "consistency_ms",
    "detect_outliers",
    "FULL_THROTTLE_THRESHOLD_PCT",
    "brake_event_count",
    "full_throttle_pct",
    "pooled_full_throttle_pct",
    "ExclusionReason",
    "LapValidity",
    "classify_lap",
    "filter_for_aggregate_stats",
    "filter_valid_laps",
    "theoretical_best_delta_ms",
    "theoretical_best_lap_ms",
]
