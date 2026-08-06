"""Runtime configuration.

Single source for the data directory the backend reads its Parquet cache
from -- see docs/api-model.md's "Data directory resolution" section for why
the default matches the repo-root convention that pipeline/pitwall_pipeline/
smoke.py, pipeline/pitwall_pipeline/ingest.py, and docker-compose.yml's
volume mounts all share.

Also the single source for the PostgreSQL connection string used by
`RaceContextRepository` (docs/adr/0011-hybrid-storage-architecture.md).
This is a second, independent backing store alongside Parquet -- it does
not replace `PITWALL_DATA_DIR`/`processed_dir`, which still serves every
V1/V2 read path unchanged.
"""

import os
from functools import lru_cache
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DATA_DIR = _REPO_ROOT / "data"
_DEFAULT_DATABASE_URL = "postgresql://pitwall:pitwall@localhost:5432/pitwall"


class Settings:
    """Backend runtime settings, read once and cached."""

    def __init__(self, data_dir: Path, database_url: str) -> None:
        self.data_dir = data_dir
        self.processed_dir = data_dir / "processed"
        self.database_url = database_url


@lru_cache
def get_settings() -> Settings:
    data_dir = Path(os.environ.get("PITWALL_DATA_DIR", str(_DEFAULT_DATA_DIR)))
    database_url = os.environ.get("PITWALL_DATABASE_URL", _DEFAULT_DATABASE_URL)
    return Settings(data_dir=data_dir, database_url=database_url)
