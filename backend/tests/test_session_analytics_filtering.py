"""Tests for app/services/session_analytics/filtering.py."""

from app.services.session_analytics.filtering import (
    classify_lap,
    filter_for_aggregate_stats,
    filter_valid_laps,
)
from tests.lap_comparison_fixtures import lap


def test_classify_lap_uses_is_accurate_for_validity() -> None:
    assert classify_lap(lap(is_accurate=True)).is_valid is True
    assert classify_lap(lap(is_accurate=False)).is_valid is False


def test_classify_lap_exclusion_reason_is_always_none_today() -> None:
    """No track-status/yellow-flag data exists anywhere in the schema
    (Phase 0 finding, plan §0.2 Q3) -- exclusion_reason must never be
    fabricated, regardless of the lap's own accuracy.
    """
    assert classify_lap(lap(is_accurate=True)).exclusion_reason is None
    assert classify_lap(lap(is_accurate=False)).exclusion_reason is None


def test_filter_valid_laps_keeps_only_accurate_laps() -> None:
    laps = [
        lap(lap_number=1, is_accurate=True),
        lap(lap_number=2, is_accurate=False),
        lap(lap_number=3, is_accurate=True),
    ]

    valid = filter_valid_laps(laps)

    assert [lap_.lap_number for lap_ in valid] == [1, 3]


def test_filter_valid_laps_does_not_mutate_or_drop_from_the_caller_s_list() -> None:
    """Filtering must never silently shrink the caller's own list -- only
    the returned subset changes; the input list itself is untouched, and
    an excluded lap is still addressable by the caller (aggregation.py
    relies on this to keep every lap in its per-driver lap list, valid or
    not -- see test_session_analytics_aggregation.py).
    """
    laps = [lap(lap_number=1, is_accurate=True), lap(lap_number=2, is_accurate=False)]
    original_length = len(laps)

    filter_valid_laps(laps)

    assert len(laps) == original_length


def test_filter_for_aggregate_stats_matches_filter_valid_laps_today() -> None:
    """Yellow-flag exclusion is a no-op today (Phase 0 finding, plan §0.2
    Q3), so the two filters must produce identical results until
    track-status data exists.
    """
    laps = [
        lap(lap_number=1, is_accurate=True),
        lap(lap_number=2, is_accurate=False),
        lap(lap_number=3, is_accurate=True),
    ]

    assert filter_for_aggregate_stats(laps) == filter_valid_laps(laps)


def test_filter_functions_return_empty_list_for_no_laps() -> None:
    assert filter_valid_laps([]) == []
    assert filter_for_aggregate_stats([]) == []
