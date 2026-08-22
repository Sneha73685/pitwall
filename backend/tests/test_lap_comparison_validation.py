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


# --- M43 exclusion-reason warnings (docs/m43-design-review.md) -------------


def test_collect_warnings_emits_no_exclusion_warning_for_a_clear_lap() -> None:
    warnings = collect_warnings(lap(), lap())
    assert warnings == []


def test_collect_warnings_flags_yellow_flag_lap_a() -> None:
    warnings = collect_warnings(lap(track_status="2"), lap())
    assert [w.code for w in warnings] == [WarningCode.YELLOW_FLAG_LAP_A]


def test_collect_warnings_flags_yellow_flag_lap_b() -> None:
    warnings = collect_warnings(lap(), lap(track_status="2"))
    assert [w.code for w in warnings] == [WarningCode.YELLOW_FLAG_LAP_B]


def test_collect_warnings_flags_track_limits_lap_a() -> None:
    warnings = collect_warnings(lap(deleted=True), lap())
    assert [w.code for w in warnings] == [WarningCode.TRACK_LIMITS_LAP_A]


def test_collect_warnings_flags_track_limits_lap_b() -> None:
    warnings = collect_warnings(lap(), lap(deleted=True))
    assert [w.code for w in warnings] == [WarningCode.TRACK_LIMITS_LAP_B]


def test_collect_warnings_flags_both_sides_independently_when_both_excluded() -> None:
    """Lap A yellow-flagged, lap B track-limits-deleted -- two different
    exclusion reasons on two different sides, both surfaced independently.
    """
    warnings = collect_warnings(lap(track_status="2"), lap(deleted=True))
    assert [w.code for w in warnings] == [
        WarningCode.YELLOW_FLAG_LAP_A,
        WarningCode.TRACK_LIMITS_LAP_B,
    ]


def test_collect_warnings_resolves_track_limits_precedence_for_a_lap_with_both() -> None:
    """A lap that is both yellow-flag-affected and track-limits-deleted
    only ever emits the track-limits warning -- classify_lap() already
    resolves this precedence (docs/m40-design-review.md §21) before
    collect_warnings() ever sees the lap, so no `yellow_flag` warning is
    ever produced alongside it.
    """
    warnings = collect_warnings(lap(track_status="2", deleted=True), lap())
    assert [w.code for w in warnings] == [WarningCode.TRACK_LIMITS_LAP_A]


def test_collect_warnings_keeps_accuracy_and_exclusion_warnings_independent() -> None:
    """is_accurate and exclusion_reason are independent signals (per
    classify_lap()'s own docstring: a track-limits ruling is not a
    telemetry-quality signal) -- an inaccurate, yellow-flagged lap must
    produce both warnings, neither suppressing the other.
    """
    warnings = collect_warnings(lap(is_accurate=False, track_status="2"), lap())
    assert [w.code for w in warnings] == [
        WarningCode.INVALID_LAP_A,
        WarningCode.YELLOW_FLAG_LAP_A,
    ]


def test_collect_warnings_emits_no_exclusion_warning_for_old_style_laps() -> None:
    """Every currently-stored real lap has track_status=None and
    deleted=None/deleted_reason=None (pre-M36/M40 ingestion, or a session
    type FastF1 doesn't populate them for) -- backward-compatibility proof
    that such laps produce no new warning, identical to this function's
    pre-M43 behavior.
    """
    old_style = lap(track_status=None, deleted=None, deleted_reason=None)
    warnings = collect_warnings(old_style, old_style)
    assert warnings == []
