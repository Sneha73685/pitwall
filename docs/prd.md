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

## 3a. Milestone History Beyond V1 (M8–M38)

The table above (§3) is the original, dated V1 schedule and is not edited by later milestones.
Everything from M8 onward was added after V1 shipped, each with its own design review under `docs/`
(`m8-design-review.md` onward) — none of it was part of the original V1–V5 schedule as written when
this document's milestone table was drafted. Recorded here for what it actually shipped and how it
relates to the themes §5 already named, not as a retroactive edit to §3:

| Milestone | What shipped | Relationship to the original roadmap |
|---|---|---|
| M8 | Session-wide driver performance analytics | Not itself named in the original roadmap |
| M9 | Professional telemetry UI (frontend redesign) | Presentational; not V-scoped |
| M10 | Postgres + Parquet hybrid storage; stints/pit-stops (single-session, per-driver) | Begins V3's "tire strategy, stints, pit stops" deliverable (§5) |
| M11 | Descriptive tyre & stint performance analytics (single-session) | Continues V3's stint/pit-stop deliverable |
| M12 | Multi-season/event/session discovery; historical ingestion backfill (2020–2026, 704 sessions) | Infrastructure; not itself V-scoped |
| M13 | Cross-session lap/telemetry comparison (`/laps/compare` generalized to two independently-selected sessions) | Extends V1's two-lap comparison (§2.1) beyond what V1 originally specified (single-session only) |
| M14 | Synchronized telemetry cursor, Zustand-based (`docs/m14-design-review.md`) | Delivers V2's synchronized-cursor criterion (§5) — via a different mechanism than originally specified |
| M15 | Cross-session stint/tyre-strategy comparison (`/stints/compare`) | Completes V3's stint/pit-stop deliverable's cross-session case — not originally specified in V3's text at all |
| M16 | Documentation & roadmap reconciliation (`docs/m16-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
| M17 | Cross-season driver pace-trend analytics (`/drivers/{driver_id}/seasons/{season}/pace-trend`) | Not itself named in the original roadmap; a new cross-season capability building on M8's session-analytics pattern, not a V1–V5 criterion |
| M18 | Per-session Parquet file-level caching (performance) | Infrastructure; not itself V-scoped |
| M19 | Telemetry driver/lap positional index (performance) | Infrastructure; not itself V-scoped |
| M20 | Documentation & roadmap reconciliation (`docs/m20-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
| M21 | Cross-season driver tyre/stint-strategy trend analytics (`/drivers/{driver_id}/seasons/{season}/tyre-trend`) | Not itself named in the original roadmap; extends V3's stint/pit-stop deliverable (§5) to the cross-season case, mirroring M17's cross-season pace-trend pattern |
| M22 | Corner highlighting on the track map and synchronized charts (`markArea`, client-side geometry detection) | Delivers V2's corner-highlighting criterion (§5) — completes the one V2 criterion M14 explicitly left as a non-goal |
| M23 | Documentation & roadmap reconciliation (`docs/m23-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
| M24 | Comparison URL persistence/shareability for `/laps/compare` and `/stints/compare` | Not itself named in the original roadmap; repairs a gap named but not fixed in M17's/M21's own design reviews — not a new V-criterion |
| M25 | Two-driver cross-season pace-trend comparison (`/drivers/pace-trend/compare`) | Not itself named in the original roadmap; the multi-driver case M17 explicitly deferred (§11) |
| M26 | Two-driver cross-season tyre-trend comparison (`/drivers/tyre-trend/compare`) | Not itself named in the original roadmap; the multi-driver case M21 explicitly deferred (§7), handed off again by M25 (§13) |
| M27 | Comparison-surface consistency pass — shared URL helpers, "Compare Stints" navigation | Documentation/maintainability-adjacent cleanup; not itself V-scoped |
| M28 | Documentation & roadmap reconciliation (`docs/m28-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
| M29 | Shared `to_driver_strategy_summary` backend mapper extraction | Not itself named in the original roadmap; maintainability-only, no capability change |
| M30 | Frontend dependency/security remediation (Vite, Vitest, `@vitejs/plugin-react`, ECharts) | Not itself named in the original roadmap; security/maintainability debt, no capability change |
| M31 | React Router 6→7 migration | Not itself named in the original roadmap; closes the security debt M30 left open, no capability change |
| M32 | Shared `FILTERABLE_SESSION_TYPES` frontend constant | Not itself named in the original roadmap; maintainability-only, no capability change |
| M33 | Documentation & roadmap reconciliation (M28–M32) | Documentation-only reconciliation pass; not itself V-scoped |
| M34 | Session race classification (`classified_position`, `grid_position`, `status`, `points`) | Not itself named in the original roadmap; a new session-classification capability that M35's position-history criterion builds on |
| M35 | Lap-by-lap running-order/position chart (`Lap.position`) | Delivers V3's "position history" criterion (§5) for the Race/Sprint session population — via FastF1's own already-loaded session data, not the Jolpica-f1/Ergast source originally anticipated for this criterion |
| M36 | Yellow-flag/Safety Car/VSC/red-flag lap exclusion (`Lap.track_status`, session-analytics filtering) | Not itself named in the original roadmap; a new session-analytics correctness capability, not a V-criterion |
| M37 | Fix: yellow-flag exclusion tags render in driver lap table | Bug fix, not itself V-scoped |
| M38 | Historical backfill of M34–M36 fields across 332 of 334 applicable historical sessions (2 permanently excluded — genuine external data-gap) | Historical-data completion, not itself V-scoped; extends M34–M36's coverage across the 2020–2026 corpus M12 ingested |

See `docs/m16-design-review.md`, `docs/m20-design-review.md`, `docs/m23-design-review.md`,
`docs/m28-design-review.md`, `docs/m33-design-review.md`, and `docs/m39-design-review.md` for the
reconciliation passes this table is part of.

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

Status column added by the M16 documentation reconciliation (`docs/m16-design-review.md`) — records
what has since shipped, verified against current source; the "Why not now" column is preserved as
originally written, describing the reasoning at V1 design time.

| Feature | Deferred to | Why not now (at V1 design time) | Status |
|---|---|---|---|
| Synchronized hover / cursor-follows-car | V2 | Needs a shared time-cursor architecture across every chart; doing it half-built in V1 undermines the "small but professional" goal | **Shipped — M14**, via page-scoped Zustand cursor stores (not `echarts.connect()`/cross-instance `axisPointer.link` as ADR-0008 originally anticipated — that mechanism can't reach the SVG track map). Covers the single-lap track-map and M13 cross-session comparison pages; session-analytics and tyre-performance charts are not yet part of this synchronized surface. |
| Corner highlighting (via `markArea`) | V2 | Same as above | **Shipped — M22**, via a geometry-derived, client-side curvature detector (`frontend/src/features/track-map/detectCorners.ts`) over existing track-point data — no new backend route, repository method, or persisted field. Covers the same two synchronized surfaces as M14's cursor-sync (single-lap track map, M13 cross-session lap comparison); does not extend coverage to session-analytics or tyre-performance charts, matching M14's own coverage boundary. Distinct from, and not to be confused with, fitted degradation curves or strategy recommendations — neither was ever part of this criterion's scope and both remain unbuilt (see the engineering-insight-generation and AI/NL-query rows below). |
| Tire strategy, stints, pit stops (single-session) | V3 | Needs relational data (a real reason to introduce Postgres) | **Shipped — M10/M11**, sourced from FastF1 session data via a second, independent repository (`RaceContextRepository`, ADR-0011). |
| Cross-session stint/tyre-strategy comparison | V3 | Not specified in the original V1 text | **Shipped — M15**, generalizing M13's cross-session comparison pattern to stints/pit-stops. |
| Position history (classification, running-order) | V3 | Needs different source data (Ergast/Jolpica) | **Shipped — M34/M35/M38**, via FastF1's own already-loaded session data (`ff1_session.results`/`.laps`), not Jolpica-f1/Ergast as originally anticipated. `Driver.classified_position/grid_position/status/points` (M34) and `Lap.position` (M35) — both populated for Race/Sprint sessions only, matching real FastF1 semantics. M38 backfilled both across 332 of the 334 applicable historical sessions (2 permanently excluded — a genuine external Ergast-data-source gap in the cached snapshot, not a PitWall defect). Related: M36/M37 add yellow-flag/Safety Car/VSC/red-flag lap exclusion (`Lap.track_status`), also backfilled by M38. |
| Gaps (time behind leader/car ahead) | V3 | Needs different source data | Not yet built — `results.Time` is available from the same already-loaded FastF1 data M34 uses, but is not currently extracted, normalized, or exposed anywhere. |
| Weather | V3 | Needs different source data (weather feeds) | Not yet built — no ingestion, provider method, or schema exists. |
| Engineering-insight generation (the "gains 0.12s because..." analysis) | V4 | Needs V2's synchronized data model and V3's race context to attribute *why*, not just *what* | Not yet built. |
| Natural-language / AI querying | V5 | Depends on all prior layers existing as clean, queryable data — an LLM layer on top of a shaky foundation would just produce confident-sounding nonsense | Not yet built. |
| Live/real-time session data | Post-V1, opportunistic | FastF1 is archive-based; real-time needs OpenF1's paid tier or a different sourcing strategy — not worth solving before the archive-based product even exists | Not yet built. |
| User accounts, saved views, sharing | Not currently planned | Adds auth, a real database of user state, and privacy/security surface for a portfolio project that doesn't need multi-user support to demonstrate engineering skill | Not planned. |
| Mobile app / responsive mobile layout | Not currently planned | Telemetry comparison is inherently a wide-screen, multi-chart experience; a cut-down mobile version is a distraction from V1's core proof points | Not planned. |

---

## Document history

- v1: initial PRD, architecture, and tech stack in one document.
- v2: architecture, tech stack, and repository structure extracted to `docs/architecture.md` following the design freeze at the end of the architecture discussion phase; tech stack updated to reflect ADR-0007 (Zustand) and ADR-0008 (ECharts), which superseded this document's original Context/uPlot recommendations.
- v3 (M16, `docs/m16-design-review.md`): added §3a recording M8–M15's shipped milestone history, distinct from the original V1 table; updated §5's deferred-features table with current shipped/unshipped status for V2/V3. No scope or architecture change — documentation reconciliation only.
- v4 (M20, `docs/m20-design-review.md`): extended §3a through M19 (M16 docs reconciliation, M17 cross-season pace trends, M18/M19 repository performance work). §5 re-verified against current source with no edit needed — every row's status is still accurate. No scope or architecture change — documentation reconciliation only.
- v5 (M23, `docs/m23-design-review.md`): extended §3a through M22 (M20 docs reconciliation, M21 cross-season tyre-strategy trends, M22 corner highlighting). Corrected §5's corner-highlighting row, false since M22 shipped. No scope or architecture change — documentation reconciliation only.
- v6 (M28, `docs/m28-design-review.md`): extended §3a through M27 (M23 docs reconciliation, M24 comparison URL persistence, M25 two-driver pace-trend comparison, M26 two-driver tyre-trend comparison, M27 comparison-surface consistency pass). Corrected §3a's own heading range (M8–M19 → M8–M27, stale since before M23). §5 re-verified against current source with no edit needed. No scope or architecture change — documentation reconciliation only.
- v7 (M33, `docs/m33-design-review.md`): extended §3a through M32 (M28 docs reconciliation, M29 shared strategy-mapper extraction, M30 dependency/security remediation, M31 React Router 7 migration, M32 shared session-type filter constant). §5 re-verified against current source with no edit needed. No scope or architecture change — documentation reconciliation only.
- v8 (M39, `docs/m39-design-review.md`): extended §3a through M38 (M33 docs reconciliation — its own retroactive entry, previously missing — M34 session classification, M35 position chart, M36 yellow-flag exclusion, M37 exclusion-rendering fix, M38 historical backfill). Corrected §5's "Weather, position history, gaps" row, false since M35/M38 shipped position history — split into three accurate rows (position history: shipped; gaps: not built; weather: not built). No scope or architecture change — documentation reconciliation only.
