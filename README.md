# PitWall

[![CI](https://github.com/Sneha73685/pitwall/actions/workflows/ci.yml/badge.svg)](https://github.com/Sneha73685/pitwall/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**An open-source Formula 1 race engineering platform** — a telemetry viewer and analytics tool that
turns raw session data into the kind of engineer's-eye view a race engineer actually works from.

> **Unofficial and fan-made.** Not affiliated with, endorsed by, or connected to Formula 1, FOM, or
> any team. See [Disclaimer](#disclaimer) below.

---

## What PitWall Does

PitWall ingests real Formula 1 session data (via [FastF1](https://github.com/theOehrly/Fast-F1)),
normalizes it into its own schema, and serves it through a typed API to a React frontend. A user
picks a season, event, session, driver, and lap, and gets:

- An accurate track map and distance-aligned telemetry traces (speed, throttle, brake, RPM, gear,
  DRS).
- Lap and sector comparisons, including a cumulative time-delta graph, between any two laps —
  even from two different sessions.
- Session-wide analytics: classification, lap-by-lap running order, consistency/outlier detection,
  and yellow-flag/track-limits exclusion handling.
- Descriptive tyre and stint performance analysis, single-session and cross-session.
- Cross-season pace and tyre-strategy trends, per driver and head-to-head.

It was built as a portfolio-grade demonstration of a clean data pipeline, a clean typed API, and a
clean frontend, with the architecture kept honest by an ADR at every real decision point.

## Current Status

> **Development paused after M46.** M46 (`94d757e`) is the last product implementation
> milestone. M47 (`d32a4ac`) is the portfolio-finalization/closeout record, not a product
> milestone. There is currently no M48.

**PitWall is not being declared absolutely feature-complete.** Several capabilities remain
deliberately deferred (see [Current Deferred Work](#current-deferred-work) below). Development
reopens only when the evidence-based re-entry triggers recorded in
[`docs/m47-design-review.md`](docs/m47-design-review.md) are met. There is currently no M48.

The audit behind that decision found that the specific class of defect that had driven nearly every
recent milestone — a backend that correctly computes something a downstream consumer then silently
ignores or never renders — had been searched for exhaustively and was genuinely exhausted, and no
other candidate (further backfill, documentation reconciliation, unused provider data, etc.) cleared
a deliberately high evidence bar. Rather than manufacture a milestone to keep a number incrementing,
product development was paused; see [Milestone History](#milestone-history) below for the full
sequence, and [`docs/m47-design-review.md`](docs/m47-design-review.md) for the closeout decision
itself.

## Milestone History

PitWall was built through a sequence of scoped, individually-designed milestones — each with its own
design-review document under `docs/` (`docs/m{N}-design-review.md`) and its own `CHANGELOG.md`
entry. The table below records what actually shipped, in order.

**M46 is the last product implementation milestone. M47 is a closeout/documentation decision, not a
product milestone** — see [Current Status](#current-status) above.

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
| M33 | Documentation & roadmap reconciliation (M28–M32) | ✅ Done |
| M34 | Session race classification (finishing position, grid, status, points) | ✅ Done |
| M35 | Lap-by-lap running-order/position chart (session analytics) | ✅ Done |
| M36 | Yellow-flag / Safety Car / VSC / red-flag lap exclusion | ✅ Done |
| M37 | Fix: yellow-flag exclusion tags render in driver lap table | ✅ Done |
| M38 | Historical backfill of M34–M36 fields (332/334 sessions) | ✅ Done |
| M39 | Documentation & roadmap reconciliation (M34–M38) | ✅ Done |
| M40 | Track-limits lap exclusion (`Lap.deleted`/`deleted_reason`) | ✅ Done |
| M41 | Fix: tyre/stint aggregate stats exclude yellow-flag/track-limits laps | ✅ Done |
| M42 | Qualifying Q1/Q2/Q3 segment results | ✅ Done |
| M43 | Fix: lap-comparison warnings surface yellow-flag/track-limits exclusion | ✅ Done |
| M44 | Documentation & roadmap reconciliation (M39–M43) | ✅ Done |
| M45 | Render lap-comparison exclusion warnings in the UI | ✅ Done |
| **M46** | **Fix: humanize lap-exclusion labels (`DriverLapTable`) — last product implementation milestone** | ✅ Done |
| **M47** | **Portfolio Finalization / Closeout** — exhaustive correctness/completion audit found no remaining milestone-worthy defect; development paused pending explicit re-entry triggers | 📋 Closeout (documentation only — not a product milestone) |

M0–M47 extend beyond the original V1 roadmap (`docs/prd.md` §3 covers M0–M7; §3a records M8 onward
without implying they were part of the original V1–V5 schedule); each has its own design review
under `docs/`. See [`CHANGELOG.md`](CHANGELOG.md) for the detailed, per-milestone change log, and
[`docs/m47-design-review.md`](docs/m47-design-review.md) for the closeout decision specifically.

## Features

| Feature | Where | What it does |
|---|---|---|
| Season → event → session → driver → lap navigation | `/`, `/seasons/:season`, `/seasons/:season/events/:eventId`, `/sessions/:sessionId`, `.../drivers/:driverId` | Browse only what's actually been ingested — never a session FastF1's schedule merely lists. |
| Track map + telemetry channel charts | `.../laps/:lapNumber` | A lap's static track outline and its speed/throttle/brake/RPM/gear/DRS traces, distance-aligned. Hovering moves a synchronized cursor across both. |
| Lap/sector comparison + delta graph | `/laps/compare` | Two laps — from the same or two independently-chosen sessions — overlaid with a sector-time table and a cumulative time-delta chart. |
| Lap-comparison warnings | `/laps/compare` | Flags when a compared lap is inaccurate, yellow-flag-affected, track-limits-deleted, or from a different circuit than the other side — computed by the backend and rendered directly in the comparison UI. |
| Session analytics | `/sessions/:sessionId/analytics` | Per-driver best/median/theoretical-best lap time, consistency, outlier detection, and a lap-by-lap position (running-order) chart. |
| Driver/session classification | Driver selection page | Finishing position, grid position, status, and points per driver (where FastF1 reports them). |
| Qualifying segment times | Driver selection page | Q1/Q2/Q3 times per driver, shown independently — a driver eliminated in Q1 shows only a Q1 time. |
| Yellow-flag / track-limits exclusion | Session-analytics lap table, lap comparison | Laps affected by a yellow flag/Safety Car/VSC/red flag, or officially deleted for a track-limits infringement, are flagged inline (not silently dropped) with a human-readable label — never conflated with a telemetry-accuracy issue. |
| Tyre & stint performance | `/sessions/:sessionId/tyre-performance`, `.../drivers/:driverId/stint-pace` | Session-wide strategy summary, compound usage, per-compound pace, and a driver-scoped segmented lap-time trace with in-/out-lap markers — descriptive only, never a fitted degradation curve or ranking. |
| Cross-session stint/tyre comparison | `/stints/compare` | Two drivers' (each from an independently-chosen session) stint sequence and pit-stop timing, juxtaposed. |
| Cross-season pace/tyre trends | `/drivers/:driverId/seasons/:season/pace-trend`, `.../tyre-trend` | One driver's pace or tyre-strategy shape across a season. |
| Two-driver trend comparison | `/drivers/pace-trend/compare`, `/drivers/tyre-trend/compare` | The same trends, head-to-head for two drivers. |

## Architecture

PitWall is a **modular monolith**, not microservices (ADR-0001). Three independent workspaces —
`pipeline/`, `backend/`, `frontend/` — communicate only through well-defined boundaries: Parquet
files and a PostgreSQL database between pipeline and backend, and a typed REST API between backend
and frontend. Data flows one direction only:

```mermaid
flowchart TD
    FF1["FastF1"] --> Provider["FastF1Provider\n(only module that imports fastf1)"]
    Provider --> Norm["Normalization\n(normalize.py → Pydantic domain model)"]
    Norm --> Parquet[("Parquet cache\nsessions · drivers · laps · telemetry · track")]
    Norm --> Postgres[("PostgreSQL\nstints · pit stops only")]
    Parquet --> TelRepo["TelemetryRepository\n(ParquetRepository)"]
    Postgres --> RCRepo["RaceContextRepository\n(PostgresRaceContextRepository)"]
    TelRepo --> Services["Backend services\nsession_analytics · tyre_performance · lap_comparison"]
    RCRepo --> Services
    Services --> APIModels["API models\n(anti-corruption layer, ADR-0009)"]
    APIModels --> FastAPI["FastAPI routes\n22 typed endpoints"]
    FastAPI --> Client["Frontend API client\n(frontend/src/api/client.ts)"]
    Client --> Pages["React feature pages\nECharts · track map (D3/SVG)"]
```

**What each layer owns — and doesn't:**

- **`FastF1Provider`** is the only code in the repository that talks to FastF1. It owns fetching and
  caching FastF1's own on-disk archive; it owns nothing about PitWall's schema or storage.
- **Normalization** converts FastF1's shape into PitWall's own model. It never writes to disk or a
  database itself, and nothing downstream of it ever sees a FastF1-native object.
- **Parquet** is the source of truth for sessions, drivers, laps, telemetry, and track geometry. It
  owns none of the stint/pit-stop data.
- **PostgreSQL** is the source of truth only for stints and pit stops — genuinely relational
  race-strategy data. It never duplicates telemetry or session data Parquet already owns.
- **`TelemetryRepository`**/**`ParquetRepository`** read Parquet only; they never touch PostgreSQL.
  **`RaceContextRepository`**/**`PostgresRaceContextRepository`** read PostgreSQL only; they never
  touch Parquet. These are two genuinely independent interfaces (ADR-0006, ADR-0011) — the only
  place they're both used in the same request is the tyre-performance route, which joins their
  results in application code, not via a cross-store query.
- **Backend services** (`app/services/`) are pure business logic — no FastAPI imports, no direct
  file or database access. They receive already-fetched data from the route layer and compute
  derived results (exclusion classification, aggregate stats, trend eligibility, comparison
  warnings) fresh on every request; none of this is persisted anywhere.
- **API models** (`app/models/`) are independently-defined Pydantic classes (ADR-0009's
  anti-corruption boundary) — never a raw passthrough of a repository or provider object.
- **The frontend API client** (`client.ts`) is the only place in the frontend that makes an HTTP
  call. Every component reaches the backend exclusively through its typed functions.
- **Frontend feature pages** own presentation and UI state only. No analytics computation happens
  in the frontend — every number a chart or table shows was already computed by the backend.

See [`docs/architecture.md`](docs/architecture.md) for the deeper system diagram, the full
layering rationale, and the caching-layer history.

## Data Flow

The lifecycle of one ingested session, traced end to end:

```mermaid
flowchart LR
    A["1. Source\nacquisition"] --> B["2. FastF1 loading\n/ caching"]
    B --> C["3. Normalization"]
    C --> D["4. Persistence"]
    D --> E["5. Repository\naccess"]
    E --> F["6. Analytics /\nservice processing"]
    F --> G["7. API\nserialization"]
    G --> H["8. Frontend\nrendering"]

    NoteD["note: persisted\ntrack_status,\ndeleted / deleted_reason"]
    NoteF["note: derived per request,\nnever persisted —\nexclusion_reason"]
    D -.-> NoteD
    F -.-> NoteF
```

1. **Source acquisition** — a pipeline CLI invocation names one season, event, and session type.
2. **FastF1 loading/caching** — `FastF1Provider` enables FastF1's own on-disk cache, resolves the
   session against the event's real schedule, and loads it. Per-lap telemetry is fetched in a loop,
   one FastF1 call per driver-lap; a single lap's telemetry failure is logged and that lap is
   skipped — it doesn't fail the whole ingest.
3. **Normalization** — FastF1's DataFrames become PitWall's own Pydantic models (`Session`,
   `Driver`, `Lap`, `TelemetrySample`, `TrackPoint`, `Stint`, `PitStop`), decoupling everything
   downstream from FastF1's native shape.
4. **Persistence** — `cache_writer.py` writes session/driver/lap/telemetry/track data to Parquet
   (`data/processed/{season}/{event_slug}/{session_type}/*.parquet`). `postgres_writer.py` then
   upserts stints/pit-stops to PostgreSQL, idempotently; a Postgres write failure is logged, not
   fatal — the already-complete Parquet write is unaffected either way.
5. **Repository access** — at request time, `ParquetRepository` reads from Parquet (with per-session,
   per-file in-memory caching) and `PostgresRaceContextRepository` reads from PostgreSQL — two
   interfaces that never cross.
6. **Analytics/service processing** — request-time-only computation over the already-persisted raw
   data: exclusion classification, aggregate statistics, trend eligibility, lap-comparison alignment
   and warnings. **This is the key persisted-vs-derived distinction**: `Lap.track_status` and
   `Lap.deleted`/`deleted_reason` are raw FastF1 signals persisted to Parquet at ingest time, but the
   derived `exclusion_reason` a user actually sees is never persisted anywhere — it's recomputed
   fresh from those raw fields on every request.
7. **API serialization** — the backend's own Pydantic response models shape what's returned; never
   a raw FastF1 or Parquet-row object.
8. **Frontend rendering** — the typed API client fetches, and feature pages render tables and
   charts. No analytics computation happens here — only presentation of what the backend already
   computed.

## Repository Structure

Three independent workspaces, each with its own dependency manifest and test suite:

```
pitwall/
├── pipeline/     # FastF1 → normalized schema → Parquet + PostgreSQL
├── backend/      # FastAPI service reading Parquet/PostgreSQL, serving a typed REST API
├── frontend/     # React + TypeScript UI
├── docs/         # PRD, architecture, ADRs, data model, API model, milestone design reviews
├── data/         # gitignored — local Parquet cache
└── docker-compose.yml
```

See [Pipeline](#pipeline-architecture), [Backend](#backend-architecture), and
[Frontend](#frontend-architecture) below for what each workspace actually contains.

## Pipeline Architecture

`pipeline/pitwall_pipeline/`:

| Module | Responsibility |
|---|---|
| `providers/` | `TelemetryProvider` interface + `FastF1Provider`, its sole implementation — the only code that imports `fastf1`. |
| `normalize.py` | FastF1 DataFrame → PitWall domain model conversion. |
| `models.py` | The normalized domain model (`Session`, `Driver`, `Lap`, `TelemetrySample`, `TrackPoint`, `Stint`, `PitStop`, `NormalizedSessionData`). |
| `track.py` | Derives track geometry (`TrackPoint`s) from a reference lap's telemetry. |
| `cache_writer.py` | Writes a session's data to the Parquet cache. |
| `postgres_writer.py` | Idempotent upsert of `Stint`/`PitStop` rows to PostgreSQL. |
| `db.py` / `migrate.py` | Connection handling and versioned SQL schema migrations. |
| `ingest.py` | Single-session CLI entrypoint. |
| `ingest_event.py` | Loops single-session ingestion over one event's real sessions. |
| `ingest_plan.py` | A `DISCOVER → PLAN → REVIEWABLE PLAN → EXECUTE` control plane for event- and season-level ingestion, with explicit CLI safety gates for anything larger than one event. |
| `backfill_m38.py` | A standalone historical-backfill tool — see below. |

**Normal ingestion vs. historical backfill tooling**: `ingest_session()`/`ingest_event.py`/
`ingest_plan.py` are the path for bringing in a new session (they always attempt the PostgreSQL
write). `backfill_m38.py` is a deliberately separate tool: it never touches PostgreSQL, only
re-derives specific additive fields for **already-ingested** sessions already on disk, and adds its
own staging → pre-swap verification → atomic-swap safety mechanism plus a resume log. It is not part
of the normal ingestion path and should not be confused with it.

Pipeline output becomes backend-readable the moment `cache_writer.py`'s Parquet write completes —
the backend has no dependency on the pipeline package and only ever reads the resulting files.

## Backend Architecture

`backend/app/`:

- **`api/`** — 12 thin FastAPI route files (one per capability family), 22 endpoints total. Routes
  fetch from a repository, hand data to a service if computation is needed, and return an API model.
- **`models/`** — 8 files of independently-defined Pydantic response models (the anti-corruption
  layer, ADR-0009) — one family per capability: `telemetry`, `discovery`, `session_analytics`,
  `tyre_performance`, `race_context`, `lap_comparison`, `stint_comparison`, `driver_trends`.
- **`repositories/`** — `TelemetryRepository`/`ParquetRepository` (Parquet) and
  `RaceContextRepository`/`PostgresRaceContextRepository` (PostgreSQL) — genuinely independent, per
  the architecture diagram above.
- **`services/`** — pure business logic, no route or storage imports:
  - `session_analytics/` — lap validity/exclusion classification (`filtering.py`'s `classify_lap`,
    the single source of truth for `exclusion_reason`), theoretical-best/consistency/outlier
    computation, per-driver aggregation.
  - `tyre_performance/` — stint/lap joining, in-/out-lap boundary detection, trend eligibility,
    per-compound aggregation, strategy summaries. Descriptive only — no fitted degradation curve,
    slope/coefficient, or driver ranking anywhere in this package.
  - `lap_comparison/` — distance-grid alignment, delta computation, sector aggregation, and
    comparability warnings.
  - `session_discovery/` — pure grouping of existing sessions into seasons/events, no new storage.
- **`dependencies.py`** — FastAPI `Depends()` wiring for both repositories.
- **`config.py`** — `PITWALL_DATA_DIR` (Parquet root) and `PITWALL_DATABASE_URL` (PostgreSQL).

**Where business/analytics logic lives**: exclusively in `app/services/`, never in a route file or
a repository. `classify_lap()` (`session_analytics/filtering.py`) is imported — never
reimplemented — by every other service that needs exclusion awareness (`tyre_performance`,
`lap_comparison`), keeping the classification logic in exactly one place.

The backend/frontend boundary, from repository to rendered page:

```mermaid
flowchart LR
    Repos["Repositories\nTelemetryRepository · RaceContextRepository"] --> Services["Backend services\n(pure business logic)"]
    Services --> Models["API models\n(Pydantic, ADR-0009\nanti-corruption boundary)"]
    Models --> FastAPI["FastAPI routes"]
    FastAPI --> Client["client.ts\n(frontend API client)"]
    Client --> Pages["React feature pages"]
```

## Frontend Architecture

`frontend/src/`:

- **`api/client.ts`** — 22 typed functions (one per backend route) plus every response
  type/interface. The only place in the frontend that makes an HTTP call.
- **`features/`** — one directory per capability: `session-select`, `track-map`,
  `telemetry-charts`, `lap-comparison`, `session-analytics`, `race-context`, `tyre-performance`,
  `stint-comparison`, `driver-trends`. Each owns its own page component(s), any
  feature-specific hooks, and (where applicable) its ECharts option-builder functions, kept as pure,
  independently-unit-tested functions separate from the rendering component.
- **`components/`** — shared, feature-agnostic UI: `Card`, `EmptyState`, `ErrorState`, `StatusChip`
  (tone-based status badge), layout chrome (`AppShell`, `Sidebar`), plus small shared utilities
  (URL query-param helpers, independently-defined driver/team color mappings, a shared ECharts
  instance hook).
- **`state/`** — `selectionStore`, the one *global* Zustand store (the primary
  Season → Event → Session → Driver → Lap trail). Two more Zustand stores are deliberately
  feature-scoped rather than global: `comparisonStore` (lap-comparison's own cursor/channel state)
  and `track-map`'s `cursorStore` — stores are scoped by concern, never collapsed into one store.

Routing (`App.tsx`) has 16 routes, matching the navigation hierarchy in
[Features](#features) above plus the two standalone cross-session/cross-season comparison routes,
which are intentionally not nested under the primary selection trail since neither compared side is
privileged over the other.

## Data Model

A conceptual summary only — [`docs/data-model.md`](docs/data-model.md) is the authoritative,
field-by-field reference.

- **Session** — one practice/qualifying/sprint/race session: season, event, round, location,
  session type, date.
- **Driver** — one driver within a session: identity plus, where FastF1 reports them, session
  classification (finishing position, grid, status, points) and qualifying segment times
  (Q1/Q2/Q3).
- **Lap** — one timed lap: sector times, personal-best/accuracy flags, tyre compound, running-order
  position, and two *raw* exclusion signals — `track_status` (was a flag period active during this
  lap?) and `deleted`/`deleted_reason` (was this lap's time officially deleted for track limits?).
- **`exclusion_reason`** — **not** a field on the stored `Lap` at all. It's a value derived at
  request time, in the backend, from `track_status`/`deleted` (track-limits takes precedence when
  both apply to the same lap) — resolving to `"yellow_flag"`, `"track_limits"`, or nothing.
- **TelemetrySample** / **TrackPoint** — distance/time-aligned channel readings for one lap, and the
  session's static track geometry.
- **Stint** / **PitStop** — relational race-strategy data (PostgreSQL only): which compound was run
  between which laps, and pit-lane timing.
- **Lap-comparison warnings** — a small, closed vocabulary (`WarningCode`) covering an inaccurate
  lap, a yellow-flag-affected lap, a track-limits-deleted lap (each independently, per side of the
  comparison), or the two compared sessions being at different circuits — computed from the same
  underlying data as `exclusion_reason`, surfaced specifically for the comparison UI.

## API

The frontend talks to the backend exclusively through a typed REST API — see
[`docs/api-model.md`](docs/api-model.md) for the authoritative contract (every route, every response
shape, and the design decisions behind them).

At a glance, the 22 routes group into: season/event/session discovery; core session/driver/lap/
telemetry/track data; lap comparison; session analytics; race context (stints/pit-stops, the two
PostgreSQL-backed routes); tyre performance; stint comparison; and driver pace/tyre trends (single
and two-driver comparison variants).

## Development Setup

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package/project manager)
- Node.js 22+
- Docker + Docker Compose (optional, for the containerized dev setup)

### Pipeline

```sh
cd pipeline
uv sync
uv run python -m pitwall_pipeline.migrate   # one-time, creates the stints/pit_stops tables
uv run python -m pitwall_pipeline.ingest --season 2023 --event Monza --session race
```

Requires `PITWALL_DATABASE_URL` (defaults to `postgresql://pitwall:pitwall@localhost:5432/pitwall`)
for the migration and for ingestion's PostgreSQL write — a write failure there is logged, not fatal;
the Parquet cache is written either way (ADR-0011).

### Backend

```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

Browse the interactive API docs at `http://localhost:8000/docs`. The backend reads
`PITWALL_DATA_DIR` (Parquet root) and `PITWALL_DATABASE_URL` (same default as above, for the two
PostgreSQL-backed routes).

### Frontend

```sh
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Docker

```sh
docker compose up
```

Starts `postgres` (healthchecked), `backend`, and `frontend` together — `backend` waits for
`postgres` to be healthy, `frontend` waits for `backend`. The schema still needs migrating once:

```sh
docker compose run --rm pipeline uv run python -m pitwall_pipeline.migrate
```

The pipeline is a batch job, not a long-running service, so it's excluded from `up` and run on
demand:

```sh
docker compose run --rm pipeline
```

## Testing

Each workspace has its own suite; this mirrors exactly what CI runs (`.github/workflows/ci.yml`,
path-filtered per workspace):

| Workspace | Tests | Lint | Format check | Type check |
|---|---|---|---|---|
| `pipeline/` | `uv run pytest` | `uv run ruff check .` | `uv run ruff format --check .` | `uv run mypy .` |
| `backend/` | `uv run pytest` | `uv run ruff check .` | `uv run ruff format --check .` | `uv run mypy .` |
| `frontend/` | `npm run test` | `npm run lint` | `npm run format` | `npm run typecheck` |

**Known limitation, local dev only**: `pipeline/`'s and `backend/`'s test suites include tests that
need a live PostgreSQL connection. CI runs these against a real, healthchecked Postgres service
container and passes fully. Locally, without Postgres running, those specific tests fail with a
connection error — every other test is unaffected. This is an environment limitation, not a code
defect; don't assume a Postgres-connection failure locally reflects CI's actual status.

No test in any workspace hits the network or a real external service — pipeline/backend tests run
against recorded fixtures, and frontend tests mock the API client.

## Documentation Map

| Document | Authoritative for |
|---|---|
| `README.md` (this file) | Project overview, architecture, onboarding |
| [`docs/architecture.md`](docs/architecture.md) | Deeper system diagram, layering rationale, caching history |
| [`docs/data-model.md`](docs/data-model.md) | Pipeline's normalized domain model and Parquet/PostgreSQL layout, field by field |
| [`docs/api-model.md`](docs/api-model.md) | Backend API contract — every route and response shape |
| [`docs/prd.md`](docs/prd.md) | Product vision, original scope, and the full milestone history |
| [`docs/success-metrics.md`](docs/success-metrics.md) | What "done" meant for each planned version |
| [`docs/backlog.md`](docs/backlog.md) | Known issues and technical debt not tied to any milestone |
| [`docs/adr/`](docs/adr/) | The 11 Architecture Decision Records — why, not just what |
| [`docs/m47-design-review.md`](docs/m47-design-review.md) | The portfolio-finalization decision and its evidence |
| Milestone design reviews (`docs/m{N}-design-review.md`) | The detailed, per-milestone historical implementation record |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable changes, grouped by milestone |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Coding standards, conventions, and process |

## Current Deferred Work

Recorded as a plain backlog, deliberately without milestone numbers — this is not a roadmap, and
picking any of it up again should start from fresh evidence, not from this list as a queue:

- **Historical backfill gaps.** Of 704 total ingested sessions, M38's 334-session population (race,
  qualifying, sprint, sprint qualifying) has classification/position/track-status fields backfilled
  for 332 of them — 2 sessions are a permanent, documented exception (a genuine external
  Ergast-data-source gap). Two later additive fields are **not** backfilled on any session: lap
  time-deletion data (`deleted`/`deleted_reason`, 0 of 704) and qualifying segment times
  (`q1_seconds`/`q2_seconds`/`q3_seconds`, 0 of 164 in-scope sessions). Concretely, this means the
  yellow-flag half of the lap-exclusion UI is already reachable on real, currently-ingested data,
  while the track-limits half currently is not, on any stored session — a real, quantified gap.
- **Documentation reconciliation.** `docs/prd.md`'s milestone history and `CHANGELOG.md` are
  reconciled through M43; the most recent milestones (M44–M47) haven't had their own reconciliation
  pass yet. No claim in either document is currently false — this is a scheduling gap, not an
  inaccuracy.
- **Weather.** No ingestion, provider method, or schema exists. FastF1 exposes weather data; PitWall
  doesn't use it.
- **Race-control messages.** Same status — available from FastF1, not ingested or modeled.
- **Other unused FastF1 signals.** `results.Time`/`results.Position`/`results.Laps` (session-level
  gap-to-leader and running-order fields) and per-lap `FreshTyre`/speed-trap readings are all
  present in FastF1's own data and not currently extracted. None has a demonstrated product need —
  "the data exists and would be cheap to add" is deliberately not treated as sufficient reason to
  build something on its own.
- **Minor technical debt**, tracked in [`docs/backlog.md`](docs/backlog.md): a CI workflow
  `permissions:` block, a couple of frontend test files missing empty-state coverage, the
  measured-but-unaddressed per-call cost of one telemetry repository method, a Python-version
  mismatch between the Dockerfiles and CI.
- **Longer-term roadmap** (V4/V5 in the original plan): deterministic engineering-insight generation
  and natural-language querying. Both remain conceptual — no work has started on either.

**Development reopens** if any of the following genuinely occurs: a newly discovered correctness
defect (data computed correctly but silently misused or ignored somewhere); a real user/product
demand signal for one of the items above; a materially useful new FastF1 data source; the historical
backfill gaps becoming operationally important rather than just incomplete; a dependency/security/
runtime issue crossing a real severity threshold; or a genuinely new product requirement. See
[`docs/m47-design-review.md`](docs/m47-design-review.md) for the full closeout reasoning.

## Local Development

Branching conventions, commit style, and coding standards all live in
[`CONTRIBUTING.md`](CONTRIBUTING.md) — treated as the single source of truth rather than duplicated here. In
short: type hints and Pydantic models throughout the Python side, Ruff for formatting/linting,
strict TypeScript with ESLint + Prettier on the frontend, and an ADR for every real architectural
decision.

## Architecture Decision Records

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-modular-monolith-over-microservices.md) | Modular monolith over microservices |
| [0002](docs/adr/0002-fastapi-over-node-for-backend.md) | FastAPI over Node/Express for the backend |
| [0003](docs/adr/0003-react-typescript-over-svelte.md) | React + TypeScript over Svelte for the frontend |
| [0004](docs/adr/0004-parquet-over-sqlite-postgres-v1-storage.md) | Parquet over SQLite/Postgres for the original V1 storage |
| [0005](docs/adr/0005-telemetry-provider-abstraction.md) | `TelemetryProvider` abstraction in the pipeline layer |
| [0006](docs/adr/0006-telemetry-repository-abstraction.md) | `TelemetryRepository` abstraction in the backend |
| [0007](docs/adr/0007-zustand-over-context.md) | Zustand over React Context for frontend state |
| [0008](docs/adr/0008-echarts-over-uplot.md) | Apache ECharts over uPlot for telemetry charts |
| [0009](docs/adr/0009-internal-api-schema-boundary.md) | Internal API schema boundary (anti-corruption layer) |
| [0010](docs/adr/0010-react-router-over-tanstack-router.md) | react-router-dom over TanStack Router |
| [0011](docs/adr/0011-hybrid-storage-architecture.md) | Hybrid Parquet + PostgreSQL storage for race-strategy data |

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
