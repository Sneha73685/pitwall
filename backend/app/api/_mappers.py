"""Shared API-boundary mappers used by more than one route module (ADR-0009).

Internal to `app.api` -- not itself a router, never passed to
`include_router`. Kept deliberately minimal: one mapper, added only because
`to_driver_strategy_summary` was independently duplicated identically across
three route modules (docs/m29-design-review.md).
"""

from app.models.tyre_performance import DriverStrategySummary
from app.services.tyre_performance.strategy_summary import (
    DriverStrategySummary as DriverStrategySummaryResult,
)


def to_driver_strategy_summary(
    result: DriverStrategySummaryResult,
) -> DriverStrategySummary:
    return DriverStrategySummary(
        driver_id=result.driver_id,
        stint_count=result.stint_count,
        compound_sequence=result.compound_sequence,
        stint_lengths=result.stint_lengths,
    )
