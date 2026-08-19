"""Two-driver cross-season pace-trend comparison (M25). See
docs/m25-design-review.md.

Separate file from `driver_trends.py`, sharing its `/drivers` prefix --
mirrors the established precedent that comparison routes get their own
file distinct from the single-entity route file even when closely related
(`stints_compare.py` is separate from `race_context.py`/
`tyre_performance.py`; `laps_compare.py` is separate from `sessions.py`).
Registering a second `APIRouter(prefix="/drivers", ...)` here is already
precedented five times over for `/sessions` (`sessions.py`,
`session_analytics.py`, `race_context.py`, `track.py`, `telemetry.py` all
share that prefix as separate files) -- no path collision with
`/drivers/{driver_id}/seasons/{season}/pace-trend` (4 segments after the
prefix) since this route (`/drivers/pace-trend/compare`, 2 segments) has a
different shape entirely (docs/m25-design-review.md §3).

`compare_pace_trends` calls `get_driver_season_pace_trend` (the existing,
unmodified M17 route function) directly, twice -- not a reimplementation
of its session-filtering/roster-check/summarize_driver sequence. This is
the most literal form of "reuse the existing single-driver trend
implementation and semantics" available: calling the same function object
twice makes it structurally impossible for this route's per-side behavior
to silently diverge from `GET /drivers/{driver_id}/seasons/{season}/
pace-trend`'s own (docs/m25-design-review.md §12). Exactly 2x that route's
work, no N² fan-out, no shared state between sides (docs/m25-design-review.md
§10).

No `driver_id`/`season` validation on either side, matching
`get_driver_season_pace_trend`'s own never-404s semantics exactly -- an
unknown driver or season on either side independently produces an empty
`points` list for that side only, never an error, and never affects the
other side's resolution (docs/m25-design-review.md §5/§9).
"""

from fastapi import APIRouter, Depends, Query

from app.api.driver_trends import get_driver_season_pace_trend
from app.dependencies import get_telemetry_repository
from app.models.driver_trends import SeasonPaceTrendComparisonResponse
from app.models.telemetry import SessionType
from app.repositories import TelemetryRepository

router = APIRouter(prefix="/drivers", tags=["driver-trends-comparison"])


@router.get(
    "/pace-trend/compare",
    response_model=SeasonPaceTrendComparisonResponse,
    summary="Compare two drivers' race-pace trends, each across its own selected season",
)
def compare_pace_trends(
    driver_a: str = Query(..., description="Driver A's ID, e.g. 'VER'"),
    season_a: int = Query(..., description="Driver A's season"),
    driver_b: str = Query(..., description="Driver B's ID, e.g. 'PER'"),
    season_b: int = Query(..., description="Driver B's season -- may equal season_a"),
    session_type: SessionType = Query(
        default=SessionType.RACE,
        description="Session type to trend, shared by both sides -- defaults to race pace",
    ),
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> SeasonPaceTrendComparisonResponse:
    side_a = get_driver_season_pace_trend(driver_a, season_a, session_type, repository)
    side_b = get_driver_season_pace_trend(driver_b, season_b, session_type, repository)
    return SeasonPaceTrendComparisonResponse(a=side_a, b=side_b)
