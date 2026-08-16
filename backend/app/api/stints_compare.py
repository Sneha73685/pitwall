"""Cross-session stint & tyre-strategy comparison endpoint (M15). See
docs/m15-design-review.md.

GET, not POST -- matching every other multi-parameter read in this API
(`compare_laps`, `list_laps`), same precedent M6/M13 already established for
`/laps/compare` (docs/m15-design-review.md §4).

This route is a thin adapter, deliberately as thin as `laps_compare.py` and
`race_context.py`/`tyre_performance.py`'s own routes: it fetches via the
existing `TelemetryRepository`/`RaceContextRepository` dependencies (no new
repository methods), calls `build_driver_stint_pace`/`driver_strategy_summary`
unchanged (both already session/driver-agnostic pure functions,
`docs/m15-design-review.md` §2.3/§2.4), and assembles the paired response.
No new service module -- there is no new *analysis* here, only new
*pairing* glue, the same reasoning `race_context.py`'s own module docstring
gives for staying thin.

Each side is resolved fully independently (own session existence check, own
repository reads) -- mirroring `laps_compare.py`'s `session_a`/`session_b`
independence exactly. The circuit-mismatch check lives here, at the route
layer, not in `app.services.tyre_performance`, for the identical reason
`laps_compare.py` keeps it out of `app.services.lap_comparison`
(docs/m13-design-review.md §5/§9): neither comparison engine should have to
know "session" or "circuit" is a concept.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.models.race_context import Stint
from app.models.stint_comparison import (
    DriverStintComparisonSide,
    StintComparisonResponse,
    StintComparisonWarning,
    StintComparisonWarningCode,
)
from app.models.telemetry import Session
from app.models.tyre_performance import DriverStrategySummary, StintPace
from app.repositories import RaceContextRepository, TelemetryRepository
from app.services.tyre_performance.orchestration import build_driver_stint_pace
from app.services.tyre_performance.stint_consistency import StintConsistency
from app.services.tyre_performance.strategy_summary import (
    DriverStrategySummary as DriverStrategySummaryResult,
)
from app.services.tyre_performance.strategy_summary import driver_strategy_summary

router = APIRouter(prefix="/stints", tags=["stint-comparison"])


def _get_session_or_404(
    repository: TelemetryRepository, session_id: str, *, session_label: str
) -> Session:
    session = repository.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail=f"Session {session_label} '{session_id}' not found"
        )
    return session


def _circuit_mismatch_warning(
    session_a: Session, session_b: Session
) -> StintComparisonWarning | None:
    """Mirrors app/api/laps_compare.py's `_circuit_mismatch_warning` exactly
    (docs/m15-design-review.md §2.4) -- deliberately re-implemented here
    rather than imported, since circuit identity is a session-level concept
    neither comparison engine should share a helper over.
    """
    if session_a.location == session_b.location:
        return None
    return StintComparisonWarning(
        code=StintComparisonWarningCode.DIFFERENT_CIRCUIT,
        detail=(
            f"Session A is at {session_a.location}, Session B is at "
            f"{session_b.location} -- strategy comparison across different "
            f"circuits may be less meaningful."
        ),
    )


def _build_side(
    session_id: str,
    driver_id: str,
    *,
    telemetry_repository: TelemetryRepository,
    race_context_repository: RaceContextRepository,
) -> DriverStintComparisonSide:
    laps = telemetry_repository.list_laps(session_id, driver_id=driver_id)
    stints = race_context_repository.list_stints(session_id, driver_id=driver_id)
    pit_stops = race_context_repository.list_pit_stops(session_id, driver_id=driver_id)

    result = build_driver_stint_pace(laps, stints, pit_stops)

    return DriverStintComparisonSide(
        session_id=session_id,
        driver_id=driver_id,
        strategy=_to_driver_strategy_summary(driver_strategy_summary(driver_id, stints)),
        stints=[
            _to_stint_pace(stint, result.consistency_by_stint)
            for stint in sorted(stints, key=lambda s: s.stint_number)
        ],
        pit_stops=pit_stops,
    )


def _to_driver_strategy_summary(
    result: DriverStrategySummaryResult,
) -> DriverStrategySummary:
    """Mirrors app/api/tyre_performance.py's own `_to_driver_strategy_summary`
    mapping exactly -- not imported from there since that module's version
    is a private, unexported helper."""
    return DriverStrategySummary(
        driver_id=result.driver_id,
        stint_count=result.stint_count,
        compound_sequence=result.compound_sequence,
        stint_lengths=result.stint_lengths,
    )


def _to_stint_pace(stint: Stint, consistency_by_stint: dict[int, StintConsistency]) -> StintPace:
    """Mirrors app/api/tyre_performance.py's own `_to_stint_pace` mapping
    exactly (same field-for-field construction) -- not imported from there
    since that module's version is a private, unexported helper."""
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


def _missing_stint_data_warning(
    side: DriverStintComparisonSide, *, code: StintComparisonWarningCode
) -> StintComparisonWarning | None:
    if side.stints:
        return None
    return StintComparisonWarning(
        code=code,
        detail=(
            f"No stint data for driver '{side.driver_id}' in session "
            f"'{side.session_id}' -- unknown driver or genuinely no strategy data."
        ),
    )


@router.get(
    "/compare",
    response_model=StintComparisonResponse,
    summary="Compare two drivers' stint/tyre strategy, each from its own selected session",
)
def compare_stints(
    session_id_a: str = Query(..., description="Session A's ID"),
    driver_a: str = Query(..., description="Driver A's ID, e.g. 'VER'"),
    session_id_b: str = Query(..., description="Session B's ID -- may equal session_id_a"),
    driver_b: str = Query(..., description="Driver B's ID, e.g. 'LEC'"),
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> StintComparisonResponse:
    session_a = _get_session_or_404(telemetry_repository, session_id_a, session_label="A")
    session_b = _get_session_or_404(telemetry_repository, session_id_b, session_label="B")

    side_a = _build_side(
        session_id_a,
        driver_a,
        telemetry_repository=telemetry_repository,
        race_context_repository=race_context_repository,
    )
    side_b = _build_side(
        session_id_b,
        driver_b,
        telemetry_repository=telemetry_repository,
        race_context_repository=race_context_repository,
    )

    warnings: list[StintComparisonWarning] = []
    circuit_warning = _circuit_mismatch_warning(session_a, session_b)
    if circuit_warning is not None:
        warnings.append(circuit_warning)
    warning_a = _missing_stint_data_warning(side_a, code=StintComparisonWarningCode.NO_STINT_DATA_A)
    if warning_a is not None:
        warnings.append(warning_a)
    warning_b = _missing_stint_data_warning(side_b, code=StintComparisonWarningCode.NO_STINT_DATA_B)
    if warning_b is not None:
        warnings.append(warning_b)

    return StintComparisonResponse(a=side_a, b=side_b, warnings=warnings)
