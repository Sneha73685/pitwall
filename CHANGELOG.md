# Changelog

All notable changes to this project are documented in this file, grouped by milestone (see
`docs/prd.md` §3 for the milestone roadmap). Semantic version tags begin at `v1.0.0` when V1 ships
(M7); until then, entries are grouped by milestone rather than by version number.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Nothing in progress — M12 is the most recently completed milestone; no later milestone is scheduled
yet (see `README.md`'s Project status).

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
