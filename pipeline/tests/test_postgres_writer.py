"""Tests for the PostgreSQL race-context writer (Phase 2, M10).

Requires a real PostgreSQL instance with the Phase 1 migrations already
applied (reachable via `PITWALL_DATABASE_URL` or the default local-dev
connection string) -- see docs/m10-implementation-plan.md Phase 2 "Testing
required": write once, assert rows; write the identical input again,
assert row count is unchanged (idempotency, the highest-value test in this
phase, per docs/m10-design-review.md §9).

Runs against a dedicated *test* database on that same server
(`postgres_test_db.resolve_test_database_url`), never the real one that
`PITWALL_DATABASE_URL` names -- this file's own `TRUNCATE TABLE stints,
pit_stops` setup previously destroyed real ingested M12 season data by
running directly against the real app database. `_clean_tables` below
redirects `PITWALL_DATABASE_URL` (via `monkeypatch`) to the isolated
database for the duration of every test in this file -- `get_connection()`
reads that variable fresh on every call, so every `get_connection()` call
in this file, not just this fixture's own, transparently targets the test
database. See `postgres_test_db.py`'s module docstring for why no
production code needed to change to make this possible.
"""

from collections.abc import Iterator
from urllib.parse import urlsplit

import pytest

from pitwall_pipeline.db import get_connection
from pitwall_pipeline.models import PitStop, Stint
from pitwall_pipeline.postgres_writer import write_pit_stops, write_stints
from tests.postgres_test_db import (
    app_database_url,
    ensure_schema,
    ensure_test_database,
    resolve_test_database_url,
)

SESSION_ID = "2023_monza_race"


@pytest.fixture(autouse=True)
def _clean_tables(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    app_url = app_database_url()
    test_url = resolve_test_database_url(app_url)
    ensure_test_database(app_url, test_url)
    ensure_schema(test_url)
    monkeypatch.setenv("PITWALL_DATABASE_URL", test_url)

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE stints, pit_stops")
        conn.commit()
    yield


def test_clean_tables_fixture_never_targets_the_real_app_database() -> None:
    """Regression test: by the time any test body in this file runs,
    PITWALL_DATABASE_URL must already point at the dedicated `_test`
    database, never the real one this file's TRUNCATE TABLE setup
    previously reached."""
    import os

    active_url = os.environ["PITWALL_DATABASE_URL"]
    assert urlsplit(active_url).path.endswith("_test")


def _stint(**overrides: object) -> Stint:
    defaults: dict[str, object] = {
        "session_id": SESSION_ID,
        "driver_id": "VER",
        "stint_number": 1,
        "compound": "SOFT",
        "start_lap": 1,
        "end_lap": 16,
        "tyre_life_at_start": 4,
    }
    defaults.update(overrides)
    return Stint.model_validate(defaults)


def _pit_stop(**overrides: object) -> PitStop:
    defaults: dict[str, object] = {
        "session_id": SESSION_ID,
        "driver_id": "VER",
        "stop_number": 1,
        "lap_number": 17,
        "pit_lane_time_seconds": 25.088,
    }
    defaults.update(overrides)
    return PitStop.model_validate(defaults)


def _all_stints() -> list[tuple[object, ...]]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT session_id, driver_id, stint_number, compound, start_lap, end_lap, "
            "tyre_life_at_start FROM stints ORDER BY driver_id, stint_number"
        )
        return cur.fetchall()


def _all_pit_stops() -> list[tuple[object, ...]]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT session_id, driver_id, stop_number, lap_number, pit_lane_time_seconds "
            "FROM pit_stops ORDER BY driver_id, stop_number"
        )
        return cur.fetchall()


def test_write_stints_inserts_rows() -> None:
    with get_connection() as conn:
        write_stints(conn, [_stint()])

    rows = _all_stints()
    assert rows == [(SESSION_ID, "VER", 1, "SOFT", 1, 16, 4)]


def test_write_stints_is_idempotent() -> None:
    with get_connection() as conn:
        write_stints(conn, [_stint()])
        write_stints(conn, [_stint()])

    assert len(_all_stints()) == 1


def test_write_stints_upsert_updates_changed_fields() -> None:
    with get_connection() as conn:
        write_stints(conn, [_stint()])
        write_stints(conn, [_stint(compound="HARD", end_lap=20)])

    rows = _all_stints()
    assert len(rows) == 1
    assert rows[0][3] == "HARD"  # compound
    assert rows[0][5] == 20  # end_lap


def test_write_stints_handles_null_tyre_life_at_start() -> None:
    with get_connection() as conn:
        write_stints(conn, [_stint(tyre_life_at_start=None)])

    rows = _all_stints()
    assert rows[0][6] is None


def test_write_stints_empty_list_is_a_no_op() -> None:
    with get_connection() as conn:
        write_stints(conn, [])

    assert _all_stints() == []


def test_write_pit_stops_inserts_rows() -> None:
    with get_connection() as conn:
        write_pit_stops(conn, [_pit_stop()])

    rows = _all_pit_stops()
    assert rows == [(SESSION_ID, "VER", 1, 17, 25.088)]


def test_write_pit_stops_is_idempotent() -> None:
    with get_connection() as conn:
        write_pit_stops(conn, [_pit_stop()])
        write_pit_stops(conn, [_pit_stop()])

    assert len(_all_pit_stops()) == 1


def test_write_pit_stops_upsert_updates_changed_fields() -> None:
    with get_connection() as conn:
        write_pit_stops(conn, [_pit_stop()])
        write_pit_stops(conn, [_pit_stop(lap_number=18, pit_lane_time_seconds=None)])

    rows = _all_pit_stops()
    assert len(rows) == 1
    assert rows[0][3] == 18  # lap_number
    assert rows[0][4] is None  # pit_lane_time_seconds

    # Re-running ingestion for the same session with unchanged input must
    # not duplicate rows across multiple stops for the same driver either.


def test_write_pit_stops_multiple_stops_same_driver() -> None:
    with get_connection() as conn:
        write_pit_stops(
            conn,
            [
                _pit_stop(stop_number=1, lap_number=17),
                _pit_stop(stop_number=2, lap_number=37),
            ],
        )

    rows = _all_pit_stops()
    assert [r[2] for r in rows] == [1, 2]
    assert [r[3] for r in rows] == [17, 37]
