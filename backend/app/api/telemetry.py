"""Telemetry sample read endpoint. See docs/api-model.md."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_telemetry_repository
from app.models import TelemetrySample
from app.repositories import TelemetryRepository

router = APIRouter(prefix="/sessions", tags=["telemetry"])


@router.get(
    "/{session_id}/telemetry",
    response_model=list[TelemetrySample],
    summary="Get one driver's one lap's telemetry samples",
)
def get_telemetry(
    session_id: str,
    driver_id: str = Query(..., description="Driver ID, e.g. 'VER'"),
    lap_number: int = Query(..., description="Lap number within the session"),
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> list[TelemetrySample]:
    samples = repository.get_telemetry(session_id, driver_id, lap_number)
    if not samples:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No telemetry found for session '{session_id}', driver '{driver_id}', "
                f"lap {lap_number}"
            ),
        )
    return samples
