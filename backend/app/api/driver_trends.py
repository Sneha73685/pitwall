"""Cross-season driver trend endpoints: pace (M17) and stint/tyre-strategy
(M21). See docs/m17-design-review.md and docs/m21-design-review.md.

GET, not POST -- matching every other multi-parameter read in this API
(`compare_laps`, `compare_stints`, `list_laps`).

Both routes are thin adapters, as thin as `laps_compare.py`/
`stints_compare.py`/`session_analytics.py`'s own routes, sharing the same
`list_sessions_for_driver_season` (§5.3) filtering step and roster-check
pattern. `get_driver_season_pace_trend` calls `summarize_driver` (M8,
`app/services/session_analytics/aggregation.py`) **unchanged**, with an
empty `telemetry_by_lap` dict -- every field it exposes is computed purely
from `Lap` data (docs/m17-design-review.md §1.3), so telemetry is never
fetched at all. `get_driver_season_tyre_trend` calls
`driver_strategy_summary` (M11, `app/services/tyre_performance/
strategy_summary.py`) **unchanged** -- it needs only `stints`, so it never
touches `laps.parquet` at all beyond the roster check both routes share
(docs/m21-design-review.md §5).

Neither route 404s: neither `driver_id` nor `season` is a persisted
resource either route could check existence against, matching
`app/api/seasons.py`'s own documented reasoning for why
`/seasons/{season}/events` doesn't 404 either -- both are aggregation keys
over `list_sessions()`, not rows in a catalogue.
"""

from fastapi import APIRouter, Depends, Query

from app.api._mappers import to_driver_strategy_summary
from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.models.driver_trends import (
    SeasonPaceTrendPoint,
    SeasonPaceTrendResponse,
    SeasonTyreTrendPoint,
    SeasonTyreTrendResponse,
)
from app.models.telemetry import Session, SessionType
from app.repositories import RaceContextRepository, TelemetryRepository
from app.services.session_analytics.aggregation import summarize_driver
from app.services.session_discovery import list_sessions_for_driver_season
from app.services.tyre_performance.strategy_summary import driver_strategy_summary

router = APIRouter(prefix="/drivers", tags=["driver-trends"])


def _to_trend_point(
    session: Session, repository: TelemetryRepository, driver_id: str
) -> SeasonPaceTrendPoint:
    laps = repository.list_laps(session.session_id, driver_id=driver_id)
    # telemetry_by_lap={} deliberately -- every field below is computed
    # purely from `laps` (docs/m17-design-review.md §1.3); this endpoint
    # never calls get_telemetry(), which is the whole point of the index
    # existing (§4): it only needs to look up N sessions' laps, not N
    # sessions' full per-lap telemetry.
    summary = summarize_driver(driver_id, laps, {})
    return SeasonPaceTrendPoint(
        session_id=session.session_id,
        event_id=session.event_id,
        event_name=session.event_name,
        round_number=session.round_number,
        session_date=session.session_date,
        valid_lap_count=summary.valid_lap_count,
        best_lap_ms=summary.best_lap_ms,
        median_lap_ms=summary.median_lap_ms,
        theoretical_best_lap_ms=summary.theoretical_best_lap_ms,
        consistency_ms=summary.consistency_ms,
        consistency_cv=summary.consistency_cv,
    )


@router.get(
    "/{driver_id}/seasons/{season}/pace-trend",
    response_model=SeasonPaceTrendResponse,
    summary="One driver's race-pace trend across one season",
)
def get_driver_season_pace_trend(
    driver_id: str,
    season: int,
    session_type: SessionType = Query(
        default=SessionType.RACE,
        description="Session type to trend -- defaults to race pace",
    ),
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> SeasonPaceTrendResponse:
    sessions = list_sessions_for_driver_season(repository.list_sessions(), season, session_type)

    points: list[SeasonPaceTrendPoint] = []
    for session in sessions:
        drivers = repository.list_drivers(session.session_id)
        # Roster-absent (§5.1 case 1): the driver wasn't entered in this
        # round at all -- e.g. a real mid-season substitution -- so this
        # round contributes no point. Distinct from "entered but zero
        # laps," handled below by summarize_driver/summary.valid_lap_count
        # naturally producing a point with null pace fields, matching
        # SessionAnalyticsResponse's own "0-valid-lap driver still gets a
        # row" convention.
        if not any(driver.driver_id == driver_id for driver in drivers):
            continue
        points.append(_to_trend_point(session, repository, driver_id))

    return SeasonPaceTrendResponse(
        driver_id=driver_id,
        season=season,
        session_type=session_type,
        points=points,
    )


def _to_tyre_trend_point(
    session: Session, race_context_repository: RaceContextRepository, driver_id: str
) -> SeasonTyreTrendPoint:
    stints = race_context_repository.list_stints(session.session_id, driver_id)
    strategy = to_driver_strategy_summary(driver_strategy_summary(driver_id, stints))
    return SeasonTyreTrendPoint(
        session_id=session.session_id,
        event_id=session.event_id,
        event_name=session.event_name,
        round_number=session.round_number,
        session_date=session.session_date,
        strategy=strategy,
    )


@router.get(
    "/{driver_id}/seasons/{season}/tyre-trend",
    response_model=SeasonTyreTrendResponse,
    summary="One driver's stint/tyre-strategy trend across one season",
)
def get_driver_season_tyre_trend(
    driver_id: str,
    season: int,
    session_type: SessionType = Query(
        default=SessionType.RACE,
        description="Session type to trend -- defaults to race strategy",
    ),
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> SeasonTyreTrendResponse:
    sessions = list_sessions_for_driver_season(
        telemetry_repository.list_sessions(), season, session_type
    )

    points: list[SeasonTyreTrendPoint] = []
    for session in sessions:
        drivers = telemetry_repository.list_drivers(session.session_id)
        # Roster-absent: same convention as get_driver_season_pace_trend
        # above. Distinct from "entered but zero stints," handled below by
        # driver_strategy_summary([]) naturally producing a point with
        # stint_count=0 and empty arrays -- no special-casing needed
        # (docs/m21-design-review.md §3).
        if not any(driver.driver_id == driver_id for driver in drivers):
            continue
        points.append(_to_tyre_trend_point(session, race_context_repository, driver_id))

    return SeasonTyreTrendResponse(
        driver_id=driver_id,
        season=season,
        session_type=session_type,
        points=points,
    )
