"""Tests for app/services/tyre_performance/stint_join.py."""

from app.services.tyre_performance.stint_join import join_laps_to_stints
from tests.lap_comparison_fixtures import lap
from tests.tyre_performance_fixtures import stint


def test_join_associates_laps_with_a_normal_multi_lap_stint() -> None:
    laps = [lap(lap_number=1), lap(lap_number=2), lap(lap_number=3)]
    stints = [stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=3, tyre_life_at_start=2)]

    positions = join_laps_to_stints(laps, stints)

    assert len(positions) == 3
    assert [position.lap_in_stint_index for position in positions] == [1, 2, 3]
    assert all(position.stint_number == 1 for position in positions)
    assert all(position.compound == "SOFT" for position in positions)
    assert all(position.tyre_life_at_stint_start == 2 for position in positions)
    assert all(position.in_known_stint for position in positions)


def test_join_resets_lap_index_per_stint_across_multiple_stints() -> None:
    laps = [lap(lap_number=n) for n in range(1, 7)]
    stints = [
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=3),
        stint(stint_number=2, compound="HARD", start_lap=4, end_lap=6),
    ]

    positions = join_laps_to_stints(laps, stints)

    assert [position.stint_number for position in positions] == [1, 1, 1, 2, 2, 2]
    assert [position.lap_in_stint_index for position in positions] == [1, 2, 3, 1, 2, 3]
    assert [position.compound for position in positions] == ["SOFT"] * 3 + ["HARD"] * 3


def test_join_handles_a_one_lap_stint_without_crashing() -> None:
    """Reproduces the real HUL/Bahrain shape (docs/m11-design-review.md
    §3.2): a stint whose start_lap == end_lap."""
    laps = [lap(lap_number=1)]
    stints = [stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=1, tyre_life_at_start=1)]

    positions = join_laps_to_stints(laps, stints)

    assert len(positions) == 1
    assert positions[0].stint_number == 1
    assert positions[0].lap_in_stint_index == 1
    assert positions[0].in_known_stint is True


def test_join_does_not_discard_a_lap_outside_any_known_stint() -> None:
    laps = [lap(lap_number=99)]
    stints = [stint(stint_number=1, start_lap=1, end_lap=3)]

    positions = join_laps_to_stints(laps, stints)

    assert len(positions) == 1
    assert positions[0].in_known_stint is False
    assert positions[0].stint_number is None
    assert positions[0].lap_in_stint_index is None
    assert positions[0].tyre_life_at_stint_start is None


def test_join_with_no_stint_data_marks_every_lap_unknown() -> None:
    laps = [lap(lap_number=1), lap(lap_number=2)]

    positions = join_laps_to_stints(laps, stints=[])

    assert all(not position.in_known_stint for position in positions)
    assert all(position.stint_number is None for position in positions)


def test_join_falls_back_to_the_lap_s_own_compound_when_there_is_no_stint_match() -> None:
    laps = [lap(lap_number=50, compound="INTERMEDIATE")]
    stints = [stint(start_lap=1, end_lap=3, compound="SOFT")]

    positions = join_laps_to_stints(laps, stints)

    assert positions[0].compound == "INTERMEDIATE"
    assert positions[0].in_known_stint is False


def test_join_does_not_fabricate_a_compound_when_neither_source_has_one() -> None:
    laps = [lap(lap_number=50)]  # compound defaults to None

    positions = join_laps_to_stints(laps, stints=[])

    assert positions[0].compound is None


def test_join_carries_through_a_missing_tyre_life_at_start_as_none() -> None:
    laps = [lap(lap_number=1)]
    stints = [stint(stint_number=1, start_lap=1, end_lap=2, tyre_life_at_start=None)]

    positions = join_laps_to_stints(laps, stints)

    assert positions[0].tyre_life_at_stint_start is None


def test_join_does_not_mutate_the_caller_s_input_lists() -> None:
    laps = [lap(lap_number=2), lap(lap_number=1)]
    stints = [stint(start_lap=1, end_lap=2)]
    original_lap_numbers = [lap_.lap_number for lap_ in laps]

    join_laps_to_stints(laps, stints)

    assert [lap_.lap_number for lap_ in laps] == original_lap_numbers


def test_join_returns_laps_ordered_by_lap_number_regardless_of_input_order() -> None:
    laps = [lap(lap_number=3), lap(lap_number=1), lap(lap_number=2)]
    stints = [
        stint(stint_number=2, compound="HARD", start_lap=3, end_lap=3),
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=2),
    ]

    positions = join_laps_to_stints(laps, stints)

    assert [position.lap.lap_number for position in positions] == [1, 2, 3]
    assert positions[2].stint_number == 2
