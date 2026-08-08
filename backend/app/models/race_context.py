"""PitWall API response models for stints and pit stops (M10).

Anti-corruption boundary, same as telemetry.py/lap_comparison.py/
session_analytics.py (docs/adr/0009): independently defined from
`pitwall_pipeline.models`, not imported from it (docs/m10-design-review.md
§5.2). These models are what `RaceContextRepository` returns *and* what the
route serializes -- the same single-model-layer pattern `TelemetryRepository`
already uses, no separate internal-domain-object mapping step. See
docs/adr/0011-hybrid-storage-architecture.md for why this data lives in a
second, separate repository rather than as an extension of
`TelemetryRepository`.

`session_id` is dropped everywhere -- every route in this module is
session-scoped by URL path. `driver_id` is kept on both models: `PitStop`
always has, and `Stint` gained in M11 (docs/m11-design-review.md §6.1),
`driver_id` because `RaceContextRepository.list_stints`/`list_pit_stops`
both support an optional `driver_id` filter and a response can therefore
span multiple drivers -- the same reason the existing `Lap` model keeps
`driver_id` but drops `session_id`. On the existing single-driver
`GET /sessions/{session_id}/drivers/{driver_id}/stints` route this is a
redundant-but-harmless additive field (M10's `compound`-on-`Lap` precedent
for "additive, non-breaking"); on M11's session-wide read it's required to
tell one driver's stints apart from another's.
"""

from app.models.telemetry import ApiModel


class Stint(ApiModel):
    """One driver's one stint: a contiguous run of laps on one tyre set."""

    driver_id: str
    stint_number: int
    compound: str
    start_lap: int
    end_lap: int
    tyre_life_at_start: int | None


class PitStop(ApiModel):
    """One pit stop.

    `pit_lane_time_seconds` measures pit-lane entry-to-exit time (FastF1's
    `PitOutTime - PitInTime`), not stationary box time -- it includes
    driving through the pit lane, not just the tyre change itself. Any
    consumer surfacing this value must not label it "pit stop duration"
    without that caveat (docs/m10-design-review.md §3.1).
    """

    driver_id: str
    stop_number: int
    lap_number: int
    pit_lane_time_seconds: float | None
