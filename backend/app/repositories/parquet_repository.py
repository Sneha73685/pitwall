"""ParquetRepository: the sole V1 TelemetryRepository implementation.

Reads the Parquet cache written by the pipeline (docs/data-model.md,
pipeline/pitwall_pipeline/cache_writer.py). This is the only module allowed
to know the on-disk cache layout -- routes only ever see the interface in
base.py. See docs/api-model.md for the session-lookup and data-directory
resolution design.
"""

from collections.abc import Hashable, Iterator, Mapping
from pathlib import Path
from typing import Any

import pandas as pd

# pyarrow ships no type stubs/py.typed marker (unlike pandas, covered by the
# pandas-stubs dev dependency) -- used only for cheap Parquet-metadata-only
# row counts (_telemetry_row_count), not for any typed data manipulation.
import pyarrow.parquet as pq  # type: ignore[import-untyped]

from app.models import Driver, Lap, Session, SessionType, TelemetrySample, TrackPoint
from app.repositories.base import TelemetryRepository
from app.utils.ids import make_event_id


def _optional_str(value: Any) -> str | None:
    return None if pd.isna(value) else str(value)


def _optional_float(value: Any) -> float | None:
    return None if pd.isna(value) else float(value)


def _session_from_row(row: Mapping[Hashable, Any], *, has_telemetry: bool) -> Session:
    season = int(row["season"])
    event_name = str(row["event_name"])
    return Session(
        session_id=str(row["session_id"]),
        season=season,
        event_name=event_name,
        event_id=make_event_id(season, event_name),
        round_number=int(row["round_number"]),
        location=str(row["location"]),
        country=str(row["country"]),
        session_type=SessionType(row["session_type"]),
        session_date=_optional_str(row["session_date"]),
        has_telemetry=has_telemetry,
    )


def _telemetry_row_count(session_dir: Path) -> int:
    """Parquet footer metadata only -- no data read (M12 Phase 4). Cheap
    even for a full race's telemetry.parquet (hundreds of thousands of
    rows), since only the file's row-group counts are inspected."""
    telemetry_file = session_dir / "telemetry.parquet"
    if not telemetry_file.exists():
        return 0
    return int(pq.ParquetFile(telemetry_file).metadata.num_rows)


def _driver_from_row(row: Mapping[Hashable, Any]) -> Driver:
    return Driver(
        driver_id=str(row["driver_id"]),
        driver_number=int(row["driver_number"]),
        full_name=str(row["full_name"]),
        team_name=str(row["team_name"]),
    )


def _lap_from_row(row: Mapping[Hashable, Any]) -> Lap:
    return Lap(
        driver_id=str(row["driver_id"]),
        lap_number=int(row["lap_number"]),
        lap_time_seconds=_optional_float(row["lap_time_seconds"]),
        sector_1_seconds=_optional_float(row["sector_1_seconds"]),
        sector_2_seconds=_optional_float(row["sector_2_seconds"]),
        sector_3_seconds=_optional_float(row["sector_3_seconds"]),
        is_personal_best=bool(row["is_personal_best"]),
        is_accurate=bool(row["is_accurate"]),
        # .get(), not row["compound"]: a pre-M10 laps.parquet has no
        # compound column at all, and must deserialize to None, not raise.
        compound=_optional_str(row.get("compound")),
    )


def _telemetry_sample_from_row(row: Mapping[Hashable, Any]) -> TelemetrySample:
    return TelemetrySample(
        distance_m=float(row["distance_m"]),
        time_seconds=float(row["time_seconds"]),
        speed_kph=float(row["speed_kph"]),
        throttle_pct=float(row["throttle_pct"]),
        brake_active=bool(row["brake_active"]),
        rpm=float(row["rpm"]),
        gear=int(row["gear"]),
        drs_active=bool(row["drs_active"]),
        x=float(row["x"]),
        y=float(row["y"]),
        z=float(row["z"]),
    )


def _track_point_from_row(row: Mapping[Hashable, Any]) -> TrackPoint:
    return TrackPoint(
        distance_m=float(row["distance_m"]),
        x=float(row["x"]),
        y=float(row["y"]),
    )


class ParquetRepository(TelemetryRepository):
    """Reads ingested sessions from `{base_dir}/{season}/{event_slug}/{session_type}/`."""

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir

    def _iter_session_dirs(self) -> Iterator[tuple[Path, Session]]:
        for session_file in sorted(self._base_dir.glob("*/*/*/session.parquet")):
            df = pd.read_parquet(session_file)
            if df.empty:
                continue
            session_dir = session_file.parent
            has_telemetry = _telemetry_row_count(session_dir) > 0
            yield session_dir, _session_from_row(df.iloc[0].to_dict(), has_telemetry=has_telemetry)

    def _find_session(self, session_id: str) -> tuple[Path, Session] | None:
        for session_dir, session in self._iter_session_dirs():
            if session.session_id == session_id:
                return session_dir, session
        return None

    def list_sessions(self) -> list[Session]:
        return [session for _, session in self._iter_session_dirs()]

    def get_session(self, session_id: str) -> Session | None:
        found = self._find_session(session_id)
        return found[1] if found else None

    def has_telemetry(self, session_id: str) -> bool:
        found = self._find_session(session_id)
        if found is None:
            return False
        session_dir, _ = found
        return _telemetry_row_count(session_dir) > 0

    def list_drivers(self, session_id: str) -> list[Driver]:
        found = self._find_session(session_id)
        if found is None:
            return []
        session_dir, _ = found
        df = pd.read_parquet(session_dir / "drivers.parquet")
        return [_driver_from_row(row) for row in df.to_dict("records")]

    def list_laps(self, session_id: str, driver_id: str | None = None) -> list[Lap]:
        found = self._find_session(session_id)
        if found is None:
            return []
        session_dir, _ = found
        df = pd.read_parquet(session_dir / "laps.parquet")
        if driver_id is not None:
            df = df[df["driver_id"] == driver_id]
        return [_lap_from_row(row) for row in df.to_dict("records")]

    def get_telemetry(
        self, session_id: str, driver_id: str, lap_number: int
    ) -> list[TelemetrySample]:
        found = self._find_session(session_id)
        if found is None:
            return []
        session_dir, _ = found
        df = pd.read_parquet(session_dir / "telemetry.parquet")
        df = df[(df["driver_id"] == driver_id) & (df["lap_number"] == lap_number)]
        df = df.sort_values("distance_m")
        return [_telemetry_sample_from_row(row) for row in df.to_dict("records")]

    def list_track_points(self, session_id: str) -> list[TrackPoint]:
        found = self._find_session(session_id)
        if found is None:
            return []
        session_dir, _ = found
        df = pd.read_parquet(session_dir / "track.parquet")
        df = df.sort_values("distance_m")
        return [_track_point_from_row(row) for row in df.to_dict("records")]
