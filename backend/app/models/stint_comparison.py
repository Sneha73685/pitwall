"""PitWall API response models for cross-session stint & tyre-strategy
comparison (M15). See docs/m15-design-review.md §4.

Anti-corruption boundary, same as every other models module (docs/adr/0009).
Deliberately adds no new *fact* fields -- only a new *pairing* shape around
three already-existing, already-descriptive models: `DriverStrategySummary`
and `StintPace` (both M11, `app.models.tyre_performance`) and `PitStop` (M10,
`app.models.race_context`). Reused directly, not duplicated or renamed.

`StintPaceLap` (M11's raw per-lap detail) is deliberately NOT included
anywhere in this module (docs/m15-design-review.md §4/§5, Decision A,
approved): this comparison stays summary-level.

No computed strategy deltas, verdicts, or comparative numbers exist here
(docs/m15-design-review.md §5, Decision B, approved) -- `a`/`b` are returned
independently; a human reader draws the comparison, the same
disclose-don't-judge boundary `app.models.tyre_performance`'s own docstring
already enforces for `RawLapTimeByCompound`.
"""

from enum import Enum

from app.models.race_context import PitStop
from app.models.telemetry import ApiModel
from app.models.tyre_performance import DriverStrategySummary, StintPace


class StintComparisonWarningCode(str, Enum):
    """Stable vocabulary for `StintComparisonWarning.code` -- a new enum,
    not an extension of `app.models.lap_comparison.WarningCode`, since that
    module's circuit-mismatch logic is deliberately re-implemented per
    feature at the route layer rather than shared (docs/m13-design-review.md
    §5/§9's reasoning, carried forward here: neither comparison engine
    should have to know the other exists).
    """

    # Session A and session B have different Session.location values.
    # Computed in app/api/stints_compare.py, mirroring
    # app/api/laps_compare.py's _circuit_mismatch_warning exactly --
    # comparison is still allowed and still computed; this only discloses
    # that a strategy comparison across circuits may be less meaningful
    # (track characteristics -- degradation, pit-lane length, corner count
    # -- directly shape strategy, more so than they shape a raw telemetry
    # trace).
    DIFFERENT_CIRCUIT = "different_circuit"
    # Side A/B has zero stints for the requested session/driver. Not a 404:
    # an unknown/typo'd driver_id is indistinguishable from a valid driver
    # with genuinely no stint data under RaceContextRepository's existing
    # contract, and no route in this area validates driver existence either
    # (docs/m15-design-review.md §9). Matches ADR-0011's "absence is data,
    # not failure."
    NO_STINT_DATA_A = "no_stint_data_a"
    NO_STINT_DATA_B = "no_stint_data_b"


class StintComparisonWarning(ApiModel):
    """One reason this comparison may be incomplete or misleading. Non-blocking."""

    code: StintComparisonWarningCode
    detail: str | None = None


class DriverStintComparisonSide(ApiModel):
    """One driver's strategy for one session -- one side of a pairwise
    comparison. `strategy`/`stints`/`pit_stops` are exactly the shapes
    `GET /sessions/{id}/drivers/{id}/stint-pace` and
    `driver_strategy_summary` already produce, reused unchanged.
    """

    session_id: str
    driver_id: str
    strategy: DriverStrategySummary
    stints: list[StintPace]
    pit_stops: list[PitStop]


class StintComparisonResponse(ApiModel):
    """`GET /stints/compare`. Two independently-resolved sides (may be the
    same session/driver on both sides, or two entirely different ones,
    mirroring `LapComparisonResponse`'s own `a`/`b` independence) plus
    non-blocking warnings. No aligned grid, no delta series -- stints/
    pit-stops are discrete, ordered lists, not continuous samples, so there
    is no alignment problem to solve here (docs/m15-design-review.md §8).
    """

    a: DriverStintComparisonSide
    b: DriverStintComparisonSide
    warnings: list[StintComparisonWarning]
