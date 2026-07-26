"""M0 smoke check.

This module deliberately does NOT implement TelemetryProvider -- it only
proves the FastF1 dependency and its on-disk cache are wired correctly,
so M0 can prove "the pipeline workspace builds and runs" without writing
any ingestion logic (that starts in M1).
"""

from pathlib import Path

import fastf1


def get_fastf1_version() -> str:
    """Return the installed FastF1 library version."""
    return str(fastf1.__version__)


def enable_cache(cache_dir: Path) -> None:
    """Point FastF1 at a local cache directory, creating it if needed.

    FastF1 refuses to operate without an explicit cache location, so
    every real provider implementation will need to call this (or its
    equivalent) before making any request.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(cache_dir))


if __name__ == "__main__":
    enable_cache(Path(__file__).resolve().parents[2] / "data" / "fastf1_cache")
    print(f"FastF1 {get_fastf1_version()} ready, cache enabled.")
