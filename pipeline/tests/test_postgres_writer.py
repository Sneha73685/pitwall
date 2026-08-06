"""Tests for the PostgreSQL race-context writer (Phase 2, M10).

Requires a real PostgreSQL instance with the Phase 1 migrations already
applied (reachable via `PITWALL_DATABASE_URL` or the default local-dev
connection string) -- see docs/m10-implementation-plan.md Phase 2 "Testing
required": write once, assert rows; write the identical input again,
assert row count is unchanged (idempotency, the highest-value test in this
phase, per docs/m10-design-review.md §9).
"""

from collections.abc import Iterator

import pytest

from pitwall_pipeline.db import get_connection
from pitwall_pipeline.models import PitStop, Stint
from pitwall_pipeline.postgres_writer import write_pit_stops, write_stints

SESSION_ID = "2023_monza_race"


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE stints, pit_stops")
        conn.commit()
    yield


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
