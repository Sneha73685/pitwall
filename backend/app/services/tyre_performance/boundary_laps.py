"""Identify in-laps and out-laps for one driver's stints/pit stops (M11
§4.1 #7, docs/m11-design-review.md §5.2).

A lap is an in-lap if it is the lap on which a pit stop is recorded
(`PitStop.lap_number`); a lap is an out-lap if it is the first lap of any
stint after the driver's first (`Stint.start_lap`). The driver's very first
stint's `start_lap` is never an out-lap -- it's the start of the race/
session, not an exit from the pits.

Callers are expected to pass `stints`/`pit_stops` already scoped to one
driver (the same precondition `stint_join.join_laps_to_stints` has for
`stints`) -- this module does not filter by `driver_id` itself.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.models.race_context import PitStop, Stint


@dataclass(frozen=True)
class StintBoundaryLaps:
    """One driver's in-lap/out-lap numbers for one session."""

    in_lap_numbers: frozenset[int]
    out_lap_numbers: frozenset[int]

    def is_boundary_lap(self, lap_number: int) -> bool:
        return lap_number in self.in_lap_numbers or lap_number in self.out_lap_numbers


def identify_boundary_laps(
    stints: Sequence[Stint], pit_stops: Sequence[PitStop]
) -> StintBoundaryLaps:
    """Build `StintBoundaryLaps` from one driver's stints and pit stops.

    A pit stop's duration being unknown (`pit_lane_time_seconds is None`)
    does not affect in-lap classification -- only `lap_number` is used.
    Missing stint data (`stints` empty) simply yields no out-laps; missing
    pit-stop data yields no in-laps. Neither case raises.
    """
    in_lap_numbers = frozenset(pit_stop.lap_number for pit_stop in pit_stops)

    ordered_stints = sorted(stints, key=lambda stint: stint.stint_number)
    out_lap_numbers = frozenset(stint.start_lap for stint in ordered_stints[1:])

    return StintBoundaryLaps(in_lap_numbers=in_lap_numbers, out_lap_numbers=out_lap_numbers)
