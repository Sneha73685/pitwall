# PitWall — Backend API Schema (M2)

Design note for M2 (backend API), per `CLAUDE.md`'s "design before code" rule. Companion to
`docs/data-model.md` (the pipeline's internal schema) — this document defines the *other* side of
the anti-corruption boundary (ADR-0009): the schema `TelemetryRepository` returns and the API
exposes. Nothing here is shared code with the pipeline; the backend workspace has no dependency on
`pitwall_pipeline` (separate `pyproject.toml`, no FastF1/matplotlib/scipy in this service).

## Scope note

M2 covered exactly what PRD §3 asked for: "FastAPI service reading the cache; endpoints for
sessions, drivers, laps, telemetry; OpenAPI docs; basic tests." Track-point data was deliberately
deferred at the time (no consumer until M4's track map); M4 (below) adds it now that one exists.

Two-lap comparison, sector-time comparison, and delta-graph computation (M6) are still out of scope
here — this API only reads and serves what M1 already wrote to Parquet, it doesn't compute anything
new.

## M4 addition: track points

`GET /sessions/{session_id}/track` returns `list[TrackPoint]` (`distance_m`, `x`, `y` — `session_id`
dropped per the usual URL-implied-field convention below), read from the session's `track.parquet`
via a new `list_track_points(session_id)` method on `TelemetryRepository`. Same 404 convention as
`/drivers`/`/laps`: 404 if the session doesn't exist, empty list (200) if the session exists but has
no track points (the pipeline's `_derive_track_points` returns `[]` when no fastest lap was found —
see `docs/data-model.md`). Points are returned sorted by `distance_m`, matching `/telemetry`'s
existing convention, so the frontend can build an SVG path directly without re-sorting.

This is genuinely a separate resource from `/telemetry` (track geometry is session-level, derived
once from a reference lap, not per-driver/per-lap), so it gets its own route module
(`app/api/track.py`) rather than living in `sessions.py` or `telemetry.py`, mirroring how
`telemetry.py` was already split out from `sessions.py` in M2 despite sharing the `/sessions`
prefix.

## M10 addition: stints and pit stops

`GET /sessions/{session_id}/drivers/{driver_id}/stints` returns `list[Stint]` (`stint_number`,
`compound`, `start_lap`, `end_lap`, `tyre_life_at_start` — `session_id`/`driver_id` dropped, both
already implied by the URL path). `GET /sessions/{session_id}/pit-stops?driver_id=` returns
`list[PitStop]` (`driver_id`, `stop_number`, `lap_number`, `pit_lane_time_seconds` — `session_id`
dropped, `driver_id` kept since the filter is optional and a response can span multiple drivers, the
same reason `Lap` keeps `driver_id`). Both routes check session existence via the existing
`TelemetryRepository` dependency (404 if the session doesn't exist); an existing session with no
stint/pit-stop rows yet returns `200` with an empty list, not `404` (ADR-0011 — absence isn't an
error).

Read from a **second**, independent repository interface, `RaceContextRepository`
(`app/repositories/race_context.py`, ADR-0011), backed by PostgreSQL — not an extension of
`TelemetryRepository`, and not read from Parquet. See `docs/m10-design-review.md` and ADR-0011 for
the full rationale for splitting relational race-context data into a second store/interface instead
of extending `TelemetryRepository`/`ParquetRepository`.

`Lap` also gains one new nullable field, `compound: str | None`, additive and non-breaking on the
existing `GET /sessions/{session_id}/laps` response — read from Parquet (`laps.parquet`'s new
`compound` column), not Postgres.

## M11 addition: tyre & stint performance analytics

Two new, session-scoped read endpoints, both descriptive-only (no fitted trend, degradation rate,
ranking, fuel correction, or traffic/weather adjustment — see `docs/m11-design-review.md` §4/§8 for
the full non-goal list this boundary enforces):

`GET /sessions/{session_id}/drivers/{driver_id}/stint-pace` returns `DriverStintPaceResponse`
(`session_id`, `driver_id`, `laps: list[StintPaceLap]`, `stints: list[StintPace]`). `StintPaceLap`
is one raw lap annotated with its stint context — `lap_number`, `lap_time_seconds`, `compound`,
`stint_number`, `lap_in_stint_index`, plus `is_valid`/`is_in_lap`/`is_out_lap`/`is_trend_eligible`
flags. Every lap the driver had appears here, including in-laps, out-laps, and invalid laps —
excluded observations are flagged, never omitted. `StintPace` is one stint's identity plus its
trend-eligible-lap consistency summary — `stint_number`, `compound`, `start_lap`, `end_lap`,
`tyre_life_at_start`, `eligible_lap_count`, `consistency_ms`, `consistency_cv` (the latter two
reusing M8's `consistency_ms`/`consistency_cv` shape, `None` below 2 eligible laps). Every stint
appears here, even one with zero eligible laps (e.g. a one-lap stint that is itself the pit-in lap).

`GET /sessions/{session_id}/tyre-performance` returns `TyrePerformanceResponse` (`session_id`,
`driver_strategies`, `compound_usage`, `compound_aggregates`, `compound_lap_index_aggregates`,
`raw_lap_times_by_compound`) — a session-wide, all-drivers view:

- **`DriverStrategySummary`** (`driver_id`, `stint_count`, `compound_sequence`, `stint_lengths`) —
  one driver's factual stint sequence, never a judgement of whether it was a good strategy.
- **`CompoundUsageCount`** (`compound`, `stint_count`, `driver_count`, `total_laps`) — session-wide
  usage counts per compound, no ranking of compounds against each other.
- **`CompoundAggregate`** (`compound`, `lap_count`, `driver_count`, `lap_times_ms`,
  `median_lap_time_ms`, `p25_lap_time_ms`, `p75_lap_time_ms`) — one compound's pooled raw lap times
  plus standard descriptive statistics; never a fitted parameter.
- **`CompoundLapIndexAggregate`** (`compound`, `lap_in_stint_index`, `lap_count`, `lap_times_ms`,
  `median_lap_time_ms`) — one compound's trend-eligible laps at one lap-in-stint index, pooled
  across every driver/stint that reached it; no curve is fitted across index values.
- **`RawLapTimeByCompound`** (`driver_id`, `compound`, `lap_count`, `lap_times_ms`,
  `lap_in_stint_indices`, `median_lap_time_ms`) — one driver's raw lap times on one compound within
  this session, deliberately **not** a "driver pace comparison" or ranking: no `rank`, `position`,
  `faster_than`, `pace_score`, or `degradation_rate` field exists, or ever will, on this model. Raw
  lap-time differences between drivers are confounded by fuel load, track position/traffic, and
  driver/car differences that this data model does not control for (`docs/m11-design-review.md`
  §4.3).

Both routes check session existence via the existing `TelemetryRepository` dependency (404 if the
session doesn't exist); an existing session with no strategy data yet returns `200` with
empty/zero-valued collections, not `404` (the same ADR-0011 "absence isn't an error" convention M10
established). Read from **both** `TelemetryRepository` (Parquet) and `RaceContextRepository`
(PostgreSQL) at once — the first PitWall routes to do so for actual data, not just an existence
check — joined in `app/services/tyre_performance/` application code, never across storage engines
(`docs/architecture.md` §3, `docs/m11-design-review.md` §6.2).

`RaceContextRepository.list_stints` widens from a required `driver_id` to `list_stints(session_id,
driver_id: str | None = None)`, mirroring `list_pit_stops`'s existing optional-filter shape rather
than adding a second method. `Stint` gains one new field, `driver_id: str`, additive and
non-breaking on the existing `GET /sessions/{session_id}/drivers/{driver_id}/stints` response — the
existing per-driver route is unaffected (still passes `driver_id` explicitly); the field is only
required to tell drivers' stints apart on M11's session-wide read.

## Why the backend re-reads Parquet directly (not via the pipeline package)

`TelemetryRepository` (ADR-0006) is defined by the API's own read patterns, not by importing
`pitwall_pipeline`. The Parquet cache layout in `docs/data-model.md` is the contract between the two
workspaces — a file format, not a shared Python type — so the backend adds its own `pandas`/`pyarrow`
dependency (the same libraries the pipeline already uses to write the cache) and its own Pydantic
models, independent of the pipeline's `pitwall_pipeline.models` module. This keeps the backend's
dependency graph light (no FastF1, no matplotlib/scipy) and matches the modular-monolith principle
(ADR-0001): each workspace depends on the layer below it, never on a sibling workspace's internals.

## Data directory resolution

The backend reads from `{PITWALL_DATA_DIR}/processed/{season}/{event_slug}/{session_type}/*.parquet`
— the same layout `pipeline/pitwall_pipeline/cache_writer.py` writes (`docs/data-model.md`).
`PITWALL_DATA_DIR` (already declared in `docker-compose.yml` for the backend service, mounted from
the repo-root `data/` directory) defaults to `<repo_root>/data` for local non-Docker dev, matching
the convention `pipeline/pitwall_pipeline/smoke.py` established in M0 and that `docker-compose.yml`
and `.gitignore`'s `data/*` rule already assume.

## `TelemetryRepository` (`app/repositories/base.py`, ADR-0006)

```python
class TelemetryRepository(ABC):
    def list_sessions(self) -> list[Session]: ...
    def get_session(self, session_id: str) -> Session | None: ...
    def list_drivers(self, session_id: str) -> list[Driver]: ...
    def list_laps(self, session_id: str, driver_id: str | None = None) -> list[Lap]: ...
    def get_telemetry(self, session_id: str, driver_id: str, lap_number: int) -> list[TelemetrySample]: ...
```

Shaped directly around what the four M2 endpoints need — `list_laps`'s optional `driver_id` and
`get_telemetry`'s required `driver_id`/`lap_number` mirror the actual query patterns, not a generic
CRUD interface. `ParquetRepository` is the sole V1 implementation; nothing above this interface
(routes) knows it's Parquet-backed.

### Session lookup: match on `session_id`, don't parse it

`session_id` (e.g. `2023_monza_race`) is built by joining season/slug/session-type with
underscores, and `slugify()` itself also uses underscores as its separator (see
`pipeline/pitwall_pipeline/utils/ids.py`) — so a `session_id` string can't be unambiguously split
back into its three parts. `ParquetRepository` never tries: it walks `{base}/*/*/*/session.parquet`,
reads each session's stored `session_id` field, and matches against that. This also means the
backend needs no knowledge of the slugging rule at all — it only needs to know the fixed
three-level directory depth from `docs/data-model.md`.

## API response models (`app/models/telemetry.py`)

Pydantic models, independently defined from `pitwall_pipeline.models` (see above), but matching the
same fields for the subset M2 exposes:

- **`SessionType`** (str enum) — same vocabulary as the pipeline's (`practice_1/2/3`, `qualifying`,
  `sprint_qualifying`, `sprint`, `race`), redefined locally per the anti-corruption boundary.
- **`Session`** — `session_id`, `season`, `event_name`, `round_number`, `location`, `country`,
  `session_type`, `session_date`.
- **`Driver`** — `driver_id`, `driver_number`, `full_name`, `team_name`.
- **`Lap`** — `driver_id`, `lap_number`, `lap_time_seconds`, `sector_1_seconds`, `sector_2_seconds`,
  `sector_3_seconds`, `is_personal_best`, `is_accurate`.
- **`TelemetrySample`** — `distance_m`, `time_seconds`, `speed_kph`, `throttle_pct`, `brake_active`,
  `rpm`, `gear`, `drs_active`, `x`, `y`, `z`.
- **`TrackPoint`** (M4) — `distance_m`, `x`, `y`.
- **`Stint`** (M10, `app/models/race_context.py`) — `stint_number`, `compound`, `start_lap`,
  `end_lap`, `tyre_life_at_start`.
- **`PitStop`** (M10, `app/models/race_context.py`) — `driver_id`, `stop_number`, `lap_number`,
  `pit_lane_time_seconds`.
- **`Session`** gains two additive fields (M12, `app/models/telemetry.py`): `event_id: str` —
  `(season, event slug)`, computed via `app/utils/ids.py`'s `make_event_id()` (formula-identical to,
  but independently defined from, the pipeline's own copy — ADR-0009; never persisted) — and
  `has_telemetry: bool` — whether this session's telemetry is actually present in the Parquet cache,
  not always true even for a successfully ingested session (the verified 2018 finding,
  `docs/m12-design-review.md` §19.2). Every other pre-existing `Session` field is unchanged.
- **`SeasonSummary`** (M12, `app/models/discovery.py`) — `season`, `event_count`.
- **`EventSummary`** (M12, `app/models/discovery.py`) — `event_id`, `season`, `event_name`,
  `round_number`, `location`, `country`, `session_types: list[SessionType]` (the canonical types
  this event has at least one locally ingested session for, in `SessionType`'s own declaration
  order — not real weekend chronology, see below), `session_count`.

Neither `SeasonSummary` nor `EventSummary` is backed by a database row or a Parquet file of its
own — both are computed on every request from `TelemetryRepository.list_sessions()`, grouped in
`app/services/session_discovery/` (see `docs/data-model.md`'s M12 addition for why `Season`/`Event`
are discovery-time-only concepts, never persisted).

`session_id`/`driver_id`/`lap_number` are dropped from the nested `Lap`/`TelemetrySample`/
`TrackPoint` payloads where they're already implied by the URL path, to avoid repeating the same
value on every list item for no reason — a plain response-shaping choice, not an architectural one.

## Endpoints (`app/api/sessions.py`, `app/api/telemetry.py`, `app/api/track.py`)

| Method | Path | Returns | Not found behavior |
|---|---|---|---|
| GET | `/sessions` | `list[Session]` | — (empty list if cache is empty) |
| GET | `/sessions/{session_id}` | `Session` | 404 if no matching session |
| GET | `/sessions/{session_id}/drivers` | `list[Driver]` | 404 if session doesn't exist |
| GET | `/sessions/{session_id}/laps?driver_id=` | `list[Lap]` | 404 if session doesn't exist; empty list if `driver_id` filter matches nothing |
| GET | `/sessions/{session_id}/telemetry?driver_id=&lap_number=` | `list[TelemetrySample]` | 404 if session/driver/lap combination has no samples |
| GET | `/sessions/{session_id}/track` (M4) | `list[TrackPoint]` | 404 if session doesn't exist; empty list if no track points were derived |
| GET | `/sessions/{session_id}/drivers/{driver_id}/stints` (M10) | `list[Stint]` | 404 if session doesn't exist; empty list if the driver has no stint data yet |
| GET | `/sessions/{session_id}/pit-stops?driver_id=` (M10) | `list[PitStop]` | 404 if session doesn't exist; empty list if there's no matching pit-stop data yet |
| GET | `/sessions/{session_id}/drivers/{driver_id}/stint-pace` (M11) | `DriverStintPaceResponse` | 404 if session doesn't exist; empty `laps`/`stints` if the driver has no stint data yet |
| GET | `/sessions/{session_id}/tyre-performance` (M11) | `TyrePerformanceResponse` | 404 if session doesn't exist; empty/zero-valued collections if the session has no strategy data yet |
| GET | `/seasons` (M12, `app/api/seasons.py`) | `list[SeasonSummary]` | `200 []` if nothing is ingested yet — see below |
| GET | `/seasons/{season}/events` (M12) | `list[EventSummary]` | `200 []` if that season has no ingested sessions |
| GET | `/seasons/{season}/events/{event_id}/sessions` (M12) | `list[Session]` | `200 []` if that `(season, event_id)` has no ingested sessions |

`driver_id` and `lap_number` are both required query parameters on `/telemetry` — fetching a whole
session's telemetry in one response isn't a V1 read pattern (PRD's success criteria and
`docs/success-metrics.md` both describe "a lap's" traces, not a session's).

**Why the `/seasons` routes return `200 []`, never `404`, for an unknown `season`/`event_id`
(M12):** neither `season` nor `event_id` is a persisted, independently checkable resource — both
are aggregation keys computed over `TelemetryRepository.list_sessions()`, not rows in a catalogue
(design review §7's decision not to persist an `Event` table). There is no way to distinguish "this
season/event doesn't exist" from "it exists but nothing is ingested for it yet" without such a
catalogue, so both cases return an empty list — the same "absence is data, not failure" posture
ADR-0011 already established for `stints`/`pit_stops`. `404` stays reserved for `session_id`, the
one identity in this API a repository can actually check against a real, individually-stored
Parquet directory.

**Ordering (M12, `app/services/session_discovery/`):** seasons descending (newest first); events
within a season by `(round_number, event_id)` ascending — the identical rule the pipeline's own
`IngestionPlan` (M12 Phase 3) already applies; sessions within one event by `session_date`
ascending — the real timestamp already on every `Session` — falling back to `SessionType`'s
declaration order for the rare session with no recorded date. This backend-side ordering
deliberately differs from the pipeline's own `IngestionPlan` chronology, which orders by each
event's real `Session1..5` schedule-slot position instead: the backend has no access to that
schedule data (and must not call FastF1 to get it), so `session_date` — the only chronological
signal an already-ingested `Session` actually carries — is the closest available proxy, not an
attempt to reproduce the pipeline's own ordering exactly.

OpenAPI/Swagger docs are FastAPI's built-in `/docs` and `/openapi.json` (auto-generated from these
route/response-model definitions) — no separate hand-maintained API reference is written, since that
would just drift from the one FastAPI already generates correctly.

## Testing approach

Fixture-based, no network/FastF1, matching the pipeline's M1 pattern: a test helper writes a small,
synthetic Parquet cache (via `pandas`/`pyarrow`, same as `cache_writer.py` does for real) to a
`tmp_path`, `ParquetRepository` is pointed at it directly for repository-level tests, and FastAPI's
`app.dependency_overrides` swaps in that same repository for endpoint-level tests via `TestClient`.
