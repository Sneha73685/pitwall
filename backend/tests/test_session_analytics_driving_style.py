"""Tests for app/services/session_analytics/driving_style.py."""

import pytest

from app.services.session_analytics.driving_style import (
    brake_event_count,
    full_throttle_pct,
    pooled_full_throttle_pct,
)
from tests.lap_comparison_fixtures import sample


def test_full_throttle_pct_matches_hand_computed_percentage() -> None:
    samples = [
        sample(throttle_pct=100.0),
        sample(throttle_pct=99.0),
        sample(throttle_pct=99.5),
        sample(throttle_pct=98.9),  # just under the 99 threshold
        sample(throttle_pct=50.0),
    ]

    assert full_throttle_pct(samples) == pytest.approx(60.0)  # 3 of 5 samples


def test_full_throttle_pct_is_none_for_no_samples() -> None:
    assert full_throttle_pct([]) is None


def test_pooled_full_throttle_pct_is_weighted_by_sample_count_not_mean_of_means() -> None:
    # Lap 1: 1 sample, 100% full throttle. Lap 2: 9 samples, 0% full throttle.
    # Naive mean-of-means would give (100 + 0) / 2 = 50%. Pooled must give
    # 1 full-throttle sample out of 10 total = 10% -- the design's explicit
    # anti-mean-of-means decision (plan §0.5).
    lap_1 = [sample(throttle_pct=100.0)]
    lap_2 = [sample(throttle_pct=0.0) for _ in range(9)]

    result = pooled_full_throttle_pct([lap_1, lap_2])

    assert result == pytest.approx(10.0)
    assert result != pytest.approx(50.0)


def test_pooled_full_throttle_pct_is_none_when_no_laps_have_samples() -> None:
    assert pooled_full_throttle_pct([]) is None
    assert pooled_full_throttle_pct([[], []]) is None


def test_brake_event_count_counts_rising_edges_only() -> None:
    # off, on, on, off, on, off, off, on -> rising edges at indices 1, 4, 7.
    brake_sequence = [False, True, True, False, True, False, False, True]
    samples = [
        sample(time_seconds=float(i), brake_active=active)
        for i, active in enumerate(brake_sequence)
    ]

    assert brake_event_count(samples) == 3


def test_brake_event_count_is_zero_when_never_braking() -> None:
    samples = [sample(time_seconds=float(i), brake_active=False) for i in range(5)]

    assert brake_event_count(samples) == 0


def test_brake_event_count_counts_starting_the_lap_under_braking() -> None:
    # The very first sample being under braking is itself a rising edge
    # from the implicit "not braking at lap start" baseline.
    samples = [sample(time_seconds=float(i), brake_active=True) for i in range(3)]

    assert brake_event_count(samples) == 1


def test_brake_event_count_uses_chronological_not_distance_order() -> None:
    """ParquetRepository.get_telemetry() returns samples sorted by
    distance_m, not time -- a rising edge is only meaningful once
    re-sorted into chronological order (same caveat as
    validate_monotonic/compute_sector_deltas elsewhere in this codebase).
    """
    # Chronological order (by time_seconds): off, on, off -- one rising
    # edge. Handed to the function in distance order (scrambled relative
    # to time), which must not change the answer.
    chronological = [
        sample(time_seconds=0.0, distance_m=0.0, brake_active=False),
        sample(time_seconds=1.0, distance_m=100.0, brake_active=True),
        sample(time_seconds=2.0, distance_m=50.0, brake_active=False),
    ]
    distance_sorted = sorted(chronological, key=lambda s: s.distance_m)

    assert brake_event_count(distance_sorted) == 1
