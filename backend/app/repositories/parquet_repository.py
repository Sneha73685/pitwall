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

import numpy as np
import numpy.typing as npt
import pandas as pd

# pyarrow ships no type stubs/py.typed marker (unlike pandas, covered by the
# pandas-stubs dev dependency) -- used only for cheap Parquet-metadata-only
# row counts (_telemetry_row_count), not for any typed data manipulation.
import pyarrow.parquet as pq  # type: ignore[import-untyped]

from app.models import Driver, Lap, Session, SessionType, TelemetrySample, TrackPoint
from app.repositories.base import TelemetryRepository
from app.utils.ids import make_event_id

# `DataFrameGroupBy.indices` (pandas-stubs 2.3.3.260113) types its values as
# `Index | np_ndarray_int64 | list[int]` -- a union covering pandas' several
# possible internal representations, not a single concrete type. Normalizing
# every value to a plain int64 ndarray via np.asarray() at build time (once,
# not per lookup -- see _telemetry_positions) collapses that union into one
# concrete type this module owns, instead of importing pandas-stubs' private
# _typing aliases or weakening this file's mypy --strict typing with Any.
_TelemetryPositions = dict[Hashable, npt.NDArray[np.int64]]


def _group_telemetry_by_driver_lap(df: pd.DataFrame) -> _TelemetryPositions:
    """(driver_id, lap_number) -> row positions into `df`, via one groupby
    pass over the already-cached, unfiltered telemetry frame. A plain
    module-level function -- like every other row/frame helper in this
    file (`_telemetry_row_count`, `_driver_from_row`, etc.) -- rather than
    inlined into `ParquetRepository._telemetry_positions`, specifically so
    it can be spied on directly in tests (`patch.object(parquet_repository,
    "_group_telemetry_by_driver_lap", wraps=...)`), the same way
    `pd.read_parquet` is spied on for M18's read-count tests. Patching
    `pd.DataFrame.groupby` itself doesn't work for this: `unittest.mock`
    replaces the class attribute with a plain `MagicMock`, which isn't a
    descriptor, so `df.groupby(...)` stops auto-binding `self` to `df` and
    the call fails with "You have to supply one of 'by' and 'level'"
    (verified during M19 implementation, docs/m19-design-review.md §12).
    `sort=False`: this function only ever looks up by exact key, never
    iterates groups in key order, so sorting group keys buys nothing.
    """
    return {
        key: np.asarray(positions, dtype=np.int64)
        for key, positions in df.groupby(["driver_id", "lap_number"], sort=False).indices.items()
    }


def _optional_str(value: Any) -> str | None:
    return None if pd.isna(value) else str(value)


def _optional_float(value: Any) -> float | None:
    return None if pd.isna(value) else float(value)


def _optional_int(value: Any) -> int | None:
    return None if pd.isna(value) else int(value)


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
        # .get(), not row[...]: a pre-M34 drivers.parquet has none of these
        # four columns at all, and must deserialize to None, not raise
        # (docs/m34-design-review.md §5 -- same pattern as Lap's `compound`).
        classified_position=_optional_str(row.get("classified_position")),
        grid_position=_optional_int(row.get("grid_position")),
        status=_optional_str(row.get("status")),
        points=_optional_float(row.get("points")),
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
        # Same reasoning for M35's position: a pre-M35 laps.parquet has no
        # position column at all (docs/m35-design-review.md §5).
        position=_optional_int(row.get("position")),
        # Same reasoning for M36's track_status (docs/m36-design-review.md §4).
        track_status=_optional_str(row.get("track_status")),
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
    """Reads ingested sessions from `{base_dir}/{season}/{event_slug}/{session_type}/`.

    `_index()` (M17, docs/m17-design-review.md §3) memoizes `_iter_session_dirs()`'s
    scan into a `session_id -> (session_dir, Session)` dict, built lazily on first
    use and cached for this instance's lifetime -- not eagerly in `__init__`, so a
    request that only ever looks up one session still pays exactly the same cost it
    always did. Every session_id-keyed method already funneled through the single
    `_find_session` choke point, so all of them benefit uniformly with no
    per-method change beyond `_find_session`/`list_sessions` themselves.

    No invalidation, no locking: `app/dependencies.py`'s `get_telemetry_repository`
    constructs a fresh `ParquetRepository` per request (no `@lru_cache`, no
    singleton) and every route is a plain `def` (its own threadpool worker) -- no
    instance is ever shared across requests or threads, so a stale or
    concurrently-mutated index can't occur under the current dependency-injection
    model. This is a documented dependency on that model continuing to hold, not an
    assumption made silently (docs/m17-design-review.md §3).

    `_cached_read()` (M18, docs/m18-design-review.md §4) extends the same lifecycle
    to each session's own data files: `drivers.parquet`, `laps.parquet`,
    `telemetry.parquet`, and `track.parquet` are each read at most once per session,
    per instance, and cached *unfiltered* -- `list_laps`/`get_telemetry` filter and
    `list_track_points`/`get_telemetry` sort a value derived from the cached frame,
    never the cached frame itself, so multiple filtered reads of the same session
    (e.g. two drivers' laps, or many drivers' many laps' telemetry -- the M8
    full-grid access pattern the index alone doesn't help with) share one file read.

    `_telemetry_positions()` (M19, docs/m19-design-review.md §4) goes one layer
    further for `get_telemetry` specifically: M18 stops repeated *file reads*, but
    every call still re-scanned the cached, unfiltered telemetry frame with a fresh
    `(driver_id, lap_number)` boolean mask over every row. This adds a second,
    per-session cache -- `(driver_id, lap_number) -> row positions` into the
    already-cached telemetry frame, built via one `groupby(...).indices` pass the
    first time a session's telemetry is looked up, then reused by every subsequent
    `get_telemetry` call for that session regardless of which driver/lap it asks
    for. It stores row *positions*, not row *data*, so it coexists with
    `_telemetry_cache` rather than replacing it -- the flat frame is still the only
    place the actual data lives; this index only says where to find it.
    """

    def __init__(self, base_dir: Path) -> None:
        self._base_dir = base_dir
        self._session_index: dict[str, tuple[Path, Session]] | None = None
        self._drivers_cache: dict[str, pd.DataFrame] = {}
        self._laps_cache: dict[str, pd.DataFrame] = {}
        self._telemetry_cache: dict[str, pd.DataFrame] = {}
        self._track_points_cache: dict[str, pd.DataFrame] = {}
        self._telemetry_index_cache: dict[str, _TelemetryPositions] = {}

    def _iter_session_dirs(self) -> Iterator[tuple[Path, Session]]:
        for session_file in sorted(self._base_dir.glob("*/*/*/session.parquet")):
            df = pd.read_parquet(session_file)
            if df.empty:
                continue
            session_dir = session_file.parent
            has_telemetry = _telemetry_row_count(session_dir) > 0
            yield session_dir, _session_from_row(df.iloc[0].to_dict(), has_telemetry=has_telemetry)

    def _index(self) -> dict[str, tuple[Path, Session]]:
        if self._session_index is None:
            self._session_index = {
                session.session_id: (session_dir, session)
                for session_dir, session in self._iter_session_dirs()
            }
        return self._session_index

    def _find_session(self, session_id: str) -> tuple[Path, Session] | None:
        return self._index().get(session_id)

    def _cached_read(
        self, cache: dict[str, pd.DataFrame], session_id: str, session_dir: Path, filename: str
    ) -> pd.DataFrame:
        """Read `session_dir / filename` at most once per `session_id`, per cache,
        per instance. Always the unfiltered file contents -- callers filter/sort
        the returned frame themselves; nothing filtered is ever written back here
        (docs/m18-design-review.md §4.1)."""
        if session_id not in cache:
            cache[session_id] = pd.read_parquet(session_dir / filename)
        return cache[session_id]

    def _telemetry_positions(self, session_id: str, df: pd.DataFrame) -> _TelemetryPositions:
        """(driver_id, lap_number) -> row positions into `df`, built via one
        groupby pass at most once per session, per instance
        (docs/m19-design-review.md §4). `df` is the already-cached, unfiltered
        telemetry frame from `_cached_read` -- this never triggers a second
        file read, only a second, cheaper pass over data already in memory.
        Scoped to `get_telemetry` alone, not folded into `_cached_read`:
        no other method calls `get_telemetry`'s per-item-loop access pattern
        (docs/m19-design-review.md §4.3)."""
        if session_id not in self._telemetry_index_cache:
            self._telemetry_index_cache[session_id] = _group_telemetry_by_driver_lap(df)
        return self._telemetry_index_cache[session_id]

    def list_sessions(self) -> list[Session]:
        # dict preserves insertion order (3.7+), and the index is built by
        # materializing _iter_session_dirs() once in its own sorted-glob
        # order -- .values() therefore yields sessions in exactly the same
        # order list_sessions() always has, indexed or not.
        return [session for _, session in self._index().values()]

    def get_session(self, session_id: str) -> Session | None:
        found = self._find_session(session_id)
        return found[1] if found else None

    def has_telemetry(self, session_id: str) -> bool:
        found = self._find_session(session_id)
        if found is None:
            return False
        # found[1].has_telemetry was already computed once while building
        # the index (the same _telemetry_row_count check below) -- reuse it
        # instead of re-reading telemetry.parquet's footer a second time.
        return found[1].has_telemetry

    def list_drivers(self, session_id: str) -> list[Driver]:
        found = self._find_session(session_id)
        if found is None:
            return []
        session_dir, _ = found
        df = self._cached_read(self._drivers_cache, session_id, session_dir, "drivers.parquet")
        return [_driver_from_row(row) for row in df.to_dict("records")]

    def list_laps(self, session_id: str, driver_id: str | None = None) -> list[Lap]:
        found = self._find_session(session_id)
        if found is None:
            return []
        session_dir, _ = found
        df = self._cached_read(self._laps_cache, session_id, session_dir, "laps.parquet")
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
        df = self._cached_read(self._telemetry_cache, session_id, session_dir, "telemetry.parquet")
        positions = self._telemetry_positions(session_id, df).get((driver_id, lap_number))
        if positions is None:
            return []
        # Fancy (non-contiguous) integer indexing -- df.iloc[positions] always
        # returns a new DataFrame, never a view, so the cached frame above is
        # never mutated by this or the sort_values() below (docs/m19-design-
        # review.md §7). Row order from `positions` follows the cached frame's
        # own row order, not distance_m -- sort_values() is still required, not
        # redundant (two other modules depend on this ordering by name: see
        # app/services/lap_comparison/validation.py and
        # app/services/session_analytics/driving_style.py).
        matched = df.iloc[positions].sort_values("distance_m")
        return [_telemetry_sample_from_row(row) for row in matched.to_dict("records")]

    def list_track_points(self, session_id: str) -> list[TrackPoint]:
        found = self._find_session(session_id)
        if found is None:
            return []
        session_dir, _ = found
        df = self._cached_read(self._track_points_cache, session_id, session_dir, "track.parquet")
        df = df.sort_values("distance_m")
        return [_track_point_from_row(row) for row in df.to_dict("records")]
