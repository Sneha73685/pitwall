"""FastAPI dependency providers.

Routes depend on `TelemetryRepository` (the interface, ADR-0006) via
`Depends(get_telemetry_repository)`, never on `ParquetRepository` directly --
tests swap this out via `app.dependency_overrides` instead of touching real
Parquet files on disk.

`get_race_context_repository()` (M10, ADR-0011) is the same pattern applied
to the second, independent `RaceContextRepository` interface -- parallel
to, not merged with, `get_telemetry_repository()`. A route needing both
would declare both dependencies.
"""

from app.config import get_settings
from app.db import get_pool
from app.repositories import (
    ParquetRepository,
    PostgresRaceContextRepository,
    RaceContextRepository,
    TelemetryRepository,
)


def get_telemetry_repository() -> TelemetryRepository:
    settings = get_settings()
    return ParquetRepository(settings.processed_dir)


def get_race_context_repository() -> RaceContextRepository:
    return PostgresRaceContextRepository(get_pool())
