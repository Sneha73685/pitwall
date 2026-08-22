"""M38: targeted historical backfill for the M34-M36 fields (Driver
`classified_position`/`grid_position`/`status`/`points`, Lap `position`,
Lap `track_status`) across the already-processed 334 Race/Qualifying/
Sprint/SprintQualifying sessions, 2020-2026 (docs/m38-design-review.md).

Explicitly NOT a general-purpose ingestion tool and NOT a replacement for
`ingest_session()`/`ingest_event()`/`execute_ingestion_plan()` -- all three
unconditionally attempt a PostgreSQL write (`ingest.py`'s `write_stints`/
`write_pit_stops`), which this milestone's safety boundary forbids. This
module calls `FastF1Provider.load_session()` + `write_session_cache()`
directly (both confirmed, by import inspection, to have zero PostgreSQL
dependency) and adds exactly what those Parquet-only primitives don't
already provide:

  - session-directory-scoped staging + atomic swap, closing
    `cache_writer.py`'s unaddressed atomicity gap without modifying
    `cache_writer.py` itself (`write_session_cache(base_dir=...)` already
    supports writing to an arbitrary root unchanged)
  - pre-swap verification: non-target-column equality against the existing
    live files, plus M34/M35/M36 target-field sanity checks -- a failed
    verification blocks the swap and leaves the live directory untouched
  - an append-only per-run state log for resume-by-skip idempotency
  - FastF1 offline-mode enforcement so a cache miss fails loudly instead of
    silently fetching from the network (see the module-level note below on
    why this one call lives here rather than in `fastf1_provider.py`)

Target population is derived entirely from the existing, already-processed
corpus on disk (`data/processed/<season>/<event>/<session_type>/`) --
never from a fresh FastF1 schedule call -- and is asserted, fail-closed,
against the exact Stage B/C-approved 334-session population (142 Race +
142 Qualifying + 28 Sprint + 22 Sprint Qualifying) before any session is
touched. `build_ingestion_plan()` (`ingest_plan.py`) was evaluated for this
discovery step and deliberately NOT used: it internally reconstructs a
`FastF1Provider`, which re-calls `fastf1.Cache.enable_cache()` and would
silently reset the offline-mode flag this module depends on for cache
safety (verified in `fastf1/req.py`: `enable_cache()` rebuilds the cached
requests session from scratch on every call) -- there is no way to
interleave offline-mode enforcement into its internal discovery call
without modifying `ingest_plan.py`, which Stage C's approved source scope
forbids. Filesystem-derived discovery avoids that conflict entirely and
requires zero FastF1/network calls of its own.

Run as:
    python -m pitwall_pipeline.backfill_m38 --dry-run --season 2023
    python -m pitwall_pipeline.backfill_m38 --season 2023
    python -m pitwall_pipeline.backfill_m38 --season 2023 --resume
    python -m pitwall_pipeline.backfill_m38 --verify-final --all-seasons --confirm-full-backfill
"""

import argparse
import json
import logging
import os
import shutil
import time
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

import fastf1
import pandas as pd

from pitwall_pipeline.cache_writer import write_session_cache
from pitwall_pipeline.ingest import DEFAULT_FASTF1_CACHE_DIR, DEFAULT_PROCESSED_DIR
from pitwall_pipeline.models import SessionType, make_session_id
from pitwall_pipeline.providers import FastF1Provider

logger = logging.getLogger(__name__)

# --- Approved scope (docs/m38-design-review.md) -----------------------------

TARGET_SEASONS: tuple[int, ...] = (2020, 2021, 2022, 2023, 2024, 2025, 2026)
TARGET_SESSION_TYPES: tuple[SessionType, ...] = (
    SessionType.RACE,
    SessionType.QUALIFYING,
    SessionType.SPRINT,
    SessionType.SPRINT_QUALIFYING,
)
EXPECTED_COUNTS_BY_TYPE: dict[SessionType, int] = {
    SessionType.RACE: 142,
    SessionType.QUALIFYING: 142,
    SessionType.SPRINT: 28,
    SessionType.SPRINT_QUALIFYING: 22,
}
EXPECTED_TOTAL = 334

_DATA_DIR = DEFAULT_PROCESSED_DIR.parent
DEFAULT_STAGING_DIR = _DATA_DIR / ".m38-staging"
DEFAULT_BACKUP_DIR = _DATA_DIR / ".m38-backup"
DEFAULT_STATE_LOG = _DATA_DIR / ".m38-state" / "backfill_log.jsonl"

_EXPECTED_FILES = {
    "session.parquet",
    "drivers.parquet",
    "laps.parquet",
    "telemetry.parquet",
    "track.parquet",
}
_DRIVER_KEY_COLUMNS = ["session_id", "driver_id"]
_DRIVER_NON_TARGET_COLUMNS = ["driver_number", "full_name", "team_name"]
_DRIVER_TARGET_COLUMNS = ["classified_position", "grid_position", "status", "points"]
_LAP_KEY_COLUMNS = ["session_id", "driver_id", "lap_number"]
_LAP_NON_TARGET_COLUMNS = [
    "lap_time_seconds",
    "sector_1_seconds",
    "sector_2_seconds",
    "sector_3_seconds",
    "is_personal_best",
    "is_accurate",
    "compound",
]
_LAP_TARGET_COLUMNS = ["position", "track_status"]
_VALID_TRACK_STATUS_CHARS = set("1234567")


class PopulationMismatchError(RuntimeError):
    """The discovered target population does not match the approved scope."""


def _is_classification_applicable(session_type: SessionType) -> bool:
    """Race/Sprint only. Contrary to normalize.py's docstring claim
    ("Race/Sprint/Qualifying-family") and this milestone's own original
    design assumption, real cached FastF1 data (verified directly against
    2020/2023/2024 sessions during Stage C's trial run) shows
    ClassifiedPosition/Status are empty strings and GridPosition/Points are
    NaN for every driver in every Qualifying and Sprint Qualifying session,
    in every era -- including the 2023 "Sprint Shootout" format the design
    doc claimed as an exception. Both M34's Driver classification fields
    and M35's Lap.position share this exact real-world applicability rule
    (both are sourced from the Race/Sprint-only-populated columns of the
    same FastF1 session results/laps). See docs/m38-design-review.md's
    Stage C deviations section."""
    return session_type in (SessionType.RACE, SessionType.SPRINT)


# --- Target population (filesystem-derived, zero FastF1/network calls) ------


@dataclass(frozen=True)
class TargetSession:
    season: int
    event_name: str
    round_number: int
    session_type: SessionType
    session_id: str
    live_dir: Path

    @property
    def m34_applicable(self) -> bool:
        return _is_classification_applicable(self.session_type)

    @property
    def m35_applicable(self) -> bool:
        return _is_classification_applicable(self.session_type)


def _candidate_session_dirs(processed_dir: Path) -> Iterable[Path]:
    for season in TARGET_SEASONS:
        season_dir = processed_dir / str(season)
        if not season_dir.is_dir():
            continue
        for event_dir in sorted(p for p in season_dir.iterdir() if p.is_dir()):
            for session_type in TARGET_SESSION_TYPES:
                candidate = event_dir / session_type.value
                if (candidate / "session.parquet").is_file():
                    yield candidate


def resolve_target_population(processed_dir: Path = DEFAULT_PROCESSED_DIR) -> list[TargetSession]:
    """Filesystem-derived discovery: read each already-processed candidate
    session's own `session.parquet` for its (season, event_name,
    round_number, session_type), recompute its `session_id`, and cross-check
    it against the stored one. Fails closed -- raises `PopulationMismatchError`
    -- if the result doesn't exactly match the approved 334-session scope."""
    targets: list[TargetSession] = []
    for live_dir in _candidate_session_dirs(processed_dir):
        session_df = pd.read_parquet(live_dir / "session.parquet")
        if len(session_df) != 1:
            raise PopulationMismatchError(
                f"{live_dir / 'session.parquet'} has {len(session_df)} row(s), expected exactly 1"
            )
        row = session_df.iloc[0]
        session_type = SessionType(row["session_type"])
        if live_dir.name != session_type.value:
            raise PopulationMismatchError(
                f"{live_dir}: directory name {live_dir.name!r} does not match "
                f"session.parquet's session_type {session_type.value!r}"
            )
        season = int(row["season"])
        event_name = str(row["event_name"])
        session_id = make_session_id(season, event_name, session_type)
        if session_id != str(row["session_id"]):
            raise PopulationMismatchError(
                f"{live_dir}: recomputed session_id {session_id!r} does not match "
                f"stored session_id {row['session_id']!r}"
            )
        targets.append(
            TargetSession(
                season=season,
                event_name=event_name,
                round_number=int(row["round_number"]),
                session_type=session_type,
                session_id=session_id,
                live_dir=live_dir,
            )
        )

    _assert_expected_population(targets)
    targets.sort(key=lambda t: (t.season, t.round_number, t.session_type.value))
    return targets


def _assert_expected_population(targets: list[TargetSession]) -> None:
    counts = Counter(t.session_type for t in targets)
    # Built against TARGET_SESSION_TYPES (never against Counter's own keys)
    # so a type with zero sessions still compares correctly -- Counter
    # simply omits keys it never saw, which would otherwise make a 0-count
    # expectation spuriously mismatch.
    got_by_type = {t: counts.get(t, 0) for t in TARGET_SESSION_TYPES}
    if len(targets) != EXPECTED_TOTAL or got_by_type != EXPECTED_COUNTS_BY_TYPE:
        got = {t.value: c for t, c in got_by_type.items()}
        expected = {t.value: c for t, c in EXPECTED_COUNTS_BY_TYPE.items()}
        raise PopulationMismatchError(
            "Discovered target population does not match the Stage B/C-approved "
            f"334-session scope. Got {len(targets)} total, by type: {got}. "
            f"Expected {EXPECTED_TOTAL} total, by type: {expected}. Refusing to "
            "proceed -- see docs/m38-design-review.md's fail-closed population check."
        )


# --- State log (append-only, resume-by-skip idempotency) --------------------


class SessionState(str, Enum):
    STARTED = "started"
    STAGED = "staged"
    VERIFIED = "verified"
    SWAPPED = "swapped"
    COMPLETED = "completed"
    FAILED = "failed"


class StateLog:
    """Append-only JSONL log, one line per state transition. A session is
    only ever safely skippable on resume if its *latest* recorded status is
    COMPLETED -- COMPLETED is written only after a verified atomic swap
    (see `process_session`), so there is no "half done" state a resumed run
    could mistake for done."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, session_id: str, status: SessionState, detail: str | None = None) -> None:
        entry = {
            "session_id": session_id,
            "status": status.value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "detail": detail,
        }
        with self.path.open("a") as f:
            f.write(json.dumps(entry) + "\n")

    def latest_statuses(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        latest: dict[str, str] = {}
        with self.path.open() as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                latest[entry["session_id"]] = entry["status"]
        return latest

    def completed_session_ids(self) -> set[str]:
        return {
            sid
            for sid, status in self.latest_statuses().items()
            if status == SessionState.COMPLETED.value
        }


# --- Verification -------------------------------------------------------------


@dataclass(frozen=True)
class VerificationResult:
    passed: bool
    checks: list[str] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)


def _compare_non_target_columns(
    old_df: pd.DataFrame,
    new_df: pd.DataFrame,
    *,
    key_columns: list[str],
    compare_columns: list[str],
    label: str,
) -> list[str]:
    needed = set(key_columns + compare_columns)
    missing_old = needed - set(old_df.columns)
    if missing_old:
        return [f"{label}: existing (old) data is missing expected column(s): {missing_old}"]
    missing_new = needed - set(new_df.columns)
    if missing_new:
        return [f"{label}: newly staged data is missing expected column(s): {missing_new}"]

    merged = old_df[key_columns + compare_columns].merge(
        new_df[key_columns + compare_columns],
        on=key_columns,
        suffixes=("_old", "_new"),
        how="outer",
        indicator=True,
    )
    failures: list[str] = []
    unmatched = merged[merged["_merge"] != "both"]
    if len(unmatched) > 0:
        failures.append(
            f"{label}: {len(unmatched)} row(s) present in only one of old/new (key set changed)"
        )

    both = merged[merged["_merge"] == "both"]
    for col in compare_columns:
        old_col, new_col = both[f"{col}_old"], both[f"{col}_new"]
        differs = ~((old_col == new_col) | (old_col.isna() & new_col.isna()))
        if differs.any():
            failures.append(f"{label}: column {col!r} changed for {int(differs.sum())} row(s)")
    return failures


def _verify_m34_fields(target: TargetSession, new_drivers: pd.DataFrame) -> list[str]:
    missing = set(_DRIVER_TARGET_COLUMNS) - set(new_drivers.columns)
    if missing:
        return [f"drivers.parquet is missing M34 column(s): {missing}"]
    failures: list[str] = []
    # FastF1 gives an empty string (not NaN/None) for ClassifiedPosition/Status
    # on non-applicable session types, so "empty" -- not just "null" -- is the
    # real signal for "this session type doesn't get classification data".
    is_empty = new_drivers["classified_position"].map(lambda v: v is None or not str(v).strip())
    if target.m34_applicable:
        if len(new_drivers) > 0 and is_empty.all():
            failures.append(
                "classified_position is empty/null for every driver row despite this "
                "session being M34-applicable"
            )
        if (new_drivers["points"].dropna() < 0).any():
            failures.append("points contains negative value(s)")
        # 0 is a real, legitimate FastF1 value here (pit-lane start, no
        # assigned grid slot -- confirmed against real 2020 Styrian GP data,
        # e.g. GRO). Only a genuinely negative grid position is invalid.
        if (new_drivers["grid_position"].dropna() < 0).any():
            failures.append("grid_position contains negative value(s)")
    else:
        if len(new_drivers) > 0 and not is_empty.all():
            failures.append(
                "classified_position is populated for a session outside the M34-applicable "
                "scope (Race/Sprint only) -- refusing to accept possible fabricated data"
            )
        if new_drivers["grid_position"].notna().any():
            failures.append(
                "grid_position is populated for a session outside the M34-applicable scope"
            )
        if new_drivers["points"].notna().any():
            failures.append("points is populated for a session outside the M34-applicable scope")
    return failures


def _verify_m35_field(target: TargetSession, new_laps: pd.DataFrame) -> list[str]:
    if "position" not in new_laps.columns:
        return ["laps.parquet is missing M35 'position' column"]
    failures: list[str] = []
    if target.m35_applicable:
        if len(new_laps) > 0 and new_laps["position"].isna().all():
            failures.append(
                "position is null for every lap despite this session being M35-applicable"
            )
        if (new_laps["position"].dropna() <= 0).any():
            failures.append("position contains non-positive value(s)")
    else:
        if new_laps["position"].notna().any():
            failures.append(
                "position is populated for a session outside the M35-applicable scope "
                "(Race/Sprint only) -- refusing to accept possible fabricated data"
            )
    return failures


def _verify_m36_field(new_laps: pd.DataFrame) -> list[str]:
    if "track_status" not in new_laps.columns:
        return ["laps.parquet is missing M36 'track_status' column"]
    # Empty string is a real, legitimate FastF1 value here -- typically lap 1
    # (formation/start lap), before FastF1's TrackStatus stream has recorded
    # a status yet (confirmed against real 2020 Eifel GP data: 23/1019 laps,
    # concentrated on lap_number == 1). Treated the same as "no data", not
    # as an invalid code.
    values = new_laps["track_status"].dropna().astype(str)
    non_empty = values[values != ""]
    invalid = non_empty[~non_empty.map(lambda v: set(v) <= _VALID_TRACK_STATUS_CHARS)]
    if len(invalid) > 0:
        return [f"track_status contains invalid code(s): {sorted(set(invalid))[:5]}"]
    return []


def verify_session(target: TargetSession, staged_dir: Path) -> VerificationResult:
    """Pre-swap verification: staged output vs. the still-untouched live
    directory. A failure here means the live directory is never touched."""
    checks: list[str] = []
    failures: list[str] = []

    actual_files = {p.name for p in staged_dir.iterdir()} if staged_dir.is_dir() else set()
    if actual_files != _EXPECTED_FILES:
        return VerificationResult(
            passed=False,
            failures=[f"expected files {_EXPECTED_FILES}, got {actual_files}"],
        )

    try:
        old = {name: pd.read_parquet(target.live_dir / name) for name in _EXPECTED_FILES}
        new = {name: pd.read_parquet(staged_dir / name) for name in _EXPECTED_FILES}
    except Exception as exc:  # noqa: BLE001 - deliberately broad: any unreadable Parquet fails verification
        return VerificationResult(
            passed=False, failures=[f"failed to read a staged/live Parquet file: {exc}"]
        )

    for name in sorted(_EXPECTED_FILES):
        old_len, new_len = len(old[name]), len(new[name])
        if old_len != new_len:
            failures.append(f"{name} row count changed: {old_len} -> {new_len}")
        else:
            checks.append(f"{name} row count unchanged ({old_len})")

    failures += _compare_non_target_columns(
        old["drivers.parquet"],
        new["drivers.parquet"],
        key_columns=_DRIVER_KEY_COLUMNS,
        compare_columns=_DRIVER_NON_TARGET_COLUMNS,
        label="drivers.parquet",
    )
    failures += _compare_non_target_columns(
        old["laps.parquet"],
        new["laps.parquet"],
        key_columns=_LAP_KEY_COLUMNS,
        compare_columns=_LAP_NON_TARGET_COLUMNS,
        label="laps.parquet",
    )
    failures += _verify_m34_fields(target, new["drivers.parquet"])
    failures += _verify_m35_field(target, new["laps.parquet"])
    failures += _verify_m36_field(new["laps.parquet"])

    if not failures:
        checks.append("non-target columns and M34/M35/M36 target fields all verified")
    return VerificationResult(passed=not failures, checks=checks, failures=failures)


# --- Atomic swap ---------------------------------------------------------------


def _atomic_swap(live_dir: Path, staged_dir: Path, backup_dir: Path) -> None:
    """live_dir -> backup_dir, then staged_dir -> live_dir. Both are single
    `os.rename()` calls on the same filesystem (all under `data/`), each
    individually atomic -- the session directory is therefore always either
    fully-old, briefly-absent, or fully-new, never partially written. If the
    second rename fails, the first is immediately undone."""
    if backup_dir.exists():
        raise RuntimeError(
            f"Backup path {backup_dir} already exists from a previous run -- refusing to "
            "overwrite a possibly-still-needed rollback copy. Inspect and clear it manually "
            "before retrying this session."
        )
    backup_dir.parent.mkdir(parents=True, exist_ok=True)
    os.rename(live_dir, backup_dir)
    try:
        os.rename(staged_dir, live_dir)
    except Exception:
        os.rename(backup_dir, live_dir)
        raise


def _readable(dir_path: Path) -> list[str]:
    failures = []
    for name in _EXPECTED_FILES:
        try:
            pd.read_parquet(dir_path / name)
        except Exception as exc:  # noqa: BLE001 - any unreadable file is a hard integrity failure
            failures.append(f"{dir_path / name} unreadable after swap: {exc}")
    return failures


# --- Per-session processing -----------------------------------------------------


class SessionOutcome(str, Enum):
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(frozen=True)
class SessionRunResult:
    target: TargetSession
    outcome: SessionOutcome
    detail: str | None = None
    elapsed_seconds: float = 0.0


def process_session(
    target: TargetSession,
    *,
    provider: FastF1Provider,
    staging_dir: Path,
    backup_dir: Path,
    state_log: StateLog,
) -> SessionRunResult:
    start = time.monotonic()
    state_log.record(target.session_id, SessionState.STARTED)

    def _fail(detail: str) -> SessionRunResult:
        logger.warning("Session %s failed: %s", target.session_id, detail)
        state_log.record(target.session_id, SessionState.FAILED, detail=detail)
        return SessionRunResult(
            target, SessionOutcome.FAILED, detail=detail, elapsed_seconds=time.monotonic() - start
        )

    try:
        data = provider.load_session(target.season, target.event_name, target.session_type)
    except Exception as exc:  # noqa: BLE001 - isolate any FastF1/normalization failure, same as ingest_event.py
        return _fail(f"load_session failed: {exc}")

    if data.session.session_id != target.session_id:
        return _fail(
            f"safety check failed: re-ingesting {target.session_id} produced session_id "
            f"{data.session.session_id!r} instead -- refusing to treat this as a valid replacement"
        )

    try:
        staged_dir = write_session_cache(data, base_dir=staging_dir)
    except Exception as exc:  # noqa: BLE001 - staging write failure never touches live_dir
        return _fail(f"staging write failed: {exc}")
    state_log.record(target.session_id, SessionState.STAGED)

    result = verify_session(target, staged_dir)
    if not result.passed:
        shutil.rmtree(staged_dir, ignore_errors=True)
        return _fail("verification failed: " + "; ".join(result.failures))
    state_log.record(target.session_id, SessionState.VERIFIED)

    session_backup_dir = backup_dir / target.session_id
    try:
        _atomic_swap(target.live_dir, staged_dir, session_backup_dir)
    except Exception as exc:  # noqa: BLE001 - swap failure must be caught so live_dir's state is reported accurately
        return _fail(f"atomic swap failed (original preserved if restorable): {exc}")
    state_log.record(target.session_id, SessionState.SWAPPED)

    post_swap_failures = _readable(target.live_dir)
    if post_swap_failures:
        # The swap itself succeeded, but the result is unreadable -- restore
        # immediately rather than leave a corrupt session live.
        os.rename(target.live_dir, staging_dir / "__post_swap_failed__" / target.session_id)
        os.rename(session_backup_dir, target.live_dir)
        return _fail(
            "post-swap integrity check failed, original restored: " + "; ".join(post_swap_failures)
        )

    state_log.record(target.session_id, SessionState.COMPLETED)
    return SessionRunResult(
        target, SessionOutcome.COMPLETED, elapsed_seconds=time.monotonic() - start
    )


# --- Discovery / dry-run report --------------------------------------------------


@dataclass(frozen=True)
class DiscoveryReport:
    total_population: int
    batch: list[TargetSession]
    already_completed: list[TargetSession]
    remaining: list[TargetSession]


def build_discovery_report(
    all_targets: list[TargetSession], batch_targets: list[TargetSession], state_log: StateLog
) -> DiscoveryReport:
    completed_ids = state_log.completed_session_ids()
    already_completed = [t for t in batch_targets if t.session_id in completed_ids]
    remaining = [t for t in batch_targets if t.session_id not in completed_ids]
    return DiscoveryReport(
        total_population=len(all_targets),
        batch=batch_targets,
        already_completed=already_completed,
        remaining=remaining,
    )


def _log_report(report: DiscoveryReport, seasons: Sequence[int]) -> None:
    counts = Counter(t.session_type for t in report.batch)
    logger.info(
        "Approved population: %d sessions total. Batch (seasons=%s): %d sessions %s.",
        report.total_population,
        sorted(seasons),
        len(report.batch),
        {t.value: c for t, c in counts.items()},
    )
    logger.info(
        "Batch status: %d already completed (will be skipped), %d remaining.",
        len(report.already_completed),
        len(report.remaining),
    )
    for t in report.batch:
        marker = "SKIP(done)" if t in report.already_completed else "target"
        logger.info(
            "  [%s] %s %s %s (m35_applicable=%s)",
            marker,
            t.season,
            t.event_name,
            t.session_type.value,
            t.m35_applicable,
        )


# --- Final aggregate verification -----------------------------------------------


@dataclass(frozen=True)
class AggregateVerificationReport:
    population_ok: bool
    total_session_dirs: int
    target_session_dirs: int
    non_target_session_dirs: int
    per_session_failures: dict[str, list[str]]

    @property
    def passed(self) -> bool:
        # Deliberately not hardcoded to the real corpus's 704/334 split --
        # that would make this report self-referential (always "passing" by
        # construction against magic numbers) instead of actually checking
        # internal consistency: every discovered session dir is accounted
        # for as exactly one of target/non-target, and the target count
        # matches the approved scope.
        return (
            self.population_ok
            and self.target_session_dirs == EXPECTED_TOTAL
            and self.total_session_dirs == self.target_session_dirs + self.non_target_session_dirs
            and not self.per_session_failures
        )


def _all_session_dirs(processed_dir: Path) -> list[Path]:
    dirs = []
    for season_dir in sorted(p for p in processed_dir.iterdir() if p.is_dir()):
        for event_dir in sorted(p for p in season_dir.iterdir() if p.is_dir()):
            for session_type in SessionType:
                candidate = event_dir / session_type.value
                if (candidate / "session.parquet").is_file():
                    dirs.append(candidate)
    return dirs


def aggregate_verify(
    processed_dir: Path = DEFAULT_PROCESSED_DIR, backup_dir: Path = DEFAULT_BACKUP_DIR
) -> AggregateVerificationReport:
    """Post-run, read-only aggregate check: population counts, per-session
    target-field sanity, and (where a backup still exists) non-target-column
    equality against the pre-swap original."""
    try:
        targets = resolve_target_population(processed_dir)
        population_ok = True
    except PopulationMismatchError as exc:
        logger.error("Final population check failed: %s", exc)
        targets, population_ok = [], False

    all_dirs = _all_session_dirs(processed_dir)
    target_ids = {t.live_dir for t in targets}
    non_target_dirs = [d for d in all_dirs if d not in target_ids]

    per_session_failures: dict[str, list[str]] = {}
    for target in targets:
        failures = _readable(target.live_dir)
        try:
            new_drivers = pd.read_parquet(target.live_dir / "drivers.parquet")
            new_laps = pd.read_parquet(target.live_dir / "laps.parquet")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"unreadable: {exc}")
            per_session_failures[target.session_id] = failures
            continue
        failures += _verify_m34_fields(target, new_drivers)
        failures += _verify_m35_field(target, new_laps)
        failures += _verify_m36_field(new_laps)

        session_backup = backup_dir / target.session_id
        if session_backup.is_dir():
            try:
                old_drivers = pd.read_parquet(session_backup / "drivers.parquet")
                old_laps = pd.read_parquet(session_backup / "laps.parquet")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"backup unreadable: {exc}")
            else:
                failures += _compare_non_target_columns(
                    old_drivers,
                    new_drivers,
                    key_columns=_DRIVER_KEY_COLUMNS,
                    compare_columns=_DRIVER_NON_TARGET_COLUMNS,
                    label="drivers.parquet (vs. backup)",
                )
                failures += _compare_non_target_columns(
                    old_laps,
                    new_laps,
                    key_columns=_LAP_KEY_COLUMNS,
                    compare_columns=_LAP_NON_TARGET_COLUMNS,
                    label="laps.parquet (vs. backup)",
                )
        if failures:
            per_session_failures[target.session_id] = failures

    return AggregateVerificationReport(
        population_ok=population_ok,
        total_session_dirs=len(all_dirs),
        target_session_dirs=len(target_ids),
        non_target_session_dirs=len(non_target_dirs),
        per_session_failures=per_session_failures,
    )


# --- CLI -------------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "M38 targeted historical backfill for M34/M35/M36 fields, scoped to the "
            "approved 334-session Race/Qualifying/Sprint/SprintQualifying population. "
            "Narrow by default: one or more --season is required; processing every "
            "target season in one run requires --all-seasons --confirm-full-backfill "
            "(docs/m38-design-review.md's season-batching recommendation)."
        )
    )
    season_group = parser.add_mutually_exclusive_group(required=True)
    season_group.add_argument("--season", type=int, action="append", dest="seasons")
    season_group.add_argument("--all-seasons", action="store_true")
    parser.add_argument("--confirm-full-backfill", action="store_true")
    parser.add_argument(
        "--dry-run", action="store_true", help="Report only; zero loads, zero writes."
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Informational: this run continues a prior interrupted run.",
    )
    parser.add_argument(
        "--only-session-id",
        help="Restrict to exactly one session_id -- for a small manual trial run.",
    )
    parser.add_argument(
        "--verify-final", action="store_true", help="Run aggregate post-backfill verification only."
    )
    parser.add_argument("--processed-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    parser.add_argument("--fastf1-cache-dir", type=Path, default=DEFAULT_FASTF1_CACHE_DIR)
    parser.add_argument("--staging-dir", type=Path, default=DEFAULT_STAGING_DIR)
    parser.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR)
    parser.add_argument("--state-log", type=Path, default=DEFAULT_STATE_LOG)
    args = parser.parse_args(argv)

    if args.all_seasons and not args.confirm_full_backfill:
        parser.error("--all-seasons requires --confirm-full-backfill")
    return args


def _preflight(args: argparse.Namespace) -> None:
    processed_dir = args.processed_dir.resolve()
    staging_dir = args.staging_dir.resolve()
    backup_dir = args.backup_dir.resolve()
    if staging_dir == processed_dir or staging_dir.is_relative_to(processed_dir):
        raise RuntimeError(
            f"Staging dir {staging_dir} must be outside the live path {processed_dir}"
        )
    if backup_dir == processed_dir or backup_dir.is_relative_to(processed_dir):
        raise RuntimeError(f"Backup dir {backup_dir} must be outside the live path {processed_dir}")
    logger.info("Preflight: staging dir %s (outside live path) -- OK", staging_dir)
    logger.info("Preflight: backup dir %s (outside live path) -- OK", backup_dir)
    logger.info("Preflight: state log %s", args.state_log.resolve())
    logger.info("Preflight: PostgreSQL -- not imported by this module, zero write capability")


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO)
    args = _parse_args(argv)
    _preflight(args)

    if args.verify_final:
        agg_report = aggregate_verify(args.processed_dir, args.backup_dir)
        logger.info(
            "Final verification: population_ok=%s total=%d target=%d non_target=%d failing=%d",
            agg_report.population_ok,
            agg_report.total_session_dirs,
            agg_report.target_session_dirs,
            agg_report.non_target_session_dirs,
            len(agg_report.per_session_failures),
        )
        for session_id, failures in agg_report.per_session_failures.items():
            logger.warning("  %s: %s", session_id, "; ".join(failures))
        logger.info("Final verification %s", "PASSED" if agg_report.passed else "FAILED")
        return

    all_targets = resolve_target_population(args.processed_dir)
    seasons = set(args.seasons) if args.seasons else set(TARGET_SEASONS)
    batch = [t for t in all_targets if t.season in seasons]
    if args.only_session_id:
        batch = [t for t in batch if t.session_id == args.only_session_id]
        if not batch:
            raise RuntimeError(
                f"No target session matches --only-session-id={args.only_session_id!r}"
            )

    state_log = StateLog(args.state_log)
    disc_report = build_discovery_report(all_targets, batch, state_log)
    _log_report(disc_report, sorted(seasons))

    if args.dry_run:
        logger.info("Dry run: zero loads, zero writes performed.")
        return

    provider = FastF1Provider(args.fastf1_cache_dir)
    # Narrow, documented exception to ADR-0005's "FastF1Provider is the only
    # module allowed to call FastF1's API directly": this is a cache-mode
    # toggle, not a data-fetch/shape call, and is the only way to make a
    # cache miss fail loudly instead of silently fetching -- required by
    # this milestone's cache-safety rule and impossible to wire through
    # FastF1Provider without modifying it, which Stage C's approved source
    # scope forbids. See docs/m38-design-review.md's deviations section.
    fastf1.Cache.offline_mode(True)
    logger.info(
        "FastF1 offline mode enabled: cache misses will raise, never fetch from the network."
    )

    completed = len(disc_report.already_completed)
    failed = 0
    durations: list[float] = []
    start_time = time.monotonic()

    for i, target in enumerate(disc_report.remaining, start=1):
        logger.info("[%d/%d] Processing %s ...", i, len(disc_report.remaining), target.session_id)
        result = process_session(
            target,
            provider=provider,
            staging_dir=args.staging_dir,
            backup_dir=args.backup_dir,
            state_log=state_log,
        )
        durations.append(result.elapsed_seconds)
        if result.outcome is SessionOutcome.COMPLETED:
            completed += 1
        else:
            failed += 1
            logger.warning("  FAILED: %s", result.detail)

        avg = sum(durations) / len(durations)
        remaining_est = avg * (len(disc_report.remaining) - i)
        logger.info(
            "progress: done=%d failed=%d skipped=%d elapsed=%.0fs eta_remaining=%.0fs (n=%d)",
            completed,
            failed,
            len(disc_report.already_completed),
            time.monotonic() - start_time,
            remaining_est,
            len(durations),
        )

    logger.info(
        "Batch done: completed=%d failed=%d skipped=%d total_elapsed=%.0fs",
        completed,
        failed,
        len(disc_report.already_completed),
        time.monotonic() - start_time,
    )
    if failed:
        logger.warning(
            "%d session(s) failed verification/processing and were left untouched. "
            "Re-run the same --season with --resume after investigating (state log: %s).",
            failed,
            args.state_log,
        )


if __name__ == "__main__":
    main()
