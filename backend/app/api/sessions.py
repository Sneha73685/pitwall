"""Session, driver, and lap read endpoints. See docs/api-model.md."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_telemetry_repository
from app.models import Driver, Lap, Session
from app.repositories import TelemetryRepository

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[Session], summary="List all ingested sessions")
def list_sessions(
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[Session]:
    return repository.list_sessions()


@router.get("/{session_id}", response_model=Session, summary="Get one session")
def get_session(
    session_id: str,
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> Session:
    session = repository.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return session


@router.get(
    "/{session_id}/drivers", response_model=list[Driver], summary="List a session's drivers"
)
def list_drivers(
    session_id: str,
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[Driver]:
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return repository.list_drivers(session_id)


@router.get("/{session_id}/laps", response_model=list[Lap], summary="List a session's laps")
def list_laps(
    session_id: str,
    driver_id: str | None = Query(default=None, description="Filter to one driver"),
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[Lap]:
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return repository.list_laps(session_id, driver_id=driver_id)
