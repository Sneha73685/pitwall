"""Unit tests for ParquetRepository against a synthetic Parquet cache."""

from pathlib import Path

import pandas as pd

from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import write_minimal_session


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
