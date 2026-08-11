"""Isolated PostgreSQL test-database helper for the pipeline workspace.

Mirrors `backend/tests/postgres_test_db.py`'s exact strategy -- a dedicated
`<real-database-name>_test` database on the same PostgreSQL server,
self-bootstrapping its own schema -- as an independent, workspace-local
copy rather than a cross-workspace import, matching this project's existing
"no dependency between backend and pipeline test/production code"
convention (this package's own `test_postgres_writer.py`/`test_migrate.py`
docstrings; the same duplication precedent `backend/tests/postgres_test_db.py`
already established, ADR-0009's anti-corruption-boundary reasoning applied
to test infrastructure).

Unlike the backend (whose Postgres access goes through an explicit
`ConnectionPool(conninfo=...)`), the pipeline's `get_connection()` and
`apply_pending_migrations()` read `PITWALL_DATABASE_URL` fresh from the
environment on every call, with no caching -- so isolating pipeline tests
only requires monkeypatching that one environment variable to the resolved
test database URL for the duration of a test (see `test_postgres_writer.py`/
`test_migrate.py`'s `autouse` fixtures); no application code needs to accept
an explicit URL parameter, and neither `pitwall_pipeline/db.py` nor
`pitwall_pipeline/migrate.py` was touched to make this possible.
"""

from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql

from pitwall_pipeline.db import _DEFAULT_DATABASE_URL

__all__ = [
    "app_database_url",
    "ensure_schema",
    "ensure_test_database",
    "resolve_test_database_url",
]

_CREATE_STINTS = """
CREATE TABLE IF NOT EXISTS stints (
    session_id          TEXT    NOT NULL,
    driver_id           TEXT    NOT NULL,
    stint_number        INT     NOT NULL,
    compound            TEXT    NOT NULL,
    start_lap           INT     NOT NULL,
    end_lap             INT     NOT NULL,
    tyre_life_at_start  INT,
    PRIMARY KEY (session_id, driver_id, stint_number)
);
"""

_CREATE_PIT_STOPS = """
CREATE TABLE IF NOT EXISTS pit_stops (
    session_id             TEXT    NOT NULL,
    driver_id              TEXT    NOT NULL,
    stop_number            INT     NOT NULL,
    lap_number             INT     NOT NULL,
    pit_lane_time_seconds  FLOAT,
    PRIMARY KEY (session_id, driver_id, stop_number)
);
"""


def app_database_url() -> str:
    """The real app database URL -- the exact resolution `get_connection()`
    itself uses (`PITWALL_DATABASE_URL`, or its shared local-dev default)."""
    import os

    return os.environ.get("PITWALL_DATABASE_URL", _DEFAULT_DATABASE_URL)


def resolve_test_database_url(app_url: str, *, suffix: str = "_test") -> str:
    """The dedicated test database's connection URL: same server, user, and
    password as `app_url`, a differently-named database. Never returns
    `app_url` unchanged."""
    parts = urlsplit(app_url)
    database_name = parts.path.lstrip("/")
    if not database_name:
        raise ValueError(f"Cannot derive a test database name from {app_url!r}")
    return urlunsplit(
        (parts.scheme, parts.netloc, "/" + database_name + suffix, parts.query, parts.fragment)
    )


def ensure_test_database(app_url: str, test_url: str) -> None:
    """Create the dedicated test database if it doesn't already exist,
    connecting via the real app database (guaranteed to already exist --
    it's the one every other part of this project already connects to).
    `CREATE DATABASE` cannot run inside a transaction block, hence
    `autocommit=True`."""
    test_db_name = urlsplit(test_url).path.lstrip("/")
    with psycopg.connect(app_url, autocommit=True) as conn:
        try:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(test_db_name)))
        except psycopg.errors.DuplicateDatabase:
            pass


def ensure_schema(test_url: str) -> None:
    """Create `stints`/`pit_stops` in the test database if they don't
    already exist -- idempotent, so this can run at the start of every test
    session without separate migration-bookkeeping. Not used by
    `test_migrate.py`, which deliberately starts from a genuinely empty
    schema to test `apply_pending_migrations()` itself."""
    with psycopg.connect(test_url, autocommit=True) as conn:
        conn.execute(_CREATE_STINTS)
        conn.execute(_CREATE_PIT_STOPS)
