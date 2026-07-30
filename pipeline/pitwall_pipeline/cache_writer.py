"""Parquet cache writer.

Writes one ingested session to the on-disk layout in docs/data-model.md's
"Parquet cache layout" section (ADR-0004). This is the sole place allowed to
write processed telemetry to disk -- everything upstream only builds a
NormalizedSessionData in memory. The (future, M2) ParquetRepository behind
TelemetryRepository (ADR-0006) is the only reader; this layout is a cache
format, not an API contract (ADR-0009).
"""

from pathlib import Path
from typing import TypeVar

import pandas as pd
from pydantic import BaseModel

from pitwall_pipeline.models import (
    Driver,
    Lap,
    NormalizedSessionData,
    Session,
    TelemetrySample,
    TrackPoint,
)
from pitwall_pipeline.utils.ids import slugify

ModelT = TypeVar("ModelT", bound=BaseModel)


def _to_dataframe(records: list[ModelT], model_cls: type[ModelT]) -> pd.DataFrame:
    """Convert normalized records to a DataFrame, preserving columns when empty."""
    if not records:
        return pd.DataFrame(columns=list(model_cls.model_fields.keys()))
    return pd.DataFrame([record.model_dump(mode="json") for record in records])


def session_cache_dir(data: NormalizedSessionData, *, base_dir: Path) -> Path:
    """The directory one session's cache is written to/read from.

    `base_dir/{season}/{event_slug}/{session_type}/`, per docs/data-model.md.
    Uses the same slugging scheme as Session.session_id (pitwall_pipeline.utils.ids)
    rather than inventing its own.
    """
    session = data.session
    return base_dir / str(session.season) / slugify(session.event_name) / session.session_type.value


def write_session_cache(data: NormalizedSessionData, *, base_dir: Path) -> Path:
    """Write one ingested session's Parquet cache. Returns the directory written to."""
    output_dir = session_cache_dir(data, base_dir=base_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    _to_dataframe([data.session], Session).to_parquet(output_dir / "session.parquet", index=False)
    _to_dataframe(data.drivers, Driver).to_parquet(output_dir / "drivers.parquet", index=False)
    _to_dataframe(data.laps, Lap).to_parquet(output_dir / "laps.parquet", index=False)
    _to_dataframe(data.telemetry, TelemetrySample).to_parquet(
        output_dir / "telemetry.parquet", index=False
    )
    _to_dataframe(data.track_points, TrackPoint).to_parquet(
        output_dir / "track.parquet", index=False
    )

    return output_dir
