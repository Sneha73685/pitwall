# PitWall — M11 Frontend Design Note: Tyre & Stint Performance Analytics (Phase 4)

**Status:** Design complete; Phase 4 implementation shipped matching this contract without
modification — see `docs/m11-implementation-plan.md` Phase 6 for overall M11 documentation status.
This document is preserved as the frontend design record, not rewritten as an implementation report.
This is the frontend design note `docs/m11-design-review.md` §7 and
`docs/m11-implementation-plan.md` Phase 4 both flagged as a prerequisite ("a dedicated frontend
design note should precede this phase's implementation, the same sequencing M8 → M9 and M10 →
(its own deferred frontend note) already used"). Phase 1 (domain logic), Phase 2 (backend API), and
Phase 3 (frontend data layer/hooks) are complete, approved, and pushed. This document is the Phase 4
implementation contract.

**Author's framing:** senior frontend design review, ready for implementation sign-off — matching
the M6/M8/M10/M11-backend precedent of a design document before code.

---

## 1. Status / Purpose

This document specifies exactly what Phase 4 builds: routes, pages, components, chart
configurations, data flow, states, responsive behavior, accessibility, and tests — so
implementation can proceed without re-deriving UX or architecture decisions. It is bound by two
upstream contracts that are **not** renegotiated here:

- The API surface `docs/m11-design-review.md`/`docs/m11-implementation-plan.md` Phase 2 shipped:
  `GET /sessions/{session_id}/drivers/{driver_id}/stint-pace` and
  `GET /sessions/{session_id}/tyre-performance`, exactly as typed in
  `frontend/src/api/client.ts` (`DriverStintPaceResponse`, `TyrePerformanceResponse`, and their
  nested types). No field is added, renamed, or reshaped here.
- The scientific boundary `docs/m11-design-review.md` §4 established: descriptive facts and
  aggregates only, never a fitted curve, ranking, or performance verdict. §21 of this document
  restates that boundary in frontend-specific, checkable terms.

Everything in this document is additive to the existing frontend: no existing component, hook, or
route is modified in a way that changes its current behavior — Phase 4 only adds new files and a
small number of new links/routes in five existing files (§22).

---

## 2. Design Principles

1. **Reuse over invention.** Every visual pattern in this document is either a direct reuse of an
   existing component (`StintTimeline`, `Card`, `EmptyState`, `ErrorState`, `LoadingState`,
   `StatusChip`, `compoundColor`, `useEChartsInstance`) or a close structural variant of one, with
   the variance justified by a genuinely different data shape — never a fresh pattern invented
   because it seemed nicer.
2. **The M8/M9 "raw connected line" precedent is the ceiling, not a license to go further.**
   `LapTimeTrendChart` already established that connecting a driver's own raw, sequential lap-time
   points with a line is not a fitted trend — it is literally the data, drawn without smoothing.
   M11 charts reuse that exact reasoning where it applies (one driver's own raw sequence) and
   deliberately do **not** extend it to aggregates (§10, §21) — a line connecting *medians across
   many drivers/stints* is a different object with a different, forbidden meaning, even though it
   looks similar on screen.
3. **Identity order, never performance order.** Every list, table, axis, and legend in this
   feature is ordered by a neutral identity key (compound taxonomy, driver ID, stint number, lap
   number) — never by pace, consistency, or any derived metric. `DriverRankingChart` and
   `DriverSummaryTable`'s default sort (both legitimate, existing session-analytics patterns) are
   the explicit counter-example this feature does not follow (§9, §21).
4. **Disclosure, not deletion.** In-laps, out-laps, invalid laps, and trend-ineligible stints are
   always rendered somewhere, distinctly marked — never silently dropped from a chart or table.
   This mirrors `DriverLapTable`'s existing "excluded laps still listed, flagged inline" convention
   exactly.
5. **Dense, not decorative.** Matches CLAUDE.md and the task's own instruction: this is an
   engineering dashboard. No new UI library, no animation, no gradients, no gamification.

---

## 3. Existing Frontend Patterns Audited

Read in full before design decisions were made:

- **`race-context/`**: `StrategyPage`, `StintTimeline` (+ CSS + test), `PitStopList` (+ CSS),
  `compoundColor.ts` (+ test), `useRaceContext.ts` (+ test).
- **`session-analytics/`**: `SessionAnalyticsPage` (+ CSS), `SessionAnalyticsHeader`,
  `DriverSummaryTable` (+ CSS), `DriverRankingChart` + `driverRankingChartOptions.ts`,
  `PaceDistributionChart` + `paceDistributionChartOptions.ts`, `LapTimeTrendChart` +
  `lapTimeTrendChartOptions.ts`, `DriverDrillDown`, `DriverLapTable`, `useSessionAnalytics.ts`,
  `useDriverLapMetrics.ts`.
- **`lap-comparison/`**: `ComparisonPage`, `DriverLapPicker`, `SectorBreakdownTable`, `DeltaChart` +
  `deltaChartOptions.ts` (markLine / NaN-gapped dual-series precedent).
- **Shared UI**: `AppShell`, `Sidebar`, `Card`, `EmptyState`/`ErrorState`/`LoadingState`
  (`StateMessage.module.css`), `StatusChip`, `SkeletonBlock`, `teamColor.ts`,
  `useEChartsInstance.ts`.
- **Routing**: `App.tsx` (full route table), `frontend/src/state/selectionStore.ts` (ADR-0007 —
  session/driver/lap only, no UI state).
- **Design tokens**: `frontend/src/styles/tokens.css` — dark-only theme, no light-mode variant
  exists anywhere in this app; documented breakpoints `sm 640 / md 1024 / lg 1440`, 4px spacing
  grid, mono font for numeric/telemetry values.
- **Session entry pages**: `DriverSelectPage` (driver-card grid + "View session analytics" link),
  `LapSelectPage` (per-lap list + "View Strategy" link, already driver-scoped).
- **API client**: full `frontend/src/api/client.ts` read, including the exact M11 Phase 3 types
  (`DriverStintPaceResponse`, `StintPaceLap`, `StintPace`, `TyrePerformanceResponse`,
  `DriverStrategySummary`, `CompoundUsageCount`, `CompoundAggregate`,
  `CompoundLapIndexAggregate`, `RawLapTimeByCompound`) and the pre-existing, unmodified
  `getPitStops(sessionId, driverId?)` (M10) whose `driverId` is already optional.
- **Phase 3 hooks**: `useDriverStintPace.ts`, `useTyrePerformance.ts`, and their tests — confirmed
  exact loading/error/clear-before-fetch semantics.

**Key finding that shapes §8/§13:** `TyrePerformanceResponse` has no pit-stop field.
`docs/m11-design-review.md` §5.1 lists pit-lane time distribution as in-scope, but Phase 2 scoped
it out of the `tyre-performance` payload — reasonably, since M10's `getPitStops(sessionId)`
(no `driverId`) already serves exactly this read pattern and is already unmodified/available.
Phase 4 therefore needs one new, small hook (`useSessionPitStops`, §17) wrapping that
already-existing client function — not a client or backend change, and not a gap in Phase 2/3, just
a read pattern Phase 3 didn't need to name because it required no new endpoint.

---

## 4. User Flows

**Flow A — session-wide entry (dashboard-first).**
Session list → driver select (`DriverSelectPage`) → **"View tyre performance"** (new link,
parallel to the existing "View session analytics") → `TyrePerformancePage`. From there, a user
looking at one driver's strategy row can follow it to that driver's stint-pace detail.

**Flow B — driver-scoped entry (detail-first).**
Session list → driver select → driver's lap list (`LapSelectPage`) → **"View Stint Pace"** (new
link, parallel to the existing "View Strategy") → `StintPacePage`.

**Flow C — raw facts → analysis (cross-link).**
`StrategyPage` (M10, raw stints/pit-stops for one driver) already exists at
`/sessions/:sessionId/drivers/:driverId/strategy`. It gets one new cross-link to
`StintPacePage` ("View Stint Pace"), and `StintPacePage` gets one back to `StrategyPage`
("View Strategy"). This is the same raw-facts-vs-analysis split the codebase already draws between
`race-context/` (facts) and `session-analytics/` (analysis) — M11 draws it again between
`StrategyPage` (facts) and `StintPacePage` (descriptive analysis of those facts).

**Flow D — sidebar persistent nav.** `Sidebar` gets one new session-scoped `NavLink`,
**"Tyre Performance"**, at the same tier as the existing "Session Analytics" link (both appear once
`sessionId` is set). No driver-scoped sidebar link is added for stint-pace, matching the existing
precedent that `StrategyPage` itself has no sidebar entry either — driver-scoped analysis pages are
reached via in-page links, not the persistent sidebar.

---

## 5. Route / Navigation Proposal

```
/sessions/:sessionId/tyre-performance                    (new — session-wide dashboard)
/sessions/:sessionId/drivers/:driverId/stint-pace         (new — driver detail)
```

Both follow the exact conventions already established:

- Plural `sessions`, matching every existing route (`App.tsx`'s own docstring already corrects the
  M6/M8 design docs' singular proposals against what was actually built — M11 doesn't repeat that
  mistake).
- `tyre-performance` sits at the same route depth as `/sessions/:sessionId/analytics` (session-wide,
  no driver param) — direct precedent.
- `stint-pace` sits at the same route depth as `/sessions/:sessionId/drivers/:driverId/strategy`
  (driver-scoped) — direct precedent.
- Neither route is nested under the other; `TyrePerformancePage` links to `StintPacePage` by full
  path with both params filled in, the same way `DriverSummaryTable`'s row selection or
  `LapSelectPage`'s "Compare Selected" pass concrete params forward rather than relying on route
  nesting.

No existing route changes shape or meaning. Two new `<Route>` entries are added to `App.tsx`
alongside the existing ones (§22).

---

## 6. Page Hierarchy

```
TyrePerformancePage        /sessions/:sessionId/tyre-performance
├── Header (session identity, mirrors SessionAnalyticsHeader)
├── Strategy Summary        (StrategySummaryPanel — per-driver strategy shape, links to StintPacePage)
├── Compound Usage          (CompoundUsageSummary — session-wide compound table)
├── chart row (2-col ≥1024px, 1-col below, matching SessionAnalyticsPage's .chartRow exactly)
│   ├── Lap Time by Compound       (CompoundDistributionChart — boxplot)
│   └── Lap Time by Tyre Age       (CompoundLapTrendChart — raw scatter, no line)
├── Driver Comparison by Compound  (DriverCompoundComparisonChart — compound-filtered, per-driver raw series)
└── Pit Lane Time                  (PitLaneTimeSummary — session-wide, all drivers)

StintPacePage               /sessions/:sessionId/drivers/:driverId/stint-pace
├── Header (driver identity + cross-link to StrategyPage)
├── Strategy               (StintTimeline — REUSED unmodified from race-context)
├── Lap Pace                (DriverStintPaceChart — combined, stint-segmented raw trace)
├── Stint Detail             (StintConsistencyTable — per-stint consistency figures)
└── Lap Detail               (StintPaceLapTable — per-lap raw table, the chart's data fallback)
```

This mirrors `SessionAnalyticsPage`'s exact shape (header → summary table → chart row → detail) at
the session level, and `StrategyPage` + `DriverDrillDown`'s shape (identity heading → compact
strategy visual → chart → table) at the driver level. No new page-composition pattern is invented.

---

## 7. Driver Stint-Pace Design (`StintPacePage`)

**Visualization hierarchy decision.** The task's brainstormed alternatives (stint cards / one chart
per stint / one combined chart / summary metrics alongside) are evaluated as:

- *One chart per stint*: rejected. A driver can have 1–6+ stints (real data: Bahrain 2024 ranges
  1–4); several small multiples for a single driver is more screen space and more component
  instances for the same information a segmented single chart already conveys, and stints vary
  wildly in length (1 lap to 20+), so small multiples would be visually inconsistent sizes.
- *Stint cards*: satisfied for free — `StintTimeline` already exists, is already the exact
  "compact proportional strategy bar" this page needs, and `StintPace` (the API's stint summary
  type) is a structural superset of `Stint`'s fields (`stint_number`, `compound`, `start_lap`,
  `end_lap`, `tyre_life_at_start`, plus `eligible_lap_count`/`consistency_ms`/`consistency_cv`).
  `<StintTimeline stints={stintPace.stints} />` works with **zero new component** — TypeScript's
  structural typing accepts the extra fields.
- *One combined chart with stint-colored segments*: **selected**, for the lap-time trace itself
  (§7.1). Reuses `LapTimeTrendChart`'s x-axis-by-lap-number convention directly, extended with
  per-stint segmentation.
- *Summary metrics alongside the chart*: **selected**, as `StintConsistencyTable` beneath the chart
  — matching `DriverDrillDown`'s existing "chart, then table" composition.

### 7.1 `DriverStintPaceChart`

One ECharts chart, x-axis = **absolute lap number** (not lap-in-stint index) — chosen because the
chart's job is to show one driver's whole-session pace story, and lap number is the axis every
existing per-driver chart in this app already uses (`LapTimeTrendChart`), which also makes pit
stops visually self-evident as gaps/color changes without a separate annotation. Lap-in-stint index
is still surfaced, in the tooltip and in `StintPaceLapTable`, satisfying the "x-axis meaning
explicit" requirement without forcing every reader through a less-familiar axis.

**Series construction, per stint:**
- One **scatter** series per stint containing every lap in that stint (`StintPaceLap[]` filtered by
  `stint_number`), regardless of `is_valid`/`is_in_lap`/`is_out_lap`/`is_trend_eligible` — nothing
  is dropped from the chart.
- One **line** series per stint containing only that stint's laps where `is_trend_eligible === true`,
  connected in lap-number order. A stint with 0 or 1 trend-eligible laps naturally produces a line
  series with 0–1 points, which ECharts renders as nothing — **no special-case code is needed**,
  this falls out of the data the API already computed (`is_trend_eligible`), the same way
  `stint_eligibility.py`'s `has_trend_shape` was designed to make this automatic on the backend.
- Marker **shape** (not color) encodes lap category, so the distinction survives without color:
  - filled circle — normal lap, trend-eligible
  - hollow triangle-down — in-lap (`is_in_lap`)
  - hollow triangle-up — out-lap (`is_out_lap`)
  - hollow diamond — excluded for another reason (`is_valid === false` or trend-ineligible but not
    an in/out-lap)
- Marker **color** always encodes compound via the reused `compoundColor()` — never encodes
  eligibility, so compound identity stays legible independent of the shape encoding.
- A dashed, silent `markLine` (reusing `DeltaChart`'s exact `markLine` pattern: `symbol: "none"`,
  `label: { show: false }`) at each stint's `start_lap` (after the first) marks stint boundaries.
- `animation: false`, `backgroundColor: transparent`, mono font, dark axis/tooltip colors — matching
  every existing chart option builder's literal styling values exactly (no new palette).
- **No fitted line, no regression, no area fill.** The per-stint line is raw, sequential,
  trend-eligible-only data, directly analogous to `LapTimeTrendChart`'s already-approved pattern —
  the only extension is that it's drawn as several shorter per-stint segments instead of one
  session-long line, specifically so it never bridges a pit stop into a fake continuous trend.
- Y-axis: **lap time in seconds** (`StintPaceLap.lap_time_seconds`), not milliseconds — unlike
  `session-analytics`, M11's own API returns seconds (mirroring `Lap.lap_time_seconds`'s existing
  convention, not `DriverLapMetrics.lap_time_ms`'s). The chart follows what M11's API actually
  returns rather than converting units to match a different milestone's unrelated choice.
- Legend: one entry per stint, labeled `"Stint {n} — {compound}"` (ECharts' native legend,
  toggleable) — communicates compound without inventing a separate legend component.

A short static caption above the chart (visible text, not just an `aria-label`) states the encoding
in plain language, e.g.: *"Lap time by lap number. Circles are normal laps; triangles are in/out
laps; diamonds are laps excluded for another reason. All are excluded from the connected trend line
and from consistency figures for that stint."* This is the chart's own plain-language explanation of
why it stays descriptive — the UI-facing analog of `docs/m11-design-review.md` §4.2's argument.

### 7.2 `StintConsistencyTable`

Plain `<table>`, styled like `PitStopList`/`SectorBreakdownTable`'s existing `.tableWrapper`/
`.table` CSS pattern, rows in **`stint_number` ascending order** (chronological, never sorted by
consistency). Columns: Stint, Compound (reusing `compoundColor` as a small swatch + text, never
color alone), Laps (`start_lap`–`end_lap`), Tyre life at start, Eligible laps, Consistency (ms),
Consistency (CV). `consistency_ms`/`consistency_cv` render `"—"` when `null`, matching
`DriverSummaryTable`'s existing `formatMsPrecise` null-dash convention exactly. A stint with
`eligible_lap_count < 2` gets the same inline `"(insufficient laps)"` treatment
`DriverSummaryTable` already uses for `MIN_VALID_LAPS_FOR_RANKING` — same wording, same reasoning,
reused verbatim: *there are laps, the population is just too small for this specific downstream
statistic*, not an error.

### 7.3 `StintPaceLapTable`

Plain per-lap table, one row per `StintPaceLap`, styled like `DriverLapTable`'s existing
"excluded laps flagged inline, not dropped" pattern. Columns: Lap, Stint, Lap-in-stint index,
Compound, Lap time, flags (in-lap / out-lap / invalid, rendered as inline parenthetical text exactly
like `DriverLapTable`'s `"({lap.exclusion_reason ?? "excluded"})"`). This table is also the
**accessible data fallback** for `DriverStintPaceChart` (§18) — every point the chart plots has a
corresponding row here.

---

## 8. Session Tyre-Performance Design (`TyrePerformancePage`)

Mirrors `SessionAnalyticsPage`'s composition exactly: header, summary panel(s), a responsive chart
row, then detail sections. **Not a leaderboard** — every list below is explicitly neutral-ordered
(§9).

### 8.1 `StrategySummaryPanel`

One row per entry in `driver_strategies` (`DriverStrategySummary`), **sorted by `driver_id`
alphabetically** — the only neutral key available on this response shape (no `driver_number` is
present on `DriverStrategySummary`, unlike `Driver`). Each row: driver ID, stint count, and a
`CompoundSequenceStrip` (§8.2). Each row is a `<Link>` to that driver's `StintPacePage` — the
session-wide → driver-detail drill path (Flow A, §4), implemented as real navigation (a distinct
route, matching `StrategyPage`'s existing precedent of being its own page) rather than an inline
expand/collapse, since stint-pace detail is substantial enough to deserve its own URL.

### 8.2 `CompoundSequenceStrip`

A new, small component — **not** a duplicate of `StintTimeline`, because the input shape is
genuinely different: `DriverStrategySummary` has `compound_sequence: string[]` and
`stint_lengths: number[]`, not `Stint[]` with lap ranges. Visually it reuses the exact same pattern
(`flexGrow: length`, `backgroundColor: compoundColor(compound)`, `StintTimeline.module.css`'s
layout rules copied, not imported, since the two components' props don't overlap enough to share a
CSS Module cleanly). This is the one place in the design where a close visual sibling of an
existing component is justified rather than reused directly — `docs/architecture.md`'s "avoid
duplicating a component without reason" bar is met because the reason is a real prop-shape
mismatch, not convenience.

### 8.3 `CompoundUsageSummary`

Plain table from `compound_usage` (`CompoundUsageCount[]`): compound, stint count, driver count,
total laps. Rows ordered by the **fixed compound taxonomy** (§9.1), not by any of the numeric
columns.

### 8.4 `CompoundDistributionChart`

Boxplot, **directly reusing `PaceDistributionChart`'s exact pattern** (`echarts/charts`
`BoxplotChart`, dataset `transform: { type: "boxplot" }` over raw arrays, `itemNameFormatter` for
category labels) — one box per compound instead of one box per driver. Source: `compound_aggregates`
(`CompoundAggregate[]`), specifically each entry's `lap_times_ms` **raw array**, fed through
ECharts' own boxplot transform exactly like `paceDistributionChartOptions.ts` does.

**Guardrail, stated explicitly because the API model makes the mistake easy:** `CompoundAggregate`
*also* carries pre-computed `median_lap_time_ms`/`p25_lap_time_ms`/`p75_lap_time_ms`. Those fields
are **not** fed into this chart — only `lap_times_ms` is, through ECharts' own transform, for
exactly the reason `paceDistributionChartOptions.ts`'s own comment already states for the
session-analytics precedent: two independently-computed quartile paths (backend Python vs. ECharts'
own boxplot algorithm) could disagree, and this codebase's established B5 decision is to have
exactly one source of truth for a chart's own quartiles. The pre-computed fields are for
**text/table display only** (e.g., a compact numeric readout next to each box, or in
`CompoundUsageSummary`), never fed to the same visual element the raw array feeds.

Compounds below `PaceDistributionChart`'s existing `MIN_LAPS_FOR_DISTRIBUTION = 2` threshold
(reused, not reinvented) are omitted from the boxplot, same reasoning: a box needs a distribution.
X-axis category order: the fixed compound taxonomy (§9.1) — **never** sorted by median or any other
statistic, the one deliberate divergence from `PaceDistributionChart`'s driver-axis (which has no
such neutrality constraint, since ranking drivers by pace is exactly what M9 built it to do).

### 8.5 `CompoundLapTrendChart`

Raw **scatter only** — this is the highest-risk chart in the whole feature and gets the most
conservative treatment (§10, §21). Source: `compound_lap_index_aggregates`
(`CompoundLapIndexAggregate[]`), x-axis = `lap_in_stint_index`, y-axis = lap time.

- One small, semi-transparent scatter point per **raw observation** in each bin's `lap_times_ms`
  array (not one point per bin) — this is deliberately the rawest possible rendering: real
  individual laps, visibly spread, not a single tidy summary value per x-position.
- The bin's `median_lap_time_ms` is optionally overlaid as one slightly larger, distinctly-shaped
  (diamond) point at the same x-position, for legibility — **still a scatter point, never part of a
  line series**, and its tooltip states `"median of N laps"` explicitly rather than implying a
  trend value.
- **No series in this chart may have `type: "line"`.** This is enforced by a test (§19) precisely
  because connecting per-bin medians in x-order would visually reproduce the exact "degradation
  curve" shape `docs/m11-design-review.md` §4.2 rules out, even though nothing was literally fit —
  the chart-option builder is the one place in Phase 4 an edit is likeliest to accidentally
  reintroduce that shape by "just connecting the dots for readability," so the design explicitly
  forbids it here, not only in prose.
- Series (one per compound), colored via `compoundColor()`, ordered per §9.1.

### 8.6 `DriverCompoundComparisonChart`

Source: `raw_lap_times_by_compound` (`RawLapTimeByCompound[]`), the API's item #18 / §4.3 payload —
the one explicitly re-scoped by the design review from "driver-vs-driver pace comparison" to "raw
side-by-side display, not a ranking."

- A small **compound filter** (button/tab group, not a dropdown — at most 5 FIA compounds, tabs are
  more discoverable and match the dashboard's density), local component state, defaulting to the
  first compound in the fixed taxonomy order (§9.1) that's actually present in the data. Selecting
  a compound filters `raw_lap_times_by_compound` to entries matching it.
- For the selected compound: one series per driver, x-axis = `lap_in_stint_indices[i]`, y-axis =
  `lap_times_ms[i]`, **connected in lap-in-stint-index order** — this is allowed, per §2.2/§21,
  because it is one driver's own raw, real laps in sequence, the same category of thing
  `LapTimeTrendChart`/`DriverStintPaceChart` already draw as a connected raw line; it is not an
  aggregate and not a fit.
- **Color**: per-driver, via a new small `driverColor.ts` utility (§16) — **not** `teamColor.ts`,
  because `teamColor.ts` hashes on `team_name`, and two teammates on the same compound would
  otherwise render identically, defeating the chart's purpose. `driverColor.ts` reuses the exact
  same deterministic-HSL-hash pattern, keyed on `driver_id` instead.
- **Series/legend order**: `driver_id` alphabetical — fixed, never reordered by the filtered
  compound's pace.
- **No sort-by-pace, no "fastest" badge or label, no color-coding by relative speed** (color is
  purely per-driver identity, uncorrelated with lap time) — enforced by a guardrail test (§19).
- Given the data volume (up to ~20 drivers on a popular compound), a dedicated full-data table
  fallback for this specific chart is intentionally not built (§18 states why); tooltips disclose
  exact values on hover, and any driver's full raw detail is one click away via `StintPacePage`.

### 8.7 `PitLaneTimeSummary`

Session-wide, all drivers — the one section requiring a new Phase 4 hook (§17), since it reads
`getPitStops(sessionId)` with no `driverId`, a call pattern neither existing hook (`useRaceContext`,
driver-scoped; `useTyrePerformance`, no pit-stop field) currently makes.

- A compact stat row: count, min, median, max pit-lane time — plain descriptive statistics
  (`statistics`-module equivalents, matching M8/M10's own "pstdev/quantiles, never a fitted
  parameter" convention), computed client-side over the fetched `PitStop[]` the same way
  `PaceDistributionChart` already treats a fetched raw array as the single source of truth.
- A plain table below it, one row per `PitStop` across the whole session, columns: Driver, Stop,
  Lap, Pit lane time — **sorted by lap number** (chronological, neutral), not by duration. Reuses
  `PitStopList`'s exact table styling and its exact caveat wording: *"Pit lane time"*, not
  *"stop duration"*, carrying forward the inherited "pit-lane entry-to-exit, not stationary box
  time" caveat as visible text under the table heading, verbatim from `PitStopList`'s existing
  code comment — not re-derived, not dropped (`docs/m11-design-review.md` §11's explicit success
  criterion).
- `pit_lane_time_seconds === null` renders `"—"`, matching `PitStopList`'s existing convention
  exactly.

---

## 9. Ordering Rule (applies to every list/table/axis in this feature)

### 9.1 Fixed compound taxonomy

A single new constant, `compoundOrder.ts` (`tyre-performance/`), shared by every component that
orders compounds (`CompoundUsageSummary`, `CompoundDistributionChart`,
`CompoundLapTrendChart`, `DriverCompoundComparisonChart`'s filter tabs):

```ts
const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
```

Same fixed vocabulary `compoundColor.ts` already hardcodes, for the same non-livery reason (this is
the FIA/Pirelli functional taxonomy, not team branding). Compounds present in the response but
absent from this list (a real, flagged risk per `docs/m11-design-review.md` §3.1 — older
seasons/edge cases) are appended afterward in alphabetical order, never dropped. One function,
`sortByCompoundOrder<T>(items, compoundOf)`, used everywhere a compound list needs ordering — one
implementation, not four independent sort call sites that could quietly drift apart.

### 9.2 Everything else

`driver_id` alphabetical (driver lists with no `driver_number`), `stint_number`/`lap_number`
ascending (chronological, per-driver views), matching identity fields already used as sort/group
keys elsewhere in the codebase (`StintTimeline` renders in `stint_number` order because that's the
array's own order; M11 makes the same choice explicit and tested, since these lists carry more
temptation toward a pace-based order than `StintTimeline`'s did).

---

## 10. Compound Visualization Decision

| Candidate | Decision | Why |
|---|---|---|
| Boxplot (per-compound pace) | **Used** (`CompoundDistributionChart`, §8.4) | Direct `PaceDistributionChart` precedent; ECharts' own quartile transform keeps one source of truth; a box is a legible, standard "here's the spread" shape with no implied ordering along an x-axis that isn't compound identity. |
| Scatter (per-compound, by tyre age) | **Used** (`CompoundLapTrendChart`, §8.5) | The only option that shows a two-dimensional relationship (lap time vs. lap-in-stint index) without any risk of being read as a fitted line, since points are never connected. |
| Small multiples (one chart per compound) | **Rejected** | With only 2–5 compounds this session-scoped app will ever see, small multiples add chrome (axes, grid lines, legends ×N) without adding legibility over a single shared-axis scatter/boxplot; also inconsistent with every other session-wide chart in this app, which use one shared axis, not per-category panels. |
| Strip plot | **Rejected in favor of the scatter above** | A strip plot (one axis, jittered points) is effectively what `CompoundLapTrendChart` already is once binned by lap-in-stint index — no separate chart type needed. |

`compoundColor()` (reused, unmodified) governs every compound's color across all four new charts
and both new pages — the same procedurally-neutral, FIA-standard palette already established, per
the task's explicit instruction not to invent a second compound-color system.

---

## 11. Stint Visualization Decision

Covered in depth in §7.1. Summary of the core judgment call: a raw line connecting one driver's own
sequential laps *within a single stint* is descriptive (§2.2); a line connecting anything computed
*across* stints, drivers, or aggregated bins is not, and is never drawn (§8.5, §21). The x-axis is
explicitly labeled and captioned so a reader never has to infer whether they're looking at "this
driver's laps in order" (safe to connect) or "an aggregate summary" (never connected).

---

## 12. Strategy Summary Design

Two distinct strategy-shape presentations exist in this feature, each reusing the closest existing
pattern rather than inventing one shared abstraction across them:

- **Per-driver, on `StintPacePage`**: `StintTimeline`, reused unmodified (§7).
- **Session-wide, on `TyrePerformancePage`**: `StrategySummaryPanel` rows, each containing a
  `CompoundSequenceStrip` (§8.2) — visually similar to `StintTimeline` but built for a different
  input shape, one row per driver.

No single component tries to serve both call sites; the M8/M10 precedent (`PaceDistributionChart`
vs. `DriverRankingChart` — two different charts over overlapping `DriverSummary[]` data, not one
configurable mega-component) is the model followed here.

---

## 13. Boundary-Lap Treatment

Every raw per-lap surface in this feature shows in-laps, out-laps, and other-excluded laps
**distinctly, never hidden**:

| Surface | Treatment |
|---|---|
| `DriverStintPaceChart` (§7.1) | Distinct marker **shape** per category (circle / triangle-down / triangle-up / diamond), color still carries compound. Excluded from the connected line, never from the scatter. |
| `StintPaceLapTable` (§7.3) | Inline parenthetical flag text, exact `DriverLapTable` convention. |
| `StintConsistencyTable` (§7.2) | A stint below the eligibility threshold shows its real `eligible_lap_count` (including 0) and `"(insufficient laps)"` next to a `null` consistency figure — not hidden, not a separate row state. |

This directly satisfies `docs/m11-design-review.md` §11's success criterion: trend-ineligible laps
are shown as unconnected points, not silently dropped from the underlying view, "matching M8's
`is_valid`-vs-aggregate-eligible pattern."

---

## 14. Consistency Metric Presentation

`consistency_ms` and `consistency_cv` are presented as **plain labeled numbers in a table**
(`StintConsistencyTable`, §7.2) — never as a badge, score, or color-coded cell implying "good" or
"bad." Column headers read "Consistency (ms)" / "Consistency (CV)", with a short caption on the
page (not per-row, to avoid repetition) stating what they mean in plain language, adapted directly
from the existing domain-logic docstring: *"the spread of a driver's lap times within one stint,
after excluding in-laps, out-laps, and invalid laps — not a performance score, and not defined for
a stint with fewer than two remaining laps."* `null` renders as `"—"`, matching every other
optional-metric convention already in this codebase (`DriverSummaryTable`,
`PitStopList`). No color scale, no red/green, no ranking column — this table is never sortable by
consistency (§9), unlike `DriverSummaryTable`'s sortable columns, specifically because sortability
would invite reading it as a leaderboard.

---

## 15. Loading / Error / Empty States

All states reuse the three existing primitives (`LoadingState`, `ErrorState`, `EmptyState`) with no
new state component:

| State | Treatment |
|---|---|
| API loading (page-level) | `<LoadingState>Loading tyre performance...</LoadingState>` / `...stint pace...`, matching `StrategyPage`'s exact wording pattern, shown while the relevant hook's `loading`/`null`-data state holds. |
| API error (page-level) | `<ErrorState>{error}</ErrorState>`, combining hook errors the same way `SessionAnalyticsPage` combines `sessionError ?? analyticsError` (here: session identity error ?? tyre-performance error, or ?? pit-stops error on `TyrePerformancePage`). |
| Session with no strategy data | `driver_strategies`/`compound_usage` empty arrays render each affected section's own `EmptyState` inline (e.g., `CompoundUsageSummary` shows `<EmptyState>No compound data available for this session.</EmptyState>`) — the rest of the page still renders, matching `StintTimeline`'s existing "empty is a per-component concern, not a whole-page blocker" precedent. |
| Driver with no stint data | `StintPacePage`: `stintPace.stints.length === 0` → `StintTimeline`'s own existing `EmptyState` fires automatically (already built); `DriverStintPaceChart` and the two tables each render their own `EmptyState` variant for the same condition. |
| Stint with no eligible laps | Not an empty state — a **populated** row/points showing zero eligible laps, `"—"` consistency, `"(insufficient laps)"` tag (§7.2, §13). |
| Compound with insufficient observations | Omitted from `CompoundDistributionChart` only (reusing `MIN_LAPS_FOR_DISTRIBUTION`, §8.4); still listed in `CompoundUsageSummary` and included in `CompoundLapTrendChart`'s raw scatter (a single point is still a real, displayable observation for a scatter, unlike a box). |
| Null consistency | `"—"`, §14. |
| Null pit-lane duration | `"—"`, §8.7, matching `PitStopList` exactly. |

---

## 16. Responsive Behavior

No new responsive framework or breakpoint scheme — reuses the documented tokens exactly
(`sm 640 / md 1024 / lg 1440` from `tokens.css`) and the one concrete pattern already in production,
`SessionAnalyticsPage.module.css`'s `.chartRow`:

```css
.chartRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--pw-space-4);
}
@media (max-width: 1024px) {
  .chartRow { grid-template-columns: 1fr; }
}
```

`TyrePerformancePage`'s "Lap Time by Compound" / "Lap Time by Tyre Age" chart row reuses this
literal rule. All tables (`CompoundUsageSummary`, `StintConsistencyTable`, `StintPaceLapTable`,
`PitLaneTimeSummary`'s table) wrap in the existing `.tableWrapper { overflow-x: auto; }` pattern
already used by `PitStopList`/`SectorBreakdownTable`/`DriverSummaryTable`/`DriverLapTable` — no new
overflow strategy. Charts keep their fixed pixel heights (260–320px, matching existing constants
`CHART_HEIGHT` per component) and resize their width automatically via `useEChartsInstance`'s
existing window-resize handler — no new responsive chart logic is needed. No dedicated mobile
layout, consistent with `docs/prd.md` §5's standing, unrevisited "mobile app / responsive mobile
layout: Not currently planned" and every prior milestone's identical posture.

---

## 17. Accessibility

- **Semantic headings**: `<h2>`/`<h3>` hierarchy matching `StrategyPage`/`SessionAnalyticsPage`'s
  existing pattern (`Card`'s `title` prop already renders an `<h3>`).
- **Chart accessible summaries**: every ECharts container keeps the existing
  `role="img" aria-label="..."` convention (`PaceDistributionChart`: `"Pace distribution chart"`,
  etc.), extended with a visible caption sentence above/below each new chart (not just the
  `aria-label`) stating what it shows and what the marker/color encodings mean — see §7.1's example
  caption. This is a slightly stronger bar than the existing charts set (which rely on
  `aria-label` alone), justified specifically because M11's marker-shape encoding (§7.1, §13) is
  more information-dense than any existing chart's and needs a plain-language key somewhere a
  screen reader user or someone unfamiliar with the shapes can find it.
- **Table fallback**: every chart has a same-page table covering its underlying data — verified
  explicitly for `DriverStintPaceChart` → `StintPaceLapTable` (every plotted point has a row),
  `CompoundDistributionChart`/`CompoundLapTrendChart` → `CompoundUsageSummary` (aggregate-level
  fallback). `DriverCompoundComparisonChart` is the one deliberate, documented exception (§8.6) —
  a full per-observation table for up to 20 drivers × dozens of laps was judged as adding density
  without adding accessibility (the same data is one click away per-driver via `StintPacePage`'s
  own full table), stated here rather than silently skipped.
- **Keyboard navigation / focus**: no new interactive control beyond `DriverCompoundComparisonChart`'s
  compound filter tabs and `StrategySummaryPanel`'s row links — both plain `<button>`/`<Link>`
  elements, keyboard-operable by default with no custom key handling, matching
  `DriverSummaryTable`'s existing sort-button pattern.
- **Color independence**: compound identity is always paired with visible text (compound name in
  tooltips, legends, table cells, and `CompoundSequenceStrip`/`StintTimeline`'s own on-segment
  label) — color is never the sole channel, extending the rule `compoundColor.ts`'s existing
  fallback behavior already implies. In-lap/out-lap/excluded status uses marker **shape**, not
  color, for the same reason (§7.1).
- **Tooltip accessibility**: ECharts tooltips remain mouse/hover-triggered, matching every existing
  chart in this app (no new keyboard-tooltip mechanism is introduced — this is a pre-existing,
  unaddressed gap across the whole codebase, not something M11 is scoped to fix; the table
  fallbacks are the accessible path to the same data, not the tooltip).
- No automated accessibility linter (e.g. `axe`) exists in this codebase's test stack today
  (`setupTests.ts` only wires up `@testing-library/jest-dom`) — Phase 4 does not add one
  speculatively; accessibility tests (§19) are written by hand against the same RTL queries every
  existing component test already uses (`getByRole`, `getByLabelText`, `getByText`).

---

## 18. Component Tree

```
frontend/src/features/tyre-performance/
├── TyrePerformancePage.tsx / .module.css / .test.tsx
├── StintPacePage.tsx / .module.css / .test.tsx
├── compoundOrder.ts / .test.ts                        (new: shared neutral compound ordering)
├── driverColor.ts / .test.ts                           (new: per-driver deterministic color, teamColor.ts's sibling keyed on driver_id)
├── hooks/
│   ├── useDriverStintPace.ts                           (existing, Phase 3 — unmodified)
│   ├── useTyrePerformance.ts                           (existing, Phase 3 — unmodified)
│   └── useSessionPitStops.ts / .test.ts                (new — wraps existing getPitStops(sessionId))
└── components/
    ├── StrategySummaryPanel.tsx / .module.css / .test.tsx
    ├── CompoundSequenceStrip.tsx / .module.css / .test.tsx
    ├── CompoundUsageSummary.tsx / .module.css / .test.tsx
    ├── CompoundDistributionChart.tsx / .module.css / .test.tsx
    ├── compoundDistributionChartOptions.ts / .test.ts
    ├── CompoundLapTrendChart.tsx / .module.css / .test.tsx
    ├── compoundLapTrendChartOptions.ts / .test.ts
    ├── DriverCompoundComparisonChart.tsx / .module.css / .test.tsx
    ├── driverCompoundComparisonChartOptions.ts / .test.ts
    ├── PitLaneTimeSummary.tsx / .module.css / .test.tsx
    ├── DriverStintPaceChart.tsx / .module.css / .test.tsx
    ├── driverStintPaceChartOptions.ts / .test.ts
    ├── StintConsistencyTable.tsx / .module.css / .test.tsx
    └── StintPaceLapTable.tsx / .module.css / .test.tsx
```

**Reused, not duplicated:** `StintTimeline`, `compoundColor.ts` (both `race-context/`),
`Card`, `EmptyState`, `ErrorState`, `LoadingState`, `StatusChip`, `useEChartsInstance`
(all `components/`). **13 new components + 2 pages + 2 utilities + 1 hook** — every one has the
single, distinct responsibility named in §7–§8; none is a generic/config-driven mega-component
covering multiple call sites (§12).

---

## 19. Data Flow Diagram

```
Backend (Phase 2, unmodified)
  GET /sessions/{id}/drivers/{driverId}/stint-pace  ─┐
  GET /sessions/{id}/tyre-performance                ─┼─▶ frontend/src/api/client.ts (unmodified)
  GET /sessions/{id}/pit-stops?driver_id=            ─┘      getDriverStintPace / getTyrePerformance / getPitStops

Phase 3 hooks (unmodified)          Phase 4 new hook
  useDriverStintPace(sessionId, driverId)      useSessionPitStops(sessionId)
  useTyrePerformance(sessionId)                  (wraps getPitStops(sessionId), no driverId)
        │                                              │
        ▼                                              ▼
  StintPacePage                              TyrePerformancePage
        │                                              │
   ┌────┴─────────────┐                    ┌───────────┼───────────────────────┐
   ▼                  ▼                    ▼           ▼                       ▼
StintTimeline   DriverStintPaceChart  StrategySummaryPanel  CompoundDistributionChart  PitLaneTimeSummary
(reused)        StintConsistencyTable CompoundUsageSummary  CompoundLapTrendChart
                StintPaceLapTable                           DriverCompoundComparisonChart

All chart-option builders are pure functions (buildXChartOption(data) -> EChartsCoreOption),
called fresh inside useEChartsInstance's second effect — no chart component computes statistics
itself; every number rendered was already computed by Phase 1/2's backend domain logic
(app/services/tyre_performance/) or by ECharts' own boxplot transform over a raw array (§8.4).
```

No Zustand store change — `selectionStore` stays scoped to session/driver/lap identity (ADR-0007);
`DriverCompoundComparisonChart`'s compound-filter selection is local component state, the same
scoping decision `SessionAnalyticsPage`'s `selectedDriver` already made for drill-down selection.

---

## 20. Testing Strategy

Every new file gets a test, following the exact patterns already established:

**Component rendering** (`StintTimeline.test.tsx`/`PitStopList` pattern — fixture in, key
text/attributes out):
- Each table component: renders expected rows/columns from fixture data; empty-array → `EmptyState`
  with the exact expected message.
- `StintConsistencyTable`/`DriverSummaryTable`-style: null-metric cells render `"—"`; a stint with
  `eligible_lap_count < 2` renders the `"(insufficient laps)"` tag.
- `StintPaceLapTable`/`DriverLapTable`-style: an in-lap/out-lap/invalid row renders its inline flag
  text.
- `CompoundSequenceStrip`: proportional widths match `stint_lengths`, colors match `compoundColor`
  output — same assertion style as `StintTimeline.test.tsx`'s existing `flexGrow`/`backgroundColor`
  checks.

**Chart option builders** (`paceDistributionChartOptions.test.ts`/`lapTimeTrendChartOptions.test.ts`
pattern — pure function, assert the returned option object's shape, never pixel/canvas output):
- `driverStintPaceChartOptions.test.ts`: correct number of series (scatter + line per stint);
  a stint with 1 trend-eligible lap produces a line series with ≤1 data point; marker `symbol`
  differs by lap category; stint-boundary `markLine` present at the right `xAxis` value.
- `compoundDistributionChartOptions.test.ts`: boxplot dataset source is built from `lap_times_ms`
  only (assert the built option's `dataset[0].source` equals the raw arrays, never
  `median_lap_time_ms`); compounds below the 2-lap threshold are excluded; x-axis category order
  matches the fixed taxonomy regardless of input array order (fixture: feed compounds in reverse
  taxonomy order **and** with the "wrong" compound having the fastest median, assert output order
  is still taxonomy order — a direct regression test for §9.1/§21).
- `compoundLapTrendChartOptions.test.ts`: **every series in the returned option has
  `type: "scatter"`, never `"line"`** — an explicit assertion-of-absence test, same technique
  Phase 1's backend tests already use for "no fitted parameter field" (`m11-implementation-plan.md`
  Phase 1).
- `driverCompoundComparisonChartOptions.test.ts`: series/legend order is `driver_id` alphabetical
  regardless of input order or which driver has the fastest raw laps in the fixture (same
  technique as above); no field or label in the built option matches `/fastest|best|rank/i` — a
  regex assertion over the full serialized option object, guarding §8.6/§21 at the data-shape
  level, not just the rendered DOM.

**Guardrail / rendered-DOM tests** (new to this milestone, but same spirit as Phase 1's
"assert absence" tests, applied at the UI layer per the task's explicit requirement in §9):
- `DriverCompoundComparisonChart.test.tsx` / `TyrePerformancePage.test.tsx`: rendered
  `container.textContent` never matches `/fastest|best on|faster than|ranking|degradation rate|fitted|regression/i`
  — one test, run against fixture data engineered so a naive implementation *would* be tempted to
  show a ranking (e.g., one driver's raw laps are all faster than another's on the same compound),
  proving the guardrail actually exercises the risk rather than trivially passing on bland fixture
  data.
- `CompoundUsageSummary.test.tsx` / `StrategySummaryPanel.test.tsx`: feed shuffled input order,
  assert rendered row order is stable and matches the neutral key, not input order and not any
  numeric column.

**Boundary-lap rendering**: fixture with one in-lap, one out-lap, one invalid (non-boundary) lap,
and one normal lap in the same stint — assert `DriverStintPaceChart`'s built option encodes four
distinct marker symbols, and `StintPaceLapTable` renders all four rows with the correct inline flag
text, none silently dropped.

**Compound colors**: assert every new chart/table imports and uses `compoundColor` from
`race-context/compoundColor` (not a re-implementation) — a simple import-and-compare test, same
technique `trackMapSegmentColors.test.ts` already uses to pin literal color values.

**Strategy sequence**: `CompoundSequenceStrip`/`StintTimeline`-reuse tests confirm stint order is
preserved from the API response (array order = chronological, per §9.2) with no client-side re-sort.

**Consistency display**: null → `"—"`; a real value renders with the same precision as
`DriverSummaryTable`'s existing `formatMsPrecise` (one decimal place).

**Accessibility checks** (bounded by what the existing stack supports, §17): every chart's
`getByRole("img", { name: /.../ })` query succeeds; every chart's caption text is present via
`getByText`; every table has the expected `<th>` headers via `getByRole("columnheader")`.

**Empty/loading/error states**: one test per table/page for each row in §15's table, reusing the
exact assertion style `StrategyPage`/`SessionAnalyticsPage`'s own tests already use for
`LoadingState`/`ErrorState`/`EmptyState`.

---

## 21. Forbidden-Semantics Guardrails

Restates `docs/m11-design-review.md` §4.2/§4.3/§8 in frontend-specific, testable terms — this
section is the checklist a reviewer (human or the tests in §20) checks a Phase 4 PR against.

| Forbidden | Where the risk concentrates in this design | Guardrail |
|---|---|---|
| Fitted/regression/degradation-rate line | `CompoundLapTrendChart` (§8.5) — connecting per-bin medians in x-order would visually reproduce this even without literal curve-fitting | Scatter-only, enforced by `compoundLapTrendChartOptions.test.ts` asserting no `type: "line"` series exists |
| "Best compound" / "fastest compound" | `CompoundDistributionChart`/`CompoundUsageSummary` axis or row order | Fixed taxonomy order only (§9.1), never sorted by `median_lap_time_ms` or any statistic — regression-tested with adversarial fixture data |
| Driver ranking / "faster than" / pace score | `DriverCompoundComparisonChart` (§8.6) — the API's own item #18/§4.3 payload exists specifically to NOT support this reading | Alphabetical driver order; color = identity only; no badge/label field exists to render because none exists in `RawLapTimeByCompound`'s own shape; text-content regex guardrail test |
| Normalized / fuel-corrected / traffic-adjusted / SC-adjusted pace | Not applicable — no such field exists anywhere in `TyrePerformanceResponse`/`DriverStintPaceResponse` | Nothing to render; if a future PR adds such a field to the API, that is itself the signal to stop and revisit this design note, per `docs/m11-implementation-plan.md`'s own "stop and flag it" clause |
| Undercut/overcut verdict | Not applicable — no gap/position data reaches the frontend at all | Same as above |
| Predictive tyre life | Not applicable — `eligible_lap_count`/consistency figures are retrospective only, never framed as "laps remaining" | `StintConsistencyTable`'s copy (§14) states what the numbers mean, explicitly past-tense/descriptive |
| Color-coding by relative speed | Any chart with per-driver or per-compound series | Compound color = `compoundColor()` (fixed FIA palette); driver color = `driverColor()` (identity hash) — neither is ever a function of a lap-time value |
| Sortable-by-performance table columns in this feature | `StintConsistencyTable`, `CompoundUsageSummary`, `PitLaneTimeSummary`'s table | None of these tables get `DriverSummaryTable`'s sortable-column treatment — a deliberate omission, not an oversight, stated here so a future PR adding "just a sort button" has a documented rebuttal to check against, the same pattern `docs/m11-design-review.md` §12's risk table already uses for the backend layer |

---

## 22. Exact Implementation File Plan

**New files** — full list in §18 (component tree).

**Existing files touched, each by a small, additive change only:**

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Two new `<Route>` entries (`tyre-performance`, `stint-pace`) + two new imports. No existing route's element or path changes. |
| `frontend/src/components/Sidebar.tsx` | One new `NavLink` ("Tyre Performance"), session-scoped, alongside the existing "Session Analytics" link. |
| `frontend/src/features/session-select/DriverSelectPage.tsx` | One new `<Link>` ("View tyre performance"), alongside the existing "View session analytics" link. |
| `frontend/src/features/session-select/LapSelectPage.tsx` | One new `<Link>` ("View Stint Pace"), alongside the existing "View Strategy" link. |
| `frontend/src/features/race-context/StrategyPage.tsx` | One new cross-link ("View Stint Pace") to the new driver-scoped route. |

No file outside `frontend/src/features/tyre-performance/` and this table is touched. No file in
`backend/`, `pipeline/`, or `frontend/src/api/client.ts` is touched — the API contract and data
layer are exactly what Phase 2/3 already shipped.

---

## 23. Risks

| Risk | Mitigation |
|---|---|
| A future edit "simplifies" `CompoundLapTrendChart` by connecting the median points for readability, quietly reintroducing a degradation-curve shape. | §8.5's explicit no-line rule + the dedicated `compoundLapTrendChartOptions.test.ts` assertion (§20) give this exact temptation a documented rebuttal and a failing test, mirroring `docs/m11-design-review.md` §12's identical risk framing at the backend layer. |
| `DriverCompoundComparisonChart`'s per-driver color or ordering drifts toward a de facto ranking (e.g., a future PR sorts by median pace "just for a cleaner chart"). | §9/§21's explicit rule + adversarial-fixture regression tests (§20) catch a reorder even if it's not literally labeled "ranking." |
| `CompoundAggregate`'s dual raw-array/precomputed-summary shape causes an implementer to wire the boxplot to the precomputed fields instead of `lap_times_ms`, silently reopening the "two disagreeing quartile paths" problem the M8 B5 decision already closed once. | §8.4 states the rule explicitly and names the exact two fields not to use for the chart; a test asserts the dataset source is the raw array. |
| `PitLaneTimeSummary` requires a genuinely new hook (`useSessionPitStops`) that Phase 3 didn't build, since it wasn't obviously implied by either existing hook's name. | Flagged explicitly here (§3, §17, §18) rather than discovered mid-Phase-4; the hook is a thin, low-risk wrapper around an already-existing, already-tested client function (`getPitStops`), not new API surface. |
| Real data (Bahrain 2024) only has 2 compounds and no 1-stop driver (`docs/m11-design-review.md` §12) — a Phase 4 component built and only visually checked against this one dataset could break on 3+ compounds or a 1-stint driver. | Component/option-builder tests (§20) use synthetic fixtures with 3+ compounds and single-stint drivers, not just data shaped like the real Bahrain session — same discipline the backend Phase 1 plan already committed to. |
| `HUL`'s real 1-lap stint (0 trend-eligible laps after exclusion) renders as an awkward single dot or empty gap if not explicitly tested. | §7.1's "0/1-point line series renders as nothing, no special-case code" design + an explicit boundary-lap test (§20) reproducing this exact real case. |
| Two new driver-scoped entry points (`LapSelectPage`, `StrategyPage`) plus one session-scoped one (`DriverSelectPage`) plus the sidebar is four small touch-points across existing files — a missed one leaves a route reachable only by typed URL. | §22's table is the exact, complete checklist; nothing beyond it needs touching. |

---

## 24. Open Decisions

1. **Whether `DriverCompoundComparisonChart` eventually needs a driver multi-select filter** (in
   addition to the compound filter) once real multi-race data makes a single compound's driver
   count large enough to be visually dense even with distinct colors. Not required for Phase 4
   against the known Bahrain 2024 dataset (§10 of `docs/m11-design-review.md`'s own real-data
   section); flagged here as a candidate follow-up rather than speculatively built now, per
   CLAUDE.md's scope discipline.
2. **Whether `CompoundLapTrendChart`'s raw-scatter-plus-median-overlay is the right density**, or
   whether the median-only variant (still unconnected, just less visually busy) reads better in
   practice once built. Both satisfy every guardrail in §21 equally; this is a legibility judgment
   best made against the real rendered chart, not resolved in the abstract here.
3. **Whether `StintConsistencyTable` and `PitLaneTimeSummary`'s table should be merged into one
   "session engineering detail" card or kept as two separate `Card`s** on their respective pages —
   a layout-density preference, not an architectural question; either satisfies every other section
   of this document unchanged.

None of these block starting Phase 4 implementation; each has a safe default already specified
above.

---

## 25. Phase 4 Success Criteria

- A user reaches `TyrePerformancePage` from `DriverSelectPage`'s new link, the sidebar's new link,
  or by typed URL, and reaches `StintPacePage` from `LapSelectPage`, `StrategyPage`'s new
  cross-link, or a `StrategySummaryPanel` row — every path in §4 is real and clickable.
- Every A/B-classified metric named in `docs/m11-design-review.md` §5.1 is visible somewhere in the
  UI, traceable to a specific component in §18's tree — no metric silently unimplemented.
- No component, chart, label, tooltip, sort order, or color scheme in this feature implies a
  fitted trend, a degradation rate, a ranking, or a performance verdict — verified by §20's
  guardrail tests, not just visual inspection.
- `HUL`'s real 1-lap-stint case (and its synthetic 3-compound/1-stop-driver analogs, §23) render
  without a broken chart, a crash, or a silently-dropped data point.
- Pit-lane time's "not box time" caveat is visible on `PitLaneTimeSummary`, carried forward
  verbatim from `PitStopList`, not re-derived or dropped.
- Every new component has a passing test file; `compoundLapTrendChartOptions.test.ts` and
  `driverCompoundComparisonChartOptions.test.ts`'s absence/adversarial-fixture assertions pass.
- Types check, lint is clean (ESLint + Prettier, per CLAUDE.md), no new dependency was added, no
  existing route/component/hook/API contract changed shape.
- `docs/architecture.md`'s frontend feature-directory listing and `README.md`'s milestone status
  (already flagged as stale by `docs/m11-implementation-plan.md` Phase 6) are updated to include
  `tyre-performance/` and M11's frontend completion — a Phase 6 documentation task, not this
  document's job to perform, but named here so Phase 4's own Definition of Done doesn't quietly
  drop it.

---

## Document History

- v1 (this document): Phase 4 frontend design note, written against Phase 1–3 as shipped and
  approved. Supersedes nothing — `docs/m11-design-review.md` and
  `docs/m11-implementation-plan.md` remain the authoritative record of the backend/data-layer
  design; this document is their frontend continuation, per both documents' own stated sequencing.
