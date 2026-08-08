"""Tests for app/services/tyre_performance/boundary_laps.py."""

from app.services.tyre_performance.boundary_laps import identify_boundary_laps
from tests.tyre_performance_fixtures import pit_stop, stint


def test_in_lap_is_detected_from_pit_stop_lap_number() -> None:
    stints = [stint(stint_number=1, start_lap=1, end_lap=15)]
    pit_stops = [pit_stop(stop_number=1, lap_number=15)]

    boundary = identify_boundary_laps(stints, pit_stops)

    assert boundary.in_lap_numbers == frozenset({15})
    assert boundary.is_boundary_lap(15) is True


def test_out_lap_is_detected_from_a_subsequent_stint_s_start_lap() -> None:
    stints = [
        stint(stint_number=1, start_lap=1, end_lap=15),
        stint(stint_number=2, start_lap=16, end_lap=30),
    ]

    boundary = identify_boundary_laps(stints, pit_stops=[])

    assert boundary.out_lap_numbers == frozenset({16})


def test_first_stint_s_start_lap_is_not_marked_as_an_out_lap() -> None:
    stints = [
        stint(stint_number=1, start_lap=1, end_lap=15),
        stint(stint_number=2, start_lap=16, end_lap=30),
    ]

    boundary = identify_boundary_laps(stints, pit_stops=[])

    assert 1 not in boundary.out_lap_numbers


def test_every_non_first_stint_contributes_an_out_lap_including_the_final_one() -> None:
    stints = [
        stint(stint_number=1, start_lap=1, end_lap=10),
        stint(stint_number=2, start_lap=11, end_lap=20),
        stint(stint_number=3, start_lap=21, end_lap=30),
    ]

    boundary = identify_boundary_laps(stints, pit_stops=[])

    assert boundary.out_lap_numbers == frozenset({11, 21})


def test_hul_style_one_lap_stint_is_an_in_lap_but_not_an_out_lap() -> None:
    """Reproduces the real Bahrain shape (docs/m11-design-review.md §3.2):
    HUL's stint 1 is lap 1 only, and lap 1 is also HUL's own pit-in lap.
    Because stint 1 is the driver's *first* stint, lap 1 must not also be
    flagged as an out-lap."""
    stints = [
        stint(stint_number=1, compound="SOFT", start_lap=1, end_lap=1, tyre_life_at_start=1),
        stint(stint_number=2, compound="HARD", start_lap=2, end_lap=20, tyre_life_at_start=1),
    ]
    pit_stops = [pit_stop(stop_number=1, lap_number=1, pit_lane_time_seconds=36.563)]

    boundary = identify_boundary_laps(stints, pit_stops)

    assert 1 in boundary.in_lap_numbers
    assert 1 not in boundary.out_lap_numbers
    assert 2 in boundary.out_lap_numbers


def test_missing_pit_stop_duration_does_not_affect_in_lap_classification() -> None:
    pit_stops = [pit_stop(lap_number=15, pit_lane_time_seconds=None)]

    boundary = identify_boundary_laps(stints=[], pit_stops=pit_stops)

    assert 15 in boundary.in_lap_numbers


def test_no_stints_yields_no_out_laps() -> None:
    boundary = identify_boundary_laps(stints=[], pit_stops=[pit_stop(lap_number=5)])

    assert boundary.out_lap_numbers == frozenset()


def test_no_pit_stops_yields_no_in_laps() -> None:
    boundary = identify_boundary_laps(
        stints=[stint(stint_number=1, start_lap=1, end_lap=10)], pit_stops=[]
    )

    assert boundary.in_lap_numbers == frozenset()


def test_is_boundary_lap_is_true_for_either_in_lap_or_out_lap() -> None:
    stints = [
        stint(stint_number=1, start_lap=1, end_lap=10),
        stint(stint_number=2, start_lap=11, end_lap=20),
    ]
    pit_stops = [pit_stop(lap_number=10)]

    boundary = identify_boundary_laps(stints, pit_stops)

    assert boundary.is_boundary_lap(10) is True  # in-lap
    assert boundary.is_boundary_lap(11) is True  # out-lap
    assert boundary.is_boundary_lap(5) is False
