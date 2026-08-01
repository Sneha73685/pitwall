# M6 Implementation Plan — Lap Comparison & Delta Analysis

**Status:** Approved for implementation (pending sign-off on open questions in §0.4)
**Baseline:** v0.5.0 (M0–M5 complete, audit passed)
**Source design:** PitWall M6 Design Review
**Scope:** Two-lap distance-aligned delta comparison, telemetry overlays, track map delta coloring, sector breakdown

---

## 0. Design Review

Before any file is touched, here is a critical pass on the design doc. Nothing below blocks starting Phase 1 — the phases already build in the recommended simplifications.

### 0.1 What the design gets right (keep as-is)

- **Server-side delta computation.** Correct call. One implementation, one set of unit tests, no risk of frontend/backend drift on a number users will scrutinize closely. Do not revisit this.
- **Linear interpolation only.** Correct for this data density and this use case. Spline overshoot near braking transients is a real correctness risk, not a theoretical one. No spline option should be added in M6, even as a flag.
- **Reject non-monotonic distance rather than repair.** Correct for a v1. Repair heuristics are exactly the kind of thing that silently rots into "why does this lap look weird" tickets. Keep the reject-with-clear-error behavior and resist scope creep here.
- **Two-series-with-NaN-gaps for delta chart fill**, over `visualMap` piecewise. Simpler, more testable, more predictable in edge cases (e.g. delta crossing zero many times). Correct recommendation, adopt it.
- **Isolating cursor/hover state from the rest of comparison state.** This is the single highest-leverage architectural decision in the doc for frontend performance. Keep it a hard requirement, not a nice-to-have.

### 0.2 Over-engineered / should be simplified

- **§4 "server-state cache" library assumption (React Query / RTK Query).** The design explicitly flags this as an assumption because the actual M0–M5 frontend state pattern is unknown to the design author. This must not be assumed — it must be confirmed by reading the existing frontend code before Phase 4 starts. If M0–M5 use plain `fetch` + component state, or a simpler custom hook pattern, M6 should match that exactly. Introducing React Query in M6 alone, when M0–M5 didn't use it, is a bigger change than this milestone should make. **Action:** Phase 0 includes an explicit "confirm existing pattern" step before any frontend data-fetching code is written; whichever pattern already exists in the single-lap view is what `useLapComparison` will use, full stop.
- **§12 in-process LRU cache on the compare endpoint.** The design itself recommends deferring this, and that recommendation is correct — but it is inconsistent with the design being present in the API section at all in this level of detail (params in cache key, etc.). Recommend **removing it from the M6 design entirely**, not just deferring it. It should not appear in code comments, TODOs, or the endpoint's docstring as a "future" hook — that invites premature complexity later without profiling data to justify it. If perf work is ever needed, it starts from measured data, not from a plan written before the endpoint has a single real caller.
- **§9 supporting both `visualMap` piecewise and two-series-with-NaN-gaps as live options.** The design correctly recommends the latter, but presenting both means an implementer might reasonably build the more complex one "for flexibility." Recommend the plan explicitly state: **only the two-series approach is implemented; `visualMap` piecewise is not implemented, not stubbed, not left as a commented-out alternative.**
- **Five telemetry channels by default (`speed, throttle, brake, gear, rpm`).** Reasonable as an API default, but the UI shouldn't render five stacked panes by default — that contradicts the "what good looks like" scenario in §1.4, which is about a single clean delta chart plus one hover interaction. Recommend: **speed only is visible by default in the UI**; throttle/brake/gear/rpm are available via `ChannelToggleControls` but start collapsed. This is a UI default, not an API change — the API default channel list is unaffected.

### 0.3 Under-specified / needs a decision before coding starts

- **GET vs POST for `/compare` (Open Question 3).** The design correctly defers to precedent, but "check precedent" isn't a plan step, it's a to-do left inside a to-do. **Resolution required in Phase 0**: read the existing route modules for any multi-parameter lap/telemetry GET endpoints in M0–M5 (e.g. whatever backs the single-lap telemetry view) and match that convention exactly. If none exists, default to **GET with query params**, matching the design's cacheability rationale, and record the decision in the route module's docstring so it isn't re-litigated.
- **Sector boundary distances (Open Question 1).** Whether session metadata already exposes sector-boundary *distances* vs only sector *times* materially changes whether `sectors.py` needs a distance-conversion step. This must be checked against the actual Parquet schema/session model in Phase 0, before `sectors.py` is designed, not discovered mid-implementation. If only times exist, the conversion uses the *same* per-lap distance/time interpolation already built for `alignment.py` — no new interpolation logic, just a different query point.
- **Lap validity / track-status data availability (Open Question 4).** The design correctly flags that if this doesn't exist yet, it's a scope addition. This plan treats it as a **hard fork point**: if `is_valid` and per-lap track-status already exist on the lap model from M0–M5, Phase 2 includes `warnings` population using that data. If they don't exist, `warnings` ships in M6 as an **empty-but-present list** (schema field exists, logic to populate it does not), and a follow-up ticket is filed rather than silently expanding M6's scope to include new Parquet plumbing. This must be confirmed in Phase 0 before `validation.py` is written, since it changes that file's actual content.
- **Resolution cap value.** The design says "capped server-side (e.g. max 2000)" — "e.g." is not a spec. Phase 1 fixes this at a concrete number (recommend **2000**, matching the design's own worked payload-size example in §12) and it becomes a named constant, not a magic number re-typed in the route, the schema validator, and any tests.

### 0.4 Inconsistent or risky as written

- **Sign convention (§8.2 step 4) is the single highest-risk item in this entire design**, and the design says so itself. The risk isn't the math — it's that the convention is stated in exactly one place in a long document. This plan elevates it: it must appear in (a) the Pydantic model's field docstring for `delta_ms`, (b) a code comment directly above the subtraction in `delta.py`, (c) a dedicated test in `test_delta.py` asserting sign and not just magnitude (already specified in §11 — keep it, don't let it get deprioritized), and (d) the UI legend text. Treat any PR touching `delta.py` or `DeltaChart.tsx` as requiring re-verification of this convention in review, not just a glance.
- **Warnings is a free-text string list (`["lap_b was under yellow flag conditions in sector 2"]`).** Free-text warnings from the backend that get rendered directly in the UI are a maintenance risk: wording changes become a coordinated frontend/backend change, and the frontend can't style or icon-differentiate warning types. Recommend a small structured shape instead — a `warning_code` (enum: `YELLOW_FLAG`, `INVALID_LAP`, `PARTIAL_LAP`, etc.) plus an optional `detail` string — so the frontend renders its own copy/iconography per code and the backend free-text becomes a debug-only fallback rather than the contract. This is a minor addition to the schema, not a scope increase, and prevents a class of future bugs where UI copy and backend strings drift.
- **"Reject at the API layer with a clear 400" for mismatched circuits (§10)**, but the design doesn't specify what "clear" means as a response shape. Since this codebase presumably already has an error-response convention from M0–M5 (FastAPI exception handlers, a standard error envelope, etc.), Phase 0 must confirm that convention and Phase 2 must reuse it — not invent a new error shape for this one endpoint.
- **Property-based test note in §11** ("delta at d=0 should always be ≈0") is a good invariant but is written as an aside ("actually delta at d=0 should always be... good invariant to fuzz-test") rather than a committed test. This plan commits it as a required test in Phase 2, with or without Hypothesis — if the project doesn't already use a property-testing library, don't add one for this single test; write it as a parametrized test over a handful of synthetic monotonic series instead of introducing a new test dependency for one milestone.

### 0.5 Net effect on scope

None of the above changes what M6 delivers. They remove one dependency-shaped risk (React Query assumption), remove one premature-optimization item (LRU cache), tighten three under-specified points into concrete decisions made in Phase 0, and add one small schema field (`warning_code`) that pays for itself the first time backend copy needs to change without a frontend release. Everything in §13 of the design (out of scope) remains out of scope.

---

## 1. Phase Overview

| Phase | Layer | Objective | Depends on |
|---|---|---|---|
| 0 | Investigation | Resolve all open questions against actual M0–M5 code | — |
| 1 | Backend | Pydantic schemas + constants | 0 |
| 2 | Backend | Domain logic: alignment, delta, sectors, validation | 1 |
| 3 | Backend | API route + typed client contract | 2 |
| 4 | Frontend | Data layer: hooks, API client, types | 0, 3 |
| 5 | Frontend | Shared component generalization (`TelemetryChart`, `TrackMap`, `DriverLapPicker`) | 4 |
| 6 | Frontend | Comparison feature components (non-chart) | 5 |
| 7 | Frontend | Delta chart + telemetry overlay charts (ECharts) | 5, 6 |
| 8 | Frontend | Track map delta coloring + cursor sync integration | 5, 6, 7 |
| 9 | Integration | End-to-end wiring, routing, manual QA pass | all above |
| 10 | Cleanup | Docs, changelog, ADR (if the project uses ADRs), version bump | 9 |

Each phase below ends with a passing test suite and a recommended commit. No phase should be merged with a red test suite, including pre-existing tests.

---

## Phase 0 — Investigation & Decisions (no code changes)

### Goal
Resolve every open question and assumption flagged in §0 above by reading actual M0–M5 code, before writing any M6 code. This phase produces decisions, not diffs.

### Activities
1. Read the existing frontend data-fetching pattern (single-lap telemetry view) to confirm: fetch library/pattern (native fetch + hooks? React Query? RTK Query? something else), typed API client structure, and error-handling wrapper shape.
2. Read the existing FastAPI route modules for lap/telemetry endpoints to confirm: GET vs POST convention for multi-parameter reads, error-response envelope shape, route module naming/organization, and how routes register with the app.
3. Read the session/lap Pydantic models and Parquet repository layer to confirm: whether sector-boundary *distances* exist or only *times*; whether `is_valid` and per-lap track-status (yellow flag, pit lane) already exist on the lap model or repository.
4. Read the existing single-lap distance-computation code (used for the track map / single-lap chart) to confirm it is reusable as-is for `alignment.py`, per §7 of the design ("do not re-derive distance independently").
5. Confirm existing test conventions: test runner, fixture organization, whether the project uses Hypothesis or similar for property-based tests, and where fixture Parquet data for tests currently lives.
6. Write up findings as a short internal note (can be the top of this document, or a linked doc) covering: GET/POST decision, error envelope to reuse, warnings data availability (hard fork per §0.3), sector distance/time availability, and confirmed frontend state pattern.

### Files
None modified. Read-only investigation.

### Tests
N/A — no code changes.

### Completion criteria
- All four "under-specified" items in §0.3 have a written decision.
- The frontend state-management pattern for Phase 4 is confirmed, not assumed.
- The `warnings` fork point (structured data available vs. empty-list-for-now) is decided.

### Git commit recommendation
No commit, or a single docs-only commit appending "Phase 0 findings" to this plan if the team wants the decisions version-controlled alongside the design.

---

## Phase 1 — Backend Schemas & Constants

### Goal
Define the request/response contract before any logic is written, so Phase 2 and Phase 3 are implemented against a stable, reviewed shape.

### Files
- `backend/app/schemas/lap_comparison.py` (new) — Pydantic models: `LapSummary`, `ChannelSeries`, `SectorDelta`, `Warning` (structured, per §0.4), `LapComparisonResponse`, and the request query/body model matching whatever GET/POST decision came out of Phase 0.
- `backend/app/domain/lap_comparison/__init__.py` (new, empty/exports only)
- `backend/app/core/constants.py` or equivalent existing constants module — add `MAX_COMPARE_RESOLUTION = 2000` and `DEFAULT_COMPARE_RESOLUTION = 1000` as named constants (reuse existing constants file location/pattern; do not create a new one if one already exists).

### Why here
Schemas are the contract. Writing them first, and reviewing them in isolation, catches sign-convention documentation, warning-shape decisions, and field naming issues before they're baked into interpolation code or frontend types.

### Tests
- `tests/schemas/test_lap_comparison_schema.py` (new): schema validation tests — valid payload parses, missing required fields rejected, resolution above `MAX_COMPARE_RESOLUTION` rejected at the schema/validator level, `delta_ms` docstring/field description contains the sign-convention statement (a simple string-presence assertion is enough to prevent someone quietly deleting the comment).

### Completion criteria
- Schemas import cleanly, `mypy`/type-checking (if used in the project) passes.
- New schema test file passes.
- All pre-existing backend tests still pass unchanged (no shared files touched yet).

### Git commit recommendation
`feat(backend): add lap comparison Pydantic schemas and constants`

---

## Phase 2 — Backend Domain Logic

### Goal
Implement the actual delta computation as a pure, well-tested domain module, fully decoupled from the API route (per existing M0–M5 layering, per the design's own file structure in §6).

### Files
- `backend/app/domain/lap_comparison/alignment.py` (new) — common distance grid construction (`np.linspace(0, min(max_a, max_b), resolution)`) and `align_lap()` interpolation, reusing the existing single-lap distance-computation utility confirmed in Phase 0 rather than re-deriving distance.
- `backend/app/domain/lap_comparison/delta.py` (new) — `compute_delta()`; sign convention documented inline directly above the subtraction, per §0.4.
- `backend/app/domain/lap_comparison/sectors.py` (new) — per-sector delta aggregation; implementation branches per the Phase 0 finding on whether sector-boundary distances already exist (direct lookup) or only times (convert via the same interpolation used in `alignment.py` — no new interpolation logic).
- `backend/app/domain/lap_comparison/validation.py` (new) — monotonicity check (reject, not repair, per design decision), same-session/circuit check, `warnings` population per the Phase 0 fork decision (structured `warning_code` + optional `detail`, or empty list if underlying data doesn't exist yet).

### Why here
Matches the design's file structure exactly (§6) and the existing M0–M5 pattern of keeping domain logic out of route handlers. Pure functions here are the cheapest thing in the whole milestone to unit test exhaustively, which matters most for the delta math specifically.

### Tests
- `tests/domain/lap_comparison/test_alignment.py`: synthetic constant-speed and known-accel/decel laps → interpolated values match analytic expectation within tolerance.
- `tests/domain/lap_comparison/test_delta.py`:
  - identical laps → `delta_ms` ≡ 0 everywhere.
  - lap B uniformly `k` ms slower → `delta_ms` ≡ `k` constant.
  - lap B faster only in a sub-region → flat outside, moves only inside; **dedicated sign-convention test**, asserting the sign matches the documented convention, not just magnitude.
  - **delta at `d=0` ≈ 0** for a handful of parametrized synthetic monotonic series (property-style test without adding a new test dependency, per §0.4, unless Phase 0 confirmed the project already has Hypothesis).
- `tests/domain/lap_comparison/test_sectors.py`: known synthetic sector boundaries → per-sector delta equals hand-computed values, covering both branches (distance-available vs. time-only) if both exist in the real schema.
- `tests/domain/lap_comparison/test_validation.py`: non-monotonic distance triggers rejection with a lap-identifying message; mismatched circuit triggers rejection; missing channel handled gracefully (omitted, not partial-aligned).

### Completion criteria
- All new domain tests pass.
- Domain module has no FastAPI/route imports (pure functions, testable without spinning up the app) — matches the design's stated separation of concerns.
- All pre-existing backend tests still pass unchanged.

### Git commit recommendation
`feat(backend): implement lap comparison alignment, delta, sector, and validation logic`

---

## Phase 3 — Backend API Route

### Goal
Expose the domain logic via `/api/v1/sessions/{session_id}/laps/compare`, using whatever GET/POST and error-envelope conventions Phase 0 confirmed.

### Files
- `backend/app/api/routes/laps_compare.py` (new) — route handler: parses params/body per Phase 0 decision, loads both laps via the existing Parquet repository (reuse, no new repository methods unless Phase 0 found a genuine gap), calls `validation.py` → `alignment.py`/`delta.py`/`sectors.py`, returns `LapComparisonResponse`.
- Existing route registration file (wherever M0–M5 register routers) — add one line to include the new router. No changes to unrelated routes.

### Why here
The route is a thin adapter over the domain module built in Phase 2; keeping it thin is itself a testability and maintainability goal consistent with M0–M5's audited architecture.

### Tests
- `tests/api/test_laps_compare_route.py` (new): integration test against fixture Parquet data (reuse existing M0–M5 fixtures if they already contain suitable laps; add minimal new fixture data only if none exists for a two-lap same-session scenario). Covers: full happy-path contract test (response shape matches schema), 400 on mismatched circuit, rejection response on non-monotonic distance, `warnings` populated for a known yellow-flag fixture lap **if** such a fixture exists (per Phase 0 finding) — otherwise this sub-case is a documented follow-up, not a fabricated test.

### Completion criteria
- New route test passes against real fixture data, not mocked domain functions (this is the contract test, per design §11).
- Manual smoke test: hit the endpoint locally with two known laps from a real session, confirm response shape matches the design's example payload.
- All pre-existing backend tests, including other route tests, still pass unchanged.

### Git commit recommendation
`feat(backend): add /laps/compare API endpoint`

At this point, the backend is feature-complete and independently verifiable. This is a natural point for a backend-only PR and review, before frontend work starts.

---

## Phase 4 — Frontend Data Layer

### Goal
Build the typed client call and data-fetching hook, matching the existing frontend pattern confirmed in Phase 0 — not introducing a new state-management library.

### Files
- `frontend/src/features/lap-comparison/api/compareLaps.ts` (new) — typed client function, added alongside existing lap/telemetry client methods, sharing the existing base fetch/error-handling wrapper.
- `frontend/src/features/lap-comparison/types.ts` (new) — TypeScript types mirroring the Pydantic response schema exactly (field names, including the structured `Warning` type).
- `frontend/src/features/lap-comparison/hooks/useLapComparison.ts` (new) — data-fetching hook using the confirmed existing pattern (React Query, RTK Query, or custom hook — whichever Phase 0 found), cache-keyed on `{sessionId, driverA, lapA, driverB, lapB, channels, resolution}`.

### Why here
Isolating the data layer from components lets Phase 5–8 build against a stable typed contract and lets this layer be tested independently of any rendering.

### Tests
- `frontend/src/features/lap-comparison/api/compareLaps.test.ts`: mocked fetch, correct URL/params construction per the confirmed GET/POST convention, error path surfaces the existing error envelope correctly.
- `frontend/src/features/lap-comparison/hooks/useLapComparison.test.ts`: mocked API response, correct cache-key behavior on param change (swap A/B → new fetch only if it actually changes params in a way that matters; channel toggle behavior — see Phase 7 note on requesting the channel superset once, per §7 of the design).

### Completion criteria
- New tests pass.
- No existing frontend data-fetching code touched or refactored beyond adding the new files.
- All pre-existing frontend tests still pass unchanged.

### Git commit recommendation
`feat(frontend): add lap comparison data layer (types, client, hook)`

---

## Phase 5 — Shared Component Generalization

### Goal
Generalize `TelemetryChart`, `TrackMap`, and extract `DriverLapPicker`, per §7 of the design — additive changes only, zero behavior change for existing single-lap usage.

### Files
- `frontend/src/components/charts/TelemetryChart.tsx` (modified) — change prop from a single dataset to `series: {label, data, color}[]`; single-lap view passes an array of length 1, behavior unchanged. This is the highest-risk shared-file change in the whole milestone — see Risks (§4).
- `frontend/src/components/track-map/TrackMap.tsx` (modified) — add optional `colorBy` or `segments` prop, defaulting to current single-color behavior when absent.
- A new standalone `DriverLapPicker` component (new file, exact path depends on where the existing single-lap driver/lap dropdown currently lives) — extracted from the existing single-lap selection UI into a component parameterized by a label, with the single-lap view updated to use the extracted component instead of its inline dropdown pair.

### Why here
These are the only three shared-file touches in the entire milestone (per the design's explicit boundary in §6: "only touch shared components at their prop-API boundary"). Isolating them into their own phase makes regression risk to the existing single-lap view easy to scope and easy to revert independently of any comparison-feature code.

### Tests
- **Regression tests first:** run the existing `TelemetryChart`, `TrackMap`, and single-lap-view test suites *before* making changes, confirm green, then again after each change, confirm still green with no modifications to those existing test files (aside from the single-lap view's test being updated only if it needs to reference the newly-extracted `DriverLapPicker`).
- New tests: `TelemetryChart` renders correctly with `series.length > 1` (new capability); `TrackMap` renders correctly with a `colorBy`/`segments` prop supplied (new capability); extracted `DriverLapPicker` renders and fires callbacks correctly in isolation, and the single-lap view still renders identically using it.

### Completion criteria
- All pre-existing tests for these three components/views pass **unchanged** — this is the explicit regression gate for this phase, not optional.
- New capability tests pass.
- Manual visual check: single-lap view looks and behaves identically to before this phase.

### Git commit recommendation
`refactor(frontend): generalize TelemetryChart/TrackMap and extract DriverLapPicker for reuse`

This is the phase most worth a careful, separate code review, since it's the one place M6 touches code outside its own feature folder.

---

## Phase 6 — Comparison Feature Components (Non-Chart)

### Goal
Build the comparison page shell, header, sector table, and channel toggle controls — everything except the three chart-heavy pieces (delta chart, telemetry overlays, track map), which get their own phase due to ECharts/cursor-sync complexity.

### Files
- `frontend/src/features/lap-comparison/ComparisonPage.tsx` (new)
- `frontend/src/features/lap-comparison/ComparisonProvider.tsx` (new) — cursor-sync context + channel visibility state, per §4/§12 isolation requirement.
- `frontend/src/features/lap-comparison/components/LapPairSelector.tsx` (new) — wraps two `DriverLapPicker` instances (Phase 5), defaults to each driver's fastest lap if available.
- `frontend/src/features/lap-comparison/components/ComparisonHeader.tsx` (new) — driver chips, lap times, overall delta, swap button.
- `frontend/src/features/lap-comparison/components/SectorBreakdownTable.tsx` (new)
- `frontend/src/features/lap-comparison/components/ChannelOverlayPanel.tsx` (new, shell only — chart instances added in Phase 7) with `ChannelToggleControls` collapsed-by-default per §0.2.

### Why here
These components consume the Phase 4 data layer and Phase 5 shared components but carry none of the ECharts/cursor-sync complexity, so they can be built and tested in isolation first, keeping Phase 7's diff smaller and more focused.

### Tests
- Component tests (React Testing Library) for each new component: renders with fixture data, fires expected callbacks (lap selection change, swap A/B, channel toggle), sector table highlights the correct best sector.
- `ComparisonProvider` test: cursor state updates don't cause sibling context consumers unrelated to cursor to re-render (render-count spy, per design §11's approach for `useCursorSync`, applied here at the provider level first).

### Completion criteria
- All new component tests pass.
- No shared or pre-existing files touched beyond Phase 5's changes.
- All pre-existing tests still pass unchanged.

### Git commit recommendation
`feat(frontend): add lap comparison page shell, header, sector table, and channel panel`

---

## Phase 7 — Delta Chart & Telemetry Overlay Charts

### Goal
Implement the two chart types using ECharts, per §9 of the design: two-series-with-NaN-gaps for the delta chart (only this approach, per §0.2), `echarts.connect(group)` for cursor sync across chart instances.

### Files
- `frontend/src/features/lap-comparison/components/DeltaChart.tsx` (new) — zero-line via `markLine`, two-series-with-NaN-gaps fill, joins the shared ECharts `group`.
- `frontend/src/features/lap-comparison/components/ChannelOverlayPanel.tsx` (modified from Phase 6 shell) — mounts one `TelemetryChart` (Phase 5, generalized) instance per active channel, each with two series (lap A, lap B) in existing team/driver colors, joining the same ECharts `group`.
- `frontend/src/features/lap-comparison/hooks/useCursorSync.ts` (new) — thin wrapper if any non-ECharts consumer needs the shared hover/distance state (the track map marker, built in Phase 8); for the ECharts instances themselves, `echarts.connect` handles sync natively with no React re-render involved, per design §12.

### Why here
Isolated from Phase 6 because ECharts instance lifecycle, `group`/`connect` behavior, and NaN-gap series construction are the most technically fiddly part of the frontend work and benefit from being reviewed as their own unit.

### Tests
- `DeltaChart` test: renders with fixture delta data, correct series count (two, for the NaN-gap approach) and correct zero-line presence; renders correctly when delta crosses zero multiple times (the case the two-series approach specifically exists to handle well).
- `ChannelOverlayPanel`/`TelemetryChart` integration test: mounts N charts for N active channels, series count and labels correct per channel.
- `echarts.connect` grouping: since pixel-level ECharts behavior is explicitly out of automated-test scope (per design §11), verify only that all chart instances are assigned to the same `group` id (a DOM/instance-property assertion, not a visual one) — actual crosshair-sync behavior is manual QA (Phase 9).

### Completion criteria
- New chart tests pass.
- Manual check: toggling channels adds/removes overlay panes without losing delta chart context (per design §1.2 decision).
- All pre-existing tests still pass unchanged.

### Git commit recommendation
`feat(frontend): add delta chart and telemetry overlay charts with cross-chart cursor sync`

---

## Phase 8 — Track Map Delta Coloring & Cursor Integration

### Goal
Wire the generalized `TrackMap` (Phase 5) into the comparison feature with delta-based segment coloring, and connect its hover marker to the shared cursor state via `useCursorSync` (not an ECharts-specific mechanism, per design §9).

### Files
- `frontend/src/features/lap-comparison/components/TrackMapDelta.tsx` (new) — passes a `colorBy`/`segments` prop (Phase 5) computed from the delta array; memoized on the delta array reference, per design §12 performance note, not recomputed on every hover/render.

### Why here
Last of the visual pieces because it's the one place a non-ECharts component needs to consume the same synced-cursor state as the ECharts instances — a good final integration point that exercises `useCursorSync` end-to-end.

### Tests
- `TrackMapDelta` test: given fixture delta data, correct color mapping per segment (diverging scale, driver-A-faster vs driver-B-faster tint); marker position updates when cursor-sync state changes (simulated); color computation is memoized (assert it isn't recomputed when unrelated state changes, e.g. a channel toggle).

### Completion criteria
- New test passes.
- Manual check: hovering any chart moves the track map marker to the corresponding position (per design §1.3/§1.4 "what good looks like" scenario).
- All pre-existing tests still pass unchanged.

### Git commit recommendation
`feat(frontend): add track map delta coloring with synced cursor marker`

---

## Phase 9 — Integration & Manual QA

### Goal
Wire everything into the actual app routing/navigation and perform the manual QA the design explicitly scopes out of automated tests (§11: pixel-level ECharts regression, cross-browser SVG rendering).

### Files
- App-level routing file (wherever routes are registered) — add `/session/:sessionId/compare` route.
- Existing lap table/list component (wherever laps are listed for a session) — add the two-lap multi-select and "Compare Selected" entry point (§1.1, path 1). This is the one other place M6 touches an existing screen; keep the diff minimal (add a selection mode and a button, no restructuring of the existing table).

### Why here
This is the first point where the whole feature is reachable end-to-end as a user would encounter it, and where cross-component behavior (not just per-component correctness) can be checked.

### Tests
- Route-level smoke test if the project has any (navigating to `/session/:sessionId/compare` renders the page without error).
- **Manual QA checklist** (not automated, matches design §11's explicit scope boundary):
  - Both entry paths (lap-table multi-select, dedicated route with pickers) work.
  - Swap A/B flips sign and driver order instantly with no refetch when both laps are already cached.
  - Click-drag zoom on delta chart affects other charts and track map.
  - Hover sync works across delta chart, every active telemetry overlay, and the track map marker.
  - Identical lap A/B selection produces a flat zero delta line, no crash (§10 edge case).
  - Cross-driver and same-driver comparisons both work.
  - Warnings (or their current empty-list placeholder, per Phase 0 fork) render sensibly and don't break layout when absent.

### Completion criteria
- Full manual QA checklist passes.
- All automated tests across backend and frontend pass.
- No regressions in the existing single-lap view or lap table (explicitly re-verified, not assumed from Phase 5's isolated tests).

### Git commit recommendation
`feat: wire lap comparison feature into app routing and lap table entry point`

---

## Phase 10 — Documentation & Cleanup

### Goal
Bring the change up to the same documentation standard as M0–M5 before release.

### Files
- Project changelog (wherever M0–M5 record milestone completions) — add M6 entry.
- API documentation (if maintained separately from FastAPI's auto-generated docs) — document the new endpoint, explicitly including the sign convention and the "raw delta, not tyre/fuel corrected" disclaimer from design §10.
- Any ADR log the project maintains — record the GET/POST decision and the "no in-process cache in M6" decision (§0.2) as short ADR entries if the project's convention is to record such decisions; skip if M0–M5 didn't establish an ADR practice.
- Version bump per existing project convention (e.g. `v0.6.0`).

### Tests
Full regression run: entire backend and frontend test suites, green.

### Completion criteria
Documentation matches the standard set by M0–M5; a new engineer reading only the docs (not this plan) could understand the endpoint's contract and the sign convention without reading `delta.py`.

### Git commit recommendation
`docs: document M6 lap comparison feature; bump version`

---

## 2. Testing Summary

| Area | New tests | Existing tests that must remain green |
|---|---|---|
| Backend schemas | `test_lap_comparison_schema.py` | All existing schema tests |
| Backend domain | `test_alignment.py`, `test_delta.py`, `test_sectors.py`, `test_validation.py` | All existing domain tests (M0–M5 repository, other domain modules) |
| Backend API | `test_laps_compare_route.py` | All existing route tests, especially any session/lap/telemetry routes the compare route's repository calls are adjacent to |
| Frontend data layer | `compareLaps.test.ts`, `useLapComparison.test.ts` | Existing API client tests |
| Frontend shared components | New capability tests for `TelemetryChart`/`TrackMap`/`DriverLapPicker` | **Existing `TelemetryChart`, `TrackMap`, and single-lap view tests, unmodified and green** — this is the single most important regression gate in the whole plan |
| Frontend feature components | Component tests per Phase 6/7/8 | N/A (new feature folder) |
| Integration | Manual QA checklist (Phase 9) | Full existing suite, both backend and frontend |

Explicitly not automated, per the design's own stated scope (§11): pixel-level ECharts visual regression, cross-browser SVG rendering. These remain manual QA only, as in the source design.

---

## 3. Reuse Ledger

Confirms §7 of the design is actually honored, phase by phase:

- Parquet repository: reused as-is in Phase 3; no new repository methods unless Phase 0 surfaces a genuine gap (e.g. missing per-lap track-status data, per §0.3).
- Existing distance-computation utility: reused in Phase 2's `alignment.py`, not re-derived.
- `TelemetryChart`: generalized in place (Phase 5), not forked.
- `TrackMap`: extended in place (Phase 5), not forked.
- Driver+lap picker: extracted once, used twice (Phase 5/6), not duplicated.
- Typed API client base wrapper: extended (Phase 4), not forked.
- Error-response envelope: reused (Phase 3), not a new shape invented for this endpoint.

---

## 4. Risks

| Risk | Type | Mitigation / where addressed |
|---|---|---|
| Sign-convention bug in `delta_ms` | Correctness | Documented in 4 places (§0.4); dedicated sign-specific test in Phase 2, not just magnitude tests |
| `TelemetryChart`/`TrackMap` generalization breaks existing single-lap view | Regression | Phase 5 isolated as its own reviewable diff; pre-change test baseline captured and re-run unchanged |
| Assumed frontend state library (React Query) doesn't match actual M0–M5 pattern | Architectural | Phase 0 confirms actual pattern before Phase 4 starts; no library introduced on assumption |
| Free-text `warnings` strings drift from frontend copy over time | Maintenance | Structured `warning_code` + optional `detail` adopted in Phase 1 schema (§0.4) |
| Premature LRU caching adds invalidation complexity with no profiling data | Performance / maintenance | Explicitly removed from scope (§0.2), not merely deferred |
| Cursor/hover state re-rendering the full comparison tree | Performance (frontend) | Isolated context in Phase 6, verified with render-count tests before chart work (Phase 7) begins |
| GET/POST or error-envelope inconsistency with rest of API | API consistency | Resolved in Phase 0 against actual existing routes, not assumed |
| `warnings` populated with fabricated logic if underlying track-status data doesn't exist | Testing / scope | Explicit fork in Phase 0/§0.3: ship empty-list placeholder rather than inventing data plumbing mid-milestone |
| Non-monotonic distance rejection UX is a dead end for the user (no repair, no explanation of where) | UX | Design already requires the error identify which lap and roughly where (§10); Phase 2 test suite enforces the message contains this, not just that a 4xx is returned |
| Manual-QA-only coverage for ECharts visuals and SVG cross-browser rendering | Testing | Explicit checklist in Phase 9, matching the design's own stated scope boundary rather than pretending automated coverage exists where it doesn't |

---

## 5. Explicitly Out of Scope (unchanged from design §13)

Multi-lap (>2) comparison, cross-session comparison, tyre/fuel/track-evolution normalization, weather normalization, export/share/permalink, live/in-progress lap comparison, bespoke mobile layout, a caching layer beyond what naturally exists, and corner-by-corner named annotations. None of these are touched by any phase above.