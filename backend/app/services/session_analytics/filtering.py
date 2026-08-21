"""Valid-lap classification and yellow-flag exclusion (M8 §10).

`is_accurate`, not `is_valid`: `is_valid` does not exist anywhere on the
`Lap` model (Phase 0 finding, plan §0.2 Q3) -- `is_accurate` (FastF1's own
telemetry-integrity heuristic) is the only lap-quality signal in the
current schema, and is the same field M6's `collect_warnings`
(app/services/lap_comparison/validation.py) already keys off of.

Yellow-flag exclusion is layered on top as a second, independent filter.
Was a no-op from M8 through M35 (no track-status data existed anywhere in
the schema, plan §0.2 Q3); M36 (docs/m36-design-review.md) activates it
using `Lap.track_status`, FastF1's own per-lap track-status code(s)
(source: `ff1_session.laps`' `TrackStatus` column, already loaded for
every session). There is also no distinct out-lap/in-lap signal to check,
so `ExclusionReason` only ever resolves to `"yellow_flag"` or `None`,
never `"out_lap"`/`"in_lap"` (plan §0.1 B4 correction) -- those two values
are not representable from any data this codebase has today.
"""

from dataclasses import dataclass
from typing import Literal

from app.models.telemetry import Lap

ExclusionReason = Literal["yellow_flag"]

# FastF1 status codes (fastf1.api.track_status_data): '1' clear, '2'
# yellow, '3' undocumented/never observed by FastF1 itself, '4' Safety
# Car, '5' red flag, '6' VSC deployed, '7' VSC ending (still under
# VSC-equivalent restriction until '1' marks the actual end). '3' is
# deliberately excluded from this set: its meaning is unknown even to
# FastF1's own maintainers, and this feature should only exclude laps
# we're confident were non-representative, not guess (docs/m36-design-review.md
# §2).
_EXCLUDED_TRACK_STATUS_CODES = frozenset({"2", "4", "5", "6", "7"})


@dataclass(frozen=True)
class LapValidity:
    """One lap's validity classification for session analytics."""

    is_valid: bool
    exclusion_reason: ExclusionReason | None


def _yellow_flag_reason(lap: Lap) -> ExclusionReason | None:
    """M36 (docs/m36-design-review.md §2/§3): `lap.track_status` is a
    concatenated string of every FastF1 status code active during the lap
    (e.g. "1", "2", "241"), not a single code -- a lap that starts under
    yellow and finishes after the all-clear gets "21". Membership, not
    equality, is therefore the correct check: excluded if any code in
    `_EXCLUDED_TRACK_STATUS_CODES` appears anywhere in the string. `None`
    (no track-status data -- any session ingested before M36) and `""`
    (FastF1 recorded zero status events for this session) both correctly
    resolve to "not excluded" here with no special-casing needed: `None`
    is checked explicitly, and iterating an empty string finds no codes.
    """
    if lap.track_status is None:
        return None
    if any(code in _EXCLUDED_TRACK_STATUS_CODES for code in lap.track_status):
        return "yellow_flag"
    return None


def classify_lap(lap: Lap) -> LapValidity:
    """Classify one lap: `is_valid` from `lap.is_accurate`, plus
    `exclusion_reason` from `lap.track_status` (M36 -- see
    `_yellow_flag_reason`; `None` for any session ingested before M36).
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
    to `filter_valid_laps` for any session ingested before M36, or for a
    session with no yellow/Safety-Car/VSC/red-flag laps -- kept as a
    distinct function so callers express which population they mean, and
    because M36 (docs/m36-design-review.md) makes the two genuinely
    diverge for a session with a flagged period.
    """
    return [
        lap
        for lap in laps
        if (validity := classify_lap(lap)).is_valid and validity.exclusion_reason is None
    ]
