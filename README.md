# PitWall

[![CI](https://github.com/Sneha73685/pitwall/actions/workflows/ci.yml/badge.svg)](https://github.com/Sneha73685/pitwall/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**An open-source Formula 1 race engineering platform** — a telemetry viewer that grows, version by
version, into a system that can explain *why* a driver gained or lost time, and eventually answer
natural-language questions about a session.

> **Unofficial and fan-made.** Not affiliated with, endorsed by, or connected to Formula 1, FOM, or
> any team. See [Disclaimer](#disclaimer) below.

---

## What is PitWall?

PitWall turns raw F1 telemetry into an engineer's-eye view of a session: pick a season, event,
session, driver, and lap, and see the track map, channel traces (speed, throttle, brake, RPM, gear,
DRS), lap/sector comparisons, and a cumulative delta graph — the kind of view a race engineer
actually works from, not just a lap-time table.

## Why PitWall?

The raw data already exists — F1's live-timing feed is accessible via open tools like
[FastF1](https://github.com/theOehrly/Fast-F1) — but there's no polished, open-source application
that turns it into that engineer's-eye view. PitWall is that project: built in public, one real
milestone at a time, as a portfolio-grade demonstration of a clean data pipeline, a clean typed API,
and a clean frontend, with the architecture kept honest by ADRs at every real decision point.

## Project status

**Current milestone: M32 — Shared session-type filter constant — complete.**

| # | Milestone | Status |
|---|---|---|
| M0 | Project scaffolding | ✅ Done |
| M1 | Ingestion pipeline | ✅ Done |
| M2 | Backend API | ✅ Done |
| M3 | Frontend shell | ✅ Done |
| M4 | Track map | ✅ Done |
| M5 | Telemetry channel charts | ✅ Done |
| M6 | Lap/sector comparison + delta graph | ✅ Done |
| M7 | Polish & release (V1) | ✅ Done |
| M8 | Driver performance & session analytics | ✅ Done |
| M9 | Professional telemetry UI (frontend redesign) | ✅ Done |
| M10 | Hybrid Parquet + PostgreSQL storage (stints, pit stops) | ✅ Done |
| M11 | Tyre & stint performance analytics (descriptive) | ✅ Done |
| M12 | Multi-season / multi-event / multi-session architecture | ✅ Done |
| M13 | Cross-session lap & telemetry comparison | ✅ Done |
| M14 | Synchronized telemetry cursor (V2) | ✅ Done |
| M15 | Cross-session stint & tyre-strategy comparison | ✅ Done |
| M16 | Documentation & roadmap reconciliation | ✅ Done |
| M17 | Cross-season driver pace trends | ✅ Done |
| M18 | Per-session Parquet file-level caching (performance) | ✅ Done |
| M19 | Telemetry driver/lap positional index (performance) | ✅ Done |
| M20 | Documentation & roadmap reconciliation (M13–M19) | ✅ Done |
| M21 | Cross-season tyre-strategy trends | ✅ Done |
| M22 | Corner highlighting (V2 completion) | ✅ Done |
| M23 | Documentation & roadmap reconciliation (M20–M22) | ✅ Done |
| M24 | Comparison URL persistence & shareability | ✅ Done |
| M25 | Two-driver cross-season pace-trend comparison | ✅ Done |
| M26 | Two-driver cross-season tyre-trend comparison | ✅ Done |
| M27 | Comparison-surface consistency pass | ✅ Done |
| M28 | Documentation & roadmap reconciliation (M23–M27) | ✅ Done |
| M29 | Shared driver-strategy mapper extraction (backend) | ✅ Done |
| M30 | Frontend dependency & security remediation | ✅ Done |
| M31 | React Router 6→7 migration | ✅ Done |
| M32 | Shared session-type filter constant (frontend) | ✅ Done |

M8–M32 extend beyond the original V1 roadmap (`docs/prd.md` §3 covers M0–M7; §3a records M8–M32
without implying they were part of the original V1–V5 schedule); each has its own design review
under `docs/` (`m8-design-review.md` onward). See `docs/releases/` for per-milestone summaries
(currently covering M1–M5; later milestones' records are their own design-review/implementation-plan
docs plus `CHANGELOG.md`).

## Current capabilities

PitWall can fetch one real F1 session from FastF1, normalize it into PitWall's own
provider-independent schema, and cache it to Parquet (M1):

```sh
cd pipeline
uv run python -m pitwall_pipeline.ingest --season 2023 --event Monza --session race
```

The backend (M2) reads that cache and serves it over a typed REST API — start it and browse the
interactive docs at `http://localhost:8000/docs`:

```sh
cd backend
uv run uvicorn app.main:app --reload
```

Endpoints: `GET /sessions`, `/sessions/{id}`, `/sessions/{id}/drivers`, `/sessions/{id}/laps`,
`/sessions/{id}/telemetry`, `/sessions/{id}/track` — see [`docs/api-model.md`](docs/api-model.md)
for the schema.

The frontend can select a session, then a driver, then a lap, and renders that lap's static track
map (M4) plus its speed/throttle/brake/RPM/gear/DRS traces, aligned by distance (M5):

```sh
cd frontend
npm run dev
```

Open `http://localhost:5173` and navigate `/` → `/seasons/:season` →
`/seasons/:season/events/:eventId` → `/sessions/:sessionId` → `/sessions/:sessionId/drivers/:driverId`
→ pick a lap (the `Season → Event → Session` hierarchy is M12 — see below; before it, `/` went
straight to a flat session list). Charts are distance-aligned traces; hovering the telemetry charts
or the track map now moves a synchronized cursor across both (M14 — see below). Lap/sector
comparison and the delta graph are M6, generalized to independently-selected sessions in M13.

M10 adds tyre-strategy viewing, backed by a second store (PostgreSQL, alongside Parquet — see
[ADR-0011](docs/adr/0011-hybrid-storage-architecture.md)): each lap in the driver's lap list shows
its tyre compound, and a "View Strategy" link opens a per-driver stint timeline and pit-stop list at
`/sessions/:sessionId/drivers/:driverId/strategy`. Requires PostgreSQL running and migrated once
before first ingest — see [Quick start](#quick-start) and [Docker](#docker) below.

M11 adds **descriptive** tyre & stint performance analytics on top of that — no new store, no new
dependency: a session-wide **Tyre Performance** dashboard (`/sessions/:sessionId/tyre-performance`
— strategy summary, compound usage, per-compound pace and lap-time-by-tyre-age charts, a raw
driver/compound comparison, pit-lane time) and a driver-scoped **Stint Pace** page
(`/sessions/:sessionId/drivers/:driverId/stint-pace` — a segmented lap-time trace with in-lap/
out-lap markers, per-stint consistency, and a full lap table), reachable from the driver/lap
selectors, the sidebar, and the existing Strategy page. These are raw values, medians, and quartiles
only — never a fitted degradation curve, ranking, or performance verdict; see
[`docs/m11-design-review.md`](docs/m11-design-review.md) for the audit behind that boundary.

M12 adds the `Season → Event → Session` navigation above: pick a season, then an event (race
weekend), then a session — reflecting only what PitWall actually has ingested, never a session
FastF1's schedule merely lists. No new store: seasons/events are grouped on read from the existing
Parquet-backed session data. Also included: a controlled, real, historical ingestion backfill
(2020–2026 to date) — see [`docs/m12-implementation-plan.md`](docs/m12-implementation-plan.md) for
the full batch-by-batch record.

M13 generalizes lap/telemetry comparison (M6) from two drivers within one session to two
**independently-selected sessions**: `/laps/compare` reads `session_id_a`/`driver_a`/`lap_a`/
`session_id_b`/`driver_b`/`lap_b` query params, each side resolved via a modal `SessionPicker`
(Season → Event → Session), and discloses — without blocking — when the two sessions are at
different circuits. See [`docs/m13-design-review.md`](docs/m13-design-review.md).

M14 adds the synchronized telemetry cursor V2 named as its next milestone since M1: hovering the
telemetry channel traces or the delta chart moves a shared cursor — backed by page-scoped Zustand
stores, not ECharts' own `connect()`/cross-instance `axisPointer.link` (see
[ADR-0008](docs/adr/0008-echarts-over-uplot.md) and
[`docs/m14-design-review.md`](docs/m14-design-review.md) §8 for why) — across the track-map and
lap-comparison pages; the track map's marker follows the cursor. Session-analytics and
tyre-performance charts are not yet part of this synchronized surface.

M15 extends M13's cross-session pattern to stint/tyre strategy: `/stints/compare` compares two
drivers' (each from an independently-selected session) stint sequence, per-stint pace consistency,
and pit-stop timing side by side — juxtaposed only, no computed strategy verdicts — reusing
`SessionPicker` unchanged and the same disclose-don't-block warning convention `/laps/compare`
established. Reachable from a driver's Strategy page ("Compare Strategy"). See
[`docs/m15-design-review.md`](docs/m15-design-review.md).

M16 is a documentation-only reconciliation pass (no application code, no capability change) —
see [`docs/m16-design-review.md`](docs/m16-design-review.md).

M17 adds a **cross-season driver pace-trend** view: `/drivers/:driverId/seasons/:season/pace-trend`
plots one driver's best/median/theoretical-best lap time and consistency across every session
they entered in a season, reusing M8's session-analytics computation unchanged (no telemetry is
fetched — every field is derived from lap data alone). Reachable from the driver selector. See
[`docs/m17-design-review.md`](docs/m17-design-review.md).

M18 and M19 are backend-only performance work, not new capabilities: M18 caches each session's
own Parquet files in memory for the lifetime of one request (previously, a full-grid
`/analytics/drivers` request could re-read `telemetry.parquet` hundreds of times); M19 adds a
per-session driver/lap lookup index on top of that cache, removing a repeated full-frame scan on
every lookup. Together they took a real full-grid session-analytics request from ~37.7s to the
low single digits of seconds, with a byte-identical response. See
[`docs/m18-design-review.md`](docs/m18-design-review.md) and
[`docs/m19-design-review.md`](docs/m19-design-review.md).

## Roadmap

Beyond V1 (M0–M7 above), PitWall is planned to grow through further versions:

| Version | Theme |
|---|---|
| V1 | Telemetry viewer (this roadmap, M0–M7) |
| V2 | Interactive dashboard — synchronized cursor across charts and track map |
| V3 | Race analysis — stints, pit stops, weather, position history (Postgres) |
| V4 | Deterministic engineering insights (why time was gained or lost) |
| V5 | Natural-language querying over the above |

Full rationale for what's deferred and why lives in `docs/prd.md` §5, which also records current
shipped/unshipped status per feature (updated through M15 — e.g. V2's synchronized cursor shipped in
M14, corner highlighting is still deferred; V3's stint/pit-stop comparison shipped in M10/M11/M15,
weather and position/gap history are still unbuilt). `docs/success-metrics.md` mirrors the same
per-version status.

## Architecture

PitWall is a **modular monolith**, not microservices (ADR-0001). Data flows in one direction only:

```
FastF1 → TelemetryProvider → Normalization → TelemetryRepository → FastAPI
       → Typed REST API → React + Zustand → ECharts / Track map
```

Each layer depends only on the layer directly below it, and every provider/storage swap is isolated
behind an interface (`TelemetryProvider`, `TelemetryRepository`) rather than rippling into the API
or UI. Full system diagram, layering rules, and the anti-corruption boundary at the API are in
[`docs/architecture.md`](docs/architecture.md).

## Technology stack

| Layer | Choice |
|---|---|
| Data source | [FastF1](https://github.com/theOehrly/Fast-F1) |
| Storage (telemetry, sessions, drivers, laps, track) | Parquet |
| Storage (race-strategy: stints, pit stops) | PostgreSQL |
| Backend | FastAPI |
| Frontend | React + TypeScript |
| State management | Zustand |
| Routing | react-router-dom |
| Telemetry charts | Apache ECharts |
| Track map | D3 + SVG/canvas |
| Deployment | Docker Compose (local); Vercel/Fly.io-class host (demo) |

Rationale and rejected alternatives for each row are in the corresponding ADR — see
[ADR index](#architecture-decision-records) below.

## Repository structure

Three independent workspaces, each with its own dependency manifest and test suite:

```
pitwall/
├── pipeline/     # data ingestion — FastF1 → normalized schema → Parquet cache
├── backend/      # FastAPI service reading the cache (M2+)
├── frontend/     # React + TypeScript UI (M3+)
├── docs/         # PRD, architecture, ADRs, data model, release notes
└── data/         # gitignored — local processed cache
```

See `docs/architecture.md` §5 for the full annotated layout.

## Quick start

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package/project manager)
- Node.js 22+
- Docker + Docker Compose (optional, for the containerized dev setup)

### Backend

```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

Since M10, the backend also reads `PITWALL_DATABASE_URL` (same default as below) to serve the
stints/pit-stops endpoints — the pipeline's migration step above must have run against the same
database first.

### Pipeline

Since M10, ingestion also writes tyre-strategy data (stints, pit stops) to PostgreSQL alongside the
existing Parquet cache. Requires `PITWALL_DATABASE_URL` (defaults to
`postgresql://pitwall:pitwall@localhost:5432/pitwall`) and the schema migrated once:

```sh
cd pipeline
uv sync
uv run python -m pitwall_pipeline.migrate   # one-time, creates stints/pit_stops tables
uv run python -m pitwall_pipeline.ingest --season 2023 --event Monza --session race
```

A Postgres write failure is logged, not fatal — the Parquet cache above is unaffected either way
(ADR-0011).

### Frontend

```sh
cd frontend
npm install
npm run dev
```

## Docker

```sh
docker compose up backend frontend
```

Since M10, this also starts a `postgres` service automatically (`backend`/`pipeline` both depend on
it being healthy first) — no separate step needed for `up`. The schema still needs migrating once,
the same as local dev:

```sh
docker compose run --rm pipeline uv run python -m pitwall_pipeline.migrate
```

The pipeline is a batch job, not a long-running service, so it's excluded from `up` and run on
demand instead:

```sh
docker compose run --rm pipeline
```

## Local development

Branching conventions, commit style, linting/formatting/type-checking standards, and the definition
of done all live in [`CLAUDE.md`](CLAUDE.md) — treated as the single source of truth rather than
duplicated here. In short: type hints and Pydantic models throughout, Ruff for Python, ESLint +
Prettier for TypeScript, `pytest` against recorded fixtures (no test hits the network), and an ADR
for every real architectural decision.

## Documentation

| Document | Contents |
|---|---|
| [`docs/prd.md`](docs/prd.md) | Vision, scope, milestone roadmap, risks |
| [`docs/architecture.md`](docs/architecture.md) | System design, layering, tech stack, repo layout |
| [`docs/data-model.md`](docs/data-model.md) | Pipeline's normalized domain model and cache layout (M1) |
| [`docs/api-model.md`](docs/api-model.md) | Backend API schema, endpoints, and repository design (M2) |
| [`docs/success-metrics.md`](docs/success-metrics.md) | What "done" means per version (V1–V5) |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records — why, not just what |
| [`docs/releases/`](docs/releases/) | Per-milestone release notes |
| [`docs/backlog.md`](docs/backlog.md) | Known issues and technical debt not yet scheduled to a milestone |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable changes, grouped by milestone |
| [`CLAUDE.md`](CLAUDE.md) | Coding standards, conventions, and process |

## Architecture Decision Records

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-modular-monolith-over-microservices.md) | Modular monolith over microservices for V1 |
| [0002](docs/adr/0002-fastapi-over-node-for-backend.md) | FastAPI over Node/Express for the backend |
| [0003](docs/adr/0003-react-typescript-over-svelte.md) | React + TypeScript over Svelte for the frontend |
| [0004](docs/adr/0004-parquet-over-sqlite-postgres-v1-storage.md) | Parquet over SQLite/Postgres for V1 storage |
| [0005](docs/adr/0005-telemetry-provider-abstraction.md) | `TelemetryProvider` abstraction in the pipeline layer |
| [0006](docs/adr/0006-telemetry-repository-abstraction.md) | `TelemetryRepository` abstraction in the backend |
| [0007](docs/adr/0007-zustand-over-context.md) | Zustand over React Context for frontend state |
| [0008](docs/adr/0008-echarts-over-uplot.md) | Apache ECharts over uPlot for telemetry charts |
| [0009](docs/adr/0009-internal-api-schema-boundary.md) | Internal API schema boundary (anti-corruption layer) |
| [0010](docs/adr/0010-react-router-over-tanstack-router.md) | react-router-dom over TanStack Router for frontend routing |
| [0011](docs/adr/0011-hybrid-storage-architecture.md) | Hybrid Parquet + PostgreSQL storage for race-strategy data |

## Screenshots

_Coming once lap/sector comparison (M6) gives the view something worth a side-by-side screenshot.
See `docs/releases/` for what's actually running at each milestone in the meantime._

## Disclaimer

PitWall is an independent, fan-made, open-source project. It is **not affiliated with, endorsed by,
sponsored by, or otherwise connected to** Formula 1, Formula One Management (FOM), the FIA, or any
Formula 1 team. "Formula 1," "F1," and related marks are trademarks of their respective owners. No
official logos, liveries, or broadcast graphics are used anywhere in this repository or application;
any driver/team color mappings are defined independently rather than lifted from broadcast graphics.
All telemetry data is sourced via [FastF1](https://github.com/theOehrly/Fast-F1) from publicly
available historical data.

## License

[MIT](LICENSE)
