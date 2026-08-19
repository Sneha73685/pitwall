"""Two-driver cross-season driver-trend comparisons: pace (M25) and
tyre/stint-strategy (M26). See docs/m25-design-review.md and
docs/m26-design-review.md. Mirrors driver_trends.py's own "pace and tyre
share one file across milestones" precedent (M17 + M21 both live there) --
applied here to the comparison side of the same two trends.

Separate file from `driver_trends.py`, sharing its `/drivers` prefix --
mirrors the established precedent that comparison routes get their own
file distinct from the single-entity route file even when closely related
(`stints_compare.py` is separate from `race_context.py`/
`tyre_performance.py`; `laps_compare.py` is separate from `sessions.py`).
Registering a second `APIRouter(prefix="/drivers", ...)` here is already
precedented five times over for `/sessions` (`sessions.py`,
`session_analytics.py`, `race_context.py`, `track.py`, `telemetry.py` all
share that prefix as separate files) -- no path collision with either
`/drivers/{driver_id}/seasons/{season}/pace-trend` or `.../tyre-trend` (4
segments after the prefix) since these routes (`/drivers/pace-trend/
compare`, `/drivers/tyre-trend/compare`, 2 segments each) have a different
shape entirely (docs/m25-design-review.md §3).

Both `compare_pace_trends` and `compare_tyre_trends` call the existing,
unmodified M17/M21 route functions directly, twice each -- not a
reimplementation of their session-filtering/roster-check/point-building
sequences. This is the most literal form of "reuse the existing
single-driver trend implementation and semantics" available: calling the
same function object twice makes it structurally impossible for either
route's per-side behavior to silently diverge from its single-driver
counterpart (docs/m25-design-review.md §12, docs/m26-design-review.md §4).
Exactly 2x that route's work each, no N² fan-out, no shared state between
sides (docs/m25-design-review.md §10, docs/m26-design-review.md §11).
`compare_tyre_trends` threads both `TelemetryRepository` and
`RaceContextRepository` through to each side -- the one concrete parameter-
list difference from `compare_pace_trends`, forced by
`get_driver_season_tyre_trend`'s own signature, not chosen
(docs/m26-design-review.md §2.1).

No `driver_id`/`season` validation on either side of either route, matching
the single-driver endpoints' own never-404s semantics exactly -- an
unknown driver or season on either side independently produces an empty
`points` list for that side only, never an error, and never affects the
other side's resolution (docs/m25-design-review.md §5/§9,
docs/m26-design-review.md §4).
"""

from fastapi import APIRouter, Depends, Query

from app.api.driver_trends import get_driver_season_pace_trend, get_driver_season_tyre_trend
from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.models.driver_trends import (
    SeasonPaceTrendComparisonResponse,
    SeasonTyreTrendComparisonResponse,
)
from app.models.telemetry import SessionType
from app.repositories import RaceContextRepository, TelemetryRepository

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


@router.get(
    "/tyre-trend/compare",
    response_model=SeasonTyreTrendComparisonResponse,
    summary="Compare two drivers' stint/tyre-strategy trends, each across its own selected season",
)
def compare_tyre_trends(
    driver_a: str = Query(..., description="Driver A's ID, e.g. 'VER'"),
    season_a: int = Query(..., description="Driver A's season"),
    driver_b: str = Query(..., description="Driver B's ID, e.g. 'PER'"),
    season_b: int = Query(..., description="Driver B's season -- may equal season_a"),
    session_type: SessionType = Query(
        default=SessionType.RACE,
        description="Session type to trend, shared by both sides -- defaults to race strategy",
    ),
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> SeasonTyreTrendComparisonResponse:
    side_a = get_driver_season_tyre_trend(
        driver_a, season_a, session_type, telemetry_repository, race_context_repository
    )
    side_b = get_driver_season_tyre_trend(
        driver_b, season_b, session_type, telemetry_repository, race_context_repository
    )
    return SeasonTyreTrendComparisonResponse(a=side_a, b=side_b)
