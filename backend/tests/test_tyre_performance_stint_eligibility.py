"""Tests for app/services/tyre_performance/stint_eligibility.py."""

from app.services.tyre_performance.boundary_laps import identify_boundary_laps
from app.services.tyre_performance.stint_eligibility import (
    has_trend_shape,
    trend_eligible_by_stint,
    trend_eligible_positions,
    valid_positions,
)
from app.services.tyre_performance.stint_join import join_laps_to_stints
from tests.lap_comparison_fixtures import lap
from tests.tyre_performance_fixtures import pit_stop, stint


def test_valid_positions_reuses_is_accurate_and_excludes_inaccurate_laps() -> None:
    laps = [
        lap(lap_number=1, is_accurate=True),
        lap(lap_number=2, is_accurate=False),
    ]
    positions = join_laps_to_stints(laps, stints=[stint(start_lap=1, end_lap=2)])

    valid = valid_positions(positions)

    assert [position.lap.lap_number for position in valid] == [1]


def test_valid_positions_is_independent_of_exclusion_reason() -> None:
    """M41 (docs/m41-design-review.md): `valid_positions` must remain the
    pure `is_accurate` signal, untouched by this milestone -- an accurate
    lap that is analytically excluded (yellow-flag or track-limits) is
    still "valid" here, exactly as `session_analytics`'s `is_valid` stays
    independent of `exclusion_reason`. `orchestration.py`'s
    `AnnotatedLap.is_valid` depends on this guarantee.
    """
    laps = [
        lap(lap_number=1, is_accurate=True, track_status="4"),
        lap(lap_number=2, is_accurate=True, deleted=True),
    ]
    positions = join_laps_to_stints(laps, stints=[stint(start_lap=1, end_lap=2)])

    valid = valid_positions(positions)

    assert [position.lap.lap_number for position in valid] == [1, 2]


def test_trend_eligible_positions_includes_a_clear_lap_with_no_exclusion_reason() -> None:
    """M41 baseline: an accurate lap with no track_status/deleted signal
    (or an explicitly clear one) has `exclusion_reason=None` and remains
    trend-eligible -- the regression this milestone must not break."""
    laps = [lap(lap_number=1, is_accurate=True, track_status="1", deleted=False)]
    stints = [stint(start_lap=1, end_lap=1)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops=[])

    eligible = trend_eligible_positions(positions, boundary)

    assert [position.lap.lap_number for position in eligible] == [1]


def test_trend_eligible_positions_excludes_yellow_flag_lap() -> None:
    """M41: a yellow-flag-affected lap (`exclusion_reason="yellow_flag"`)
    is accurate but must not be trend-eligible -- it would otherwise
    corrupt pace/consistency stats, matching `session_analytics`'s own
    `filter_for_aggregate_stats` standard."""
    laps = [lap(lap_number=1, is_accurate=True, track_status="4")]
    stints = [stint(start_lap=1, end_lap=1)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops=[])

    eligible = trend_eligible_positions(positions, boundary)

    assert eligible == []


def test_trend_eligible_positions_excludes_track_limits_lap() -> None:
    """M41: a track-limits-deleted lap (`exclusion_reason="track_limits"`)
    is accurate but must not be trend-eligible, mirroring the yellow-flag
    case above."""
    laps = [lap(lap_number=1, is_accurate=True, deleted=True)]
    stints = [stint(start_lap=1, end_lap=1)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops=[])

    eligible = trend_eligible_positions(positions, boundary)

    assert eligible == []


def test_trend_eligible_positions_excludes_inaccurate_lap_with_exclusion_reason() -> None:
    """A lap that is both inaccurate and analytically excluded is excluded
    for either reason alone -- no precedence ambiguity to resolve here
    (unlike `filtering.py`'s own display-precedence concern between
    "yellow_flag"/"track_limits", which is irrelevant to this boolean
    gate)."""
    laps = [lap(lap_number=1, is_accurate=False, deleted=True)]
    stints = [stint(start_lap=1, end_lap=1)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops=[])

    eligible = trend_eligible_positions(positions, boundary)

    assert eligible == []


def test_trend_eligible_excludes_laps_outside_any_known_stint() -> None:
    laps = [lap(lap_number=1), lap(lap_number=99)]
    stints = [stint(stint_number=1, start_lap=1, end_lap=1)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops=[])

    eligible = trend_eligible_positions(positions, boundary)

    assert [position.lap.lap_number for position in eligible] == [1]


def test_trend_eligible_excludes_in_laps_and_out_laps() -> None:
    laps = [lap(lap_number=n) for n in range(1, 5)]
    stints = [
        stint(stint_number=1, start_lap=1, end_lap=2),
        stint(stint_number=2, start_lap=3, end_lap=4),
    ]
    pit_stops = [pit_stop(lap_number=2)]  # in-lap; lap 3 is the resulting out-lap
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops)

    eligible = trend_eligible_positions(positions, boundary)

    # lap 1 (stint 1, not boundary) and lap 4 (stint 2, not boundary) remain;
    # lap 2 (in-lap) and lap 3 (out-lap) are excluded.
    assert [position.lap.lap_number for position in eligible] == [1, 4]


def test_trend_eligible_by_stint_groups_the_remaining_laps_by_stint_number() -> None:
    laps = [lap(lap_number=n) for n in range(1, 5)]
    stints = [
        stint(stint_number=1, start_lap=1, end_lap=2),
        stint(stint_number=2, start_lap=3, end_lap=4),
    ]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops=[])

    grouped = trend_eligible_by_stint(positions, boundary)

    # lap 3 is stint 2's start_lap, so it's an out-lap (stint 2 isn't the
    # driver's first stint) and correctly excluded -- only lap 4 remains.
    assert set(grouped) == {1, 2}
    assert [position.lap.lap_number for position in grouped[1]] == [1, 2]
    assert [position.lap.lap_number for position in grouped[2]] == [4]


def test_hul_style_one_lap_stint_has_zero_trend_eligible_laps() -> None:
    """The resolved rule from docs/m11-design-review.md §5.2: there is no
    separate short-stint constant. HUL's real one-lap stint (lap 1, which
    is also HUL's own pit-in lap) must end up with zero trend-eligible
    laps purely as a consequence of in-lap exclusion."""
    laps = [lap(lap_number=1)] + [lap(lap_number=n) for n in range(2, 21)]
    stints = [
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=1, tyre_life_at_start=1),
        stint(stint_number=2, compound="HARD", start_lap=2, end_lap=20, tyre_life_at_start=1),
    ]
    pit_stops = [pit_stop(stop_number=1, lap_number=1, pit_lane_time_seconds=36.563)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops)

    grouped = trend_eligible_by_stint(positions, boundary)

    assert 1 not in grouped
    assert 2 in grouped  # stint 2's laps (minus its own out-lap) remain eligible


def test_has_trend_shape_requires_at_least_two_points() -> None:
    laps = [lap(lap_number=1), lap(lap_number=2)]
    stints = [stint(start_lap=1, end_lap=2)]
    positions = join_laps_to_stints(laps, stints)

    assert has_trend_shape(positions) is True
    assert has_trend_shape(positions[:1]) is False
    assert has_trend_shape([]) is False


def test_trend_eligible_positions_does_not_mutate_the_caller_s_list() -> None:
    laps = [lap(lap_number=1), lap(lap_number=2, is_accurate=False)]
    stints = [stint(start_lap=1, end_lap=2)]
    positions = join_laps_to_stints(laps, stints)
    boundary = identify_boundary_laps(stints, pit_stops=[])
    original_length = len(positions)

    trend_eligible_positions(positions, boundary)

    assert len(positions) == original_length
