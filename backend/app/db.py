"""PostgreSQL connection pool for relational race-context data.

See docs/adr/0011-hybrid-storage-architecture.md: PostgreSQL is a second,
independent backing store alongside Parquet, used only by
`RaceContextRepository` implementations for stints/pit stops -- never for
telemetry, sessions, drivers, or laps, which stay on
`TelemetryRepository`/`ParquetRepository` unchanged.

A pooled connection, not a single one: unlike the pipeline (a batch job,
see pipeline/pitwall_pipeline/db.py), the backend is a long-running service
handling concurrent requests (ADR-0011, Implementation Constraints).
"""

from functools import lru_cache

from psycopg_pool import ConnectionPool

from app.config import get_settings


@lru_cache
def get_pool() -> ConnectionPool:
    """Return the process-wide connection pool, created on first use."""
    settings = get_settings()
    return ConnectionPool(conninfo=settings.database_url, open=True)
