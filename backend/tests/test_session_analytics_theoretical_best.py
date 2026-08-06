"""Tests for app/services/session_analytics/theoretical_best.py."""

import pytest

from app.services.session_analytics.theoretical_best import (
    theoretical_best_delta_ms,
    theoretical_best_lap_ms,
)
from tests.lap_comparison_fixtures import lap


def test_theoretical_best_lap_ms_sums_best_of_each_sector_independently() -> None:
    # Best sector 1 (29.0) is on lap 2, best sector 2 (28.5) is on lap 1,
    # best sector 3 (29.5) is on lap 3 -- no single lap achieves all three,
    # which is exactly the point of "theoretical" best.
    laps = [
        lap(lap_number=1, sector_1_seconds=30.0, sector_2_seconds=28.5, sector_3_seconds=31.0),
        lap(lap_number=2, sector_1_seconds=29.0, sector_2_seconds=29.0, sector_3_seconds=30.0),
        lap(lap_number=3, sector_1_seconds=30.5, sector_2_seconds=29.5, sector_3_seconds=29.5),
    ]

    result = theoretical_best_lap_ms(laps)

    assert result == pytest.approx((29.0 + 28.5 + 29.5) * 1000.0)


def test_theoretical_best_lap_ms_is_none_when_a_sector_has_no_data_at_all() -> None:
    laps = [
        lap(lap_number=1, sector_1_seconds=30.0, sector_2_seconds=None, sector_3_seconds=30.0),
        lap(lap_number=2, sector_1_seconds=29.0, sector_2_seconds=None, sector_3_seconds=29.5),
    ]

    assert theoretical_best_lap_ms(laps) is None


def test_theoretical_best_lap_ms_skips_only_the_laps_missing_that_sector() -> None:
    # Lap 1 is missing sector 2 -- it should still contribute its (better)
    # sector 1 and sector 3 times, without being dropped outright.
    laps = [
        lap(lap_number=1, sector_1_seconds=28.0, sector_2_seconds=None, sector_3_seconds=28.0),
        lap(lap_number=2, sector_1_seconds=30.0, sector_2_seconds=29.0, sector_3_seconds=30.0),
    ]

    result = theoretical_best_lap_ms(laps)

    assert result == pytest.approx((28.0 + 29.0 + 28.0) * 1000.0)


def test_theoretical_best_lap_ms_is_none_for_no_laps() -> None:
    assert theoretical_best_lap_ms([]) is None


def test_theoretical_best_delta_ms_is_none_if_either_input_is_none() -> None:
    assert theoretical_best_delta_ms(None, 90000.0) is None
    assert theoretical_best_delta_ms(90000.0, None) is None
    assert theoretical_best_delta_ms(None, None) is None


def test_theoretical_best_delta_ms_is_zero_for_a_single_lap_driver() -> None:
    # With exactly one lap, that lap's own sectors are each sector's "best"
    # by definition, so the theoretical best equals the lap itself.
    only_lap = lap(sector_1_seconds=30.0, sector_2_seconds=30.0, sector_3_seconds=30.0)
    best_lap_ms = 90000.0
    theoretical_best = theoretical_best_lap_ms([only_lap])

    assert theoretical_best_delta_ms(best_lap_ms, theoretical_best) == pytest.approx(0.0)


@pytest.mark.parametrize(
    "sector_times",
    [
        [(30.0, 30.0, 30.0), (29.5, 30.5, 30.0), (30.2, 29.8, 30.5)],
        [(25.0, 40.0, 35.0), (26.0, 39.0, 34.5), (24.5, 41.0, 36.0)],
        [(20.0, 20.0, 20.0)],
        [(20.0, 20.0, 20.0), (20.0, 20.0, 20.0)],
    ],
)
def test_theoretical_best_delta_ms_is_never_negative(
    sector_times: list[tuple[float, float, float]],
) -> None:
    """Invariant test (plan's "single highest-value fuzz test"): the
    theoretical best is a lower bound by construction, so
    best_lap_ms - theoretical_best_lap_ms must always be >= 0. Parametrized
    over a handful of synthetic sector-time sets rather than adding a
    property-testing dependency for one invariant, matching M6's own
    precedent (delta-at-d=0 test, plan §0.4).
    """
    laps = [
        lap(lap_number=i, sector_1_seconds=s1, sector_2_seconds=s2, sector_3_seconds=s3)
        for i, (s1, s2, s3) in enumerate(sector_times, start=1)
    ]
    best_lap_ms = min((s1 + s2 + s3) * 1000.0 for s1, s2, s3 in sector_times)

    theoretical_best = theoretical_best_lap_ms(laps)
    delta = theoretical_best_delta_ms(best_lap_ms, theoretical_best)

    assert delta is not None
    assert delta >= -1e-9
