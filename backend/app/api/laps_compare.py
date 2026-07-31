"""Two-lap distance-aligned comparison endpoint (M6). See docs/api-model.md
and docs/m6-implementation-plan.md for the design.

GET, not POST, matching every other multi-parameter read in this API
(list_laps, get_telemetry) -- decided in Phase 0 against that existing
precedent, not invented fresh for this endpoint.

This route is a thin adapter: it fetches via the existing
TelemetryRepository (no new repository methods -- list_laps is filtered
locally for the one lap requested, since no single-lap lookup exists),
translates app.services.lap_comparison's plain exceptions into the same
HTTPException(status_code, detail) shape every other route in this API
already returns (there is no separate error-envelope class to reuse --
that plain shape *is* the existing envelope), and assembles the
response. All alignment/delta/sector/validation logic lives in
app.services.lap_comparison; nothing here re-implements any of it.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_telemetry_repository
from app.models.lap_comparison import (
    COMPARE_CHANNELS,
    DEFAULT_COMPARE_RESOLUTION,
    MAX_COMPARE_RESOLUTION,
    ChannelSeries,
    LapComparisonResponse,
)
from app.models.telemetry import Lap
from app.repositories import TelemetryRepository
from app.services.lap_comparison.alignment import align_lap, build_distance_grid, max_distance
from app.services.lap_comparison.delta import compute_delta_ms
from app.services.lap_comparison.sectors import compute_sector_deltas
from app.services.lap_comparison.validation import (
    LapComparisonError,
    collect_warnings,
    validate_monotonic,
)

router = APIRouter(prefix="/sessions", tags=["laps"])


def _find_lap(laps: list[Lap], lap_number: int, *, driver_id: str, lap_label: str) -> Lap:
    for lap in laps:
        if lap.lap_number == lap_number:
            return lap
    raise HTTPException(
        status_code=404,
        detail=f"Lap {lap_label}: no lap {lap_number} found for driver '{driver_id}'",
    )


@router.get(
    "/{session_id}/laps/compare",
    response_model=LapComparisonResponse,
    summary="Compare two laps within one session, distance-aligned",
)
def compare_laps(
    session_id: str,
    driver_a: str = Query(..., description="Driver A's ID (the reference lap), e.g. 'VER'"),
    lap_a: int = Query(..., description="Lap A's lap number"),
    driver_b: str = Query(..., description="Driver B's ID, e.g. 'LEC'"),
    lap_b: int = Query(..., description="Lap B's lap number"),
    resolution: int = Query(
        default=DEFAULT_COMPARE_RESOLUTION,
        ge=1,
        le=MAX_COMPARE_RESOLUTION,
        description="Number of points in the common distance grid",
    ),
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> LapComparisonResponse:
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    lap_a_model = _find_lap(
        repository.list_laps(session_id, driver_id=driver_a),
        lap_a,
        driver_id=driver_a,
        lap_label="A",
    )
    lap_b_model = _find_lap(
        repository.list_laps(session_id, driver_id=driver_b),
        lap_b,
        driver_id=driver_b,
        lap_label="B",
    )

    samples_a = repository.get_telemetry(session_id, driver_a, lap_a)
    samples_b = repository.get_telemetry(session_id, driver_b, lap_b)
    if not samples_a:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No telemetry found for session '{session_id}', driver '{driver_a}', lap {lap_a}"
            ),
        )
    if not samples_b:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No telemetry found for session '{session_id}', driver '{driver_b}', lap {lap_b}"
            ),
        )

    try:
        validate_monotonic(samples_a, lap_label="A")
        validate_monotonic(samples_b, lap_label="B")
    except LapComparisonError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    grid = build_distance_grid(max_distance(samples_a), max_distance(samples_b), resolution)
    aligned_a = align_lap(samples_a, grid)
    aligned_b = align_lap(samples_b, grid)
    delta_ms = compute_delta_ms(aligned_a, aligned_b)

    return LapComparisonResponse(
        session_id=session_id,
        lap_a=lap_a_model,
        lap_b=lap_b_model,
        compared_distance_m=float(grid[-1]),
        distance_m=grid.tolist(),
        delta_ms=delta_ms.tolist(),
        channels={
            channel: ChannelSeries(
                a=aligned_a.channels[channel].tolist(),
                b=aligned_b.channels[channel].tolist(),
            )
            for channel in COMPARE_CHANNELS
        },
        sectors=compute_sector_deltas(lap_a_model, samples_a, grid, delta_ms),
        warnings=collect_warnings(lap_a_model, lap_b_model),
    )
