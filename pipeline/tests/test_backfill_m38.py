"""Tests for M38's targeted historical backfill tool
(pitwall_pipeline.backfill_m38). Entirely local -- no network, no real
FastF1Provider.load_session() call (mocked throughout), no writes outside
tmp_path fixtures (CLAUDE.md's testing rules): no test may write to the
real historical processed-data directory.
"""

from pathlib import Path
from unittest.mock import MagicMock

import pandas as pd
import pytest

from pitwall_pipeline import backfill_m38
from pitwall_pipeline.backfill_m38 import (
    PopulationMismatchError,
    SessionOutcome,
    SessionState,
    StateLog,
    TargetSession,
    _assert_expected_population,
    _atomic_swap,
    aggregate_verify,
    build_discovery_report,
    process_session,
    resolve_target_population,
    verify_session,
)
from pitwall_pipeline.cache_writer import write_session_cache
from pitwall_pipeline.models import Driver, Lap, NormalizedSessionData, Session, SessionType
from pitwall_pipeline.providers import FastF1Provider

# --- Fixture helpers --------------------------------------------------------


def _write_old_session(
    base_dir: Path,
    *,
    season: int,
    event_name: str,
    round_number: int,
    session_type: SessionType,
    slug: str,
    drivers: list[dict[str, object]],
    laps: list[dict[str, object]],
) -> Path:
    """Writes a pre-M34/M35/M36-style session directly via pandas, bypassing
    the current Driver/Lap pydantic models (which always include the
    M34-M36 columns) -- matching the real production schema of an
    already-processed, not-yet-backfilled session (Stage A: 0/704 sessions
    have these columns at all)."""
    session_id = f"{season}_{slug}_{session_type.value}"
    out_dir = base_dir / str(season) / slug / session_type.value
    out_dir.mkdir(parents=True, exist_ok=True)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "season": season,
                "event_name": event_name,
                "round_number": round_number,
                "location": "Monza",
                "country": "Italy",
                "session_type": session_type.value,
                "session_date": None,
            }
        ]
    ).to_parquet(out_dir / "session.parquet", index=False)
    pd.DataFrame([{**d, "session_id": session_id} for d in drivers]).to_parquet(
        out_dir / "drivers.parquet", index=False
    )
    pd.DataFrame([{**lap, "session_id": session_id} for lap in laps]).to_parquet(
        out_dir / "laps.parquet", index=False
    )
    pd.DataFrame(
        columns=[
            "session_id",
            "driver_id",
            "lap_number",
            "distance_m",
            "time_seconds",
            "speed_kph",
            "throttle_pct",
            "brake_active",
            "rpm",
            "gear",
            "drs_active",
            "x",
            "y",
            "z",
        ]
    ).to_parquet(out_dir / "telemetry.parquet", index=False)
    pd.DataFrame(columns=["session_id", "distance_m", "x", "y"]).to_parquet(
        out_dir / "track.parquet", index=False
    )
    return out_dir


def _target_and_live(
    tmp_path: Path,
    *,
    season: int = 2023,
    session_type: SessionType = SessionType.RACE,
    slug: str = "italian_grand_prix",
    event_name: str = "Italian Grand Prix",
) -> TargetSession:
    live_dir = _write_old_session(
        tmp_path,
        season=season,
        event_name=event_name,
        round_number=16,
        session_type=session_type,
        slug=slug,
        drivers=[
            {
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Max Verstappen",
                "team_name": "Red Bull Racing",
            }
        ],
        laps=[
            {
                "driver_id": "VER",
                "lap_number": 1,
                "lap_time_seconds": 91.234,
                "sector_1_seconds": 30.1,
                "sector_2_seconds": 31.0,
                "sector_3_seconds": 30.134,
                "is_personal_best": True,
                "is_accurate": True,
                "compound": "SOFT",
            }
        ],
    )
    return TargetSession(
        season=season,
        event_name=event_name,
        round_number=16,
        session_type=session_type,
        session_id=f"{season}_{slug}_{session_type.value}",
        live_dir=live_dir,
    )


def _normalized_data(
    target: TargetSession,
    *,
    mutate_driver: dict[str, object] | None = None,
    mutate_lap: dict[str, object] | None = None,
    m34: bool = True,
    m35: bool = True,
    m36: bool = True,
) -> NormalizedSessionData:
    session = Session(
        session_id=target.session_id,
        season=target.season,
        event_name=target.event_name,
        round_number=target.round_number,
        location="Monza",
        country="Italy",
        session_type=target.session_type,
        session_date=None,
    )
    driver_kwargs: dict[str, object] = dict(
        session_id=target.session_id,
        driver_id="VER",
        driver_number=1,
        full_name="Max Verstappen",
        team_name="Red Bull Racing",
    )
    if m34:
        driver_kwargs.update(
            classified_position="1", grid_position=1, status="Finished", points=25.0
        )
    if mutate_driver:
        driver_kwargs.update(mutate_driver)

    lap_kwargs: dict[str, object] = dict(
        session_id=target.session_id,
        driver_id="VER",
        lap_number=1,
        lap_time_seconds=91.234,
        sector_1_seconds=30.1,
        sector_2_seconds=31.0,
        sector_3_seconds=30.134,
        is_personal_best=True,
        is_accurate=True,
        compound="SOFT",
    )
    if m35:
        lap_kwargs.update(position=1)
    if m36:
        lap_kwargs.update(track_status="1")
    if mutate_lap:
        lap_kwargs.update(mutate_lap)

    return NormalizedSessionData(
        session=session,
        drivers=[Driver(**driver_kwargs)],  # type: ignore[arg-type]
        laps=[Lap(**lap_kwargs)],  # type: ignore[arg-type]
        telemetry=[],
        track_points=[],
    )


def _synthetic_targets() -> list[TargetSession]:
    targets = []

    def add(session_type: SessionType, count: int) -> None:
        for i in range(count):
            targets.append(
                TargetSession(
                    season=2023,
                    event_name=f"Event {i}",
                    round_number=i,
                    session_type=session_type,
                    session_id=f"2023_event_{i}_{session_type.value}",
                    live_dir=Path(f"/nonexistent/{session_type.value}/{i}"),
                )
            )

    add(SessionType.RACE, 142)
    add(SessionType.QUALIFYING, 142)
    add(SessionType.SPRINT, 28)
    add(SessionType.SPRINT_QUALIFYING, 22)
    return targets


# --- Target population selection / count enforcement / type filtering ------


def test_assert_expected_population_accepts_exact_334() -> None:
    _assert_expected_population(_synthetic_targets())  # must not raise


def test_assert_expected_population_rejects_undercount() -> None:
    with pytest.raises(PopulationMismatchError):
        _assert_expected_population(_synthetic_targets()[:-1])


def test_assert_expected_population_rejects_overcount() -> None:
    extra = _synthetic_targets()
    extra.append(
        TargetSession(
            season=2023,
            event_name="Extra",
            round_number=99,
            session_type=SessionType.RACE,
            session_id="2023_extra_race",
            live_dir=Path("/nonexistent/extra"),
        )
    )
    with pytest.raises(PopulationMismatchError):
        _assert_expected_population(extra)


def test_resolve_target_population_filters_by_type_and_reads_metadata(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(backfill_m38, "TARGET_SEASONS", (2023,))
    monkeypatch.setattr(backfill_m38, "EXPECTED_TOTAL", 2)
    monkeypatch.setattr(
        backfill_m38,
        "EXPECTED_COUNTS_BY_TYPE",
        {
            SessionType.RACE: 1,
            SessionType.QUALIFYING: 1,
            SessionType.SPRINT: 0,
            SessionType.SPRINT_QUALIFYING: 0,
        },
    )
    _write_old_session(
        tmp_path,
        season=2023,
        event_name="Italian Grand Prix",
        round_number=16,
        session_type=SessionType.RACE,
        slug="italian_grand_prix",
        drivers=[
            {
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Max Verstappen",
                "team_name": "Red Bull",
            }
        ],
        laps=[],
    )
    _write_old_session(
        tmp_path,
        season=2023,
        event_name="Italian Grand Prix",
        round_number=16,
        session_type=SessionType.QUALIFYING,
        slug="italian_grand_prix",
        drivers=[
            {
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Max Verstappen",
                "team_name": "Red Bull",
            }
        ],
        laps=[],
    )
    # Practice must never be considered, regardless of EXPECTED_TOTAL overrides.
    _write_old_session(
        tmp_path,
        season=2023,
        event_name="Italian Grand Prix",
        round_number=16,
        session_type=SessionType.PRACTICE_1,
        slug="italian_grand_prix",
        drivers=[
            {
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Max Verstappen",
                "team_name": "Red Bull",
            }
        ],
        laps=[],
    )

    targets = resolve_target_population(tmp_path)

    assert {t.session_type for t in targets} == {SessionType.RACE, SessionType.QUALIFYING}
    assert all(t.season == 2023 and t.event_name == "Italian Grand Prix" for t in targets)


def test_resolve_target_population_raises_on_empty_corpus(tmp_path: Path) -> None:
    with pytest.raises(PopulationMismatchError):
        resolve_target_population(tmp_path)


def test_resolve_target_population_detects_directory_type_mismatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(backfill_m38, "TARGET_SEASONS", (2023,))
    out_dir = tmp_path / "2023" / "italian_grand_prix" / "race"
    out_dir.mkdir(parents=True)
    pd.DataFrame(
        [
            {
                "session_id": "2023_italian_grand_prix_qualifying",
                "season": 2023,
                "event_name": "Italian Grand Prix",
                "round_number": 16,
                "location": "Monza",
                "country": "Italy",
                "session_type": SessionType.QUALIFYING.value,  # mismatches "race" dir
                "session_date": None,
            }
        ]
    ).to_parquet(out_dir / "session.parquet", index=False)

    with pytest.raises(PopulationMismatchError, match="does not match"):
        resolve_target_population(tmp_path)


# --- State log / resume-by-skip ---------------------------------------------


def test_state_log_latest_status_wins(tmp_path: Path) -> None:
    log = StateLog(tmp_path / "log.jsonl")
    log.record("s1", SessionState.STARTED)
    log.record("s1", SessionState.STAGED)
    log.record("s1", SessionState.FAILED, detail="oops")

    assert log.completed_session_ids() == set()
    assert log.latest_statuses()["s1"] == "failed"


def test_state_log_only_completed_is_skippable(tmp_path: Path) -> None:
    log = StateLog(tmp_path / "log.jsonl")
    log.record("s1", SessionState.STARTED)
    log.record("s1", SessionState.STAGED)
    log.record("s1", SessionState.VERIFIED)
    log.record("s1", SessionState.SWAPPED)
    log.record("s1", SessionState.COMPLETED)

    assert log.completed_session_ids() == {"s1"}


def test_build_discovery_report_skips_only_completed(tmp_path: Path) -> None:
    t1 = TargetSession(
        season=2023,
        event_name="A",
        round_number=1,
        session_type=SessionType.RACE,
        session_id="s1",
        live_dir=tmp_path / "s1",
    )
    t2 = TargetSession(
        season=2023,
        event_name="B",
        round_number=2,
        session_type=SessionType.RACE,
        session_id="s2",
        live_dir=tmp_path / "s2",
    )
    state_log = StateLog(tmp_path / "state.jsonl")
    state_log.record("s1", SessionState.STARTED)
    state_log.record("s1", SessionState.COMPLETED)
    state_log.record("s2", SessionState.STARTED)
    state_log.record("s2", SessionState.FAILED, detail="boom")

    report = build_discovery_report([t1, t2], [t1, t2], state_log)

    assert report.already_completed == [t1]
    assert report.remaining == [t2]  # a FAILED session is retried, never silently skipped


# --- Verification ------------------------------------------------------------


def test_verify_session_passes_for_correct_backfill(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    data = _normalized_data(target)
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert result.passed, result.failures


def test_verify_session_accepts_zero_grid_position(tmp_path: Path) -> None:
    # Real FastF1 convention: grid_position=0 means "started from the pit
    # lane, no assigned grid slot" -- confirmed against real 2020 Styrian
    # Grand Prix data (driver GRO). Not corruption.
    target = _target_and_live(tmp_path)
    data = _normalized_data(target, mutate_driver={"grid_position": 0})
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert result.passed, result.failures


def test_verify_session_accepts_empty_track_status(tmp_path: Path) -> None:
    # Real FastF1 convention: an empty string on lap 1 means "no status
    # recorded yet" -- confirmed against real 2020 Eifel Grand Prix data
    # (23/1019 laps, concentrated on lap_number == 1). Not corruption.
    target = _target_and_live(tmp_path)
    data = _normalized_data(target, mutate_lap={"track_status": ""})
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert result.passed, result.failures


def test_verify_session_fails_on_row_count_change(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    data = _normalized_data(target)
    extra_driver = Driver(
        session_id=target.session_id,
        driver_id="HAM",
        driver_number=44,
        full_name="Lewis Hamilton",
        team_name="Mercedes",
        classified_position="2",
        grid_position=2,
        status="Finished",
        points=18.0,
    )
    data = data.model_copy(update={"drivers": [*data.drivers, extra_driver]})
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert not result.passed
    assert any("row count changed" in f for f in result.failures)


def test_verify_session_fails_on_non_target_column_drift(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    data = _normalized_data(target, mutate_driver={"full_name": "Someone Else"})
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert not result.passed
    assert any("full_name" in f for f in result.failures)


def test_verify_session_fails_when_position_leaks_outside_m35_scope(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path, session_type=SessionType.QUALIFYING)
    data = _normalized_data(target, m34=False, m35=True)  # Qualifying: FastF1 never gives position
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert not result.passed
    assert any("M35-applicable" in f for f in result.failures)


def test_verify_session_fails_when_classification_leaks_outside_m34_scope(tmp_path: Path) -> None:
    # Empirically confirmed against real cached FastF1 data during Stage C's
    # trial run: Qualifying/Sprint Qualifying never get classification data,
    # in any era -- contrary to normalize.py's docstring claim.
    target = _target_and_live(tmp_path, session_type=SessionType.QUALIFYING)
    data = _normalized_data(target, m34=True, m35=False)
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert not result.passed
    assert any("M34-applicable" in f for f in result.failures)


def test_verify_session_passes_for_qualifying_with_correctly_empty_classification(
    tmp_path: Path,
) -> None:
    target = _target_and_live(tmp_path, session_type=SessionType.QUALIFYING)
    data = _normalized_data(target, m34=False, m35=False, m36=True)
    staged = write_session_cache(data, base_dir=tmp_path / "staging")

    result = verify_session(target, staged)

    assert result.passed, result.failures


def test_verify_session_fails_on_missing_files(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    staged = tmp_path / "staging" / "incomplete"
    staged.mkdir(parents=True)
    (staged / "session.parquet").write_bytes(b"")

    result = verify_session(target, staged)

    assert not result.passed


# --- Atomic swap / rollback ---------------------------------------------------


def test_atomic_swap_moves_new_into_place_and_preserves_old(tmp_path: Path) -> None:
    live = tmp_path / "live"
    live.mkdir()
    (live / "f.txt").write_text("old")
    staged = tmp_path / "staged"
    staged.mkdir()
    (staged / "f.txt").write_text("new")
    backup = tmp_path / "backup" / "sess"

    _atomic_swap(live, staged, backup)

    assert (live / "f.txt").read_text() == "new"
    assert (backup / "f.txt").read_text() == "old"
    assert not staged.exists()


def test_atomic_swap_refuses_to_overwrite_existing_backup(tmp_path: Path) -> None:
    live = tmp_path / "live"
    live.mkdir()
    staged = tmp_path / "staged"
    staged.mkdir()
    backup = tmp_path / "backup" / "sess"
    backup.mkdir(parents=True)

    with pytest.raises(RuntimeError, match="already exists"):
        _atomic_swap(live, staged, backup)
    assert live.exists()  # untouched -- refused before any rename


def test_atomic_swap_restores_original_if_second_rename_fails(tmp_path: Path) -> None:
    live = tmp_path / "live"
    live.mkdir()
    (live / "f.txt").write_text("old")
    staged = tmp_path / "does_not_exist"  # forces the second os.rename to fail
    backup = tmp_path / "backup" / "sess"

    with pytest.raises(FileNotFoundError):
        _atomic_swap(live, staged, backup)

    assert live.exists()
    assert (live / "f.txt").read_text() == "old"
    assert not backup.exists()


# --- process_session (end-to-end per-session pipeline, mocked provider) ----


def test_process_session_completes_and_swaps(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    provider = MagicMock()
    provider.load_session.return_value = _normalized_data(target)
    state_log = StateLog(tmp_path / "state.jsonl")

    result = process_session(
        target,
        provider=provider,
        staging_dir=tmp_path / "staging",
        backup_dir=tmp_path / "backup",
        state_log=state_log,
    )

    assert result.outcome is SessionOutcome.COMPLETED
    new_drivers = pd.read_parquet(target.live_dir / "drivers.parquet")
    assert new_drivers.iloc[0]["classified_position"] == "1"
    new_laps = pd.read_parquet(target.live_dir / "laps.parquet")
    assert new_laps.iloc[0]["track_status"] == "1"
    assert (
        tmp_path / "backup" / target.session_id / "drivers.parquet"
    ).is_file()  # rollback copy retained
    assert state_log.completed_session_ids() == {target.session_id}


def test_process_session_fails_closed_on_non_target_drift_and_preserves_live(
    tmp_path: Path,
) -> None:
    target = _target_and_live(tmp_path)
    provider = MagicMock()
    provider.load_session.return_value = _normalized_data(
        target, mutate_driver={"full_name": "Someone Else"}
    )
    state_log = StateLog(tmp_path / "state.jsonl")
    original_drivers = pd.read_parquet(target.live_dir / "drivers.parquet")

    result = process_session(
        target,
        provider=provider,
        staging_dir=tmp_path / "staging",
        backup_dir=tmp_path / "backup",
        state_log=state_log,
    )

    assert result.outcome is SessionOutcome.FAILED
    assert "full_name" in (result.detail or "")
    live_drivers = pd.read_parquet(target.live_dir / "drivers.parquet")
    pd.testing.assert_frame_equal(live_drivers, original_drivers)
    assert not (tmp_path / "backup" / target.session_id).exists()
    assert state_log.completed_session_ids() == set()


def test_process_session_cleans_up_staging_on_verification_failure(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    provider = MagicMock()
    provider.load_session.return_value = _normalized_data(
        target, mutate_driver={"full_name": "Wrong Name"}
    )
    state_log = StateLog(tmp_path / "state.jsonl")
    staging_root = tmp_path / "staging"

    process_session(
        target,
        provider=provider,
        staging_dir=staging_root,
        backup_dir=tmp_path / "backup",
        state_log=state_log,
    )

    assert not any(staging_root.rglob("*.parquet"))


def test_process_session_handles_missing_cache_without_touching_live(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    provider = MagicMock()
    provider.load_session.side_effect = RuntimeError("cache miss: only_if_cached is set")
    state_log = StateLog(tmp_path / "state.jsonl")
    original_files = {p.name for p in target.live_dir.iterdir()}

    result = process_session(
        target,
        provider=provider,
        staging_dir=tmp_path / "staging",
        backup_dir=tmp_path / "backup",
        state_log=state_log,
    )

    assert result.outcome is SessionOutcome.FAILED
    assert "cache miss" in (result.detail or "")
    assert {p.name for p in target.live_dir.iterdir()} == original_files
    assert not (tmp_path / "backup" / target.session_id).exists()
    assert state_log.latest_statuses()[target.session_id] == "failed"


def test_process_session_rejects_session_id_mismatch(tmp_path: Path) -> None:
    target = _target_and_live(tmp_path)
    provider = MagicMock()
    data = _normalized_data(target)
    wrong_session = data.session.model_copy(update={"session_id": "2023_different_event_race"})
    provider.load_session.return_value = data.model_copy(update={"session": wrong_session})
    state_log = StateLog(tmp_path / "state.jsonl")

    result = process_session(
        target,
        provider=provider,
        staging_dir=tmp_path / "staging",
        backup_dir=tmp_path / "backup",
        state_log=state_log,
    )

    assert result.outcome is SessionOutcome.FAILED
    assert "safety check failed" in (result.detail or "")
    assert not (tmp_path / "backup" / target.session_id).exists()


# --- Aggregate final verification --------------------------------------------


def test_aggregate_verify_reports_population_and_integrity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(backfill_m38, "TARGET_SEASONS", (2023,))
    monkeypatch.setattr(backfill_m38, "EXPECTED_TOTAL", 1)
    monkeypatch.setattr(
        backfill_m38,
        "EXPECTED_COUNTS_BY_TYPE",
        {
            SessionType.RACE: 1,
            SessionType.QUALIFYING: 0,
            SessionType.SPRINT: 0,
            SessionType.SPRINT_QUALIFYING: 0,
        },
    )
    target = _target_and_live(tmp_path)
    data = _normalized_data(target)
    staged = write_session_cache(data, base_dir=tmp_path / "staging")
    backup_dir = tmp_path / "backup"
    _atomic_swap(target.live_dir, staged, backup_dir / target.session_id)

    report = aggregate_verify(tmp_path, backup_dir)

    assert report.population_ok
    assert report.total_session_dirs == 1
    assert report.target_session_dirs == 1
    assert report.non_target_session_dirs == 0
    assert report.per_session_failures == {}
    assert report.passed


# --- CLI dry-run: zero loads, zero writes ------------------------------------


def test_main_dry_run_performs_zero_loads_and_zero_writes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(backfill_m38, "TARGET_SEASONS", (2023,))
    monkeypatch.setattr(backfill_m38, "EXPECTED_TOTAL", 1)
    monkeypatch.setattr(
        backfill_m38,
        "EXPECTED_COUNTS_BY_TYPE",
        {
            SessionType.RACE: 1,
            SessionType.QUALIFYING: 0,
            SessionType.SPRINT: 0,
            SessionType.SPRINT_QUALIFYING: 0,
        },
    )
    processed_dir = tmp_path / "processed"
    _target_and_live(processed_dir)

    def _boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("load_session must not be called during --dry-run")

    monkeypatch.setattr(FastF1Provider, "load_session", _boom)
    state_log_path = tmp_path / "state" / "log.jsonl"

    backfill_m38.main(
        [
            "--season",
            "2023",
            "--dry-run",
            "--processed-dir",
            str(processed_dir),
            "--staging-dir",
            str(tmp_path / "staging"),
            "--backup-dir",
            str(tmp_path / "backup"),
            "--state-log",
            str(state_log_path),
            "--fastf1-cache-dir",
            str(tmp_path / "cache"),
        ]
    )

    assert not state_log_path.exists()
    assert not (tmp_path / "staging").exists()
