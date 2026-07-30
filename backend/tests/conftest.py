"""Shared pytest fixtures: a synthetic Parquet cache and a TestClient wired
to read from it via dependency override, instead of any real FastF1/pipeline
output.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_telemetry_repository
from app.main import app
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import write_session_cache


@pytest.fixture
def session_cache_dir(tmp_path: Path) -> Path:
    write_session_cache(tmp_path)
    return tmp_path


@pytest.fixture
def client(session_cache_dir: Path) -> Iterator[TestClient]:
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(
        session_cache_dir
    )
    yield TestClient(app)
    app.dependency_overrides.clear()
