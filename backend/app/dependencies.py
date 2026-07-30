"""FastAPI dependency providers.

Routes depend on `TelemetryRepository` (the interface, ADR-0006) via
`Depends(get_telemetry_repository)`, never on `ParquetRepository` directly --
tests swap this out via `app.dependency_overrides` instead of touching real
Parquet files on disk.
"""

from app.config import get_settings
from app.repositories import ParquetRepository, TelemetryRepository


def get_telemetry_repository() -> TelemetryRepository:
    settings = get_settings()
    return ParquetRepository(settings.processed_dir)
