"""PitWall API response models for cross-season driver pace trends (M17).
See docs/m17-design-review.md §5.

Anti-corruption boundary, same as every other models module (docs/adr/0009).
Deliberately a subset of `app.models.session_analytics.DriverSummary`'s
fields (M8), not a new metric shape: `full_throttle_pct` is omitted
entirely (docs/m17-design-review.md §2 -- the route never fetches
telemetry, so that field would always be null; a field that's always null
is misleading, not just unused) and so are `outlier_lap_count`/
`lap_times_ms`/`laps` (per-session detail not meaningful at trend-point
granularity). Kept intentionally small, per the design's own instruction.
"""

from app.models.telemetry import ApiModel, SessionType


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
