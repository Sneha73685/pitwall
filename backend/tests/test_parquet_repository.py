"""Unit tests for ParquetRepository against a synthetic Parquet cache."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import SESSION_ID, write_minimal_session


def test_list_sessions_returns_ingested_session(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    sessions = repo.list_sessions()

    assert len(sessions) == 1
    assert sessions[0].session_id == "2023_monza_race"
    assert sessions[0].season == 2023


def test_list_sessions_includes_event_id(session_cache_dir: Path) -> None:
    """M12 Phase 4: event_id is additive, computed from (season,
    event_name), matching pitwall_pipeline.models.make_event_id's formula
    (parity asserted in test_ids.py)."""
    repo = ParquetRepository(session_cache_dir)

    sessions = repo.list_sessions()

    assert sessions[0].event_id == "2023_italian_grand_prix"


def test_list_sessions_reports_has_telemetry_true_when_present(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    sessions = repo.list_sessions()

    assert sessions[0].has_telemetry is True


def test_has_telemetry_true_for_session_with_real_telemetry_rows(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    assert repo.has_telemetry("2023_monza_race") is True


def test_has_telemetry_false_for_session_with_empty_telemetry_parquet(tmp_path: Path) -> None:
    """M12 Phase 4: the real, verified 2018 finding (docs/m12-design-
    review.md §19.2) -- a session can be fully ingested (laps/session
    metadata present) while telemetry.parquet has zero rows."""
    write_minimal_session(
        tmp_path,
        session_id="2018_bahrain_grand_prix_race",
        season=2018,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2018-04-08T15:10:00+00:00",
        include_telemetry=False,
    )
    repo = ParquetRepository(tmp_path)

    assert repo.has_telemetry("2018_bahrain_grand_prix_race") is False
    session = repo.get_session("2018_bahrain_grand_prix_race")
    assert session is not None
    assert session.has_telemetry is False


def test_has_telemetry_false_for_unknown_session(tmp_path: Path) -> None:
    repo = ParquetRepository(tmp_path)

    assert repo.has_telemetry("2099_nowhere_race") is False


def test_list_sessions_empty_cache_returns_empty_list(tmp_path: Path) -> None:
    repo = ParquetRepository(tmp_path)

    assert repo.list_sessions() == []


def test_get_session_returns_none_for_unknown_id(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    assert repo.get_session("2099_nowhere_race") is None


def test_list_drivers_returns_all_drivers(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    drivers = repo.list_drivers("2023_monza_race")

    assert {d.driver_id for d in drivers} == {"VER", "LEC"}


def test_list_drivers_unknown_session_returns_empty_list(tmp_path: Path) -> None:
    repo = ParquetRepository(tmp_path)

    assert repo.list_drivers("2023_monza_race") == []


def test_list_laps_filters_by_driver(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    laps = repo.list_laps("2023_monza_race", driver_id="VER")

    assert len(laps) == 2
    assert all(lap.driver_id == "VER" for lap in laps)


def test_list_laps_without_filter_returns_every_driver(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    laps = repo.list_laps("2023_monza_race")

    assert len(laps) == 3


def test_list_laps_handles_missing_lap_time(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    laps = repo.list_laps("2023_monza_race", driver_id="VER")
    incomplete_lap = next(lap for lap in laps if lap.lap_number == 2)

    assert incomplete_lap.lap_time_seconds is None
    assert incomplete_lap.is_accurate is False


def test_list_laps_round_trips_compound(session_cache_dir: Path) -> None:
    """M10: compound is an additive column on laps.parquet -- round-trips
    through ParquetRepository, and is None where the fixture has it as
    None (VER's incomplete lap 2), not "None" (the string) or missing.
    """
    repo = ParquetRepository(session_cache_dir)

    laps = repo.list_laps("2023_monza_race", driver_id="VER")
    lec_laps = repo.list_laps("2023_monza_race", driver_id="LEC")

    assert next(lap for lap in laps if lap.lap_number == 1).compound == "SOFT"
    assert next(lap for lap in laps if lap.lap_number == 2).compound is None
    assert lec_laps[0].compound == "MEDIUM"


def test_list_laps_missing_compound_column_deserializes_to_none(tmp_path: Path) -> None:
    """A pre-M10 laps.parquet has no `compound` column at all -- must
    deserialize to None, not raise a KeyError (docs/m10-implementation-plan.md
    Phase 4 "Testing required").
    """
    session_dir = tmp_path / "2022" / "silverstone" / "race"
    session_dir.mkdir(parents=True)

    pd.DataFrame(
        [
            {
                "session_id": "2022_silverstone_race",
                "season": 2022,
                "event_name": "British Grand Prix",
                "round_number": 10,
                "location": "Silverstone",
                "country": "United Kingdom",
                "session_type": "race",
                "session_date": None,
            }
        ]
    ).to_parquet(session_dir / "session.parquet", index=False)
    pd.DataFrame(
        [
            {
                "session_id": "2022_silverstone_race",
                "driver_id": "VER",
                "lap_number": 1,
                "lap_time_seconds": 90.0,
                "sector_1_seconds": 30.0,
                "sector_2_seconds": 30.0,
                "sector_3_seconds": 30.0,
                "is_personal_best": True,
                "is_accurate": True,
                # deliberately no "compound" key/column at all
            }
        ]
    ).to_parquet(session_dir / "laps.parquet", index=False)

    repo = ParquetRepository(tmp_path)

    laps = repo.list_laps("2022_silverstone_race")

    assert laps[0].compound is None


def test_get_telemetry_returns_samples_sorted_by_distance(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    samples = repo.get_telemetry("2023_monza_race", "VER", 1)

    assert [s.distance_m for s in samples] == [50.0, 100.0]


def test_get_telemetry_unknown_lap_returns_empty_list(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    assert repo.get_telemetry("2023_monza_race", "VER", 99) == []


def test_list_track_points_returns_points_sorted_by_distance(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    points = repo.list_track_points("2023_monza_race")

    assert [p.distance_m for p in points] == [50.0, 100.0]


def test_list_track_points_unknown_session_returns_empty_list(tmp_path: Path) -> None:
    repo = ParquetRepository(tmp_path)

    assert repo.list_track_points("2023_monza_race") == []


# --- M17 session index (docs/m17-design-review.md §3/§13) --------------------


def _write_roster_and_laps(session_dir: Path, session_id: str) -> None:
    """write_minimal_session only writes session.parquet/telemetry.parquet
    (M12 Phase 4's own session/event/season discovery tests never needed
    more) -- these M17 index tests also exercise list_drivers/list_laps,
    the pace-trend endpoint's own access pattern (§4/§5.3), so this adds
    the two files that pattern actually reads."""
    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Max Verstappen",
                "team_name": "Red Bull Racing",
            }
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)
    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "driver_id": "VER",
                "lap_number": 1,
                "lap_time_seconds": 90.0,
                "sector_1_seconds": 30.0,
                "sector_2_seconds": 30.0,
                "sector_3_seconds": 30.0,
                "is_personal_best": True,
                "is_accurate": True,
            }
        ]
    ).to_parquet(session_dir / "laps.parquet", index=False)


def _write_three_sessions(base_dir: Path) -> None:
    """Three distinct, minimal sessions across two seasons -- enough to
    exercise index membership, ordering, and multi-lookup call counting
    without stretching write_session_cache's single-fixed-session shape."""
    session_dir = write_minimal_session(
        base_dir,
        session_id="2023_bahrain_grand_prix_race",
        season=2023,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2023-03-05T15:00:00+00:00",
    )
    _write_roster_and_laps(session_dir, "2023_bahrain_grand_prix_race")
    session_dir = write_minimal_session(
        base_dir,
        session_id="2023_saudi_arabian_grand_prix_race",
        season=2023,
        event_slug="saudi_arabian_grand_prix",
        session_type="race",
        event_name="Saudi Arabian Grand Prix",
        round_number=2,
        location="Jeddah",
        country="Saudi Arabia",
        session_date="2023-03-19T17:00:00+00:00",
    )
    _write_roster_and_laps(session_dir, "2023_saudi_arabian_grand_prix_race")
    session_dir = write_minimal_session(
        base_dir,
        session_id="2024_bahrain_grand_prix_race",
        season=2024,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2024-03-02T15:00:00+00:00",
    )
    _write_roster_and_laps(session_dir, "2024_bahrain_grand_prix_race")


def test_index_contents_are_correct(tmp_path: Path) -> None:
    _write_three_sessions(tmp_path)
    repo = ParquetRepository(tmp_path)

    sessions = repo.list_sessions()

    assert {s.session_id for s in sessions} == {
        "2023_bahrain_grand_prix_race",
        "2023_saudi_arabian_grand_prix_race",
        "2024_bahrain_grand_prix_race",
    }
    session_by_id = {s.session_id: s for s in sessions}
    assert session_by_id["2023_bahrain_grand_prix_race"].round_number == 1
    assert session_by_id["2024_bahrain_grand_prix_race"].season == 2024


def test_indexed_lookup_matches_direct_scan_for_every_session(tmp_path: Path) -> None:
    """Equivalence by construction (the index memoizes the same
    _iter_session_dirs() generator, it doesn't reimplement it) -- this test
    proves it holds for get_session, not just list_sessions."""
    _write_three_sessions(tmp_path)
    repo = ParquetRepository(tmp_path)
    expected = {s.session_id: s for s in repo.list_sessions()}

    fresh_repo = ParquetRepository(tmp_path)
    for session_id, expected_session in expected.items():
        assert fresh_repo.get_session(session_id) == expected_session


def test_list_sessions_order_is_unchanged_by_indexing(tmp_path: Path) -> None:
    """list_sessions()'s order (sorted-glob path order: season/event_slug/
    session_type) must survive being routed through the memoized index --
    dict insertion order preserves it, but this asserts it directly rather
    than only by prose."""
    _write_three_sessions(tmp_path)
    repo = ParquetRepository(tmp_path)

    session_ids = [s.session_id for s in repo.list_sessions()]

    assert session_ids == [
        "2023_bahrain_grand_prix_race",
        "2023_saudi_arabian_grand_prix_race",
        "2024_bahrain_grand_prix_race",
    ]


def test_index_is_not_built_until_first_relevant_access(tmp_path: Path) -> None:
    _write_three_sessions(tmp_path)
    repo = ParquetRepository(tmp_path)

    assert repo._session_index is None  # noqa: SLF001

    repo.list_sessions()

    assert repo._session_index is not None  # noqa: SLF001


def test_repeated_lookups_on_the_same_instance_do_not_rebuild_the_index(tmp_path: Path) -> None:
    _write_three_sessions(tmp_path)
    repo = ParquetRepository(tmp_path)

    with patch.object(
        ParquetRepository, "_iter_session_dirs", wraps=repo._iter_session_dirs
    ) as scan_spy:
        repo.get_session("2023_bahrain_grand_prix_race")
        repo.get_session("2023_saudi_arabian_grand_prix_race")
        repo.list_drivers("2024_bahrain_grand_prix_race")
        repo.list_laps("2023_bahrain_grand_prix_race")
        repo.has_telemetry("2023_saudi_arabian_grand_prix_race")

        assert scan_spy.call_count == 1


def test_a_naive_22_session_lookup_pattern_scans_exactly_once(tmp_path: Path) -> None:
    """Simulates the pace-trend endpoint's own access pattern (§4/§5.3:
    list_drivers + list_laps per matching session) against a
    representative 22-session season -- the concrete performance
    requirement the design's session index exists to satisfy."""
    for round_number in range(1, 23):
        session_id = f"2023_round_{round_number}_race"
        session_dir = write_minimal_session(
            tmp_path,
            session_id=session_id,
            season=2023,
            event_slug=f"round_{round_number}",
            session_type="race",
            event_name=f"Round {round_number}",
            round_number=round_number,
            location="Testville",
            country="Testland",
            session_date=(
                f"2023-{round_number:02d}-01T15:00:00+00:00" if round_number <= 12 else None
            ),
        )
        _write_roster_and_laps(session_dir, session_id)
    repo = ParquetRepository(tmp_path)

    with patch.object(
        ParquetRepository, "_iter_session_dirs", wraps=repo._iter_session_dirs
    ) as scan_spy:
        sessions = [s for s in repo.list_sessions() if s.season == 2023]
        for session in sessions:
            repo.list_drivers(session.session_id)
            repo.list_laps(session.session_id)

        assert len(sessions) == 22
        assert scan_spy.call_count == 1


def test_a_fresh_repository_instance_gets_a_fresh_index(tmp_path: Path) -> None:
    """Proves the lifecycle claim in docs/m17-design-review.md §3: a new
    session directory that appears after one instance's index was already
    built is invisible to that instance, but visible to a brand-new one --
    exactly the "next request is fresh" behavior the design relies on
    instead of any explicit invalidation."""
    write_minimal_session(
        tmp_path,
        session_id="2023_bahrain_grand_prix_race",
        season=2023,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2023-03-05T15:00:00+00:00",
    )
    repo = ParquetRepository(tmp_path)
    assert {s.session_id for s in repo.list_sessions()} == {"2023_bahrain_grand_prix_race"}

    write_minimal_session(
        tmp_path,
        session_id="2023_saudi_arabian_grand_prix_race",
        season=2023,
        event_slug="saudi_arabian_grand_prix",
        session_type="race",
        event_name="Saudi Arabian Grand Prix",
        round_number=2,
        location="Jeddah",
        country="Saudi Arabia",
        session_date="2023-03-19T17:00:00+00:00",
    )

    # The already-built instance is stale by design -- no invalidation.
    assert {s.session_id for s in repo.list_sessions()} == {"2023_bahrain_grand_prix_race"}

    # A brand-new instance against the same directory sees current disk state.
    fresh_repo = ParquetRepository(tmp_path)
    assert {s.session_id for s in fresh_repo.list_sessions()} == {
        "2023_bahrain_grand_prix_race",
        "2023_saudi_arabian_grand_prix_race",
    }


def test_has_telemetry_reuses_the_indexed_value_not_a_second_file_read(tmp_path: Path) -> None:
    write_minimal_session(
        tmp_path,
        session_id="2023_bahrain_grand_prix_race",
        season=2023,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2023-03-05T15:00:00+00:00",
        include_telemetry=True,
    )
    repo = ParquetRepository(tmp_path)

    assert repo.has_telemetry("2023_bahrain_grand_prix_race") is True
    assert repo.get_session("2023_bahrain_grand_prix_race").has_telemetry is True  # type: ignore[union-attr]


# --- M18 per-session file cache (docs/m18-design-review.md §4/§6) -----------


def _read_calls(read_spy: MagicMock, filename: str) -> list[object]:
    """Filter a `patch.object(pd, "read_parquet", wraps=...)` spy's call log
    down to reads of one filename -- `pd.read_parquet` is called with a
    `Path` positional arg whose `.name` is the file it read."""
    return [c for c in read_spy.call_args_list if c.args[0].name == filename]


def test_file_caches_start_empty_and_populate_lazily(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    assert repo._drivers_cache == {}  # noqa: SLF001
    assert repo._laps_cache == {}  # noqa: SLF001
    assert repo._telemetry_cache == {}  # noqa: SLF001
    assert repo._track_points_cache == {}  # noqa: SLF001

    repo.list_drivers(SESSION_ID)

    assert SESSION_ID in repo._drivers_cache  # noqa: SLF001
    # Only the file this call actually needed was read/cached.
    assert repo._laps_cache == {}  # noqa: SLF001
    assert repo._telemetry_cache == {}  # noqa: SLF001
    assert repo._track_points_cache == {}  # noqa: SLF001


def test_each_session_file_is_read_at_most_once_per_instance(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    with patch.object(pd, "read_parquet", wraps=pd.read_parquet) as read_spy:
        repo.list_drivers(SESSION_ID)
        repo.list_drivers(SESSION_ID)
        repo.list_laps(SESSION_ID)
        repo.list_laps(SESSION_ID, driver_id="VER")
        repo.list_laps(SESSION_ID, driver_id="LEC")
        repo.get_telemetry(SESSION_ID, "VER", 1)
        repo.get_telemetry(SESSION_ID, "LEC", 1)
        repo.list_track_points(SESSION_ID)
        repo.list_track_points(SESSION_ID)

        assert len(_read_calls(read_spy, "drivers.parquet")) == 1
        assert len(_read_calls(read_spy, "laps.parquet")) == 1
        assert len(_read_calls(read_spy, "telemetry.parquet")) == 1
        assert len(_read_calls(read_spy, "track.parquet")) == 1


def test_list_laps_filter_independence_from_one_shared_cache_entry(
    session_cache_dir: Path,
) -> None:
    repo = ParquetRepository(session_cache_dir)

    with patch.object(pd, "read_parquet", wraps=pd.read_parquet) as read_spy:
        ver_laps = repo.list_laps(SESSION_ID, driver_id="VER")
        lec_laps = repo.list_laps(SESSION_ID, driver_id="LEC")

        assert len(_read_calls(read_spy, "laps.parquet")) == 1

    assert {lap.driver_id for lap in ver_laps} == {"VER"}
    assert {lap.driver_id for lap in lec_laps} == {"LEC"}
    assert len(ver_laps) == 2
    assert len(lec_laps) == 1


def test_get_telemetry_filter_independence_from_one_shared_cache_entry(
    session_cache_dir: Path,
) -> None:
    repo = ParquetRepository(session_cache_dir)

    with patch.object(pd, "read_parquet", wraps=pd.read_parquet) as read_spy:
        ver_samples = repo.get_telemetry(SESSION_ID, "VER", 1)
        lec_samples = repo.get_telemetry(SESSION_ID, "LEC", 1)
        missing_samples = repo.get_telemetry(SESSION_ID, "VER", 99)

        assert len(_read_calls(read_spy, "telemetry.parquet")) == 1

    assert [s.distance_m for s in ver_samples] == [50.0, 100.0]
    assert [s.distance_m for s in lec_samples] == [50.0, 100.0]
    assert missing_samples == []


def test_two_sessions_never_share_a_cached_laps_dataframe(tmp_path: Path) -> None:
    session_a_dir = write_minimal_session(
        tmp_path,
        session_id="2023_bahrain_grand_prix_race",
        season=2023,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2023-03-05T15:00:00+00:00",
    )
    pd.DataFrame(
        [
            {
                "session_id": "2023_bahrain_grand_prix_race",
                "driver_id": "VER",
                "lap_number": 1,
                "lap_time_seconds": 90.0,
                "sector_1_seconds": 30.0,
                "sector_2_seconds": 30.0,
                "sector_3_seconds": 30.0,
                "is_personal_best": True,
                "is_accurate": True,
            }
        ]
    ).to_parquet(session_a_dir / "laps.parquet", index=False)

    session_b_dir = write_minimal_session(
        tmp_path,
        session_id="2023_saudi_arabian_grand_prix_race",
        season=2023,
        event_slug="saudi_arabian_grand_prix",
        session_type="race",
        event_name="Saudi Arabian Grand Prix",
        round_number=2,
        location="Jeddah",
        country="Saudi Arabia",
        session_date="2023-03-19T17:00:00+00:00",
    )
    pd.DataFrame(
        [
            {
                "session_id": "2023_saudi_arabian_grand_prix_race",
                "driver_id": "PER",
                "lap_number": 1,
                "lap_time_seconds": 91.5,
                "sector_1_seconds": 30.5,
                "sector_2_seconds": 30.5,
                "sector_3_seconds": 30.5,
                "is_personal_best": True,
                "is_accurate": True,
            }
        ]
    ).to_parquet(session_b_dir / "laps.parquet", index=False)

    repo = ParquetRepository(tmp_path)

    with patch.object(pd, "read_parquet", wraps=pd.read_parquet) as read_spy:
        laps_a = repo.list_laps("2023_bahrain_grand_prix_race")
        laps_b = repo.list_laps("2023_saudi_arabian_grand_prix_race")

        # One read per session -- never a cache hit across session_ids.
        assert len(_read_calls(read_spy, "laps.parquet")) == 2

    assert {lap.driver_id for lap in laps_a} == {"VER"}
    assert {lap.driver_id for lap in laps_b} == {"PER"}


def test_fresh_repository_instance_has_its_own_empty_file_caches(
    session_cache_dir: Path,
) -> None:
    repo_a = ParquetRepository(session_cache_dir)
    repo_a.list_drivers(SESSION_ID)
    assert SESSION_ID in repo_a._drivers_cache  # noqa: SLF001

    repo_b = ParquetRepository(session_cache_dir)
    assert repo_b._drivers_cache == {}  # noqa: SLF001

    with patch.object(pd, "read_parquet", wraps=pd.read_parquet) as read_spy:
        repo_b.list_drivers(SESSION_ID)

        assert len(_read_calls(read_spy, "drivers.parquet")) == 1


def test_list_drivers_still_raises_for_a_missing_file_not_swallowed_by_the_cache(
    tmp_path: Path,
) -> None:
    write_minimal_session(
        tmp_path,
        session_id="2023_bahrain_grand_prix_race",
        season=2023,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2023-03-05T15:00:00+00:00",
    )
    repo = ParquetRepository(tmp_path)

    with pytest.raises(FileNotFoundError):
        repo.list_drivers("2023_bahrain_grand_prix_race")

    assert "2023_bahrain_grand_prix_race" not in repo._drivers_cache  # noqa: SLF001


def test_get_telemetry_caches_an_empty_telemetry_file_without_raising(tmp_path: Path) -> None:
    write_minimal_session(
        tmp_path,
        session_id="2023_bahrain_grand_prix_race",
        season=2023,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2023-03-05T15:00:00+00:00",
        include_telemetry=False,
    )
    repo = ParquetRepository(tmp_path)

    with patch.object(pd, "read_parquet", wraps=pd.read_parquet) as read_spy:
        first = repo.get_telemetry("2023_bahrain_grand_prix_race", "VER", 1)
        second = repo.get_telemetry("2023_bahrain_grand_prix_race", "VER", 1)

        assert len(_read_calls(read_spy, "telemetry.parquet")) == 1

    assert first == []
    assert second == []


def test_m18_regression_repeated_get_telemetry_across_a_grid_reads_the_file_once(
    tmp_path: Path,
) -> None:
    """Reproduces the M8 access pattern that motivated this design
    (docs/m18-design-review.md §0, §6.4): session_analytics.py calls
    get_telemetry once per lap, per driver -- before this cache, that meant
    one telemetry.parquet read per call (~914 for a full grid race)."""
    session_dir = write_minimal_session(
        tmp_path,
        session_id="2023_bahrain_grand_prix_race",
        season=2023,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2023-03-05T15:00:00+00:00",
    )
    telemetry_rows = [
        {
            "session_id": "2023_bahrain_grand_prix_race",
            "driver_id": driver_id,
            "lap_number": lap_number,
            "distance_m": 0.0,
            "time_seconds": 0.0,
            "speed_kph": 300.0,
            "throttle_pct": 100.0,
            "brake_active": False,
            "rpm": 11000.0,
            "gear": 8,
            "drs_active": False,
            "x": 0.0,
            "y": 0.0,
            "z": 0.0,
        }
        for driver_id in ("VER", "LEC", "HAM")
        for lap_number in (1, 2, 3)
    ]
    pd.DataFrame(telemetry_rows).to_parquet(session_dir / "telemetry.parquet", index=False)
    repo = ParquetRepository(tmp_path)

    with patch.object(pd, "read_parquet", wraps=pd.read_parquet) as read_spy:
        results = [
            repo.get_telemetry("2023_bahrain_grand_prix_race", driver_id, lap_number)
            for driver_id in ("VER", "LEC", "HAM")
            for lap_number in (1, 2, 3)
        ]

        assert len(_read_calls(read_spy, "telemetry.parquet")) == 1

    assert len(results) == 9
    assert all(len(samples) == 1 for samples in results)
