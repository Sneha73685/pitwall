"""Two-lap distance-aligned comparison endpoint (M6; generalized to two
independent sessions in M13). See docs/api-model.md, docs/m6-implementation-plan.md,
and docs/m13-design-review.md for the design.

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

M13: `session_id` is no longer a shared path parameter -- each side
resolves its own session independently (docs/m13-design-review.md §4/§5).
The old `GET /sessions/{session_id}/laps/compare` route is retired, not
kept as a compatibility wrapper (design review §4's considered decision:
one internal consumer, no external API contract to preserve). The
circuit-mismatch check (`DIFFERENT_CIRCUIT` warning) lives here, at the
route layer, specifically so app.services.lap_comparison never has to
know "session" is a concept (§5/§9 of that design).
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_telemetry_repository
from app.models.lap_comparison import (
    COMPARE_CHANNELS,
    DEFAULT_COMPARE_RESOLUTION,
    MAX_COMPARE_RESOLUTION,
    ChannelSeries,
    ComparisonWarning,
    LapComparisonResponse,
    WarningCode,
)
from app.models.telemetry import Lap, Session
from app.repositories import TelemetryRepository
from app.services.lap_comparison.alignment import align_lap, build_distance_grid, max_distance
from app.services.lap_comparison.delta import compute_delta_ms
from app.services.lap_comparison.sectors import compute_sector_deltas
from app.services.lap_comparison.validation import (
    LapComparisonError,
    collect_warnings,
    validate_monotonic,
)

router = APIRouter(prefix="/laps", tags=["laps"])


def _find_lap(laps: list[Lap], lap_number: int, *, driver_id: str, lap_label: str) -> Lap:
    for lap in laps:
        if lap.lap_number == lap_number:
            return lap
    raise HTTPException(
        status_code=404,
        detail=f"Lap {lap_label}: no lap {lap_number} found for driver '{driver_id}'",
    )


def _get_session_or_404(
    repository: TelemetryRepository, session_id: str, *, session_label: str
) -> Session:
    session = repository.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404, detail=f"Session {session_label} '{session_id}' not found"
        )
    return session


def _circuit_mismatch_warning(session_a: Session, session_b: Session) -> ComparisonWarning | None:
    """M13: session A and session B are at different real-world locations.

    Comparison-blocking is deliberately not done here (docs/m13-design-review.md
    §9) -- comparison stays allowed and computed; this only tells the
    frontend to hide TrackMapDelta rather than render session A's track
    outline for a lap that never drove it.
    """
    if session_a.location == session_b.location:
        return None
    return ComparisonWarning(
        code=WarningCode.DIFFERENT_CIRCUIT,
        detail=(
            f"Session A is at {session_a.location}, Session B is at "
            f"{session_b.location} -- track visualization is not shown."
        ),
    )


@router.get(
    "/compare",
    response_model=LapComparisonResponse,
    summary="Compare two laps, each from its own independently-selected session, distance-aligned",
)
def compare_laps(
    session_id_a: str = Query(..., description="Session A's ID"),
    driver_a: str = Query(..., description="Driver A's ID (the reference lap), e.g. 'VER'"),
    lap_a: int = Query(..., description="Lap A's lap number"),
    session_id_b: str = Query(..., description="Session B's ID -- may equal session_id_a"),
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
    session_a = _get_session_or_404(repository, session_id_a, session_label="A")
    session_b = _get_session_or_404(repository, session_id_b, session_label="B")

    lap_a_model = _find_lap(
        repository.list_laps(session_id_a, driver_id=driver_a),
        lap_a,
        driver_id=driver_a,
        lap_label="A",
    )
    lap_b_model = _find_lap(
        repository.list_laps(session_id_b, driver_id=driver_b),
        lap_b,
        driver_id=driver_b,
        lap_label="B",
    )

    samples_a = repository.get_telemetry(session_id_a, driver_a, lap_a)
    samples_b = repository.get_telemetry(session_id_b, driver_b, lap_b)
    if not samples_a:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No telemetry found for session '{session_id_a}', driver '{driver_a}', lap {lap_a}"
            ),
        )
    if not samples_b:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No telemetry found for session '{session_id_b}', driver '{driver_b}', lap {lap_b}"
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

    warnings = collect_warnings(lap_a_model, lap_b_model)
    circuit_warning = _circuit_mismatch_warning(session_a, session_b)
    if circuit_warning is not None:
        warnings.append(circuit_warning)

    return LapComparisonResponse(
        session_id_a=session_id_a,
        session_id_b=session_id_b,
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
        warnings=warnings,
    )
