"""Tests for app/services/tyre_performance/driver_compound_comparison.py.

See docs/m11-design-review.md §4.3: this is a raw, side-by-side display,
never a normalized pace comparison or ranking.
"""

import dataclasses

import pytest

from app.models.race_context import PitStop, Stint
from app.models.telemetry import Lap
from app.services.tyre_performance.boundary_laps import identify_boundary_laps
from app.services.tyre_performance.driver_compound_comparison import (
    RawLapTimeByCompound,
    raw_lap_times_by_compound,
)
from app.services.tyre_performance.stint_eligibility import trend_eligible_positions
from app.services.tyre_performance.stint_join import LapStintPosition, join_laps_to_stints
from tests.lap_comparison_fixtures import lap
from tests.tyre_performance_fixtures import stint


def _eligible(
    laps: list[Lap], stints: list[Stint], pit_stops: list[PitStop]
) -> list[LapStintPosition]:
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops)
    return trend_eligible_positions(positions, boundary)


def _two_driver_same_compound_scenario() -> dict[str, list[LapStintPosition]]:
    driver_a_laps = [lap(lap_number=n, lap_time_seconds=90.0 + n * 0.1) for n in range(1, 6)]
    driver_a_stints = [stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=5)]

    driver_b_laps = [lap(lap_number=n, lap_time_seconds=91.0 + n * 0.2) for n in range(1, 6)]
    driver_b_stints = [stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=5)]

    return {
        "A": _eligible(driver_a_laps, driver_a_stints, []),
        "B": _eligible(driver_b_laps, driver_b_stints, []),
    }


def test_raw_lap_times_by_compound_covers_multiple_drivers_on_the_same_compound() -> None:
    results = raw_lap_times_by_compound(_two_driver_same_compound_scenario())

    driver_ids = {result.driver_id for result in results}
    assert driver_ids == {"A", "B"}
    assert all(result.compound == "SOFT" for result in results)


def test_raw_lap_times_by_compound_preserves_raw_per_lap_observations() -> None:
    results = raw_lap_times_by_compound(_two_driver_same_compound_scenario())
    driver_a = next(result for result in results if result.driver_id == "A")

    expected_lap_times_ms = [(90.0 + n * 0.1) * 1000.0 for n in range(1, 6)]
    assert driver_a.lap_count == 5
    assert driver_a.lap_times_ms == pytest.approx(expected_lap_times_ms)
    assert driver_a.lap_in_stint_indices == [1, 2, 3, 4, 5]


def test_raw_lap_times_by_compound_is_ordered_alphabetically_not_by_pace() -> None:
    """Driver B's laps are all slower than driver A's in this scenario;
    the result order must still be alphabetical by (driver_id, compound),
    proving list order cannot be read as a ranking."""
    results = raw_lap_times_by_compound(_two_driver_same_compound_scenario())

    assert [result.driver_id for result in results] == ["A", "B"]


def test_raw_lap_times_by_compound_returns_empty_list_for_no_input() -> None:
    assert raw_lap_times_by_compound({}) == []


def test_raw_lap_times_by_compound_skips_a_lap_with_a_missing_lap_time_without_crashing() -> None:
    scenario = {
        "A": _eligible(
            [
                lap(lap_number=1, lap_time_seconds=90.0),
                lap(lap_number=2, lap_time_seconds=None),
            ],
            [stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=2)],
            [],
        )
    }

    results = raw_lap_times_by_compound(scenario)

    assert results[0].lap_count == 1


def test_no_ranking_or_performance_field_exists_on_the_result_type() -> None:
    """Assert-the-absence-of-a-feature test (docs/m11-implementation-plan.md
    Phase 1): guards docs/m11-design-review.md §4.3/§8's non-goal."""
    banned_field_names = {
        "rank",
        "position",
        "faster_than",
        "pace_score",
        "normalized_pace",
        "performance_score",
        "degradation_rate",
    }

    field_names = {field.name for field in dataclasses.fields(RawLapTimeByCompound)}

    assert field_names.isdisjoint(banned_field_names)
