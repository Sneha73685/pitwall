# PitWall — Product Requirements Document

For system design, tech stack rationale, and repo layout, see `docs/architecture.md`. For why each technical decision was made over its alternatives, see `docs/adr/`. For what "done" means per version, see `docs/success-metrics.md`.

## 0. Two things worth stating up front

**"Feel like sitting on the Mercedes pit wall" is the V2 target, not V1.** Synchronized charts, cursor-follows-car, corner highlighting — that's real engineering work (a shared time-cursor state that every visualization subscribes to). Pulling it into V1 turns "small but professional" into "ambitious and half-finished." V1 proves the foundation is sound: clean data pipeline, clean API, clean static charts. V2 makes it feel alive.

**The name and branding need a legal disclaimer, not just a good README.** "PitWall," F1 terminology, and any team colors/liveries rendered in the app put this near Formula 1's trademarks. That doesn't block building the project — plenty of open-source F1 tools exist (FastF1 itself does this) — but it means: no official logos/team assets in the repo, a clear "unofficial, fan-made, not affiliated with Formula 1 or FOM" disclaimer in the README, and driver/team color mappings defined independently rather than lifted from broadcast graphics.

---

## 1. Product Requirements

### 1.1 Problem / Opportunity

Fans, students, and aspiring motorsport engineers have no accessible way to explore real F1 telemetry the way race engineers do. The raw data exists (F1's live-timing feed, made accessible via open tools like FastF1), but there's no polished, open-source application that turns it into an engineer's-eye view: lap-by-lap traces, sector deltas, and eventually the "why" behind a gain or loss.

### 1.2 Vision

An open-source race engineering platform that starts as a focused telemetry viewer and grows, version by version, into a system that can explain *why* a driver gained or lost time — and eventually answer natural-language questions about a session.

### 1.3 Target users

- Primary: the builder — this is a portfolio piece for master's applications and SWE/motorsport-adjacent roles. Every design decision should be defensible in an interview.
- Secondary: F1-fan developers who'd use or contribute to an open-source telemetry tool.
- Tertiary (aspirational, not a V1 design constraint): someone in a motorsport engineering context who wants a free alternative to proprietary tools for casual analysis.

### 1.4 Goals

- Ship a working, deployed, publicly-accessible V1 within a bounded scope.
- Every version is a real release: tagged, documented, demoable.
- Codebase reads as production-quality: typed, tested, linted, documented, sensibly modular.
- Architecture in V1 doesn't have to include V2/V3 features, but must not actively block them.

### 1.5 Non-goals (for now)

- Live/real-time data during an actual race weekend (see §4, risk on data sourcing).
- Multi-user accounts, saved workspaces, sharing.
- Mobile app.
- Any claim of affiliation with F1, FOM, or any team.

### 1.6 Success criteria for V1

You can hand someone a URL, they pick a 2023+ session, driver, and lap, and they see an accurate track map plus synchronized-looking (but not yet interactive) speed/throttle/brake/RPM/gear/DRS traces, with a working lap and sector comparison and delta graph. It loads in seconds, not minutes, because data is pre-processed rather than fetched live on every request. See `docs/success-metrics.md` for the full per-version breakdown.

---

## 2. Scope for Version 1

### 2.1 In scope

- Session selection (season + event + session type: practice/qualifying/race).
- Driver selection.
- Lap selection, including fastest lap auto-select.
- Track map rendered from telemetry GPS/position channels.
- Channel traces: speed, throttle, brake, RPM, gear, DRS — as static, aligned-by-distance charts (not yet cursor-synced).
- Two-lap comparison (e.g., driver A vs driver B, or same driver two laps).
- Sector time comparison.
- Delta graph (cumulative time gained/lost vs. a reference lap).
- Data ingestion pipeline that pulls from FastF1, normalizes, and caches sessions server-side so the frontend never waits on a live scrape.

### 2.2 Explicitly out of scope for V1

Anything from V2 onward (see §3 roadmap) — synchronized hover, cursor-follows-car, corner highlighting, tire/stint/pit-stop strategy, weather, position history, engineering-insight generation, and the AI/NL query layer. Also out: user accounts, live/real-time sessions, mobile layout.

---

## 3. Milestone Roadmap (V1)

Relative complexity shown as S/M/L rather than calendar time, since pacing depends on available hours.

| Milestone | Scope | Complexity |
|---|---|---|
| M0 — Project scaffolding | Repo structure, tooling (linting, formatting, type-checking), CI skeleton, ADR process, README with disclaimer | S |
| M1 — Ingestion pipeline | FastF1 fetch + normalize for one session end-to-end, write to Parquet cache, tests against recorded fixtures | M |
| M2 — Backend API | FastAPI service reading the cache; endpoints for sessions, drivers, laps, telemetry; OpenAPI docs; basic tests | M |
| M3 — Frontend shell | React+TS app scaffold, typed API client, session/driver/lap selectors, routing | S |
| M4 — Track map | Render track shape from position telemetry, plot a lap's line, mark a point (static, not yet hover-driven) | M |
| M5 — Telemetry channel charts | Speed/throttle/brake/RPM/gear/DRS traces via ECharts, aligned by distance | M |
| M6 — Lap/sector comparison + delta graph | Two-lap overlay, sector time table, cumulative delta computation and chart | L |
| M7 — Polish & release | Test coverage pass, docs, deployment, tag v1.0.0, demo recording for portfolio | M |

Sequencing note: M1 and M2 can't be meaningfully parallelized (API needs real cached data to design against), but M3 (frontend shell) can start against a mocked API contract while M1/M2 are in progress if working both ends at once is preferred.

---

## 4. Engineering Risks

**Data quality and coverage gaps.** FastF1's telemetry completeness varies by session/year/team — some laps have missing or inconsistent samples across channels. The pipeline should validate and flag incomplete data rather than assume every session is clean.

**Data volume.** A full season of telemetry at speed/throttle/brake/RPM/gear/DRS resolution across all drivers and sessions adds up to real disk space. V1 doesn't need "all seasons" — start with a small, curated set of sessions and let the cache grow deliberately.

**Rate limiting / upstream instability.** FastF1 pulls from F1's live-timing archive, which isn't an official public API with guarantees. Retry/backoff belongs in the pipeline; ingestion is already decoupled from request-time for this reason (see `docs/architecture.md`).

**Designing V1 so V2 doesn't require a rewrite.** The real risk isn't "V1 is too small," it's "V1's data model makes synchronized interactivity in V2 painful to retrofit." Telemetry should be indexed/aligned by a common axis (distance or time) from the start, even though V1 only renders it statically.

**Trademark/legal exposure.** Covered in §0 — mitigate with disclaimers and by not using official visual assets, rather than by avoiding the project.

**Scope creep from the vision itself.** The long-term vision (AI engineer, engineering insights) is exciting and easy to let bleed into "just one more feature" in V1. The milestone table in §3 and `docs/success-metrics.md` are the guardrails — if a feature isn't in them, it's not in scope, no matter how tempting.

**Solo-maintainer risk on chosen tools.** FastF1 and Jolpica-f1 are both community-maintained by small teams. Fine for V1's needs, but worth monitoring — if either goes stale, the pipeline layer is the one place that would need a source swap, which is exactly why it's isolated from the backend/frontend via the `TelemetryProvider` abstraction (ADR-0005).

---

## 5. Intentionally Deferred (with rationale)

| Feature | Deferred to | Why not now |
|---|---|---|
| Synchronized hover, cursor-follows-car, corner highlighting | V2 | Needs a shared time-cursor architecture across every chart; doing it half-built in V1 undermines the "small but professional" goal |
| Tire strategy, stints, pit stops, weather, position history, gaps | V3 | Needs relational data (a real reason to introduce Postgres) and different source data (Ergast/Jolpica, weather feeds) |
| Engineering-insight generation (the "gains 0.12s because..." analysis) | V4 | Needs V2's synchronized data model and V3's race context to attribute *why*, not just *what* |
| Natural-language / AI querying | V5 | Depends on all prior layers existing as clean, queryable data — an LLM layer on top of a shaky foundation would just produce confident-sounding nonsense |
| Live/real-time session data | Post-V1, opportunistic | FastF1 is archive-based; real-time needs OpenF1's paid tier or a different sourcing strategy — not worth solving before the archive-based product even exists |
| User accounts, saved views, sharing | Not currently planned | Adds auth, a real database of user state, and privacy/security surface for a portfolio project that doesn't need multi-user support to demonstrate engineering skill |
| Mobile app / responsive mobile layout | Not currently planned | Telemetry comparison is inherently a wide-screen, multi-chart experience; a cut-down mobile version is a distraction from V1's core proof points |

---

## Document history

- v1: initial PRD, architecture, and tech stack in one document.
- v2: architecture, tech stack, and repository structure extracted to `docs/architecture.md` following the design freeze at the end of the architecture discussion phase; tech stack updated to reflect ADR-0007 (Zustand) and ADR-0008 (ECharts), which superseded this document's original Context/uPlot recommendations.
