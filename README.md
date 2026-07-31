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

**Current milestone: M4 — Track map — complete.**

| # | Milestone | Status |
|---|---|---|
| M0 | Project scaffolding | ✅ Done |
| M1 | Ingestion pipeline | ✅ Done |
| M2 | Backend API | ✅ Done |
| M3 | Frontend shell | ✅ Done |
| M4 | Track map | ✅ Done |
| M5 | Telemetry channel charts | ⏭ Next |
| M6 | Lap/sector comparison + delta graph | Planned |
| M7 | Polish & release (tag `v1.0.0`) | Planned |

See `docs/prd.md` §3 for the full roadmap and `docs/releases/` for a summary of each completed
milestone (currently: [`m1-summary.md`](docs/releases/m1-summary.md),
[`m2-summary.md`](docs/releases/m2-summary.md), [`m3-summary.md`](docs/releases/m3-summary.md),
[`m4-summary.md`](docs/releases/m4-summary.md)).

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

The frontend can select a session, then a driver, then a lap, and now (M4) renders that lap's static
track map — the session's track outline with the lap's line and start point plotted over it:

```sh
cd frontend
npm run dev
```

Open `http://localhost:5173` and navigate `/` → `/sessions/:sessionId` →
`/sessions/:sessionId/drivers/:driverId` → pick a lap. There's **no telemetry channel chart yet**
(speed/throttle/brake/RPM/gear/DRS traces) or hover-driven interactivity — those are M5 and V2.

## Roadmap

Beyond V1 (M0–M7 above), PitWall is planned to grow through further versions:

| Version | Theme |
|---|---|
| V1 | Telemetry viewer (this roadmap, M0–M7) |
| V2 | Interactive dashboard — synchronized cursor across charts and track map |
| V3 | Race analysis — stints, pit stops, weather, position history (Postgres) |
| V4 | Deterministic engineering insights (why time was gained or lost) |
| V5 | Natural-language querying over the above |

Full rationale for what's deferred and why lives in `docs/prd.md` §5.

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
| Storage | Parquet (→ Postgres in V3) |
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

### Pipeline

```sh
cd pipeline
uv sync
uv run python -m pitwall_pipeline.ingest --season 2023 --event Monza --session race
```

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

## Screenshots

_Coming once telemetry charts (M5) round out the view — the track map (M4) is live but a single
static SVG isn't worth a screenshot section on its own yet. See `docs/releases/` for what's
actually running at each milestone in the meantime._

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
