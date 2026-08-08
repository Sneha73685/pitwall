"""Tyre & stint performance analytics endpoints (M11). See
docs/m11-design-review.md §6 and docs/m11-implementation-plan.md Phase 2.

Both routes follow `race_context.py`'s existing session-existence pattern
exactly: `RaceContextRepository` has no concept of "does this session
exist," so that check is delegated to the existing `TelemetryRepository`
dependency (reused, not duplicated). An existing session with no
strategy data yet returns 200 with empty/zero-valued collections, not 404
(ADR-0011 -- absence is data, not failure).

Routes are thin by construction: all joining, boundary detection,
eligibility, statistics, grouping, and strategy construction happens in
`app.services.tyre_performance` (Phase 1) and its orchestration layer
(Phase 2, `orchestration.py`). Routes only fetch repository data, call the
orchestration functions, and map the resulting plain dataclasses onto the
Pydantic response models below -- the anti-corruption boundary (ADR-0009).
This is the first PitWall route to read from both `TelemetryRepository`
(Parquet) and `RaceContextRepository` (PostgreSQL) for actual data (not
just the existence check `race_context.py` already does) -- the join
itself happens entirely in `orchestration.py`'s application code, never in
SQL or across storage engines (docs/m11-design-review.md §6.2).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.models.race_context import Stint
from app.models.tyre_performance import (
    CompoundAggregate,
    CompoundLapIndexAggregate,
    CompoundUsageCount,
    DriverStintPaceResponse,
    DriverStrategySummary,
    RawLapTimeByCompound,
    StintPace,
    StintPaceLap,
    TyrePerformanceResponse,
)
from app.repositories import RaceContextRepository, TelemetryRepository
from app.services.tyre_performance.compound_aggregation import (
    CompoundAggregate as CompoundAggregateResult,
)
from app.services.tyre_performance.compound_aggregation import (
    CompoundLapIndexAggregate as CompoundLapIndexAggregateResult,
)
from app.services.tyre_performance.driver_compound_comparison import (
    RawLapTimeByCompound as RawLapTimeByCompoundResult,
)
from app.services.tyre_performance.orchestration import (
    AnnotatedLap,
    DriverStintPace,
    SessionTyrePerformance,
    build_driver_stint_pace,
    build_session_tyre_performance,
)
from app.services.tyre_performance.stint_consistency import StintConsistency
from app.services.tyre_performance.strategy_summary import (
    CompoundUsageCount as CompoundUsageCountResult,
)
from app.services.tyre_performance.strategy_summary import (
    DriverStrategySummary as DriverStrategySummaryResult,
)

router = APIRouter(prefix="/sessions", tags=["tyre-performance"])


def _to_stint_pace_lap(annotated: AnnotatedLap) -> StintPaceLap:
    position = annotated.position
    return StintPaceLap(
        lap_number=position.lap.lap_number,
        lap_time_seconds=position.lap.lap_time_seconds,
        compound=position.compound,
        stint_number=position.stint_number,
        lap_in_stint_index=position.lap_in_stint_index,
        is_valid=annotated.is_valid,
        is_in_lap=annotated.is_in_lap,
        is_out_lap=annotated.is_out_lap,
        is_trend_eligible=annotated.is_trend_eligible,
    )


def _to_stint_pace(stint: Stint, consistency_by_stint: dict[int, StintConsistency]) -> StintPace:
    consistency = consistency_by_stint.get(stint.stint_number)
    return StintPace(
        stint_number=stint.stint_number,
        compound=stint.compound,
        start_lap=stint.start_lap,
        end_lap=stint.end_lap,
        tyre_life_at_start=stint.tyre_life_at_start,
        eligible_lap_count=consistency.eligible_lap_count if consistency else 0,
        consistency_ms=consistency.consistency_ms if consistency else None,
        consistency_cv=consistency.consistency_cv if consistency else None,
    )


def _to_driver_strategy_summary(result: DriverStrategySummaryResult) -> DriverStrategySummary:
    return DriverStrategySummary(
        driver_id=result.driver_id,
        stint_count=result.stint_count,
        compound_sequence=result.compound_sequence,
        stint_lengths=result.stint_lengths,
    )


def _to_compound_usage_count(result: CompoundUsageCountResult) -> CompoundUsageCount:
    return CompoundUsageCount(
        compound=result.compound,
        stint_count=result.stint_count,
        driver_count=result.driver_count,
        total_laps=result.total_laps,
    )


def _to_compound_aggregate(result: CompoundAggregateResult) -> CompoundAggregate:
    return CompoundAggregate(
        compound=result.compound,
        lap_count=result.lap_count,
        driver_count=result.driver_count,
        lap_times_ms=result.lap_times_ms,
        median_lap_time_ms=result.median_lap_time_ms,
        p25_lap_time_ms=result.p25_lap_time_ms,
        p75_lap_time_ms=result.p75_lap_time_ms,
    )


def _to_compound_lap_index_aggregate(
    result: CompoundLapIndexAggregateResult,
) -> CompoundLapIndexAggregate:
    return CompoundLapIndexAggregate(
        compound=result.compound,
        lap_in_stint_index=result.lap_in_stint_index,
        lap_count=result.lap_count,
        lap_times_ms=result.lap_times_ms,
        median_lap_time_ms=result.median_lap_time_ms,
    )


def _to_raw_lap_time_by_compound(result: RawLapTimeByCompoundResult) -> RawLapTimeByCompound:
    return RawLapTimeByCompound(
        driver_id=result.driver_id,
        compound=result.compound,
        lap_count=result.lap_count,
        lap_times_ms=result.lap_times_ms,
        lap_in_stint_indices=result.lap_in_stint_indices,
        median_lap_time_ms=result.median_lap_time_ms,
    )


def _to_stint_pace_response(
    session_id: str, driver_id: str, stints: list[Stint], result: DriverStintPace
) -> DriverStintPaceResponse:
    return DriverStintPaceResponse(
        session_id=session_id,
        driver_id=driver_id,
        laps=[_to_stint_pace_lap(annotated) for annotated in result.annotated_laps],
        stints=[_to_stint_pace(stint, result.consistency_by_stint) for stint in stints],
    )


def _to_tyre_performance_response(
    session_id: str, result: SessionTyrePerformance
) -> TyrePerformanceResponse:
    return TyrePerformanceResponse(
        session_id=session_id,
        driver_strategies=[_to_driver_strategy_summary(s) for s in result.driver_strategies],
        compound_usage=[_to_compound_usage_count(c) for c in result.compound_usage],
        compound_aggregates=[_to_compound_aggregate(c) for c in result.compound_aggregates],
        compound_lap_index_aggregates=[
            _to_compound_lap_index_aggregate(c) for c in result.compound_lap_index_aggregates
        ],
        raw_lap_times_by_compound=[
            _to_raw_lap_time_by_compound(r) for r in result.raw_lap_times_by_compound
        ],
    )


@router.get(
    "/{session_id}/drivers/{driver_id}/stint-pace",
    response_model=DriverStintPaceResponse,
    summary="One driver's descriptive per-stint raw lap-time view",
)
def get_driver_stint_pace(
    session_id: str,
    driver_id: str,
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> DriverStintPaceResponse:
    if telemetry_repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    laps = telemetry_repository.list_laps(session_id, driver_id=driver_id)
    stints = race_context_repository.list_stints(session_id, driver_id=driver_id)
    pit_stops = race_context_repository.list_pit_stops(session_id, driver_id=driver_id)

    result = build_driver_stint_pace(laps, stints, pit_stops)

    return _to_stint_pace_response(session_id, driver_id, stints, result)


@router.get(
    "/{session_id}/tyre-performance",
    response_model=TyrePerformanceResponse,
    summary="Session-wide descriptive tyre/stint performance",
)
def get_session_tyre_performance(
    session_id: str,
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> TyrePerformanceResponse:
    if telemetry_repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    driver_ids = [driver.driver_id for driver in telemetry_repository.list_drivers(session_id)]
    laps = telemetry_repository.list_laps(session_id)
    stints = race_context_repository.list_stints(session_id)
    pit_stops = race_context_repository.list_pit_stops(session_id)

    result = build_session_tyre_performance(driver_ids, laps, stints, pit_stops)

    return _to_tyre_performance_response(session_id, result)
