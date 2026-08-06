"""Tests for PostgresRaceContextRepository (Phase 3, M10).

Requires a real PostgreSQL instance with the Phase 1 migrations already
applied (reachable via `PITWALL_DATABASE_URL` or the default local-dev
connection string) -- see docs/m10-implementation-plan.md Phase 3 "Testing
required". Seeded via direct SQL inserts in the test itself, not via the
pipeline package -- the backend has no dependency on `pitwall_pipeline`
(docs/api-model.md's workspace-independence rule, already established for
Parquet and carried forward here for Postgres).

Uses its own `ConnectionPool`, not `app.db.get_pool()` -- that function is
`@lru_cache`'d and shared process-wide (see test_db.py, which closes the
pool it creates), so reusing it here would couple this file's test
isolation to whatever order test_db.py happens to run in.
"""

from collections.abc import Iterator

import pytest
from psycopg_pool import ConnectionPool

from app.config import get_settings
from app.repositories.postgres_race_context_repository import PostgresRaceContextRepository

SESSION_ID = "2023_monza_race"


@pytest.fixture
def pool() -> Iterator[ConnectionPool]:
    get_settings.cache_clear()
    settings = get_settings()
    test_pool = ConnectionPool(conninfo=settings.database_url, open=True)
    with test_pool.connection() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE stints, pit_stops")
        conn.commit()
    yield test_pool
    test_pool.close()


@pytest.fixture
def repository(pool: ConnectionPool) -> PostgresRaceContextRepository:
    return PostgresRaceContextRepository(pool)


def _insert_stint(pool: ConnectionPool, **row: object) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO stints
                (session_id, driver_id, stint_number, compound,
                 start_lap, end_lap, tyre_life_at_start)
            VALUES
                (%(session_id)s, %(driver_id)s, %(stint_number)s, %(compound)s,
                 %(start_lap)s, %(end_lap)s, %(tyre_life_at_start)s)
            """,
            row,
        )
        conn.commit()


def _insert_pit_stop(pool: ConnectionPool, **row: object) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO pit_stops
                (session_id, driver_id, stop_number, lap_number, pit_lane_time_seconds)
            VALUES
                (%(session_id)s, %(driver_id)s, %(stop_number)s, %(lap_number)s,
                 %(pit_lane_time_seconds)s)
            """,
            row,
        )
        conn.commit()


def test_list_stints_returns_multiple_stints_ordered_by_stint_number(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    # Inserted out of order deliberately -- ORDER BY stint_number must sort them.
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stint_number=2,
        compound="HARD",
        start_lap=18,
        end_lap=37,
        tyre_life_at_start=1,
    )
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stint_number=1,
        compound="SOFT",
        start_lap=1,
        end_lap=17,
        tyre_life_at_start=4,
    )

    stints = repository.list_stints(SESSION_ID, "VER")

    assert [s.stint_number for s in stints] == [1, 2]
    assert stints[0].compound == "SOFT"
    assert stints[0].start_lap == 1
    assert stints[0].end_lap == 17
    assert stints[0].tyre_life_at_start == 4
    assert stints[1].compound == "HARD"


def test_list_stints_handles_null_tyre_life_at_start(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stint_number=1,
        compound="SOFT",
        start_lap=1,
        end_lap=17,
        tyre_life_at_start=None,
    )

    stints = repository.list_stints(SESSION_ID, "VER")

    assert stints[0].tyre_life_at_start is None


def test_list_stints_driver_with_zero_stints_returns_empty_list(
    repository: PostgresRaceContextRepository,
) -> None:
    assert repository.list_stints(SESSION_ID, "HAM") == []


def test_list_stints_only_returns_the_requested_driver(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stint_number=1,
        compound="SOFT",
        start_lap=1,
        end_lap=17,
        tyre_life_at_start=4,
    )
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="HAM",
        stint_number=1,
        compound="MEDIUM",
        start_lap=1,
        end_lap=20,
        tyre_life_at_start=2,
    )

    stints = repository.list_stints(SESSION_ID, "VER")

    assert len(stints) == 1
    assert stints[0].compound == "SOFT"


def test_list_pit_stops_without_filter_returns_all_drivers(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    _insert_pit_stop(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stop_number=1,
        lap_number=17,
        pit_lane_time_seconds=25.088,
    )
    _insert_pit_stop(
        pool,
        session_id=SESSION_ID,
        driver_id="HAM",
        stop_number=1,
        lap_number=20,
        pit_lane_time_seconds=23.5,
    )

    pit_stops = repository.list_pit_stops(SESSION_ID)

    assert len(pit_stops) == 2
    assert {p.driver_id for p in pit_stops} == {"VER", "HAM"}


def test_list_pit_stops_with_driver_filter(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    _insert_pit_stop(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stop_number=1,
        lap_number=17,
        pit_lane_time_seconds=25.088,
    )
    _insert_pit_stop(
        pool,
        session_id=SESSION_ID,
        driver_id="HAM",
        stop_number=1,
        lap_number=20,
        pit_lane_time_seconds=23.5,
    )

    pit_stops = repository.list_pit_stops(SESSION_ID, driver_id="VER")

    assert len(pit_stops) == 1
    assert pit_stops[0].driver_id == "VER"
    assert pit_stops[0].lap_number == 17


def test_list_pit_stops_handles_null_duration(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    _insert_pit_stop(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stop_number=1,
        lap_number=17,
        pit_lane_time_seconds=None,
    )

    pit_stops = repository.list_pit_stops(SESSION_ID, driver_id="VER")

    assert pit_stops[0].pit_lane_time_seconds is None


def test_list_pit_stops_zero_pit_stops_returns_empty_list(
    repository: PostgresRaceContextRepository,
) -> None:
    assert repository.list_pit_stops(SESSION_ID) == []


def test_nonexistent_session_returns_empty_lists_not_an_exception(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    # Real data exists for SESSION_ID, but not for this session_id -- the
    # repository has no concept of "does this session exist" (that's
    # TelemetryRepository's job, checked at the route layer in Phase 4);
    # an unknown session_id is simply a session_id with no matching rows.
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="VER",
        stint_number=1,
        compound="SOFT",
        start_lap=1,
        end_lap=17,
        tyre_life_at_start=4,
    )

    assert repository.list_stints("2099_nonexistent_race", "VER") == []
    assert repository.list_pit_stops("2099_nonexistent_race") == []
