"""PostgreSQL writer for relational race-context data (stints, pit stops).

See docs/adr/0011-hybrid-storage-architecture.md. Called from ingest.py
after the existing Parquet write -- Parquet remains the source of truth
for telemetry/laps/sessions/drivers/track (ADR-0004, unchanged); this is a
second, independent, additive write for the two genuinely relational
entities PostgreSQL exists for. Upserts (`ON CONFLICT ... DO UPDATE`) on
the natural composite keys from pitwall_pipeline/migrations/, so
re-running ingestion for an already-ingested session never duplicates
rows.
"""

from typing import Any

from psycopg import Connection

from pitwall_pipeline.models import PitStop, Stint

_UPSERT_STINT = """
INSERT INTO stints (
    session_id, driver_id, stint_number, compound, start_lap, end_lap, tyre_life_at_start
)
VALUES (
    %(session_id)s, %(driver_id)s, %(stint_number)s, %(compound)s,
    %(start_lap)s, %(end_lap)s, %(tyre_life_at_start)s
)
ON CONFLICT (session_id, driver_id, stint_number) DO UPDATE SET
    compound = EXCLUDED.compound,
    start_lap = EXCLUDED.start_lap,
    end_lap = EXCLUDED.end_lap,
    tyre_life_at_start = EXCLUDED.tyre_life_at_start
"""

_UPSERT_PIT_STOP = """
INSERT INTO pit_stops (session_id, driver_id, stop_number, lap_number, pit_lane_time_seconds)
VALUES (%(session_id)s, %(driver_id)s, %(stop_number)s, %(lap_number)s, %(pit_lane_time_seconds)s)
ON CONFLICT (session_id, driver_id, stop_number) DO UPDATE SET
    lap_number = EXCLUDED.lap_number,
    pit_lane_time_seconds = EXCLUDED.pit_lane_time_seconds
"""


def write_stints(conn: Connection[Any], stints: list[Stint]) -> None:
    """Upsert stints for one ingested session, keyed on (session_id, driver_id, stint_number)."""
    with conn.cursor() as cur:
        for stint in stints:
            cur.execute(_UPSERT_STINT, stint.model_dump())
    conn.commit()


def write_pit_stops(conn: Connection[Any], pit_stops: list[PitStop]) -> None:
    """Upsert pit stops for one ingested session, keyed on (session_id, driver_id, stop_number)."""
    with conn.cursor() as cur:
        for pit_stop in pit_stops:
            cur.execute(_UPSERT_PIT_STOP, pit_stop.model_dump())
    conn.commit()
