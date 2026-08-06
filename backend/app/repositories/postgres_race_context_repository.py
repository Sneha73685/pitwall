"""PostgresRaceContextRepository: the sole RaceContextRepository implementation.

See docs/adr/0011-hybrid-storage-architecture.md. Reads the `stints`/
`pit_stops` tables written by `pipeline/pitwall_pipeline/postgres_writer.py`
via the migrations in `pipeline/pitwall_pipeline/migrations/`. This is the
only module allowed to know those tables/columns exist -- routes only ever
see the interface in `race_context.py`, mirroring how
`parquet_repository.py` is the only module that knows the Parquet cache
layout behind `TelemetryRepository`. Plain SQL via `psycopg` (no ORM, per
C8/ADR-0011); each method is a direct, single-table read keyed on the
natural composite key columns from Phase 1 -- no join back to Parquet, no
join between `stints` and `pit_stops`.
"""

from psycopg.rows import DictRow, dict_row
from psycopg_pool import ConnectionPool

from app.models.race_context import PitStop, Stint
from app.repositories.race_context import RaceContextRepository

_LIST_STINTS_SQL = """
    SELECT stint_number, compound, start_lap, end_lap, tyre_life_at_start
    FROM stints
    WHERE session_id = %(session_id)s AND driver_id = %(driver_id)s
    ORDER BY stint_number
"""

_LIST_PIT_STOPS_SQL = """
    SELECT driver_id, stop_number, lap_number, pit_lane_time_seconds
    FROM pit_stops
    WHERE session_id = %(session_id)s
      AND (%(driver_id)s::text IS NULL OR driver_id = %(driver_id)s::text)
    ORDER BY driver_id, stop_number
"""


def _stint_from_row(row: DictRow) -> Stint:
    return Stint(
        stint_number=row["stint_number"],
        compound=row["compound"],
        start_lap=row["start_lap"],
        end_lap=row["end_lap"],
        tyre_life_at_start=row["tyre_life_at_start"],
    )


def _pit_stop_from_row(row: DictRow) -> PitStop:
    return PitStop(
        driver_id=row["driver_id"],
        stop_number=row["stop_number"],
        lap_number=row["lap_number"],
        pit_lane_time_seconds=row["pit_lane_time_seconds"],
    )


class PostgresRaceContextRepository(RaceContextRepository):
    """Reads stints/pit stops from PostgreSQL via a pooled connection."""

    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    def list_stints(self, session_id: str, driver_id: str) -> list[Stint]:
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_LIST_STINTS_SQL, {"session_id": session_id, "driver_id": driver_id})
            return [_stint_from_row(row) for row in cur.fetchall()]

    def list_pit_stops(self, session_id: str, driver_id: str | None = None) -> list[PitStop]:
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(_LIST_PIT_STOPS_SQL, {"session_id": session_id, "driver_id": driver_id})
            return [_pit_stop_from_row(row) for row in cur.fetchall()]
