"""Tests for PostgresRaceContextRepository (Phase 3, M10).

Requires a real PostgreSQL server reachable via `PITWALL_DATABASE_URL` (or
the default local-dev connection string) -- see docs/m10-implementation-plan.md
Phase 3 "Testing required". Seeded via direct SQL inserts in the test
itself, not via the pipeline package -- the backend has no dependency on
`pitwall_pipeline` (docs/api-model.md's workspace-independence rule, already
established for Parquet and carried forward here for Postgres).

Runs against a dedicated *test* database on that same server
(`postgres_test_db.resolve_test_database_url`), never the real one that
`PITWALL_DATABASE_URL` names -- M12 Phase 6 found that this file's own
`TRUNCATE TABLE stints, pit_stops` setup previously destroyed real ingested
data by running directly against the real app database (see
`docs/m12-implementation-plan.md`'s Phase 6 section and
`postgres_test_db.py`'s module docstring). `ensure_test_database`/
`ensure_schema` create that dedicated database and its schema on first use,
in both a fresh CI Postgres service and an existing local one.

Uses its own `ConnectionPool`, not `app.db.get_pool()` -- that function is
`@lru_cache`'d and shared process-wide (see test_db.py, which closes the
pool it creates), so reusing it here would couple this file's test
isolation to whatever order test_db.py happens to run in.
"""

from collections.abc import Iterator
from urllib.parse import urlsplit

import pytest
from psycopg_pool import ConnectionPool

from app.config import get_settings
from app.repositories.postgres_race_context_repository import PostgresRaceContextRepository
from tests.postgres_test_db import ensure_schema, ensure_test_database, resolve_test_database_url

SESSION_ID = "2023_monza_race"


@pytest.fixture
def pool() -> Iterator[ConnectionPool]:
    get_settings.cache_clear()
    settings = get_settings()
    test_url = resolve_test_database_url(settings.database_url)
    ensure_test_database(settings.database_url, test_url)
    ensure_schema(test_url)

    test_pool = ConnectionPool(conninfo=test_url, open=True)
    with test_pool.connection() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE stints, pit_stops")
        conn.commit()
    yield test_pool
    test_pool.close()


def test_pool_fixture_never_targets_the_real_app_database(pool: ConnectionPool) -> None:
    """Regression test for the M12 Phase 6 finding: this fixture's
    connection pool must never point at the same database
    `get_settings().database_url` names, in any environment -- that is the
    real ingestion database, and this fixture's own `TRUNCATE TABLE
    stints, pit_stops` setup must never be able to reach it."""
    get_settings.cache_clear()
    real_database_url = get_settings().database_url
    pool_conninfo = pool.conninfo
    assert isinstance(pool_conninfo, str)

    assert pool_conninfo != real_database_url
    assert urlsplit(pool_conninfo).path != urlsplit(real_database_url).path
    assert urlsplit(pool_conninfo).path.endswith("_test")


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
    assert stints[0].driver_id == "VER"
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


def test_list_stints_without_driver_filter_returns_stints_for_every_driver(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    """docs/m11-design-review.md §6.1's resolved decision: `list_stints`
    widened to an optional `driver_id`, mirroring `list_pit_stops`, rather
    than a second method."""
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

    stints = repository.list_stints(SESSION_ID)

    assert {s.driver_id for s in stints} == {"VER", "HAM"}
    assert len(stints) == 2


def test_list_stints_without_driver_filter_orders_by_driver_then_stint_number(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    # Inserted out of order deliberately -- ORDER BY driver_id, stint_number
    # must sort them, matching list_pit_stops's existing ordering convention.
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="HAM",
        stint_number=2,
        compound="HARD",
        start_lap=21,
        end_lap=40,
        tyre_life_at_start=1,
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
    _insert_stint(
        pool,
        session_id=SESSION_ID,
        driver_id="ALB",
        stint_number=1,
        compound="SOFT",
        start_lap=1,
        end_lap=15,
        tyre_life_at_start=1,
    )

    stints = repository.list_stints(SESSION_ID)

    assert [(s.driver_id, s.stint_number) for s in stints] == [
        ("ALB", 1),
        ("HAM", 1),
        ("HAM", 2),
    ]


def test_list_stints_without_driver_filter_still_requires_the_requested_driver_when_given(
    pool: ConnectionPool, repository: PostgresRaceContextRepository
) -> None:
    """Preserves existing per-driver behavior -- widening the parameter
    must not change what a caller who still passes `driver_id` gets back."""
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

    stints = repository.list_stints(SESSION_ID, driver_id="VER")

    assert len(stints) == 1
    assert stints[0].driver_id == "VER"


def test_list_stints_without_driver_filter_on_a_session_with_no_stints_returns_empty_list(
    repository: PostgresRaceContextRepository,
) -> None:
    assert repository.list_stints(SESSION_ID) == []


def test_list_stints_without_driver_filter_on_a_nonexistent_session_returns_empty_list(
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

    assert repository.list_stints("2099_nonexistent_race") == []


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
