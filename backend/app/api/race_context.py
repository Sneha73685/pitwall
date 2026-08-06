"""Stint and pit-stop read endpoints (M10). See docs/m10-design-review.md
§5 and docs/adr/0011-hybrid-storage-architecture.md.

`RaceContextRepository` has no concept of "does this session exist" -- that
check is delegated to the existing `TelemetryRepository` dependency
(reused, not duplicated), exactly as `laps_compare.py` already does for the
same reason. An existing session with no stint/pit-stop rows yet returns
200 with an empty list, not 404 (ADR-0011, Implementation Constraints --
absence is data, not failure), matching `/laps?driver_id=` and
`/analytics/drivers` precedent.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.models.race_context import PitStop, Stint
from app.repositories import RaceContextRepository, TelemetryRepository

router = APIRouter(prefix="/sessions", tags=["race-context"])


@router.get(
    "/{session_id}/drivers/{driver_id}/stints",
    response_model=list[Stint],
    summary="List a driver's stints for one session",
)
def list_stints(
    session_id: str,
    driver_id: str,
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> list[Stint]:
    if telemetry_repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return race_context_repository.list_stints(session_id, driver_id)


@router.get(
    "/{session_id}/pit-stops",
    response_model=list[PitStop],
    summary="List a session's pit stops",
)
def list_pit_stops(
    session_id: str,
    driver_id: str | None = Query(default=None, description="Filter to one driver"),
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> list[PitStop]:
    if telemetry_repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return race_context_repository.list_pit_stops(session_id, driver_id=driver_id)
