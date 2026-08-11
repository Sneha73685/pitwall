"""Tests for the Postgres migration runner (Phase 1, M10).

Requires a real PostgreSQL instance reachable via `PITWALL_DATABASE_URL`
(or the default local-dev connection string) -- see
docs/m10-implementation-plan.md Phase 1 "Testing required": migrations
apply cleanly from empty, re-applying is a no-op, and the resulting schema
matches what 0001_create_stints.sql/0002_create_pit_stops.sql define.
Unlike every other pipeline test, this one cannot run against a hand-built
fixture in isolation -- there is no Parquet-style file to point at instead
of a real database (docs/adr/0011-hybrid-storage-architecture.md).

Runs against a dedicated *test* database (`postgres_test_db.py`), never the
real one `PITWALL_DATABASE_URL` names -- this file's own `DROP TABLE ...
CASCADE` setup previously destroyed the real schema/data by running
directly against the real app database. `_clean_schema` below redirects
`PITWALL_DATABASE_URL` (via `monkeypatch`) to the isolated database for the
duration of every test in this file; `get_connection()` (called both here
and internally by `apply_pending_migrations()`) reads that variable fresh
on every call, so no production code needed to change. Deliberately does
*not* call `postgres_test_db.ensure_schema()` -- this file's whole point is
testing that `apply_pending_migrations()` itself creates the schema from a
genuinely empty database.
"""

from collections.abc import Iterator
from urllib.parse import urlsplit

import pytest

from pitwall_pipeline.db import get_connection
from pitwall_pipeline.migrate import apply_pending_migrations
from tests.postgres_test_db import app_database_url, ensure_test_database, resolve_test_database_url

EXPECTED_TABLES = {"stints", "pit_stops"}


@pytest.fixture(autouse=True)
def _clean_schema(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Drop every table this migration set creates before each test, so
    each test starts from a genuinely empty schema regardless of what a
    previous test (or a manual `python -m pitwall_pipeline.migrate` run)
    left behind -- against the isolated test database only.
    """
    app_url = app_database_url()
    test_url = resolve_test_database_url(app_url)
    ensure_test_database(app_url, test_url)
    monkeypatch.setenv("PITWALL_DATABASE_URL", test_url)

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS stints, pit_stops, schema_migrations CASCADE")
        conn.commit()
    yield


def test_clean_schema_fixture_never_targets_the_real_app_database() -> None:
    """Regression test: by the time any test body in this file runs,
    PITWALL_DATABASE_URL must already point at the dedicated `_test`
    database, never the real one this file's DROP TABLE ... CASCADE setup
    previously reached."""
    import os

    active_url = os.environ["PITWALL_DATABASE_URL"]
    assert urlsplit(active_url).path.endswith("_test")


def _existing_tables() -> set[str]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = ANY(%s)",
            (list(EXPECTED_TABLES),),
        )
        return {row[0] for row in cur.fetchall()}


def _columns(table_name: str) -> dict[str, str]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = %s",
            (table_name,),
        )
        return dict(cur.fetchall())


def _primary_key_columns(table_name: str) -> list[str]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = %s AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position
            """,
            (table_name,),
        )
        return [row[0] for row in cur.fetchall()]


def test_apply_pending_migrations_creates_expected_tables_from_empty() -> None:
    assert _existing_tables() == set()

    applied = apply_pending_migrations()

    assert applied == ["0001_create_stints.sql", "0002_create_pit_stops.sql"]
    assert _existing_tables() == EXPECTED_TABLES


def test_apply_pending_migrations_is_idempotent() -> None:
    first = apply_pending_migrations()
    second = apply_pending_migrations()

    assert first == ["0001_create_stints.sql", "0002_create_pit_stops.sql"]
    assert second == []
    assert _existing_tables() == EXPECTED_TABLES


def test_stints_schema_matches_design() -> None:
    apply_pending_migrations()

    assert _columns("stints") == {
        "session_id": "NO",
        "driver_id": "NO",
        "stint_number": "NO",
        "compound": "NO",
        "start_lap": "NO",
        "end_lap": "NO",
        "tyre_life_at_start": "YES",
    }
    assert _primary_key_columns("stints") == ["session_id", "driver_id", "stint_number"]


def test_pit_stops_schema_matches_design() -> None:
    apply_pending_migrations()

    assert _columns("pit_stops") == {
        "session_id": "NO",
        "driver_id": "NO",
        "stop_number": "NO",
        "lap_number": "NO",
        "pit_lane_time_seconds": "YES",
    }
    assert _primary_key_columns("pit_stops") == ["session_id", "driver_id", "stop_number"]
