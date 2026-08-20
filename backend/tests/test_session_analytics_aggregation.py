"""Tests for app/services/session_analytics/aggregation.py -- the
end-to-end per-driver rollup, catching wiring bugs the unit-level tests
for filtering/theoretical_best/consistency/driving_style wouldn't (plan
Phase 1 exit criteria).
"""

import pytest

from app.services.session_analytics.aggregation import summarize_driver
from tests.lap_comparison_fixtures import lap, sample


def test_summarize_driver_matches_hand_computed_values_across_all_fields() -> None:
    # Lap 1 (accurate): sectors 30.0/29.0/31.0 -> lap_time 90.0s.
    # Lap 2 (accurate): sectors 29.5/30.0/30.0 -> lap_time 89.5s.
    # Lap 3 (INACCURATE): lap_time 95.0s -- must still appear in `.laps`,
    # but must not affect any of the aggregate fields.
    laps = [
        lap(
            lap_number=1,
            lap_time_seconds=90.0,
            sector_1_seconds=30.0,
            sector_2_seconds=29.0,
            sector_3_seconds=31.0,
            is_accurate=True,
        ),
        lap(
            lap_number=2,
            lap_time_seconds=89.5,
            sector_1_seconds=29.5,
            sector_2_seconds=30.0,
            sector_3_seconds=30.0,
            is_accurate=True,
        ),
        lap(lap_number=3, lap_time_seconds=95.0, is_accurate=False),
    ]
    telemetry_by_lap = {
        1: [
            sample(time_seconds=0.0, throttle_pct=100.0, brake_active=False),
            sample(time_seconds=1.0, throttle_pct=100.0, brake_active=True),
            sample(time_seconds=2.0, throttle_pct=100.0, brake_active=False),
            sample(time_seconds=3.0, throttle_pct=100.0, brake_active=True),
        ],
        2: [
            sample(time_seconds=0.0, throttle_pct=100.0, brake_active=False),
            sample(time_seconds=1.0, throttle_pct=100.0, brake_active=False),
            sample(time_seconds=2.0, throttle_pct=40.0, brake_active=True),
            sample(time_seconds=3.0, throttle_pct=40.0, brake_active=False),
        ],
        # Lap 3 (invalid) deliberately has no telemetry at all.
    }

    summary = summarize_driver("VER", laps, telemetry_by_lap)

    # Best-of-each-sector: sector 1 = 29.5 (lap 2), sector 2 = 29.0 (lap 1),
    # sector 3 = 30.0 (lap 2) -> theoretical best = 88.5s = 88500ms.
    assert summary.driver_id == "VER"
    assert summary.valid_lap_count == 2
    assert summary.best_lap_ms == pytest.approx(89500.0)
    assert summary.theoretical_best_lap_ms == pytest.approx(88500.0)
    assert summary.theoretical_best_delta_ms == pytest.approx(1000.0)
    assert summary.median_lap_ms == pytest.approx(89750.0)
    assert summary.consistency_ms == pytest.approx(250.0)
    assert summary.consistency_cv == pytest.approx(250.0 / 89750.0)
    assert summary.outlier_lap_count == 0
    # Pooled: lap 1 = 4/4 full-throttle samples, lap 2 = 2/4 -> 6/8 = 75%.
    assert summary.full_throttle_pct == pytest.approx(75.0)


def test_summarize_driver_includes_every_lap_valid_or_not() -> None:
    """The invalid lap must be *listed*, not silently dropped -- easy to
    conflate "excluded from aggregate stats" with "excluded from the
    response entirely" (plan Phase 1, `filtering.py` note).
    """
    laps = [
        lap(lap_number=1, lap_time_seconds=90.0, is_accurate=True),
        lap(lap_number=2, lap_time_seconds=95.0, is_accurate=False),
    ]

    summary = summarize_driver("VER", laps, {})

    assert [lap_metrics.lap_number for lap_metrics in summary.laps] == [1, 2]
    invalid_lap_metrics = summary.laps[1]
    assert invalid_lap_metrics.is_valid is False
    assert invalid_lap_metrics.lap_time_ms == pytest.approx(95000.0)


def test_summarize_driver_per_lap_deltas_and_driving_style_are_correct() -> None:
    laps = [
        lap(
            lap_number=1,
            lap_time_seconds=90.0,
            sector_1_seconds=30.0,
            sector_2_seconds=29.0,
            sector_3_seconds=31.0,
            is_accurate=True,
        ),
        lap(
            lap_number=2,
            lap_time_seconds=89.5,
            sector_1_seconds=29.5,
            sector_2_seconds=30.0,
            sector_3_seconds=30.0,
            is_accurate=True,
        ),
    ]
    telemetry_by_lap = {
        1: [
            sample(time_seconds=0.0, throttle_pct=100.0),
            sample(time_seconds=1.0, throttle_pct=100.0),
        ],
        2: [
            sample(time_seconds=0.0, throttle_pct=40.0),
            sample(time_seconds=1.0, throttle_pct=40.0),
        ],
    }

    summary = summarize_driver("VER", laps, telemetry_by_lap)

    lap_1_metrics, lap_2_metrics = summary.laps
    # theoretical_best = 88500ms, median = 89750ms (from the shared scenario math).
    assert lap_1_metrics.delta_to_theoretical_best_ms == pytest.approx(1500.0)
    assert lap_1_metrics.delta_to_own_median_ms == pytest.approx(250.0)
    assert lap_1_metrics.full_throttle_pct == pytest.approx(100.0)
    assert lap_2_metrics.delta_to_theoretical_best_ms == pytest.approx(1000.0)
    assert lap_2_metrics.delta_to_own_median_ms == pytest.approx(-250.0)
    assert lap_2_metrics.full_throttle_pct == pytest.approx(0.0)


def test_summarize_driver_with_zero_valid_laps_is_all_none_not_an_error() -> None:
    """§10: a driver with 0 valid laps (e.g. a DNF before a timed lap) is
    listed with null aggregate fields, not an error and not excluded.
    """
    laps = [lap(lap_number=1, lap_time_seconds=None, is_accurate=False)]

    summary = summarize_driver("HAM", laps, {})

    assert summary.valid_lap_count == 0
    assert summary.best_lap_ms is None
    assert summary.theoretical_best_lap_ms is None
    assert summary.theoretical_best_delta_ms is None
    assert summary.median_lap_ms is None
    assert summary.consistency_ms is None
    assert summary.consistency_cv is None
    assert summary.full_throttle_pct is None
    assert summary.outlier_lap_count == 0
    assert len(summary.laps) == 1  # still listed, per B1


def test_summarize_driver_with_exactly_one_valid_lap_has_null_consistency() -> None:
    """§10: a single valid lap has a defined theoretical-best delta (0, per
    the single-lap-driver reasoning in test_theoretical_best.py) but
    undefined consistency -- `None`, not `0`.
    """
    laps = [
        lap(
            lap_number=1,
            lap_time_seconds=90.0,
            sector_1_seconds=30.0,
            sector_2_seconds=30.0,
            sector_3_seconds=30.0,
            is_accurate=True,
        )
    ]

    summary = summarize_driver("HAM", laps, {})

    assert summary.valid_lap_count == 1
    assert summary.best_lap_ms == pytest.approx(90000.0)
    assert summary.theoretical_best_delta_ms == pytest.approx(0.0)
    assert summary.consistency_ms is None
    assert summary.consistency_cv is None


def test_summarize_driver_with_no_laps_at_all() -> None:
    summary = summarize_driver("HAM", [], {})

    assert summary.valid_lap_count == 0
    assert summary.laps == []
    assert summary.best_lap_ms is None


def test_summarize_driver_builds_positions_from_every_lap() -> None:
    """M35 (docs/m35-design-review.md §5/§10): `positions` uses the full
    lap list, not the yellow-flag-excluded aggregate-stats population --
    and preserves a `None` position (e.g. a lap FastF1 didn't rank) rather
    than fabricating one.
    """
    laps = [
        lap(lap_number=1, position=3),
        lap(lap_number=2, position=2),
        lap(lap_number=3, position=None),
    ]

    summary = summarize_driver("VER", laps, {})

    assert [p.lap_number for p in summary.positions] == [1, 2, 3]
    assert [p.position for p in summary.positions] == [3, 2, None]
