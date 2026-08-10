"""Tests for app/services/tyre_performance/strategy_summary.py."""

from app.services.tyre_performance.strategy_summary import (
    driver_strategy_summary,
    session_compound_usage,
)
from tests.tyre_performance_fixtures import stint


def test_driver_strategy_summary_reports_an_ordered_compound_sequence() -> None:
    stints = [
        stint(stint_number=2, compound="HARD", start_lap=16, end_lap=36),
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=15),
        stint(stint_number=3, compound="SOFT", start_lap=37, end_lap=57),
    ]

    summary = driver_strategy_summary("VER", stints)

    assert summary.driver_id == "VER"
    assert summary.stint_count == 3
    assert summary.compound_sequence == ["SOFT", "HARD", "SOFT"]
    assert summary.stint_lengths == [15, 21, 21]


def test_driver_strategy_summary_handles_a_one_stop_driver() -> None:
    stints = [stint(stint_number=1, compound="MEDIUM", start_lap=1, end_lap=57)]

    summary = driver_strategy_summary("ALB", stints)

    assert summary.stint_count == 1
    assert summary.compound_sequence == ["MEDIUM"]


def test_driver_strategy_summary_handles_no_stints() -> None:
    summary = driver_strategy_summary("SOLO", stints=[])

    assert summary.stint_count == 0
    assert summary.compound_sequence == []
    assert summary.stint_lengths == []


def test_session_compound_usage_counts_stints_drivers_and_laps_per_compound() -> None:
    stints_by_driver = {
        "A": [
            stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=10),
            stint(stint_number=2, compound="HARD", start_lap=11, end_lap=30),
        ],
        "B": [
            stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=12),
            stint(stint_number=2, compound="MEDIUM", start_lap=13, end_lap=25),
            stint(stint_number=3, compound="HARD", start_lap=26, end_lap=40),
        ],
        "C": [
            stint(stint_number=1, compound="MEDIUM", start_lap=1, end_lap=40),
        ],
    }

    usage = session_compound_usage(stints_by_driver)
    by_compound = {u.compound: u for u in usage}

    assert set(by_compound) == {"SOFT", "MEDIUM", "HARD"}
    assert by_compound["SOFT"].stint_count == 2
    assert by_compound["SOFT"].driver_count == 2
    assert by_compound["SOFT"].total_laps == 10 + 12

    assert by_compound["MEDIUM"].stint_count == 2
    assert by_compound["MEDIUM"].driver_count == 2
    assert by_compound["MEDIUM"].total_laps == 13 + 40

    assert by_compound["HARD"].stint_count == 2
    assert by_compound["HARD"].driver_count == 2
    assert by_compound["HARD"].total_laps == 20 + 15


def test_session_compound_usage_is_sorted_alphabetically_not_by_count() -> None:
    stints_by_driver = {
        "A": [stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=10)],
        "B": [stint(stint_number=1, compound="HARD", start_lap=1, end_lap=10)],
    }

    usage = session_compound_usage(stints_by_driver)

    assert [u.compound for u in usage] == ["HARD", "SOFT"]


def test_session_compound_usage_returns_empty_list_for_no_drivers() -> None:
    assert session_compound_usage({}) == []
