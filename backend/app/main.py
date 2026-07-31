"""PitWall backend entrypoint.

Wires the FastAPI app: CORS, health check, and the read endpoints for
sessions/drivers/laps/telemetry/track/laps-compare (see docs/api-model.md
and docs/m6-implementation-plan.md).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, laps_compare, sessions, telemetry, track

app = FastAPI(
    title="PitWall API",
    description=(
        "Unofficial, fan-made Formula 1 race engineering platform. "
        "Not affiliated with Formula 1, FOM, or any team."
    ),
    version="0.1.0",
)

# Permissive CORS for local development only (frontend dev server on a
# different port). Tighten this before any real deployment in M7.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(sessions.router)
app.include_router(telemetry.router)
app.include_router(track.router)
app.include_router(laps_compare.router)
