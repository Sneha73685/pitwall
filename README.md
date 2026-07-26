# PitWall

An open-source Formula 1 race engineering platform: a telemetry viewer that grows, version by version, toward explaining *why* a driver gained or lost time, and eventually answering natural-language questions about a session.

> **Unofficial and fan-made.** PitWall is not affiliated with, endorsed by, or connected to Formula 1, FOM, or any team. No official logos, liveries, or broadcast graphics are used in this project.

**Status:** M0 — engineering foundation only. There is no telemetry functionality yet; see [`docs/prd.md`](docs/prd.md) for the full roadmap.

## Documentation

- [`docs/prd.md`](docs/prd.md) — vision, scope, milestone roadmap, risks
- [`docs/architecture.md`](docs/architecture.md) — system design, tech stack, repository layout
- [`docs/adr/`](docs/adr/) — architecture decision records (why, not just what)
- [`docs/success-metrics.md`](docs/success-metrics.md) — what "done" means per version
- [`CLAUDE.md`](CLAUDE.md) — coding standards, conventions, and process for anyone (human or agent) working on this codebase

## Project structure

Three independent workspaces — see `docs/architecture.md` §5 for the full layout:

- `pipeline/` — data ingestion (Python + [FastF1](https://github.com/theOehrly/Fast-F1))
- `backend/` — API service (Python + FastAPI)
- `frontend/` — web UI (React + TypeScript)

## Getting started

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
uv run python -m pitwall_pipeline.smoke
```

### Frontend

```sh
cd frontend
npm install
npm run dev
```

### Everything via Docker Compose

```sh
docker compose up backend frontend
```

The pipeline is a batch job, not a long-running service, so it's excluded from `up` and run on demand instead:

```sh
docker compose run --rm pipeline
```

## Development workflow

Branching, commit conventions, linting/formatting/type-checking standards, and the definition of done all live in [`CLAUDE.md`](CLAUDE.md) — this keeps one source of truth rather than duplicating it here.

## License

[MIT](LICENSE)
