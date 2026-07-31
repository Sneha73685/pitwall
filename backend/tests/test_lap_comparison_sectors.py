"""Tests for app/services/lap_comparison/sectors.py."""

import numpy as np
import pytest

from app.services.lap_comparison.alignment import build_distance_grid
from app.services.lap_comparison.sectors import compute_sector_deltas
from tests.lap_comparison_fixtures import constant_speed_lap, lap


def test_compute_sector_deltas_matches_hand_computed_values() -> None:
    # Constant 10 m/s lap: sector boundaries at t=30/60/90s land exactly on
    # d=300/600/900m, so this has an exact hand-computable answer.
    lap_a = lap(sector_1_seconds=30.0, sector_2_seconds=30.0, sector_3_seconds=30.0)
    samples_a = constant_speed_lap(distance_step=10.0, time_step=1.0, count=91)  # 0..900m, 0..90s
    grid = build_distance_grid(900.0, 900.0, 901)  # 1m resolution
    delta_ms = grid.copy()  # delta_ms(d) = d, by construction

    sectors = compute_sector_deltas(lap_a, samples_a, grid, delta_ms)

    assert [s.sector for s in sectors] == [1, 2, 3]
    assert [s.delta_ms for s in sectors] == pytest.approx([300.0, 300.0, 300.0])
    assert all(s.faster == "a" for s in sectors)


def test_compute_sector_deltas_faster_reflects_negative_segment_delta() -> None:
    lap_a = lap(sector_1_seconds=30.0, sector_2_seconds=30.0, sector_3_seconds=30.0)
    samples_a = constant_speed_lap(distance_step=10.0, time_step=1.0, count=91)
    grid = build_distance_grid(900.0, 900.0, 901)
    delta_ms = -grid.copy()  # delta falls with distance -> lap B faster throughout

    sectors = compute_sector_deltas(lap_a, samples_a, grid, delta_ms)

    assert all(s.faster == "b" for s in sectors)
    assert all(s.delta_ms < 0 for s in sectors)


def test_compute_sector_deltas_returns_empty_when_no_sector_times_exist() -> None:
    lap_a = lap(sector_1_seconds=None, sector_2_seconds=None, sector_3_seconds=None)
    samples_a = constant_speed_lap(distance_step=10.0, time_step=1.0, count=11)
    grid = build_distance_grid(100.0, 100.0, 11)
    delta_ms = np.zeros(11, dtype=np.float64)

    assert compute_sector_deltas(lap_a, samples_a, grid, delta_ms) == []


def test_compute_sector_deltas_stops_at_first_missing_sector_time() -> None:
    # sector_3 is present, but sector_2 is missing -- a later present value
    # after a gap must not be used to guess the boundary in between.
    lap_a = lap(sector_1_seconds=30.0, sector_2_seconds=None, sector_3_seconds=30.0)
    samples_a = constant_speed_lap(distance_step=10.0, time_step=1.0, count=91)
    grid = build_distance_grid(900.0, 900.0, 901)
    delta_ms = grid.copy()

    sectors = compute_sector_deltas(lap_a, samples_a, grid, delta_ms)

    assert [s.sector for s in sectors] == [1]


def test_compute_sector_deltas_clips_boundaries_to_the_common_grid() -> None:
    # Lap A's own sector times imply a lap distance (900m) longer than the
    # common grid (only 0..500m, e.g. because lap B was shorter) -- the
    # boundary must clip to the grid's end, not extrapolate past it.
    lap_a = lap(sector_1_seconds=30.0, sector_2_seconds=30.0, sector_3_seconds=30.0)
    samples_a = constant_speed_lap(distance_step=10.0, time_step=1.0, count=91)  # up to 900m
    grid = build_distance_grid(500.0, 500.0, 501)  # shorter common grid
    delta_ms = grid.copy()

    sectors = compute_sector_deltas(lap_a, samples_a, grid, delta_ms)

    # Sector 3's boundary (900m) clips to 500m, same as sector 2's actual
    # boundary (600m also clips to 500m) -- both land at delta_ms(500)=500,
    # so sector 3's segment delta is 0, not negative or fabricated.
    assert sectors[-1].delta_ms == pytest.approx(0.0, abs=1e-9)
