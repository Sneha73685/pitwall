"""Session-assembly orchestration for M11's two API endpoints (Phase 2).

Composes Phase 1's pure functions (stint_join, boundary_laps,
stint_eligibility, stint_consistency, compound_aggregation,
driver_compound_comparison, strategy_summary) into the two shapes
app/api/tyre_performance.py's routes actually need. Fetching from
repositories and mapping to Pydantic response models both stay in the
route module (docs/m11-implementation-plan.md Phase 2 §5) -- this module,
like every other one in this package, only ever receives and returns
already-typed domain objects.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TypeVar

from app.models.race_context import PitStop, Stint
from app.models.telemetry import Lap
from app.services.tyre_performance.boundary_laps import identify_boundary_laps
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
from app.services.tyre_performance.stint_consistency import (
    StintConsistency,
    stint_consistency_by_stint,
)
from app.services.tyre_performance.stint_eligibility import (
    trend_eligible_positions,
    valid_positions,
)
from app.services.tyre_performance.stint_join import LapStintPosition, join_laps_to_stints
from app.services.tyre_performance.strategy_summary import (
    CompoundUsageCount,
    DriverStrategySummary,
    driver_strategy_summary,
    session_compound_usage,
)

_T = TypeVar("_T")


def _group_by_driver(items: Sequence[_T], key: Callable[[_T], str]) -> dict[str, list[_T]]:
    grouped: dict[str, list[_T]] = {}
    for item in items:
        grouped.setdefault(key(item), []).append(item)
    return grouped


@dataclass(frozen=True)
class AnnotatedLap:
    """One lap, pre-flagged with everything the stint-pace API response
    needs. The flags are computed once here by composing Phase 1's
    existing rules (`stint_eligibility.valid_positions`/
    `trend_eligible_positions`, `boundary_laps.StintBoundaryLaps`) -- never
    re-derived by the route or the API-mapping layer, which only ever read
    these already-decided booleans."""

    position: LapStintPosition
    is_valid: bool
    is_in_lap: bool
    is_out_lap: bool
    is_trend_eligible: bool


@dataclass(frozen=True)
class DriverStintPace:
    """Everything one driver's stint-pace endpoint needs, pre-computed."""

    annotated_laps: list[AnnotatedLap]
    consistency_by_stint: dict[int, StintConsistency]


def build_driver_stint_pace(
    laps: Sequence[Lap], stints: Sequence[Stint], pit_stops: Sequence[PitStop]
) -> DriverStintPace:
    """`laps`/`stints`/`pit_stops` must already be scoped to one driver --
    the same precondition `stint_join.join_laps_to_stints` and
    `boundary_laps.identify_boundary_laps` already have."""
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops)
    valid_lap_numbers = {position.lap.lap_number for position in valid_positions(positions)}
    eligible_lap_numbers = {
        position.lap.lap_number for position in trend_eligible_positions(positions, boundary)
    }
    consistency_by_stint = stint_consistency_by_stint(positions, boundary)

    annotated_laps = [
        AnnotatedLap(
            position=position,
            is_valid=position.lap.lap_number in valid_lap_numbers,
            is_in_lap=position.lap.lap_number in boundary.in_lap_numbers,
            is_out_lap=position.lap.lap_number in boundary.out_lap_numbers,
            is_trend_eligible=position.lap.lap_number in eligible_lap_numbers,
        )
        for position in positions
    ]
    return DriverStintPace(annotated_laps=annotated_laps, consistency_by_stint=consistency_by_stint)


@dataclass(frozen=True)
class SessionTyrePerformance:
    """Everything the session-wide tyre-performance endpoint needs,
    pre-computed."""

    driver_strategies: list[DriverStrategySummary]
    compound_usage: list[CompoundUsageCount]
    compound_aggregates: list[CompoundAggregate]
    compound_lap_index_aggregates: list[CompoundLapIndexAggregate]
    raw_lap_times_by_compound: list[RawLapTimeByCompound]


def build_session_tyre_performance(
    driver_ids: Sequence[str],
    laps: Sequence[Lap],
    stints: Sequence[Stint],
    pit_stops: Sequence[PitStop],
) -> SessionTyrePerformance:
    """`laps`/`stints`/`pit_stops` span every driver in the session (each
    item carries its own `driver_id`). `driver_ids` is the session's full
    driver roster, passed explicitly rather than inferred from `laps`/
    `stints`, so a driver with laps but no stints still gets a
    `DriverStrategySummary` row with `stint_count=0` -- matching
    `session_analytics`'s own "list every driver, regardless of data"
    convention.
    """
    laps_by_driver = _group_by_driver(laps, key=lambda lap: lap.driver_id)
    stints_by_driver = _group_by_driver(stints, key=lambda stint: stint.driver_id)
    pit_stops_by_driver = _group_by_driver(pit_stops, key=lambda pit_stop: pit_stop.driver_id)

    eligible_positions_by_driver: dict[str, list[LapStintPosition]] = {}
    for driver_id in driver_ids:
        driver_laps = laps_by_driver.get(driver_id, [])
        driver_stints = stints_by_driver.get(driver_id, [])
        driver_pit_stops = pit_stops_by_driver.get(driver_id, [])
        positions = join_laps_to_stints(driver_laps, driver_stints)
        boundary = identify_boundary_laps(driver_stints, driver_pit_stops)
        eligible_positions_by_driver[driver_id] = trend_eligible_positions(positions, boundary)

    driver_strategies = [
        driver_strategy_summary(driver_id, stints_by_driver.get(driver_id, []))
        for driver_id in sorted(driver_ids)
    ]

    return SessionTyrePerformance(
        driver_strategies=driver_strategies,
        compound_usage=session_compound_usage(stints_by_driver),
        compound_aggregates=aggregate_by_compound(eligible_positions_by_driver),
        compound_lap_index_aggregates=aggregate_by_compound_and_lap_index(
            eligible_positions_by_driver
        ),
        raw_lap_times_by_compound=raw_lap_times_by_compound(eligible_positions_by_driver),
    )
