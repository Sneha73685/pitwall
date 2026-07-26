"""PitWall backend entrypoint.

M0 scope: app wiring + health check only. No telemetry routes, no
repository implementations yet -- those arrive in M1/M2 per
docs/prd.md's milestone roadmap.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health

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
