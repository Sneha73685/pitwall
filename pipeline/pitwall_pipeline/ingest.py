"""Ingestion entrypoint: fetch one session via FastF1Provider, write it to the Parquet cache.

Run as `python -m pitwall_pipeline.ingest --season 2023 --event Monza --session race`. This is
the offline/batch process docs/architecture.md describes -- the FastAPI backend (M2) only ever
reads what this writes, it never fetches live (see ADR-0004's rationale for why ingestion is
decoupled from request time).
"""

import argparse
import logging
from pathlib import Path

from pitwall_pipeline.cache_writer import write_session_cache
from pitwall_pipeline.models import SessionType
from pitwall_pipeline.providers import FastF1Provider

logger = logging.getLogger(__name__)

_PIPELINE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FASTF1_CACHE_DIR = _PIPELINE_ROOT / "data" / "fastf1_cache"
DEFAULT_PROCESSED_DIR = _PIPELINE_ROOT / "data" / "processed"


def ingest_session(
    season: int,
    event: str,
    session_type: SessionType,
    *,
    fastf1_cache_dir: Path = DEFAULT_FASTF1_CACHE_DIR,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
) -> Path:
    """Fetch, normalize, and cache one session. Returns the written cache directory."""
    provider = FastF1Provider(fastf1_cache_dir)
    data = provider.load_session(season, event, session_type)
    output_dir = write_session_cache(data, base_dir=processed_dir)
    logger.info("Ingested %s -> %s", data.session.session_id, output_dir)
    return output_dir


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
