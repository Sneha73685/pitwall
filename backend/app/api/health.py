"""Health-check endpoint.

Infrastructure, not a feature: this exists so local development, Docker
Compose, and CI all have something trivial to smoke-test before any real
telemetry endpoints exist (M1+). See docs/prd.md M0 scope.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    return HealthResponse(status="ok", service="pitwall-backend")
