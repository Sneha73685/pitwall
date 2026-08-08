"""Tests for app/services/tyre_performance/compound_aggregation.py.

Uses a hand-built, synthetic multi-driver/multi-compound scenario rather
than the real Bahrain dataset -- docs/m11-design-review.md §12 flags that
Bahrain only exercises two compounds (SOFT/HARD) and unusual stint
distributions, so this scenario deliberately includes a third compound
(MEDIUM), a one-stop driver, and a multi-stop driver to prove the domain
logic is generic rather than accidentally shaped around Bahrain.
"""

import dataclasses

from app.models.race_context import PitStop, Stint
from app.models.telemetry import Lap
from app.services.tyre_performance.boundary_laps import identify_boundary_laps
from app.services.tyre_performance.compound_aggregation import (
    CompoundAggregate,
    CompoundLapIndexAggregate,
    aggregate_by_compound,
    aggregate_by_compound_and_lap_index,
)
from app.services.tyre_performance.stint_eligibility import trend_eligible_positions
from app.services.tyre_performance.stint_join import LapStintPosition, join_laps_to_stints
from tests.lap_comparison_fixtures import lap
from tests.tyre_performance_fixtures import pit_stop, stint


def _eligible(
    laps: list[Lap], stints: list[Stint], pit_stops: list[PitStop]
) -> list[LapStintPosition]:
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops)
    return trend_eligible_positions(positions, boundary)


def _three_compound_scenario() -> dict[str, list[LapStintPosition]]:
    """Three drivers: A (three stops, SOFT/MEDIUM/HARD), B (one stop,
    SOFT/HARD), C (no stops, MEDIUM only)."""
    driver_a_laps = [lap(lap_number=n, lap_time_seconds=90.0 + n * 0.01) for n in range(1, 16)]
    driver_a_stints = [
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=5, tyre_life_at_start=1),
        stint(stint_number=2, compound="MEDIUM", start_lap=6, end_lap=10, tyre_life_at_start=1),
        stint(stint_number=3, compound="HARD", start_lap=11, end_lap=15, tyre_life_at_start=1),
    ]
    driver_a_pit_stops = [
        pit_stop(driver_id="A", stop_number=1, lap_number=5),
        pit_stop(driver_id="A", stop_number=2, lap_number=10),
    ]

    driver_b_laps = [lap(lap_number=n, lap_time_seconds=91.0 + n * 0.02) for n in range(1, 13)]
    driver_b_stints = [
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=6, tyre_life_at_start=1),
        stint(stint_number=2, compound="HARD", start_lap=7, end_lap=12, tyre_life_at_start=1),
    ]
    driver_b_pit_stops = [pit_stop(driver_id="B", stop_number=1, lap_number=6)]

    driver_c_laps = [lap(lap_number=n, lap_time_seconds=92.0 + n * 0.03) for n in range(1, 9)]
    driver_c_stints = [
        stint(stint_number=1, compound="MEDIUM", start_lap=1, end_lap=8, tyre_life_at_start=3),
    ]

    return {
        "A": _eligible(driver_a_laps, driver_a_stints, driver_a_pit_stops),
        "B": _eligible(driver_b_laps, driver_b_stints, driver_b_pit_stops),
        "C": _eligible(driver_c_laps, driver_c_stints, []),
    }


def test_aggregate_by_compound_covers_three_compounds_across_multiple_drivers() -> None:
    scenario = _three_compound_scenario()

    aggregates = aggregate_by_compound(scenario)

    compounds = {aggregate.compound for aggregate in aggregates}
    assert compounds == {"SOFT", "MEDIUM", "HARD"}

    by_compound = {aggregate.compound: aggregate for aggregate in aggregates}
    assert by_compound["SOFT"].driver_count == 2  # A, B
    assert by_compound["MEDIUM"].driver_count == 2  # A, C
    assert by_compound["HARD"].driver_count == 2  # A, B
    # SOFT: A's stint 1 minus its in-lap (4), B's stint 1 minus its in-lap (5).
    assert by_compound["SOFT"].lap_count == 4 + 5
    # MEDIUM: A's stint 2 minus in/out laps (3), all of C's only stint (8).
    assert by_compound["MEDIUM"].lap_count == 3 + 8
    # HARD: A's stint 3 minus its out-lap (4), B's stint 2 minus its out-lap (5).
    assert by_compound["HARD"].lap_count == 4 + 5


def test_aggregate_by_compound_result_is_sorted_alphabetically_not_by_any_statistic() -> None:
    aggregates = aggregate_by_compound(_three_compound_scenario())

    assert [aggregate.compound for aggregate in aggregates] == ["HARD", "MEDIUM", "SOFT"]


def test_aggregate_by_compound_lap_times_are_raw_and_sorted() -> None:
    aggregates = aggregate_by_compound(_three_compound_scenario())
    soft = next(a for a in aggregates if a.compound == "SOFT")

    assert soft.lap_times_ms == sorted(soft.lap_times_ms)
    assert len(soft.lap_times_ms) == soft.lap_count
    assert soft.median_lap_time_ms is not None
    assert soft.p25_lap_time_ms is not None
    assert soft.p75_lap_time_ms is not None


def test_aggregate_by_compound_and_lap_index_breaks_down_by_position_in_stint() -> None:
    aggregates = aggregate_by_compound_and_lap_index(_three_compound_scenario())
    by_key = {(a.compound, a.lap_in_stint_index): a for a in aggregates}

    # SOFT, index 1: driver A's lap 1 and driver B's lap 1.
    assert by_key[("SOFT", 1)].lap_count == 2
    # MEDIUM, index 2: driver A's lap 7 (stint start 6, so index 2) and
    # driver C's lap 2 (stint start 1, so index 2).
    assert by_key[("MEDIUM", 2)].lap_count == 2


def test_aggregate_functions_return_empty_lists_for_no_input() -> None:
    assert aggregate_by_compound({}) == []
    assert aggregate_by_compound_and_lap_index({}) == []


def test_aggregate_by_compound_skips_a_lap_with_a_missing_lap_time_without_crashing() -> None:
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

    aggregates = aggregate_by_compound(scenario)

    assert aggregates[0].lap_count == 1


def test_quartiles_are_none_below_two_values_matching_m8_s_convention() -> None:
    single_lap_driver = {
        "SOLO": _eligible(
            [lap(lap_number=1, lap_time_seconds=90.0)],
            [stint(stint_number=1, compound="WET", start_lap=1, end_lap=5)],
            [],
        )
    }

    aggregates = aggregate_by_compound(single_lap_driver)

    assert len(aggregates) == 1
    assert aggregates[0].lap_count == 1
    assert aggregates[0].median_lap_time_ms is not None  # median is defined for n=1
    assert aggregates[0].p25_lap_time_ms is None
    assert aggregates[0].p75_lap_time_ms is None


def test_no_fitted_or_ranking_field_exists_on_either_result_type() -> None:
    """Assert-the-absence-of-a-feature test (docs/m11-implementation-plan.md
    Phase 1): guards against a future edit reintroducing a fitted
    parameter into this specifically fitting-prone module."""
    banned_substrings = ("slope", "coefficient", "rate", "fit", "regress", "rank", "best")

    for model in (CompoundAggregate, CompoundLapIndexAggregate):
        field_names = [field.name.lower() for field in dataclasses.fields(model)]
        for field_name in field_names:
            for banned in banned_substrings:
                message = f"{model.__name__}.{field_name} looks fitted/ranked"
                assert banned not in field_name, message
