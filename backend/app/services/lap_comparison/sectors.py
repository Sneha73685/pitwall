"""Per-sector delta aggregation for two-lap comparison (M6).

Only sector *times* exist anywhere in the current schema (Phase 0
finding: sector_1_seconds/sector_2_seconds/sector_3_seconds on Lap) --
there is no sector-boundary *distance* in either the backend or pipeline
models. This module derives boundary distances from lap A's own
telemetry (lap A is the UX's designated "reference" lap, per
docs/m6-design-review.md §1.1) by inverting the same distance<->time
relationship alignment.py already interpolates: np.interp with the x/y
arrays swapped (query by time, return distance), not new interpolation
logic.

Using lap A's boundaries for both laps is a deliberate choice, not an
oversight: there's no independent source of "where sector 1 actually
ends" to reconcile two laps against, so lap A is treated as the single
source of truth for where the boundaries are, and delta_ms (already a
pure function of distance) is sampled at those points for both laps.
"""

from typing import Literal

import numpy as np

from app.models.lap_comparison import SectorDelta
from app.models.telemetry import Lap, TelemetrySample
from app.services.lap_comparison.alignment import FloatArray

_SECTOR_NUMBERS: tuple[Literal[1, 2, 3], ...] = (1, 2, 3)


def _cumulative_sector_boundaries(lap: Lap) -> list[float]:
    """Cumulative elapsed time (seconds) at the end of sectors 1, 2, and 3.

    A missing sector time (an incomplete/partial lap) stops accumulation
    at that point rather than guessing a value for it -- callers get
    fewer boundaries, not a fabricated one.
    """
    boundaries: list[float] = []
    cumulative = 0.0
    for sector_seconds in (lap.sector_1_seconds, lap.sector_2_seconds, lap.sector_3_seconds):
        if sector_seconds is None:
            break
        cumulative += sector_seconds
        boundaries.append(cumulative)
    return boundaries


def compute_sector_deltas(
    lap_a: Lap,
    samples_a: list[TelemetrySample],
    grid: FloatArray,
    delta_ms: FloatArray,
) -> list[SectorDelta]:
    """Per-sector delta_ms, diffing delta_ms at consecutive sector-boundary
    distances (derived from lap A's sector times). Returns fewer than 3
    entries if lap A's sector times are incomplete, and [] if none exist.
    """
    boundary_times = _cumulative_sector_boundaries(lap_a)
    if not boundary_times:
        return []

    # Re-sort by time (not the repository's default distance order) before
    # inverting time->distance, for the same reason validation.py does --
    # np.interp's x-array (here, time) must be ascending to mean anything.
    ordered = sorted(samples_a, key=lambda sample: sample.time_seconds)
    time = np.array([sample.time_seconds for sample in ordered], dtype=float)
    distance = np.array([sample.distance_m for sample in ordered], dtype=float)

    boundary_distances = np.interp(boundary_times, time, distance)
    # Sector boundaries can't extend past the common grid (the shorter of
    # the two laps' max distance, per alignment.build_distance_grid) --
    # clip rather than extrapolate past what was actually compared.
    boundary_distances = np.clip(boundary_distances, grid[0], grid[-1])
    delta_at_boundaries = np.interp(boundary_distances, grid, delta_ms)

    sectors: list[SectorDelta] = []
    previous_delta = 0.0  # delta_ms(0) is always ~0 -- see test_delta_at_distance_zero_is_...
    for sector_number, boundary_delta in zip(_SECTOR_NUMBERS, delta_at_boundaries, strict=False):
        segment_delta = float(boundary_delta - previous_delta)
        sectors.append(
            SectorDelta(
                sector=sector_number,
                delta_ms=segment_delta,
                faster="a" if segment_delta >= 0 else "b",
            )
        )
        previous_delta = float(boundary_delta)
    return sectors
