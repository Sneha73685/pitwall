# CONTRIBUTING.md — PitWall Project Guidance

PitWall is an open-source, fan-made Formula 1 race engineering platform. It is not affiliated with Formula 1, FOM, or any team. No official logos, liveries, or broadcast graphics belong in this repository.

This file is persistent guidance for any agent (or human) working on this codebase. Read `docs/prd.md` for full vision/roadmap and `docs/adr/` for why specific decisions were made before changing anything they cover.

## Architecture principles

- **Modular monolith, not microservices** (ADR-0001). Don't introduce a new deployable service without an ADR justifying it.
- **Strict layering.** Data flows one direction only:
  `FastF1/OpenF1 → TelemetryProvider → Normalization → TelemetryRepository → FastAPI → Typed REST API → React + Zustand → ECharts / Track map`
  Each layer depends only on the layer directly below it. The frontend must never import, reference, or assume anything about FastF1, OpenF1, or Parquet. The backend must never return a FastF1- or Parquet-shaped object from an endpoint.
- **Anti-corruption layer at the API boundary** (ADR-0009). Every API response is a PitWall-defined Pydantic model. If you're tempted to pass a provider or repository object straight through, stop and write the mapping instead.
- **Interfaces are shaped by their consumer, not their current implementation** (ADR-0005, ADR-0006). `TelemetryProvider` and `TelemetryRepository` are defined by what the pipeline/backend actually needs, not by mirroring FastF1's or Parquet's native shape.

## Coding standards

**Python (pipeline + backend)**
- Type hints on every function signature; Pydantic models for all API request/response shapes.
- Format/lint with Ruff only (`ruff format` + `ruff check`), enforced in CI — don't hand-format. Black is intentionally not used; Ruff's formatter covers the same ground with one less tool to maintain.
- Tests use `pytest` against recorded fixtures; no test should hit FastF1 or the network.
- No bare `except:` — ingestion failures (upstream instability is a known risk) must be caught and logged explicitly, not swallowed.

**TypeScript (frontend)**
- Strict mode on. No `any` without an inline comment explaining why.
- `ESLint` + `Prettier` enforced in CI.
- Functional components only.
- Zustand stores are scoped by concern (`selectionStore`, later `cursorStore`) — don't collapse them into one global store.
- Components access the API only through the typed client in `frontend/src/api` — never call `fetch` directly from a component.

## Conventions

- Branches: `feature/<milestone>-<short-desc>`, `fix/<short-desc>`.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- New code goes in the layer it architecturally belongs to, per `docs/architecture.md` — not wherever is quickest to edit.

## Definition of done

A feature or milestone is done when:
- Tests pass, types check, lint is clean.
- Any new architectural decision (new dependency, new layer boundary, reversal of a prior decision) has an ADR in `docs/adr/` written *before* merge, not after.
- Docs are updated if behavior or contracts changed.
- The result matches its milestone's entry in `docs/success-metrics.md` — nothing extra is bundled in because "I was already in there."

## Scope discipline

Before adding anything not explicitly called for by the current milestone, check `docs/success-metrics.md` and the deferred-features table in `docs/prd.md`. If it belongs to a later version, note it and move on — don't fold it into the current PR.

## Process

- Design before code: every milestone gets a short design note or ADR before implementation starts.
- Code review before merge, even solo — write the PR as if a teammate will read it.
- One milestone at a time, per `docs/prd.md` §3 (Milestone Roadmap).
