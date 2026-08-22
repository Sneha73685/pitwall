# PitWall — Normalized Domain Model (M1)

Design note for M1 (ingestion pipeline), per `CLAUDE.md`'s "design before code" rule. Fills in the
`docs/data-model.md, TBD` reference left in the M0 scaffold
(`pipeline/pitwall_pipeline/providers/__init__.py`).

This defines the schema that sits at the "Normalization → internal schema" step in
`docs/architecture.md` §1: the shape `TelemetryProvider` implementations produce, and the shape
the (future, M2) `TelemetryRepository` reads back from Parquet. It is pipeline-internal — nothing
here is an API response model (ADR-0009 draws that line at the backend boundary, not here).

## Scope note

Only what V1 needs (PRD §2.1, `docs/success-metrics.md`): session/driver/lap identity, lap and
sector times, per-lap channel telemetry (speed/throttle/brake/RPM/gear/DRS) indexed by distance,
and track geometry for the map. Tire compound, stints, pit stops, weather, and position/gaps are
explicitly V3 (PRD §5) and are not modeled here, even though FastF1 exposes some of them on the
same objects (e.g. `Laps.Compound`) — pulling them in now would be scope creep against a later
milestone's data source (Jolpica-f1/Postgres), not a free extra field.

**Update (M10):** compound, `Stint`, and `PitStop` are now modeled — see "M10 additions" below.
Weather and position/gaps remain deferred (`docs/m10-design-review.md` §1.2).

**Update (M12):** `Event`/`EventDiscovery` (discovery-time only, no new persisted schema) — see
"M12 additions" below.

## Entities (`pitwall_pipeline/models.py`)

All are frozen Pydantic models (validation matters here: PRD §4 flags telemetry completeness as a
real risk, and Pydantic gives that validation for free at the normalization boundary; `pydantic` is
already a transitive dependency of `fastf1` and is now a direct one).

- **`SessionType`** (str enum) — `PRACTICE_1/2/3`, `QUALIFYING`, `SPRINT_QUALIFYING`, `SPRINT`,
  `RACE`. Normalizes FastF1's inconsistent session-name strings (`"Practice 1"`, `"Race"`, ...) to
  one stable vocabulary the rest of the system can rely on.
- **`Session`** — `session_id` (derived, e.g. `2023_monza_race`), `season`, `event_name`,
  `round_number`, `location`, `country`, `session_type`, `session_date` (UTC, optional — some
  historic/testing events lack it).
- **`Driver`** — `driver_id` (FastF1 3-letter `Abbreviation`, e.g. `VER`), `driver_number`,
  `full_name`, `team_name`, plus four additive M34 fields sourced from the same
  `ff1_session.results` FastF1 already loads: `classified_position`, `grid_position`, `status`,
  `points` (populated by FastF1 for Race/Sprint sessions only — Qualifying and Sprint Qualifying
  return empty/`None` values in every era, confirmed empirically during M38's execution; `None` for
  every other session type. `None` for any session ingested before M34 that M38 did not backfill —
  M38 backfilled 332 of the 334 applicable historical sessions; 2 are a permanent, genuine external
  Ergast-data-source gap, see `docs/m38-design-review.md` §14.1/§14.4).
- **`Lap`** — `session_id`, `driver_id`, `lap_number`, `lap_time_seconds` (`None` for an
  incomplete/invalid lap), `sector_1_seconds`, `sector_2_seconds`, `sector_3_seconds` (each
  `None`-able for the same reason), `is_personal_best`, `is_accurate` (FastF1's own
  telemetry-integrity flag — surfaced so a future consumer can choose to distrust a lap's
  telemetry rather than silently trusting noisy data), plus an additive M35 field,
  `position: int | None`, sourced from `ff1_session.laps`' `Position` column that FastF1 already
  loads — populated for Race/Sprint sessions only (Qualifying, Sprint Qualifying, and Practice all
  return `None`, confirmed empirically during M38); `None` for any session ingested before M35 that
  M38 did not backfill (332 of 334 applicable sessions backfilled, 2 permanently excluded — see
  `docs/m38-design-review.md` §14.1/§14.4) — an additive M36 field, `track_status: str | None`,
  sourced from `ff1_session.laps`' `TrackStatus` column (a concatenated string of every status code
  active during the lap, e.g. `"1"`, `"241"`; not session-type-restricted). `None` for any session
  ingested before M36 that M38 did not backfill (same 332/334 population) — and two additive M40
  fields, `deleted: bool | None` and `deleted_reason: str | None`, sourced from `ff1_session.laps`'
  `Deleted`/`DeletedReason` columns (FastF1's official lap-time-deletion ruling, populated from race
  control messages; not session-type-restricted, same as `track_status`). `deleted_reason` is the
  raw stewards' message (e.g. `"TRACK LIMITS AT TURN 10 (NEXT LAP)"`), empty-string normalized to
  `None`. `deleted`/`deleted_reason` are independent of `is_accurate` — a track-limits-deleted lap
  can have perfectly clean telemetry (confirmed empirically, `docs/m40-design-review.md` §17) — and
  feed only into `app/services/session_analytics/filtering.py`'s `exclusion_reason` (`"track_limits"`,
  taking precedence over `"yellow_flag"` when both apply for the single displayed reason,
  `docs/m40-design-review.md` §21), never `is_valid`. `None` for any session ingested before M40 —
  no historical backfill in M40 itself (`docs/m40-design-review.md` §24).
- **`TelemetrySample`** — one row of channel data for one driver/lap, keyed by `session_id`,
  `driver_id`, `lap_number` plus: `distance_m` (the common alignment axis PRD §4 calls for),
  `time_seconds` (lap-relative), `speed_kph`, `throttle_pct`, `brake_active`, `rpm`, `gear`,
  `drs_active`, `x`, `y`, `z`. Denormalized (keys repeated per row) deliberately: this is a
  columnar cache, not a relational store (ADR-0004), and repeated string/int keys compress well in
  Parquet.
- **`TrackPoint`** — `session_id`, `distance_m`, `x`, `y`: the track geometry used by the M4 track
  map, derived (not fetched) from telemetry — see below.
- **`NormalizedSessionData`** — the bundle a `TelemetryProvider.load_session()` call returns:
  `session`, `drivers: list[Driver]`, `laps: list[Lap]`, `telemetry: list[TelemetrySample]`,
  `track_points: list[TrackPoint]`. One bundle = one fully ingested session.

## `TelemetryProvider` (`pitwall_pipeline/providers/base.py`, ADR-0005)

```python
class TelemetryProvider(ABC):
    @abstractmethod
    def load_session(self, season: int, event: str, session_type: SessionType) -> NormalizedSessionData: ...
```

One method, shaped around what the ingestion entrypoint actually does: fetch one session, get back
fully normalized data. This is intentionally coarse rather than split into
`get_drivers`/`get_laps`/`get_telemetry` — V1 ingests a whole session in one batch job (PRD's
"pulls from FastF1, normalizes, and caches sessions server-side"), and a per-entity interface would
be speculative generality with no second caller to justify it yet (ADR-0005's own "grows when a
second real implementation forces it" principle).

## Normalization (`pitwall_pipeline/normalize.py`)

Kept as pure functions separate from `FastF1Provider` itself (mirroring the distinct "Provider" vs.
"Normalization" boxes in `docs/architecture.md`'s data-flow diagram), so mapping logic is
unit-testable against hand-built FastF1-shaped DataFrames without needing a fake `Session` object:

- `normalize_session(...) -> Session`
- `normalize_drivers(...) -> list[Driver]`
- `normalize_laps(...) -> list[Lap]`
- `normalize_telemetry(...) -> list[TelemetrySample]`

`FastF1Provider` is the only thing that calls FastF1's live/cached API; it calls these functions to
convert what it gets back into the internal schema before returning.

## TrackPoint derivation (`pitwall_pipeline/track.py`)

Track geometry isn't a FastF1 field — it's derived from one reference lap's telemetry (the
session's overall fastest timed lap), projecting each sample to its `(distance_m, x, y)`. One
reference lap is sufficient for V1's static track map (M4); V2's cursor-follows-car reuses
per-lap `TelemetrySample.x/y` directly rather than `TrackPoint`, so this stays a simple projection,
not a curve-fitting or smoothing step.

## Parquet cache layout (`pitwall_pipeline/cache_writer.py`)

```
data/processed/{season}/{event_slug}/{session_type}/
    session.parquet     # 1 row
    drivers.parquet
    laps.parquet
    telemetry.parquet
    track.parquet
```

This is a cache format, not an API contract — the (future, M2) `ParquetRepository` behind
`TelemetryRepository` (ADR-0006) is free to read it however it needs to; nothing here is exposed
past that boundary (ADR-0009). Layout is deliberately simple (one directory per ingested session)
since M1 doesn't yet need cross-session queries.

## M10 additions: `compound`, `Stint`, `PitStop`

Tire compound, stints, and pit stops — explicitly deferred above as "V3" when this document was
written for M1 — are modeled starting at M10 (ADR-0011). Weather and position/gaps remain deferred;
see `docs/m10-design-review.md` §1.2 for why M10 splits that bundle.

- **`Lap`** gains `compound: str | None = None` — a scalar per-lap fact (FastF1's `Laps.Compound`),
  identical in shape to `lap_time_seconds`. Still written to `laps.parquet`; no new store needed for
  this one field.
- **`Stint`** (new) — `session_id`, `driver_id`, `stint_number`, `compound`, `start_lap`, `end_lap`,
  `tyre_life_at_start`. Unlike every other model in this document, `Stint` is **not** written to
  Parquet — it's genuinely relational (a range of laps bounded by pit events), so it's written to
  PostgreSQL instead (`pitwall_pipeline/postgres_writer.py`), per ADR-0011.
- **`PitStop`** (new) — `session_id`, `driver_id`, `stop_number`, `lap_number`,
  `pit_lane_time_seconds` (pit-lane entry-to-exit time, not stationary box time). Also PostgreSQL,
  same reasoning as `Stint`.
- `normalize_stints()` / `normalize_pit_stops()` (`pitwall_pipeline/normalize.py`) derive these from
  the same FastF1 `Laps` DataFrame `normalize_laps()` already reads (`Stint`, `Compound`, `TyreLife`,
  `PitInTime`, `PitOutTime` columns — verified against a real FastF1 session,
  `docs/m10-implementation-plan.md` Phase 2 §2.0) — no new FastF1 call.

### PostgreSQL schema (`pipeline/pitwall_pipeline/migrations/`)

```
stints(session_id, driver_id, stint_number, compound, start_lap, end_lap, tyre_life_at_start)
    PRIMARY KEY (session_id, driver_id, stint_number)
pit_stops(session_id, driver_id, stop_number, lap_number, pit_lane_time_seconds)
    PRIMARY KEY (session_id, driver_id, stop_number)
```

Composite natural keys, not surrogate ids, so ingestion can upsert (`ON CONFLICT DO UPDATE`) instead
of accumulating duplicates on re-ingestion. No cross-engine foreign key back to Parquet — referential
integrity between the two stores is a convention (matching `session_id`/`driver_id` strings), enforced
by ingestion writing both in the same run, not by a database constraint. Full rationale in
ADR-0011.

## M11: no new persisted schema

M11 (tyre & stint performance analytics) introduces no new Parquet column, no new PostgreSQL table
or column, and no migration. It reads the `Lap`/`Stint`/`PitStop` data already defined above and
derives descriptive statistics (stint-scoped lap joins, in/out-lap flags, per-compound aggregates)
entirely in backend application code (`app/services/tyre_performance/`) — nothing new is written to
either store. See `docs/api-model.md`'s M11 addition for the derived API response shapes this
produces.

## M12 additions: `Event`/`EventDiscovery` (discovery-time only — no new persisted schema)

M12 (multi-season/event/session architecture) introduces a grouping identity *above* `Session` —
but, like M11, adds **no new Parquet column, no new PostgreSQL table or column, and no migration**.
`Event`/`EventDiscovery` are real Pydantic models in `pitwall_pipeline/models.py`, but neither is
ever written to Parquet or Postgres; both are computed at discovery time, from a single
schedule-only FastF1 call, and used only to plan and validate ingestion before it runs.

- **`Event`** (`pitwall_pipeline/models.py`) — `event_id` (derived, `{season}_{slugify(event_name)}`
  — see `make_event_id`), `season`, `round_number`, `event_name`, `event_format` (FastF1's own
  vocabulary — `conventional`/`sprint`/`sprint_shootout`/`sprint_qualifying`/`testing`, kept as metadata, not
  re-canonicalized), `location`, `country`, `event_date` (optional). The grouping identity
  Season → Event → Session discovery uses; **not** a new identity for `Session` itself — every
  already-existing `session_id` is completely unchanged by this.
- **`EventDiscovery`** (`pitwall_pipeline/models.py`) — one event's real, discovered session
  structure: the `Event` above, `session_names` (that event's real `Session1..5` display-name
  strings, in schedule order — `None` for a slot the event doesn't have), and `available_sessions`
  (`dict[SessionType, str]`, the canonical `SessionType` → literal FastF1 identifier map — an
  absent key means "not available for this event," never a misresolved or substituted session).
  Produced by `FastF1Provider.discover_event()`/`discover_season()` (one `fastf1.get_event_schedule()`
  call per season; no `.load()`, no lap/telemetry fetch).

### Relationship between discovered Season → Event → Session and persisted session data

Discovery and persistence are two genuinely separate concerns here, deliberately kept that way:

- **`Season`/`Event` are never persisted.** There is no `events` table and no `season`/`event_id`
  column added to any Parquet or PostgreSQL schema by M12. Both are computed on read — on the
  pipeline side, from a live (or FastF1-cached) schedule call at *discovery* time, before any
  ingestion happens; on the backend side, from the already-persisted `Session` rows' own
  `season`/`event_name` fields, grouped in `app/services/session_discovery/` (see
  `docs/api-model.md`'s M12 addition) — never from a fresh FastF1 call at request time.
  `app/utils/ids.py`'s `make_event_id()` independently reproduces the exact same `event_id` formula
  as the pipeline's own `make_event_id()` (parity-tested, `backend/tests/test_ids.py`), so both
  sides agree on one event's identity without either importing the other (ADR-0009).
- **The backend's independent API `Session` model gains one new, additive, computed field because
  of this: `event_id`** (`app/models/telemetry.py`, see `docs/api-model.md`'s M12 addition) —
  computed from that same session's `season`/`event_name`, not stored as a separate persisted
  column. This is a backend-only, response-model addition: `pitwall_pipeline.models.Session` (the
  entity this document defines above) is **not** changed — it gains no `event_id` field, since the
  pipeline's own `Event`/`EventDiscovery` already carry that identity at discovery time and have no
  need to duplicate it onto every ingested `Session` row. `session_id` itself (the identity this
  document already defines above) is completely unchanged on either side — M12 groups sessions by a
  computed event identity, it does not restructure or re-key them.
- **What discovery is actually used for:** `EventDiscovery` (and the multi-event/season planning
  built on it, `pitwall_pipeline/ingest_plan.py`'s `build_ingestion_plan()`/`execute_ingestion_plan()`)
  exists purely to decide, safely and reviewably, *what to ingest* — it has no runtime role once a
  session is already ingested. Once `ingest_session()` has written a session's Parquet (and, for
  stints/pit stops, Postgres) rows, that session is indistinguishable in storage from one ingested
  before M12 ever existed.

## M13–M19: no new persisted schema

None of M13 (cross-session lap comparison), M14 (synchronized cursor), M15 (cross-session stint
comparison), M16 (documentation reconciliation), M17 (cross-season pace trend), M18 (per-session
Parquet file caching), or M19 (telemetry driver/lap positional index) added a Parquet column, a
PostgreSQL table or column, or a migration — re-verified directly against `pipeline/` at M20
implementation time: zero changes to `pipeline/pitwall_pipeline/` (including
`pipeline/pitwall_pipeline/migrations/`) across the entire M15→M19 commit range. The Parquet cache
layout and PostgreSQL `stints`/`pit_stops` schema defined above (M1, M10) are exactly what every
session on disk, and every row in Postgres, still looks like.

**M14's cursor-sync is entirely frontend state** — page-scoped Zustand stores in the React app —
with no backend or data-layer involvement at all; it has no entry in this document because there
is nothing here for it to touch.

**M17→M18→M19 added caches, not schema — and the distinction is load-bearing, not incidental.**
`ParquetRepository` (`backend/app/repositories/parquet_repository.py`) now holds, per instance:

- a session-lookup index (M17): `session_id -> (session_dir, Session)`,
- four per-session file caches (M18): the unfiltered contents of `drivers.parquet`,
  `laps.parquet`, `telemetry.parquet`, `track.parquet`, each read at most once per session,
- a telemetry driver/lap positional index (M19): `(driver_id, lap_number) -> row positions` into
  the M18 telemetry cache, built via one `groupby(...).indices` pass at most once per session.

All three are **plain Python objects living on one `ParquetRepository` instance, for the lifetime
of one request** — `app/dependencies.py` constructs a fresh instance per request, with no
`@lru_cache` and no singleton, so none of this state ever exists in a database, on disk, or across
more than one request. It is not a schema, not a migration, not a persistent index in the database
sense of that word — it is exactly as ephemeral as a local variable, just one that happens to
survive for the duration of one request's several repository calls instead of one function call.
See `docs/architecture.md` §3 for the same lineage described at the architecture level, and
`docs/m17-design-review.md`/`docs/m18-design-review.md`/`docs/m19-design-review.md` for the full
design and correctness record of each stage.
