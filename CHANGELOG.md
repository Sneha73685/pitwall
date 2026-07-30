# Changelog

All notable changes to this project are documented in this file, grouped by milestone (see
`docs/prd.md` §3 for the milestone roadmap). Semantic version tags begin at `v1.0.0` when V1 ships
(M7); until then, entries are grouped by milestone rather than by version number.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Work in progress toward M4 — Track map.

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
