# Changelog

All notable changes to this project are documented in this file, grouped by milestone (see
`docs/prd.md` §3 for the milestone roadmap). Semantic version tags begin at `v1.0.0` when V1 ships
(M7); until then, entries are grouped by milestone rather than by version number.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Nothing in progress — M22 is the most recently completed milestone (see `README.md`'s Project
status).

## M22 — Corner Highlighting — 2026-08-19

See `docs/m22-design-review.md` for the full design record.

### Added

- `detectCorners()` (`frontend/src/features/track-map/detectCorners.ts`) — a pure, deterministic,
  geometry-derived corner detector run entirely client-side over the `TrackPoint` data
  `/sessions/{session_id}/track` already returned before this milestone. Computes local curvature
  from an arc-length-windowed heading (chord-based, `windowM=40`), thresholds it
  (`curvatureThreshold=0.008`), merges contiguous flagged regions across small gaps
  (`mergeGapM=25`), and drops any region shorter than `minRegionLengthM=15`. Output is
  `{start_distance_m, end_distance_m}` pairs only — no apex, direction, corner number, or severity
  is exposed. Validated against real track geometry for Bahrain/Monaco/Monza/Spa and 9 synthetic
  edge cases (straight, single left/right turn, hairpin, chicane, noisy geometry, insufficient/
  empty points, two-close-corners) before integration.
- Corner-region rendering on the track map (`TrackMap.tsx`) as subtle shaded arcs along the track
  outline, and as `markArea` regions on the synchronized telemetry charts (`chartOptions.ts`) and
  delta chart (`deltaChartOptions.ts`) — the same `corners` array, computed once, passed to all
  three consumers so the highlighted regions are guaranteed identical across surfaces.
- `trackPoints` fetch lifted from `TrackMapDelta` up to `ComparisonPage`, matching
  `TrackMapPage`'s existing "fetch once at page level" pattern, so the same corner list reaches
  `DeltaChart`/`ChannelOverlayPanel` on the lap-comparison page without a duplicate fetch.
- Test coverage: `detectCorners.test.ts` (synthetic geometry), plus updated/added tests across
  `TrackMap`, `TrackMapPage`, `ComparisonPage`, `TrackMapDelta`, `DeltaChart`, `ChannelOverlayPanel`,
  `TelemetryCharts`, `chartOptions`, `deltaChartOptions`.

### Changed

- None to any backend route, response model, or repository method — `/sessions/{session_id}/track`'s
  contract is unchanged. This milestone is frontend-only: it extends M14's existing synchronized
  cursor surfaces (single-lap track map, M13 cross-session lap comparison) with static
  corner-region highlighting; it does not add a new synchronized surface, a new store, or any
  backend/schema architecture.

## M21 — Cross-Season Tyre Strategy Trends — 2026-08-19

See `docs/m21-design-review.md` for the full design record.

### Added

- `GET /drivers/{driver_id}/seasons/{season}/tyre-trend?session_type=` (defaults to `race`)
  (`backend/app/api/driver_trends.py`) — one driver's stint/tyre-strategy shape across every
  session of a season, mirroring M17's pace-trend route's shape and conventions exactly (same
  `list_sessions_for_driver_season` filtering step, same roster-absent-omission semantics, never
  404s). Calls M11's `driver_strategy_summary` unchanged — needs only `stints`, so it never touches
  `laps.parquet` beyond the shared roster check.
- `SeasonTyreTrendResponse`/`SeasonTyreTrendPoint` (`backend/app/models/driver_trends.py`) — each
  point nests M11's `DriverStrategySummary` unchanged (not flattened, since every field is reused)
  alongside the same session-identity fields M17's pace-trend point already exposes.
- Frontend: `/drivers/:driverId/seasons/:season/tyre-trend` route, `DriverSeasonTyreTrendPage`,
  `SeasonTyreTrendList`, `useDriverSeasonTyreTrend` hook, and a new trend link on
  `DriverSelectPage` (renamed the pre-existing `.paceTrendLink` CSS class to `.trendLink` since it
  now backs both the pace-trend and tyre-trend links).
- 411 lines of new backend route tests (`test_driver_tyre_trend_route.py`) plus new frontend tests
  for the page, list component, and hook.

### Changed

- None to any existing route, response model, or repository method — purely additive.

## M20 — Documentation & Roadmap Reconciliation — 2026-08-19

See `docs/m20-design-review.md` for the full design record.

### Added

- Backfilled this file's M16–M19 entries (above) and corrected stale statements across
  `README.md`, `docs/prd.md`, `docs/architecture.md`, `docs/api-model.md`, `docs/data-model.md`,
  and `docs/backlog.md`, reconciling documentation that had drifted since M13.

### Changed

- Documentation only — no application code, schema, or API contract changed.

## M19 — Telemetry Positional Index — 2026-08-19

See `docs/m19-design-review.md` for the full design record.

### Added

- `ParquetRepository._telemetry_index_cache`/`_telemetry_positions`/`_group_telemetry_by_driver_lap`
  (`app/repositories/parquet_repository.py`) — a per-session `(driver_id, lap_number) -> row
  positions` index over the already-cached, unfiltered telemetry frame (M18), built via one
  `groupby(...).indices` pass at most once per session, per instance. `get_telemetry()` now looks
  up row positions and slices with `.iloc[...]` instead of re-scanning the full frame with a
  boolean mask on every call — M18 stopped repeated file reads; this stops the repeated per-call
  filter that remained. `distance_m` ordering, missing-driver/missing-lap behavior, cross-session
  isolation, and per-instance isolation are all unchanged (verified byte-identical response body
  on the same real full-grid `/analytics/drivers` request M18 was verified against).
- 17 new repository tests covering lazy build, build-once-per-session, cross-session/cross-instance
  isolation, ordering, and non-mutation of the cached frame.

### Changed

- None to any route, response model, or `TelemetryRepository` interface method — entirely internal
  to `ParquetRepository`. No frontend, pipeline, schema, or dependency change.

## M18 — Per-Session Parquet File Caching — 2026-08-18

See `docs/m18-design-review.md` for the full design record.

### Added

- Four per-session file caches on `ParquetRepository` (`_drivers_cache`, `_laps_cache`,
  `_telemetry_cache`, `_track_points_cache`) and a shared `_cached_read()` helper
  (`app/repositories/parquet_repository.py`) — each of `drivers.parquet`, `laps.parquet`,
  `telemetry.parquet`, `track.parquet` is now read at most once per session, per
  `ParquetRepository` instance, regardless of how many times a method needing that file is called
  or with what filter arguments. Extends M17's session-lookup index to the *contents* of a
  session's own files, not just where they live.
- 12 new repository tests covering lazy population, read-once-per-file, filter independence from
  one shared cached frame, and cross-session/cross-instance isolation.

### Changed

- None to any route, response model, or `TelemetryRepository` interface method — entirely internal
  to `ParquetRepository`. No frontend, pipeline, schema, or dependency change.

## M17 — Cross-Season Driver Pace Trends — 2026-08-16

See `docs/m17-design-review.md` for the full design record.

### Added

- `GET /drivers/{driver_id}/seasons/{season}/pace-trend` (`app/api/driver_trends.py`) — one
  driver's race-pace trend across one season, reusing M8's `summarize_driver` unchanged with an
  empty `telemetry_by_lap` (every field this endpoint exposes is computed purely from `Lap` data,
  so telemetry is never fetched). New response models
  (`app/models/driver_trends.py`): `SeasonPaceTrendResponse{driver_id, season, session_type,
  points}`, `SeasonPaceTrendPoint` — a deliberate subset of M8's `DriverSummary` fields. Never
  404s: neither `driver_id` nor `season` is a persisted, independently-checkable resource, matching
  `/seasons/{season}/events`'s existing "aggregation key, not a catalogue row" reasoning.
- `ParquetRepository._index()`/`_find_session()` (`app/repositories/parquet_repository.py`) — a
  `session_id -> (session_dir, Session)` lookup memoized once per instance, replacing a full
  directory re-scan on every session lookup. Every existing `session_id`-keyed method benefits
  uniformly; no method beyond `_find_session`/`list_sessions` itself changed.
- Frontend: `/drivers/:driverId/seasons/:season/pace-trend`
  (`features/driver-trends/DriverSeasonPaceTrendPage`), reachable from `DriverSelectPage`.

### Changed

- None to any existing endpoint contract, `app/services/session_analytics/`, or any pre-existing
  `ParquetRepository` method's return value/ordering/error behavior — all verified unchanged.

## M16 — Documentation & Roadmap Reconciliation — 2026-08-16

See `docs/m16-design-review.md` for the full design record.

### Changed

- `docs/prd.md` — added §3a recording M8–M15's real shipped milestone history, distinct from the
  original V1 table; updated §5's deferred-features table with current shipped/unshipped status.
- `docs/success-metrics.md` — corrected V2's cursor-sync description to the real M14 architecture
  (Zustand stores, not `echarts.connect()`); added V3's M10/M11/M15 shipped status.
- `README.md` — corrected "Current milestone," the milestone table, and the stale quickstart
  cursor-sync line; added M13/M14/M15 paragraphs to "Current capabilities."
- `CHANGELOG.md` — backfilled M13, M14, M15 entries; corrected the `[Unreleased]` blurb.
- No application source, test, schema, migration, dependency, or data file touched.

## M15 — Cross-Session Stint & Tyre-Strategy Comparison — 2026-08-16

See `docs/m15-design-review.md` for the full design record.

### Added

- `GET /stints/compare` (`app/api/stints_compare.py`) — pairwise stint/tyre-strategy comparison,
  each side independently resolved from its own session/driver, mirroring M13's `/laps/compare`
  pattern exactly. Reuses `build_driver_stint_pace`/`driver_strategy_summary` (M11) unchanged, called
  once per side — no new repository methods, no new service-layer logic beyond thin route assembly.
- New response models (`app/models/stint_comparison.py`): `StintComparisonResponse{a, b, warnings}`,
  each side `{session_id, driver_id, strategy, stints, pit_stops}` — summary-level only, deliberately
  no per-lap detail and no computed strategy deltas or verdicts (juxtaposition, not judgment,
  matching M11's own descriptive-only boundary).
- `DIFFERENT_CIRCUIT` and `NO_STINT_DATA_A`/`NO_STINT_DATA_B` warnings — non-blocking (200,
  disclose-don't-block), the same convention `/laps/compare` established in M13.
- Frontend: `/stints/compare` (`features/stint-comparison/`) — a new driver-only `DriverPicker`
  (no lap dimension), reusing `SessionPicker`, `StintTimeline`, `StintConsistencyTable`, and
  `PitStopList` unchanged. One entry point: a "Compare Strategy" link on the driver Strategy page.

### Changed

- None to `/laps/compare`, `LapComparisonResponse`, `app/services/lap_comparison/`, or M14's cursor
  architecture (`useCursorSync`, either `CursorSlice` store) — all verified zero-diff.

## M14 — Synchronized Telemetry Cursor (V2) — 2026-08-16

See `docs/m14-design-review.md` for the full design record.

### Added

- Two page-scoped Zustand cursor stores — `comparisonStore`'s `hoverDistance` slot (declared but
  unwired since M6) finally wired up, and a new sibling `features/track-map/cursorStore.ts` — the
  sole cross-component synchronization mechanism. ECharts' own `connect()`/cross-instance
  `axisPointer.link` is deliberately not used for this (it can't reach the SVG track map); its
  `axisPointer.link` option is still used, but only within one chart instance's own multiple grids.
- `useEChartsInstance` gains an additive `onEvents`/`dispatch` extension (every pre-M14 call site
  unchanged); a new shared `useCursorSync` hook.
- Hovering `TelemetryCharts` or `DeltaChart` now moves a shared cursor across the other chart and the
  corresponding `TrackMap`/`TrackMapDelta` marker, on both the single-lap track-map page and the M13
  cross-session comparison page.
- M13 discoverability follow-through: a "Compare" link added to `SessionListForEventPage`'s session
  cards; Sidebar's "Lap Comparison" link relabeled "Compare Sessions."

### Changed

- None to `/laps/compare`'s API contract, `app/services/lap_comparison/`, or any backend file —
  frontend-only milestone.

## M13 — Cross-Session Lap & Telemetry Comparison — 2026-08-16

See `docs/m13-design-review.md` for the full design record.

### Added

- `GET /laps/compare` generalized from one shared session to two independently-selected sessions
  (`session_id_a`/`session_id_b`, replacing the retired `GET /sessions/{session_id}/laps/compare`) —
  each side resolves its own session, which may be the same session (the M6-era case) or two
  entirely different ones.
- `DIFFERENT_CIRCUIT` warning (`WarningCode`) — non-blocking; `TrackMapDelta` hides its track-outline
  rendering when the two compared sessions are at different real-world locations, since neither
  driven lap ran the other's track.
- Frontend: a modal `SessionPicker` (Season → Event → Session) for selecting Session B independently
  of the app's primary navigation trail; `ComparisonPage` moved to the standalone `/laps/compare`
  route.

### Changed

- None to `app/services/lap_comparison/`'s alignment/delta/sector logic — unaffected by the
  session-identity generalization, per that design's own service-boundary decision.

## M12 — Multi-Season / Multi-Event / Multi-Session Architecture — 2026-08-15

See `docs/m12-design-review.md` and `docs/m12-implementation-plan.md` for the full design and
phased implementation record (Phases 0–8, batch-by-batch real-execution evidence for the historical
backfill).

### Added

- Pipeline: `Event`/`EventDiscovery` (`pitwall_pipeline/models.py`) — a `(season, event slug)`
  grouping identity above `Session`, computed at discovery time only, never persisted to Parquet or
  Postgres. `FastF1Provider.discover_event()`/`discover_season()` (Tier A: schedule-only, no
  `.load()`), replacing the prior static, empirically-unsafe session-identifier mapping with
  real per-event schedule resolution.
- Pipeline: `ingest_event.py` (event-level ingestion, looping the existing, unchanged
  `ingest_session()` over one event's real sessions with per-session failure isolation) and
  `ingest_plan.py` (`build_ingestion_plan()`/`execute_ingestion_plan()` — a `DISCOVER → PLAN →
  REVIEWABLE PLAN → EXECUTE` control plane for event- and season-level ingestion, with CLI safety
  gates requiring explicit opt-in for a whole season or more than one season at once).
- Backend: three new read routes under `app/api/seasons.py` — `GET /seasons`, `GET
  /seasons/{season}/events`, `GET /seasons/{season}/events/{event_id}/sessions` — backed by
  `app/services/session_discovery/` (pure grouping over the existing
  `TelemetryRepository.list_sessions()`, no new repository method beyond `has_telemetry` below, no
  FastF1 call at request time). New response models `SeasonSummary`/`EventSummary`
  (`app/models/discovery.py`).
- Backend: `Session` gains two additive fields — `event_id` (computed via `app/utils/ids.py`,
  independently defined from but formula-identical to the pipeline's own `make_event_id`, parity-
  tested) and `has_telemetry` (Parquet-metadata-only check, motivated by the real, verified 2018
  finding that telemetry access can fail even when lap/stint data loads cleanly). New
  `TelemetryRepository.has_telemetry(session_id)` method, `ParquetRepository`'s implementation.
- Frontend: the old flat, all-sessions `SessionListPage` is replaced by a `Season → Event → Session`
  navigation hierarchy — `SeasonListPage` (`/`), `EventListPage` (`/seasons/:season`),
  `SessionListForEventPage` (`/seasons/:season/events/:eventId`) — consuming the new `/seasons`
  routes; `selectionStore` gains `season`/`eventId` fields with the same cascading-clear pattern its
  existing fields already use; the Sidebar gains matching trail links. Everything from the existing
  `/sessions/:sessionId` route onward is unchanged.
- Controlled historical ingestion/backfill: 2020–2026 (through round 11 of 2026's in-progress
  season) real-ingested and reconciled — 704 sessions total. Parquet and PostgreSQL `stints`
  session-ID sets are an exact match, zero orphans; `pit_stops` differs from that by exactly 5 real,
  individually-corroborated zero-pit-stop sessions (no data gap) plus one pre-existing test-fixture
  contamination row, unrelated to this milestone. Zero duplicate stint/pit-stop identities anywhere.
  Explicitly **not** a bulk/automatic sweep: every season was its own separate, explicitly-approved
  batch (see `docs/m12-implementation-plan.md` Phase 7). Multi-season historical bulk backfill
  (Tier E) remains unscheduled by design.
- Documentation closeout (this entry, plus `docs/architecture.md`, `docs/data-model.md`,
  `docs/api-model.md`, `docs/m12-implementation-plan.md`'s own Phase 8 record) — no code change.

### Changed

- None to any existing endpoint contract beyond the two additive `Session` fields above — every
  pre-existing route, `TelemetryRepository`, and `RaceContextRepository` method is otherwise
  untouched. No Postgres schema change, no migration, no new dependency.

## M11 — Tyre & Stint Performance Analytics (Descriptive) — 2026-08-10

See `docs/m11-design-review.md`, `docs/m11-implementation-plan.md`, and
`docs/m11-frontend-design-note.md` for the full design and phased implementation record.

### Added

- `app/services/tyre_performance/` — PitWall's first backend domain-logic package to read from both
  `TelemetryRepository` (Parquet) and `RaceContextRepository` (PostgreSQL) in the same request,
  joined in application code, not across storage engines: stint/lap joining, in-lap/out-lap boundary
  detection, trend eligibility, per-stint pace consistency, per-compound aggregation, raw
  driver/compound comparison, and strategy summaries.
- Two new read endpoints: `GET /sessions/{session_id}/drivers/{driver_id}/stint-pace` (one driver's
  per-stint raw lap-time trace, boundary-lap flags, and consistency figures) and
  `GET /sessions/{session_id}/tyre-performance` (session-wide strategy summaries, compound usage,
  per-compound pace aggregates, and raw per-driver/per-compound lap-time comparison).
- `RaceContextRepository.list_stints` widened to an optional `driver_id` filter, mirroring
  `list_pit_stops`'s existing shape; `Stint` gains an additive `driver_id` field.
- Frontend: a session-wide `TyrePerformancePage` (strategy summary, compound-usage table,
  per-compound pace boxplot and lap-time-by-tyre-age scatter, raw driver/compound comparison chart,
  pit-lane time summary) and a driver-scoped `StintPacePage` (reused stint timeline, segmented
  lap-time trace with boundary-lap markers, per-stint consistency table, per-lap table), reachable
  from `DriverSelectPage`, `LapSelectPage`, `StrategyPage`, and a new sidebar link.
- This is **descriptive analytics only** — raw values, medians, and quartiles. No fitted degradation
  curve, regression, slope/coefficient, driver ranking, fuel correction, or safety-car/weather/
  traffic adjustment is computed or implied anywhere in the API or UI (`docs/m11-design-review.md`
  §4, §8).

### Changed

- None to any existing endpoint contract beyond the additive `Stint.driver_id` field — the existing
  per-driver `/stints` route, `TelemetryRepository`, and every pre-existing route are otherwise
  untouched.

## M10 — Hybrid Parquet + PostgreSQL Storage — 2026-08-07

See `docs/m10-design-review.md`, `docs/adr/0011-hybrid-storage-architecture.md`, and
`docs/m10-implementation-plan.md` for the full design and phased implementation record.

### Added

- PostgreSQL as a second, independent backing store alongside Parquet, for tyre-strategy data only
  (stints, pit stops) — Parquet remains the source of truth for telemetry, sessions, drivers, laps,
  and track geometry, unchanged (ADR-0011).
- `stints`/`pit_stops` tables, applied via versioned SQL migrations
  (`pipeline/pitwall_pipeline/migrations/`, run with `python -m pitwall_pipeline.migrate`).
- Pipeline: `normalize_stints()`/`normalize_pit_stops()` and `postgres_writer.py`, writing
  idempotently (upsert on natural composite keys) after the existing Parquet write; a Postgres write
  failure is logged and does not block or roll back ingestion.
- `Lap.compound` — an additive, nullable field on the existing `laps.parquet` schema and the
  `GET /sessions/{session_id}/laps` response.
- Backend: `RaceContextRepository` (a second, separate interface from `TelemetryRepository`) and its
  sole implementation, `PostgresRaceContextRepository`.
- Two new read endpoints: `GET /sessions/{session_id}/drivers/{driver_id}/stints` and
  `GET /sessions/{session_id}/pit-stops?driver_id=`.
- Frontend: a driver-scoped Strategy page (`/sessions/:sessionId/drivers/:driverId/strategy`) showing
  a stint timeline (compound + lap range per stint) and a pit-stop list; a compound chip and a "View
  Strategy" entry point added to the existing per-driver lap list.
- `docker-compose.yml` and CI both gain a `postgres` service.

### Changed

- None to any existing V1/V2 endpoint contract beyond the additive `Lap.compound` field —
  `TelemetryRepository`/`ParquetRepository` and every pre-existing route are otherwise untouched
  (verified: `test_laps_compare_route.py` and `test_session_analytics_route.py` pass unmodified).

## M5 — Telemetry Channel Charts — 2026-07-31

See `docs/releases/m5-summary.md` for the full release summary.

### Added

- `TelemetryCharts`, an ECharts component rendering speed/throttle/brake/RPM/gear/DRS as one
  instance with a stacked grid per channel, sharing a distance-aligned x-axis (ADR-0008).
- `buildChartOption`, a pure function (in `frontend/src/features/telemetry-charts/chartOptions.ts`)
  mapping a lap's `TelemetrySample[]` to that ECharts option — unit-tested independently of any
  chart instance.
- `TrackMapPage` now renders `TelemetryCharts` alongside the M4 track map, reusing the same
  `getTelemetry` fetch — no new API call or backend change needed.
- 12 new frontend tests (5 for `buildChartOption`, 6 for `TelemetryCharts`, 1 for `TrackMapPage`'s
  telemetry hand-off to the new component).

### Fixed

- `eslint.config.js` didn't declare DOM lib globals (e.g. `HTMLDivElement`), so `no-undef` flagged
  legitimate, TS-checked references as errors. Disabled `no-undef` for TS files per
  typescript-eslint's own guidance, since `tsc` already catches genuine undefined references.

## M4 — Track Map — 2026-07-30

See `docs/releases/m4-summary.md` for the full release summary.

### Added

- `GET /sessions/{id}/track` endpoint, `TrackPoint` response model, and `list_track_points` on
  `TelemetryRepository`/`ParquetRepository`.
- `TrackMap` (D3 scales/line generator, React-rendered SVG): the session's static track outline with
  the selected lap's line and start-point marker plotted over it.
- `TrackMapPage` at `/sessions/:sessionId/drivers/:driverId/laps/:lapNumber`.
- 4 new backend tests and 6 new frontend tests.

### Changed

- `LapSelectPage`'s lap items now link to the track map route instead of just setting selection
  state with nothing to show for it.

## M3 — Frontend Shell — 2026-07-30

See `docs/releases/m3-summary.md` for the full release summary.

### Added

- `react-router-dom` routing (ADR-0010): `/`, `/sessions/:sessionId`,
  `/sessions/:sessionId/drivers/:driverId`.
- Typed API client coverage for all five M2 endpoints (`listSessions`, `getSession`, `listDrivers`,
  `listLaps`, `getTelemetry`), refactored around one shared `getJson<T>` helper.
- `SessionListPage`, `DriverSelectPage`, `LapSelectPage` under `features/session-select/` — the
  session → driver → lap selection flow, each recording its choice in `selectionStore`.
- 8 new frontend tests covering loading/error/empty states and lap selection.
- `docs/adr/0010-react-router-over-tanstack-router.md`.

### Fixed

- A pre-existing React `act()` warning in `App.test.tsx` (the health-check effect wasn't awaited
  before asserting).

## M2 — Backend API — 2026-07-30

See `docs/releases/m2-summary.md` for the full release summary.

### Added

- `TelemetryRepository` interface and `ParquetRepository`, its sole V1 implementation, reading the
  M1 Parquet cache directly (no dependency on the pipeline package).
- API response models (`Session`, `Driver`, `Lap`, `TelemetrySample`) at the anti-corruption
  boundary (ADR-0009).
- Five endpoints: `GET /sessions`, `/sessions/{id}`, `/sessions/{id}/drivers`,
  `/sessions/{id}/laps`, `/sessions/{id}/telemetry`.
- FastAPI's auto-generated OpenAPI docs (`/docs`, `/openapi.json`) covering all endpoints.
- Fixture-based backend test suite (22 tests, no network, no real FastF1 data).
- `docs/api-model.md` — backend API schema design note.

## M1 — Ingestion Pipeline — 2026-07-30

See `docs/releases/m1-summary.md` for the full release summary.

### Added

- Normalized, provider-independent domain model (`Session`, `Driver`, `Lap`, `TelemetrySample`,
  `TrackPoint`, `NormalizedSessionData`).
- `TelemetryProvider` interface and `FastF1Provider`, its sole V1 implementation.
- FastF1-to-domain-model normalization layer, including unit conversion and DRS status decoding.
- Track geometry derivation from a reference lap's telemetry.
- Parquet cache writer implementing the on-disk layout in `docs/data-model.md`.
- CLI ingestion entrypoint (`python -m pitwall_pipeline.ingest`).
- Fixture-based pipeline test suite (19 tests, fully mocked, no network access).
- `docs/data-model.md` — pipeline domain model design note.

### Changed

- Slug generation extracted into a shared `pitwall_pipeline/utils/ids.py`, used by both session IDs
  and cache paths.

## M0 — Project Scaffolding — 2026-07-27

### Added

- Repository structure for the three workspaces: `pipeline/`, `backend/`, `frontend/`.
- Tooling: Ruff (lint + format) for Python, ESLint + Prettier for TypeScript, mypy (strict) and
  TypeScript strict mode.
- CI skeleton (`.github/workflows/ci.yml`), path-filtered per workspace.
- ADR process and the initial nine ADRs (`docs/adr/0001`–`0009`).
- `docs/prd.md`, `docs/architecture.md`, `docs/success-metrics.md`.
- README with the Formula 1 trademark disclaimer.
- Minimal FastAPI health check endpoint, React app shell, and pipeline smoke test.

### Fixed

- Local verification issues found after the initial scaffold (frontend test/tsconfig fixes, lockfiles
  committed, pipeline smoke test correction).
