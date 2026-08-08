"""Join a driver's laps against their stints by lap-number range (M11 §4.1
#6/#7). This is the foundation every other tyre_performance module builds
on -- see docs/m11-design-review.md §5.2 and docs/m11-implementation-plan.md
Phase 1.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.models.race_context import Stint
from app.models.telemetry import Lap


@dataclass(frozen=True)
class LapStintPosition:
    """One lap annotated with its stint context.

    `lap` is the original, unmodified `Lap` object -- nothing here mutates
    it, and every other field is derived purely from range-matching against
    `stints`, never invented.

    `compound` prefers the matched stint's compound (the authoritative
    per-stint tyre identity); if the lap has no matching stint, it falls
    back to the lap's own `compound` field (M10's per-lap fact) instead of
    reporting `None` when a real value is available. Both sources are
    genuine ingested data -- this is a source-preference choice, not
    fabrication.

    `lap_in_stint_index` is 1-based (a stint's first lap is index 1) and is
    `None` exactly when `in_known_stint` is `False`. `tyre_life_at_stint_start`
    is the matched stint's own `tyre_life_at_start`, carried through
    unmodified -- this is NOT a per-lap tyre-life estimate; no arithmetic
    projects it across the stint (that would assume no missed/deleted laps
    and would be an inferred value, not an ingested one).
    """

    lap: Lap
    stint_number: int | None
    lap_in_stint_index: int | None
    compound: str | None
    tyre_life_at_stint_start: int | None
    in_known_stint: bool


def _matching_stint(lap_number: int, ordered_stints: Sequence[Stint]) -> Stint | None:
    """First stint (by ascending `stint_number`) whose lap range contains
    `lap_number`. Real ingested stint data has no overlapping ranges for one
    driver, so "first match" only matters as a defensive, deterministic
    tie-break for malformed input -- it is not expected to matter in
    practice.
    """
    return next(
        (stint for stint in ordered_stints if stint.start_lap <= lap_number <= stint.end_lap),
        None,
    )


def join_laps_to_stints(laps: Sequence[Lap], stints: Sequence[Stint]) -> list[LapStintPosition]:
    """Annotate every lap in `laps` with its stint context, if any.

    Every lap produces exactly one `LapStintPosition` -- a lap outside every
    known stint range (missing stint data, a session ingested before M10,
    or a genuine gap) is still returned, with `in_known_stint=False` and
    `stint_number`/`lap_in_stint_index`/`tyre_life_at_stint_start` all
    `None`. Laps are never silently discarded here; population-scoping
    (e.g. restricting to laps inside a known stint) is a downstream
    concern -- see `stint_eligibility.py`.
    """
    ordered_stints = sorted(stints, key=lambda stint: stint.stint_number)
    ordered_laps = sorted(laps, key=lambda lap: lap.lap_number)

    positions: list[LapStintPosition] = []
    for lap in ordered_laps:
        matched = _matching_stint(lap.lap_number, ordered_stints)
        if matched is None:
            positions.append(
                LapStintPosition(
                    lap=lap,
                    stint_number=None,
                    lap_in_stint_index=None,
                    compound=lap.compound,
                    tyre_life_at_stint_start=None,
                    in_known_stint=False,
                )
            )
            continue
        positions.append(
            LapStintPosition(
                lap=lap,
                stint_number=matched.stint_number,
                lap_in_stint_index=lap.lap_number - matched.start_lap + 1,
                compound=matched.compound,
                tyre_life_at_stint_start=matched.tyre_life_at_start,
                in_known_stint=True,
            )
        )
    return positions
