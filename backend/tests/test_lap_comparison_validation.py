"""Tests for app/services/lap_comparison/validation.py."""

import pytest

from app.models.lap_comparison import WarningCode
from app.services.lap_comparison.validation import (
    EmptyTelemetryError,
    NonMonotonicDistanceError,
    collect_warnings,
    validate_monotonic,
)
from tests.lap_comparison_fixtures import lap, sample


def test_validate_monotonic_accepts_a_valid_lap() -> None:
    samples = [
        sample(distance_m=0.0, time_seconds=0.0),
        sample(distance_m=50.0, time_seconds=1.0),
        sample(distance_m=100.0, time_seconds=2.0),
    ]

    validate_monotonic(samples, lap_label="A")  # must not raise


def test_validate_monotonic_rejects_when_distance_decreases_in_time_order() -> None:
    samples = [
        sample(distance_m=0.0, time_seconds=0.0),
        sample(distance_m=100.0, time_seconds=1.0),
        sample(distance_m=80.0, time_seconds=2.0),  # a spin: distance drops
    ]

    with pytest.raises(NonMonotonicDistanceError) as excinfo:
        validate_monotonic(samples, lap_label="B")

    assert excinfo.value.lap_label == "B"
    assert "Lap B" in str(excinfo.value)
    assert "sample 2" in str(excinfo.value)


def test_validate_monotonic_checks_chronological_order_not_input_order() -> None:
    """ParquetRepository.get_telemetry() returns samples sorted by
    distance_m, not by time -- so a spin has to be detectable even when
    the input list is already distance-sorted (i.e. already "monotonic"
    by construction) and the non-monotonic behavior only shows up once
    re-sorted into chronological order.
    """
    # In distance order (as the repository would hand it over): looks fine.
    # In time order: distance goes 0 -> 100 -> 40 -> 100, i.e. a spin
    # between t=1 and t=2 that recovers by t=3.
    distance_sorted = [
        sample(distance_m=0.0, time_seconds=0.0),
        sample(distance_m=40.0, time_seconds=2.0),
        sample(distance_m=100.0, time_seconds=1.0),
        sample(distance_m=100.0, time_seconds=3.0),
    ]

    with pytest.raises(NonMonotonicDistanceError):
        validate_monotonic(distance_sorted, lap_label="A")


def test_validate_monotonic_rejects_empty_telemetry() -> None:
    with pytest.raises(EmptyTelemetryError) as excinfo:
        validate_monotonic([], lap_label="A")

    assert excinfo.value.lap_label == "A"


def test_collect_warnings_flags_each_inaccurate_lap_independently() -> None:
    both_accurate = collect_warnings(lap(is_accurate=True), lap(is_accurate=True))
    assert both_accurate == []

    only_a_inaccurate = collect_warnings(lap(is_accurate=False), lap(is_accurate=True))
    assert [w.code for w in only_a_inaccurate] == [WarningCode.INVALID_LAP_A]

    only_b_inaccurate = collect_warnings(lap(is_accurate=True), lap(is_accurate=False))
    assert [w.code for w in only_b_inaccurate] == [WarningCode.INVALID_LAP_B]

    both_inaccurate = collect_warnings(lap(is_accurate=False), lap(is_accurate=False))
    assert [w.code for w in both_inaccurate] == [
        WarningCode.INVALID_LAP_A,
        WarningCode.INVALID_LAP_B,
    ]
    assert all(w.detail for w in both_inaccurate)
