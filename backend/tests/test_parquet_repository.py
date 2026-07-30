"""Unit tests for ParquetRepository against a synthetic Parquet cache."""

from pathlib import Path

from app.repositories.parquet_repository import ParquetRepository


def test_list_sessions_returns_ingested_session(session_cache_dir: Path) -> None:
    repo = ParquetRepository(session_cache_dir)

    sessions = repo.list_sessions()

    assert len(sessions) == 1
    assert sessions[0].session_id == "2023_monza_race"
    assert sessions[0].season == 2023


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
