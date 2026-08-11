"""Ingestion entrypoint: fetch one session via FastF1Provider, write it to the Parquet cache.

Run as `python -m pitwall_pipeline.ingest --season 2023 --event Monza --session race`. This is
the offline/batch process docs/architecture.md describes -- the FastAPI backend (M2) only ever
reads what this writes, it never fetches live (see ADR-0004's rationale for why ingestion is
decoupled from request time).
"""

import argparse
import logging
from dataclasses import dataclass
from pathlib import Path

import psycopg

from pitwall_pipeline.cache_writer import write_session_cache
from pitwall_pipeline.db import get_connection
from pitwall_pipeline.models import SessionType
from pitwall_pipeline.postgres_writer import write_pit_stops, write_stints
from pitwall_pipeline.providers import FastF1Provider

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FASTF1_CACHE_DIR = _REPO_ROOT / "data" / "fastf1_cache"
DEFAULT_PROCESSED_DIR = _REPO_ROOT / "data" / "processed"


@dataclass(frozen=True)
class IngestResult:
    """Result of ingesting one session (M12 Phase 2, added to what was
    previously a bare `Path` return -- no existing caller relied on the old
    return type: `main()` below discards it, and no test asserted its
    shape). Carries enough for a caller to detect a session that ingested
    successfully but with no telemetry (the real, verified 2018 finding,
    docs/m12-design-review.md §19.2) without re-deriving it by re-reading
    the Parquet cache -- `pitwall_pipeline/ingest_event.py`'s orchestrator
    is the first consumer.
    """

    session_id: str
    output_dir: Path
    lap_count: int
    telemetry_sample_count: int


def ingest_session(
    season: int,
    event: str,
    session_type: SessionType,
    *,
    fastf1_cache_dir: Path = DEFAULT_FASTF1_CACHE_DIR,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
) -> IngestResult:
    """Fetch, normalize, and cache one session -- the single source of
    truth for actual ingestion (docs/m12-implementation-plan.md Phase 2);
    `ingest_event.py`'s event-level orchestration calls this unchanged,
    once per session, rather than re-implementing any part of it.
    """
    provider = FastF1Provider(fastf1_cache_dir)
    data = provider.load_session(season, event, session_type)
    output_dir = write_session_cache(data, base_dir=processed_dir)
    logger.info("Ingested %s -> %s", data.session.session_id, output_dir)

    # Second, independent write for relational race-context data
    # (ADR-0011). The Parquet write above is already complete and is never
    # rolled back if this fails -- a Postgres failure is logged, not
    # swallowed, and does not raise: the session is still fully usable for
    # every V1/V2 feature (docs/m10-implementation-plan.md Phase 2).
    try:
        with get_connection() as conn:
            write_stints(conn, data.stints)
            write_pit_stops(conn, data.pit_stops)
    except psycopg.Error:
        logger.warning(
            "Failed to write race-context data (stints/pit stops) to PostgreSQL for %s; "
            "the Parquet cache above was written successfully and ingestion is otherwise "
            "complete.",
            data.session.session_id,
            exc_info=True,
        )

    return IngestResult(
        session_id=data.session.session_id,
        output_dir=output_dir,
        lap_count=len(data.laps),
        telemetry_sample_count=len(data.telemetry),
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest one F1 session into the Parquet cache.")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument(
        "--event",
        required=True,
        help="Event name or round number, as accepted by fastf1.get_session",
    )
    parser.add_argument(
        "--session",
        required=True,
        dest="session_type",
        choices=[member.value for member in SessionType],
    )
    parser.add_argument("--fastf1-cache-dir", type=Path, default=DEFAULT_FASTF1_CACHE_DIR)
    parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO)
    args = _parse_args(argv)
    ingest_session(
        args.season,
        args.event,
        SessionType(args.session_type),
        fastf1_cache_dir=args.fastf1_cache_dir,
        processed_dir=args.processed_dir,
    )


if __name__ == "__main__":
    main()
