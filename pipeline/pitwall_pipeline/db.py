"""PostgreSQL connection helper for the ingestion pipeline.

See docs/adr/0011-hybrid-storage-architecture.md: PostgreSQL is a second,
independent backing store alongside Parquet, used only for relational
race-context data (stints, pit stops) -- never telemetry, sessions,
drivers, or laps, which stay on Parquet (ADR-0004) unchanged.

A single connection, not a pool: the pipeline is a batch job, not a
long-running service (ADR-0001) -- see backend/app/db.py for the backend's
pooled equivalent, which needs one because it serves concurrent requests.

Reads `PITWALL_DATABASE_URL` directly. This is the first environment-variable
-driven configuration in this workspace -- `ingest.py`'s existing configuration
is CLI-arg-based (`--processed-dir`, `--fastf1-cache-dir`), not env-var-based,
and neither it nor `smoke.py` reads `PITWALL_DATA_DIR` despite docker-compose.yml
setting it for this service. `PITWALL_DATABASE_URL` is introduced here because
ADR-0011 specifies it as the connection string's home, matching the naming
convention `PITWALL_DATA_DIR` already established for the backend
(`backend/app/config.py`).
"""

import os
from typing import Any

import psycopg

_DEFAULT_DATABASE_URL = "postgresql://pitwall:pitwall@localhost:5432/pitwall"


def get_connection() -> psycopg.Connection[Any]:
    """Open a new connection to the race-context database.

    Callers are responsible for closing it (e.g. via a `with` block) --
    this function does not manage a pool or cache connections, matching
    the pipeline's one-shot, single-connection usage pattern.
    """
    database_url = os.environ.get("PITWALL_DATABASE_URL", _DEFAULT_DATABASE_URL)
    return psycopg.connect(database_url)
