"""Track geometry read endpoint. See docs/api-model.md."""

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_telemetry_repository
from app.models import TrackPoint
from app.repositories import TelemetryRepository

router = APIRouter(prefix="/sessions", tags=["track"])


@router.get(
    "/{session_id}/track",
    response_model=list[TrackPoint],
    summary="Get a session's track geometry",
)
def list_track_points(
    session_id: str,
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[TrackPoint]:
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return repository.list_track_points(session_id)
