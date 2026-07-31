"""Tests for app/services/lap_comparison/alignment.py."""

import numpy as np
import pytest

from app.services.lap_comparison.alignment import align_lap, build_distance_grid, max_distance
from tests.lap_comparison_fixtures import constant_speed_lap, sample


def test_max_distance_returns_the_furthest_sample() -> None:
    samples = [sample(distance_m=0.0), sample(distance_m=250.0), sample(distance_m=100.0)]

    assert max_distance(samples) == 250.0


def test_build_distance_grid_spans_zero_to_the_shorter_lap() -> None:
    grid = build_distance_grid(max_distance_a=500.0, max_distance_b=300.0, resolution=4)

    assert grid[0] == 0.0
    assert grid[-1] == 300.0
    assert len(grid) == 4


def test_align_lap_interpolates_time_exactly_for_constant_speed() -> None:
    # 50 km/h in m/s terms doesn't matter here -- distance = 10 * time, i.e.
    # a constant-speed lap with a perfectly known analytic relationship.
    samples = constant_speed_lap(distance_step=10.0, time_step=1.0, count=11)  # 0..100m, 0..10s
    grid = build_distance_grid(max_distance_a=100.0, max_distance_b=100.0, resolution=5)

    aligned = align_lap(samples, grid)

    # grid = [0, 25, 50, 75, 100]; time = distance / 10 for this lap.
    expected_time = grid / 10.0
    np.testing.assert_allclose(aligned.time_seconds, expected_time)


def test_align_lap_converts_boolean_channels_to_zero_and_one() -> None:
    samples = [
        sample(distance_m=0.0, time_seconds=0.0, brake_active=False, drs_active=True),
        sample(distance_m=100.0, time_seconds=1.0, brake_active=True, drs_active=False),
    ]
    grid = build_distance_grid(max_distance_a=100.0, max_distance_b=100.0, resolution=2)

    aligned = align_lap(samples, grid)

    assert list(aligned.channels["brake_active"]) == pytest.approx([0.0, 1.0])
    assert list(aligned.channels["drs_active"]) == pytest.approx([1.0, 0.0])


def test_align_lap_produces_every_compare_channel() -> None:
    samples = constant_speed_lap(distance_step=10.0, time_step=1.0, count=5)
    grid = build_distance_grid(max_distance_a=40.0, max_distance_b=40.0, resolution=3)

    aligned = align_lap(samples, grid)

    assert set(aligned.channels) == {
        "speed_kph",
        "throttle_pct",
        "brake_active",
        "rpm",
        "gear",
        "drs_active",
    }
    assert all(len(series) == 3 for series in aligned.channels.values())
