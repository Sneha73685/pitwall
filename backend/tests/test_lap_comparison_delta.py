"""Tests for app/services/lap_comparison/delta.py.

Highest-priority test file in the whole milestone (docs/m6-implementation-
plan.md §0.4): a silent sign inversion here is the single easiest way for
this feature to be quietly, confidently wrong.
"""

import numpy as np
import pytest

from app.models.telemetry import TelemetrySample
from app.services.lap_comparison.alignment import (
    AlignedLap,
    FloatArray,
    align_lap,
    build_distance_grid,
)
from app.services.lap_comparison.delta import compute_delta_ms
from tests.lap_comparison_fixtures import constant_speed_lap, sample


def _aligned(
    samples: list[TelemetrySample], max_distance: float, resolution: int = 5
) -> tuple[FloatArray, AlignedLap]:
    grid = build_distance_grid(max_distance, max_distance, resolution)
    return grid, align_lap(samples, grid)


def test_identical_laps_have_zero_delta_everywhere() -> None:
    samples = constant_speed_lap(distance_step=10.0, time_step=1.0, count=11)
    grid, aligned_a = _aligned(samples, 100.0)
    _, aligned_b = _aligned(samples, 100.0)

    delta_ms = compute_delta_ms(aligned_a, aligned_b)

    np.testing.assert_allclose(delta_ms, np.zeros_like(delta_ms), atol=1e-9)


def test_lap_b_uniformly_slower_by_a_constant_offset() -> None:
    samples_a = constant_speed_lap(distance_step=10.0, time_step=1.0, count=11)  # 0..10s
    # Same distances, every time_seconds shifted +2s -> uniformly 2s slower.
    samples_b = [
        sample(distance_m=s.distance_m, time_seconds=s.time_seconds + 2.0) for s in samples_a
    ]
    grid, aligned_a = _aligned(samples_a, 100.0)
    _, aligned_b = _aligned(samples_b, 100.0)

    delta_ms = compute_delta_ms(aligned_a, aligned_b)

    np.testing.assert_allclose(delta_ms, np.full_like(delta_ms, 2000.0), atol=1e-6)


def test_lap_b_faster_only_in_a_sub_region_stays_flat_outside_it() -> None:
    samples_a = constant_speed_lap(distance_step=10.0, time_step=1.0, count=11)  # 0..100m, 0..10s
    # Lap B matches lap A everywhere except it gains 0.5s strictly within
    # the 40-60m sub-region, then holds that gain to the end (a step, not a
    # spike) -- delta should be 0 before the region, move only within it,
    # and stay flat at the new value after it. Lap B being faster there
    # means delta_ms must go NEGATIVE, not positive -- per the sign
    # convention (positive == lap A faster), this is the same convention
    # test_sign_convention_positive_means_lap_a_is_faster asserts directly,
    # exercised here through a region rather than the whole lap.
    samples_b = [
        sample(
            distance_m=s.distance_m,
            time_seconds=s.time_seconds - (0.5 if s.distance_m >= 60.0 else 0.0),
        )
        for s in samples_a
    ]
    grid, aligned_a = _aligned(samples_a, 100.0, resolution=11)
    _, aligned_b = _aligned(samples_b, 100.0, resolution=11)

    delta_ms = compute_delta_ms(aligned_a, aligned_b)

    before_region = delta_ms[grid < 40.0]
    after_region = delta_ms[grid >= 60.0]
    np.testing.assert_allclose(before_region, np.zeros_like(before_region), atol=1e-6)
    np.testing.assert_allclose(after_region, np.full_like(after_region, -500.0), atol=1e-6)


def test_sign_convention_positive_means_lap_a_is_faster() -> None:
    """Dedicated sign test -- not a magnitude check. Constructs a case
    where lap A is unambiguously faster (reaches every distance point
    sooner) and asserts delta_ms is POSITIVE, then the mirror case for
    lap B and asserts NEGATIVE. See delta.py's compute_delta_ms docstring
    for the convention this enforces: positive == lap A faster/ahead.
    """
    fast_samples = constant_speed_lap(distance_step=10.0, time_step=1.0, count=11)  # 0..10s
    slow_samples = constant_speed_lap(distance_step=10.0, time_step=1.5, count=11)  # 0..15s

    grid, aligned_fast = _aligned(fast_samples, 100.0)
    _, aligned_slow = _aligned(slow_samples, 100.0)

    # Lap A fast, lap B slow -> A is faster/ahead -> delta must be positive.
    delta_a_faster = compute_delta_ms(aligned_fast, aligned_slow)
    assert np.all(delta_a_faster[1:] > 0), "lap A faster must produce a positive delta"

    # Lap A slow, lap B fast -> B is faster/ahead -> delta must be negative.
    delta_b_faster = compute_delta_ms(aligned_slow, aligned_fast)
    assert np.all(delta_b_faster[1:] < 0), "lap B faster must produce a negative delta"


@pytest.mark.parametrize(
    "time_step_a,time_step_b",
    [
        (1.0, 1.0),
        (1.0, 1.5),
        (2.0, 1.0),
        (0.8, 1.2),
    ],
)
def test_delta_at_distance_zero_is_approximately_zero(
    time_step_a: float, time_step_b: float
) -> None:
    """Both laps start their clock at distance 0 by definition, so
    delta_ms at the first grid point must always be ~0 regardless of how
    differently the laps unfold afterward. Parametrized over a handful of
    synthetic monotonic series rather than adding a property-testing
    dependency for this one invariant (Phase 0 decision, plan §0.4).
    """
    samples_a = constant_speed_lap(distance_step=10.0, time_step=time_step_a, count=11)
    samples_b = constant_speed_lap(distance_step=10.0, time_step=time_step_b, count=11)
    grid, aligned_a = _aligned(samples_a, 100.0)
    _, aligned_b = _aligned(samples_b, 100.0)

    delta_ms = compute_delta_ms(aligned_a, aligned_b)

    assert grid[0] == 0.0
    assert delta_ms[0] == pytest.approx(0.0, abs=1e-9)
