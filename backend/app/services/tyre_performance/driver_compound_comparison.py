"""Raw, per-driver lap-time-by-compound display (M11 §4.1 #18,
docs/m11-design-review.md §4.3).

This is deliberately NOT a "driver pace comparison," "driver ranking," or
any normalized performance claim. Comparing raw lap times across drivers on
the same compound is confounded by fuel load, track position/traffic,
track evolution, session conditions, and driver/team/car differences --
none of which this data model controls for (docs/m11-design-review.md
§4.3's confound table). The only dimension partially aligned here is tyre
age, via `lap_in_stint_index` (the same axis `compound_aggregation.py`
uses).

`RawLapTimeByCompound` therefore has no `rank`, `position`, `faster_than`,
`pace_score`, `normalized_pace`, `performance_score`, or `degradation_rate`
field, and never will -- a caller with a legitimate need for one of those
concepts must build it outside this module, with its own explicit
normalization assumptions, not by reinterpreting this output.

Like `compound_aggregation.py`, callers must pass already trend-eligible
positions; this module applies no validity or in/out-lap filtering itself.
"""

import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.services.tyre_performance.stint_join import LapStintPosition


@dataclass(frozen=True)
class RawLapTimeByCompound:
    """One driver's raw lap times on one compound, within this session.

    A legitimate descriptive summary (`median_lap_time_ms`) is included;
    no comparative or ranking field is or will be added -- see this
    module's docstring."""

    driver_id: str
    compound: str
    lap_count: int
    lap_times_ms: list[float]
    lap_in_stint_indices: list[int]
    median_lap_time_ms: float | None


def raw_lap_times_by_compound(
    eligible_positions_by_driver: Mapping[str, Sequence[LapStintPosition]],
) -> list[RawLapTimeByCompound]:
    """One `RawLapTimeByCompound` per (driver, compound) pair present in
    the input, sorted alphabetically by (driver_id, compound) -- never by
    pace or any derived metric, so list order cannot be misread as a
    ranking (docs/m11-design-review.md §4.3, §8)."""
    grouped: dict[tuple[str, str], list[LapStintPosition]] = {}
    for driver_id, positions in eligible_positions_by_driver.items():
        for position in positions:
            if position.compound is None or position.lap.lap_time_seconds is None:
                continue
            grouped.setdefault((driver_id, position.compound), []).append(position)

    results = []
    for driver_id, compound in sorted(grouped):
        ordered = sorted(grouped[(driver_id, compound)], key=lambda p: p.lap.lap_number)
        lap_times_ms = [
            position.lap.lap_time_seconds * 1000.0
            for position in ordered
            if position.lap.lap_time_seconds is not None
        ]
        lap_in_stint_indices = [
            position.lap_in_stint_index
            for position in ordered
            if position.lap_in_stint_index is not None
        ]
        results.append(
            RawLapTimeByCompound(
                driver_id=driver_id,
                compound=compound,
                lap_count=len(lap_times_ms),
                lap_times_ms=lap_times_ms,
                lap_in_stint_indices=lap_in_stint_indices,
                median_lap_time_ms=statistics.median(lap_times_ms) if lap_times_ms else None,
            )
        )
    return results
