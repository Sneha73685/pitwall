"""Isolated PostgreSQL test-database helper.

Repository integration tests (`test_postgres_race_context_repository.py`)
must never write to the same database real ingestion writes to. Before this
module existed, that test file's own `TRUNCATE TABLE stints, pit_stops`
setup fixture connected directly via `app.config.get_settings().database_url`
-- which defaults, both locally and in CI, to the same database the
pipeline's real `ingest_session()` writes to (`PITWALL_DATABASE_URL`, or its
shared `postgresql://pitwall:pitwall@localhost:5432/pitwall` local-dev
default). Locally, that database can hold real ingested PitWall data (M12
Phase 6 confirmed this directly: running the backend test suite truncated a
real ingestion's `stints`/`pit_stops` rows). In CI it happens to start
empty, so the same bug is invisible there -- which is exactly why it must
not be relied on as the safety mechanism.

This module resolves a *separate* database on the same PostgreSQL server
(same host/user/password `get_settings()` already resolves -- no new
environment variable is introduced) and ensures it exists, with the same
`stints`/`pit_stops` schema, before tests use it. In both environments this
module only ever creates and writes to `<real-database-name>_test`, never
the real one -- verified at runtime by
`test_postgres_race_context_repository.test_pool_fixture_never_targets_the_real_app_database`.

The table definitions below are an independent, test-only copy of
`pipeline/pitwall_pipeline/migrations/0001_create_stints.sql` and
`0002_create_pit_stops.sql` (`CREATE TABLE IF NOT EXISTS` here, since this
bootstraps a disposable test database rather than performing a tracked
migration), not a cross-workspace import -- matching the backend's existing
"no dependency on `pitwall_pipeline`" rule (this package's own
`test_postgres_race_context_repository.py` docstring) and the same
independent-duplication precedent `app/utils/ids.py` already established for
`pitwall_pipeline/models.py`'s `make_event_id` (ADR-0009's anti-corruption
boundary). If those migrations ever change, this copy must be updated to
match by hand.
"""

from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql

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


def resolve_test_database_url(app_database_url: str, *, suffix: str = "_test") -> str:
    """The dedicated test database's connection URL: same server, user, and
    password as `app_database_url` (whatever `PITWALL_DATABASE_URL`/its
    default already resolves to), a differently-named database. Never
    returns `app_database_url` unchanged."""
    parts = urlsplit(app_database_url)
    database_name = parts.path.lstrip("/")
    if not database_name:
        raise ValueError(f"Cannot derive a test database name from {app_database_url!r}")
    return urlunsplit(
        (parts.scheme, parts.netloc, "/" + database_name + suffix, parts.query, parts.fragment)
    )


def ensure_test_database(app_database_url: str, test_database_url: str) -> None:
    """Create the dedicated test database if it doesn't already exist,
    connecting via the real app database (guaranteed to already exist --
    it's the one every other part of this project already connects to).
    `CREATE DATABASE` cannot run inside a transaction block, hence
    `autocommit=True`."""
    test_db_name = urlsplit(test_database_url).path.lstrip("/")
    with psycopg.connect(app_database_url, autocommit=True) as conn:
        try:
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(test_db_name)))
        except psycopg.errors.DuplicateDatabase:
            pass


def ensure_schema(test_database_url: str) -> None:
    """Create `stints`/`pit_stops` in the test database if they don't
    already exist -- idempotent, so this can run at the start of every test
    session without separate migration-bookkeeping."""
    with psycopg.connect(test_database_url, autocommit=True) as conn:
        conn.execute(_CREATE_STINTS)
        conn.execute(_CREATE_PIT_STOPS)
