"""Valid-lap classification and yellow-flag exclusion (M8 §10).

`is_accurate`, not `is_valid`: `is_valid` does not exist anywhere on the
`Lap` model (Phase 0 finding, plan §0.2 Q3) -- `is_accurate` (FastF1's own
telemetry-integrity heuristic) is the only lap-quality signal in the
current schema, and is the same field M6's `collect_warnings`
(app/services/lap_comparison/validation.py) already keys off of.

Yellow-flag exclusion is layered on top as a second, independent filter,
structured to activate once track-status data exists but implemented as a
no-op today, since no such data exists anywhere in the Parquet schema or
pipeline models (Phase 0 finding, plan §0.2 Q3). There is also no distinct
out-lap/in-lap signal to check, so `ExclusionReason` only ever resolves to
`"yellow_flag"` or `None`, never `"out_lap"`/`"in_lap"` (plan §0.1 B4
correction) -- those two values are not representable from any data this
codebase has today.
"""

from dataclasses import dataclass
from typing import Literal

from app.models.telemetry import Lap

ExclusionReason = Literal["yellow_flag"]


@dataclass(frozen=True)
class LapValidity:
    """One lap's validity classification for session analytics."""

    is_valid: bool
    exclusion_reason: ExclusionReason | None


def _yellow_flag_reason(lap: Lap) -> ExclusionReason | None:
    """No-op today: no track-status field exists on `Lap` to check (Phase 0
    finding, Q3). Kept as its own function, not inlined, so the eventual
    real check has one obvious place to land without a caller-side change.
    """
    del lap  # unused until track-status data exists
    return None


def classify_lap(lap: Lap) -> LapValidity:
    """Classify one lap: `is_valid` from `lap.is_accurate`, plus a
    (currently always-`None`) `exclusion_reason` slot for yellow-flag/
    track-status exclusion once that data exists.
    """
    return LapValidity(is_valid=lap.is_accurate, exclusion_reason=_yellow_flag_reason(lap))


def filter_valid_laps(laps: list[Lap]) -> list[Lap]:
    """Laps counted in `valid_lap_count` -- accurate laps only, regardless
    of yellow-flag status (§10: out-lap/in-lap and inaccurate laps are
    excluded here; a yellow-flag-affected lap is still "valid" in this
    sense but excluded from the stricter aggregate-stats population by
    `filter_for_aggregate_stats`).
    """
    return [lap for lap in laps if classify_lap(lap).is_valid]


def filter_for_aggregate_stats(laps: list[Lap]) -> list[Lap]:
    """Laps eligible for theoretical-best/consistency/best-lap/median
    computation: valid AND not excluded for a reason like yellow-flag
    (§10's "different, more defensible choice" vs. M6 -- a single distorted
    lap shouldn't silently corrupt an aggregate ranking statistic). Equal
    to `filter_valid_laps` today since yellow-flag exclusion is a no-op,
    but kept as a distinct function so callers express which population
    they mean.
    """
    return [
        lap
        for lap in laps
        if (validity := classify_lap(lap)).is_valid and validity.exclusion_reason is None
    ]
