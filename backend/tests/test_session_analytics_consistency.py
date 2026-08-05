"""Tests for app/services/session_analytics/consistency.py."""

import statistics

import pytest

from app.services.session_analytics.consistency import (
    consistency_cv,
    consistency_ms,
    detect_outliers,
)


def test_consistency_ms_matches_hand_computed_population_stddev() -> None:
    lap_times_ms = [90000.0, 90500.0, 91000.0, 90200.0]

    result = consistency_ms(lap_times_ms)

    assert result == pytest.approx(statistics.pstdev(lap_times_ms))


def test_consistency_cv_matches_hand_computed_ratio() -> None:
    lap_times_ms = [90000.0, 90500.0, 91000.0, 90200.0]

    result = consistency_cv(lap_times_ms)

    expected = statistics.pstdev(lap_times_ms) / statistics.fmean(lap_times_ms)
    assert result == pytest.approx(expected)


def test_consistency_is_none_not_zero_for_a_single_lap() -> None:
    assert consistency_ms([90000.0]) is None
    assert consistency_cv([90000.0]) is None


def test_consistency_is_none_for_zero_laps() -> None:
    assert consistency_ms([]) is None
    assert consistency_cv([]) is None


def test_detect_outliers_flags_a_planted_slow_side_outlier() -> None:
    # A tight cluster around 90000ms plus one dramatically slower lap.
    lap_times_ms = [90000.0, 90050.0, 89950.0, 90100.0, 89900.0, 120000.0]

    outliers = detect_outliers(lap_times_ms)

    assert outliers == [False, False, False, False, False, True]


def test_detect_outliers_flags_a_planted_fast_side_outlier() -> None:
    # A tight cluster around 90000ms plus one dramatically faster lap
    # (e.g. a data glitch) -- both directions must be checked independently.
    lap_times_ms = [90000.0, 90050.0, 89950.0, 90100.0, 89900.0, 60000.0]

    outliers = detect_outliers(lap_times_ms)

    assert outliers == [False, False, False, False, False, True]


def test_detect_outliers_flags_nothing_for_a_tight_cluster() -> None:
    lap_times_ms = [90000.0, 90050.0, 89950.0, 90100.0, 89900.0]

    assert detect_outliers(lap_times_ms) == [False] * len(lap_times_ms)


def test_detect_outliers_returns_all_false_for_fewer_than_two_laps() -> None:
    assert detect_outliers([]) == []
    assert detect_outliers([90000.0]) == [False]
