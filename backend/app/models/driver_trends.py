"""PitWall API response models for cross-season driver trends: pace (M17)
and stint/tyre-strategy (M21). See docs/m17-design-review.md §5 and
docs/m21-design-review.md §3.

Anti-corruption boundary, same as every other models module (docs/adr/0009).
`SeasonPaceTrendPoint` is deliberately a subset of
`app.models.session_analytics.DriverSummary`'s fields (M8), not a new
metric shape: `full_throttle_pct` is omitted entirely (docs/m17-design-
review.md §2 -- the route never fetches telemetry, so that field would
always be null; a field that's always null is misleading, not just
unused) and so are `outlier_lap_count`/`lap_times_ms`/`laps` (per-session
detail not meaningful at trend-point granularity). `SeasonTyreTrendPoint`
reuses `app.models.tyre_performance.DriverStrategySummary` (M11) in full,
nested rather than flattened -- see that class's own docstring for why.
Both kept intentionally small, per each milestone's own instruction.
"""

from app.models.telemetry import ApiModel, SessionType
from app.models.tyre_performance import DriverStrategySummary


class SeasonPaceTrendPoint(ApiModel):
    """One session's pace summary within a driver's season trend.

    `event_id`/`event_name`/`round_number`/`session_date` are carried on
    every point (not just implied by response order) so the frontend can
    label each point correctly without re-deriving identity from ordering
    alone.
    """

    session_id: str
    event_id: str
    event_name: str
    round_number: int
    session_date: str | None
    valid_lap_count: int
    best_lap_ms: float | None
    median_lap_ms: float | None
    theoretical_best_lap_ms: float | None
    consistency_ms: float | None
    consistency_cv: float | None


class SeasonPaceTrendResponse(ApiModel):
    """`GET /drivers/{driver_id}/seasons/{season}/pace-trend`.

    `points` is ordered by `session_date` ascending (falling back to
    `SessionType`'s own declaration order for an undated session), never
    by `round_number` alone (docs/m17-design-review.md §6 -- M12 §18 Q2,
    round-number stability, remains open and this response doesn't depend
    on it). A round the driver didn't compete in is omitted entirely, not
    represented as a null point (docs/m17-design-review.md §5.1).
    """

    driver_id: str
    season: int
    session_type: SessionType
    points: list[SeasonPaceTrendPoint]


class SeasonTyreTrendPoint(ApiModel):
    """One session's stint/tyre-strategy shape within a driver's season
    trend (M21, docs/m21-design-review.md §3).

    Carries the same identity fields as `SeasonPaceTrendPoint`
    (`session_id`/`event_id`/`event_name`/`round_number`/`session_date`),
    for the same reason. `strategy` is `DriverStrategySummary` (M11)
    reused unchanged and nested, not flattened -- this point reuses all of
    that model's fields, not a subset, matching the nesting precedent
    `app.models.stint_comparison.DriverStintComparisonSide` already
    established (M15) rather than M17's own flattening (M17 exposed only a
    subset of `DriverSummary`'s fields, so flattening made sense there;
    here every field is reused, so nesting the existing model is simpler
    than restating its fields). Deliberately excludes per-stint pace
    consistency, raw laps, and pit-stop timing -- see
    docs/m21-design-review.md §3 for why each was considered and rejected.
    """

    session_id: str
    event_id: str
    event_name: str
    round_number: int
    session_date: str | None
    strategy: DriverStrategySummary


class SeasonTyreTrendResponse(ApiModel):
    """`GET /drivers/{driver_id}/seasons/{season}/tyre-trend`.

    `points` ordering, never-404, and roster-absent-omission semantics are
    identical to `SeasonPaceTrendResponse` (see that class's docstring) --
    the only behavioral difference is that a session where the driver is
    on the roster but has zero recorded stints still produces a point
    (`strategy.stint_count == 0`, empty `compound_sequence`/
    `stint_lengths`) rather than being omitted, since
    `driver_strategy_summary([])` already produces exactly that shape with
    no special-casing needed (docs/m21-design-review.md §3).
    """

    driver_id: str
    season: int
    session_type: SessionType
    points: list[SeasonTyreTrendPoint]


class SeasonPaceTrendComparisonResponse(ApiModel):
    """`GET /drivers/pace-trend/compare` (M25, docs/m25-design-review.md §4).

    `a`/`b` are two complete, unmodified `SeasonPaceTrendResponse` sides --
    not a new flattened shape, not a computed-metric shape. Each side is
    resolved fully independently (own driver, own season, shared
    `session_type`); there is no cross-side computation, alignment, or
    comparative field of any kind, matching `StintComparisonResponse`'s own
    "disclose, don't judge" precedent (M15). Deliberately no `warnings`
    field: unlike a single-session stint comparison, a season-granularity
    comparison has no equivalent "different circuit" concern -- a season
    already spans every circuit on the calendar by definition, and an empty
    side's `points` list already self-describes "no data for this
    driver/season" exactly as it does for the single-driver endpoint.
    """

    a: SeasonPaceTrendResponse
    b: SeasonPaceTrendResponse
