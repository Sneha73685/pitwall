"""Tests for app/services/tyre_performance/stint_consistency.py."""

from app.services.session_analytics.consistency import consistency_cv, consistency_ms
from app.services.tyre_performance.boundary_laps import identify_boundary_laps
from app.services.tyre_performance.stint_consistency import (
    stint_consistency,
    stint_consistency_by_stint,
)
from app.services.tyre_performance.stint_join import join_laps_to_stints
from tests.lap_comparison_fixtures import lap
from tests.tyre_performance_fixtures import pit_stop, stint


def test_stint_consistency_is_none_not_zero_for_exactly_one_eligible_lap() -> None:
    laps = [lap(lap_number=1, lap_time_seconds=90.0)]
    positions = join_laps_to_stints(laps, stints=[stint(start_lap=1, end_lap=1)])

    result = stint_consistency(stint_number=1, positions=positions)

    assert result.eligible_lap_count == 1
    assert result.consistency_ms is None
    assert result.consistency_cv is None


def test_stint_consistency_reuses_m8_s_semantics_for_two_or_more_laps() -> None:
    lap_times_seconds = [90.0, 90.5, 91.0, 90.2]
    laps = [lap(lap_number=n + 1, lap_time_seconds=t) for n, t in enumerate(lap_times_seconds)]
    positions = join_laps_to_stints(laps, stints=[stint(start_lap=1, end_lap=4)])

    result = stint_consistency(stint_number=1, positions=positions)

    expected_ms = [t * 1000.0 for t in lap_times_seconds]
    assert result.consistency_ms == consistency_ms(expected_ms)
    assert result.consistency_cv == consistency_cv(expected_ms)


def test_stint_consistency_ignores_a_lap_with_a_missing_lap_time() -> None:
    laps = [
        lap(lap_number=1, lap_time_seconds=90.0),
        lap(lap_number=2, lap_time_seconds=None),
        lap(lap_number=3, lap_time_seconds=90.5),
    ]
    positions = join_laps_to_stints(laps, stints=[stint(start_lap=1, end_lap=3)])

    result = stint_consistency(stint_number=1, positions=positions)

    assert result.eligible_lap_count == 2


def test_stint_consistency_by_stint_omits_a_stint_with_zero_eligible_laps() -> None:
    """Mirrors trend_eligible_by_stint's own 'absent, not empty' convention
    -- HUL's real one-lap stint (docs/m11-design-review.md §3.2) should not
    appear in the result at all."""
    laps = [lap(lap_number=1)] + [lap(lap_number=n) for n in range(2, 5)]
    stints = [
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=1),
        stint(stint_number=2, compound="HARD", start_lap=2, end_lap=4),
    ]
    pit_stops = [pit_stop(stop_number=1, lap_number=1)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops)

    result = stint_consistency_by_stint(positions, boundary)

    assert 1 not in result
    assert 2 in result


def test_stint_consistency_of_an_empty_population_is_none_with_zero_count() -> None:
    result = stint_consistency(stint_number=1, positions=[])

    assert result.eligible_lap_count == 0
    assert result.consistency_ms is None
    assert result.consistency_cv is None
