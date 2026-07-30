"""Runtime configuration.

Single source for the data directory the backend reads its Parquet cache
from -- see docs/api-model.md's "Data directory resolution" section for why
the default matches pipeline/pitwall_pipeline/smoke.py's repo-root
convention rather than pipeline/pitwall_pipeline/ingest.py's (tracked as a
known inconsistency in docs/backlog.md).
"""

import os
from functools import lru_cache
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DATA_DIR = _REPO_ROOT / "data"


class Settings:
    """Backend runtime settings, read once and cached."""

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.processed_dir = data_dir / "processed"


@lru_cache
def get_settings() -> Settings:
    data_dir = Path(os.environ.get("PITWALL_DATA_DIR", str(_DEFAULT_DATA_DIR)))
    return Settings(data_dir=data_dir)
