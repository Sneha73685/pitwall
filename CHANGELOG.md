# Changelog

All notable changes to this project are documented in this file, grouped by milestone (see
`docs/prd.md` §3 for the milestone roadmap). Semantic version tags begin at `v1.0.0` when V1 ships
(M7); until then, entries are grouped by milestone rather than by version number.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Work in progress toward M6 — Lap/sector comparison + delta graph.

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
