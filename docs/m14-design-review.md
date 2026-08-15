# PitWall — M14 Design Review: Synchronized Telemetry Cursor (V2) + M13 Comparison Discoverability

**Status:** Design only — no implementation, no schema change, no migration, no ingestion change.
**Baseline:** M13 complete (`790eab4`) — cross-session lap/telemetry comparison, `DIFFERENT_CIRCUIT`
warning, `SessionPicker`. Nothing implemented since.
**Author's framing:** senior engineering design review, matching the M6/M8/M10/M11/M12/M13
precedent — every claim below is checked directly against the current, real source.

---

## 1. Context

Every chart in this app is currently static. `docs/success-metrics.md`'s V2 definition — hovering
any chart moves a synchronized cursor across every other chart for the same lap(s), the track map's
marker follows it, the delta graph updates live — has been the explicit, named "next" item since M1,
untouched through M2–M13. Two real, code-verified facts make this design non-trivial rather than a
simple wiring exercise:

1. **A cursor slot already exists and was deliberately left unwired.**
   `frontend/src/features/lap-comparison/comparisonStore.ts` already declares `hoverDistance: number
   | null` and `setHoverDistance()`, with its own docstring stating: *"hoverDistance is only a state
   slot in Phase 6 -- nothing writes to it yet. Phase 7 wires real chart hover events into
   setHoverDistance and handles ECharts cross-instance synchronization; neither happens here."* That
   Phase 7 never ran. This design finishes it, rather than inventing a new mechanism from scratch.
2. **The track map is SVG, not ECharts, in both contexts that need a cursor** — confirmed directly
   (`TrackMap.tsx`: plain D3+SVG, `TrackMapDelta.tsx`: reuses the same SVG component). ECharts'
   native `connect()`/`axisPointer.link` mechanism has no way to reach an SVG component. This one
   fact resolves most of the design's harder questions (§4, §12).

## 2. Goals

- Hovering any of `TelemetryCharts`, `DeltaChart`, or `ChannelOverlayPanel` moves a shared cursor
  (a distance-on-track position) that every other currently-mounted synchronized chart reflects.
- `TrackMap`/`TrackMapDelta` show a position marker following that same cursor, where a position
  exists to show.
- Works correctly for M13 cross-session comparison, including different distance grids and
  different-circuit sessions (§9 preserves M13's existing `DIFFERENT_CIRCUIT` behavior unchanged).
- A small, discoverable "Compare against another session" entry point is added alongside this work
  (§7), reusing `SessionPicker` unchanged.

## 3. Non-goals

Corner highlighting (`markArea`), click-drag zoom, any new visualization type, any redesign of
existing charts' static rendering, any backend/API/schema/repository change, any change to
`app/services/lap_comparison/`, any change to `selectionStore`, any change to the M13 comparison API
contract, any change to `SessionPicker`'s own architecture, session-analytics/tyre-performance chart
sync (out of scope — those charts are not in the enumerated set this design covers), mobile
touch-drag cursor support (see §10 for what "non-hover" means here).

---

## 4. Current Architecture (verified directly)

- **`useEChartsInstance`** (`components/useEChartsInstance.ts`) is the one shared hook behind
  `DeltaChart`, `TelemetryCharts`, and three session-analytics/tyre-performance charts out of scope
  here. It owns the `echarts.ECharts` instance entirely internally (`chartRef`), exposing only a
  `containerRef` — **callers cannot currently attach event listeners or call `dispatchAction`**.
  This must change (§8).
- **`TelemetryCharts`** builds *one* ECharts instance with **one grid per channel**, each with its
  own `xAxis` (`type: "value"`, i.e. `distance_m`) — multiple axes *within one instance* already.
  Its own code comment: *"Deliberately does not call echarts.connect()/axisPointer.link -- V1 is
  static... that's explicitly V2 scope."*
- **`DeltaChart`** is a *separate* ECharts instance (`xAxis.type: "value"`, also distance_m). Its own
  comment references the exact same deferred `useCursorSync` hook this design now builds.
  `ChannelOverlayPanel` renders `TelemetryCharts` with `secondarySamples`/`channels` — it does not
  own a second instance.
- **`TrackMap`** (plain D3+SVG) draws `lapPoints`/`secondaryLapPoints` (real per-sample x/y/distance,
  for the single-lap page) or, via `TrackMapDelta`, only `trackPoints` (the track outline, since the
  M13 compare response carries no per-lap x/y — confirmed: `lapPoints={[]}` always, for that case).
  **No hover/cursor prop exists yet on either.**
- **Where the two page contexts actually live**, confirmed by reading both pages directly:
  - `TrackMapPage.tsx` (single lap): mounts `TrackMap` + `TelemetryCharts` together, fed by the same
    `lapPoints` fetch. Its own docstring: *"Static only; hover-driven sync is V2."*
  - `ComparisonPage.tsx` (M13, two laps, possibly two sessions): mounts `TrackMapDelta` + `DeltaChart`
    + `ChannelOverlayPanel` together, all driven by one `LapComparisonResponse`, which already
    carries **one shared, pre-aligned `distance_m` grid** for both compared laps (`aligned_a`/
    `aligned_b` were already interpolated onto it server-side, per M6 §8.2 — this matters directly
    for §9).
- These two contexts are **never mounted simultaneously** (different routes) — confirmed via
  `App.tsx`'s route list.

## 5. Proposed Architecture

Two small, feature-scoped Zustand stores — not one global cursor store — exactly matching the
precedent `comparisonStore.ts` already set (feature-scoped, not `frontend/src/state/`, because
nothing outside each feature reads it):

1. **`comparisonStore.hoverDistance`** (already exists) — wired up, not replaced. Used by
   `ComparisonPage`'s three charts.
2. **A new, sibling `frontend/src/features/track-map/cursorStore.ts`** — identical shape, for
   `TrackMapPage`'s two charts.

**Why two stores, not one shared/global one:** the two contexts have genuinely different cursor
semantics (single lap's own telemetry samples vs. two laps pre-aligned to one shared grid) and are
never mounted together — a single global store would need scope-guarding logic (which page "owns"
it right now) for zero real benefit. This directly satisfies the instruction to avoid coupling
cursor state to `selectionStore` and to avoid unnecessary global state: each store is exactly as
global as its one consuming page, matching `comparisonStore`'s own existing precedent.

**A new shared hook, `useCursorSync`** (the name both `DeltaChart.tsx` and `TrackMapDelta.tsx`'s
existing comments already predicted), built on an extended `useEChartsInstance`, used identically by
both contexts against their respective store. One hook, two store instances — no duplicated sync
logic (§8 gives the exact contract).

---

## 6. Cursor State Model

Both stores share the same shape (two instances of the same pattern, not two different shapes):

```ts
interface CursorState {
  /** Canonical position on the shared distance_m axis. null = no active hover anywhere. */
  distanceM: number | null;
  /** Which chart last set it (own-instance dispatchAction skip, §8) -- not shown to the user. */
  source: "telemetry-charts" | "delta-chart" | "track-map" | null;
  setCursor: (distanceM: number, source: CursorSource) => void;
  clearCursor: () => void;
}
```

- **Position representation: `distanceM` only** — not time, not a sample index. `distance_m` is
  already the one axis every relevant chart already shares (`TelemetryCharts`/`DeltaChart`'s own
  `xAxis`, and every `TelemetrySample`/`TrackPoint`'s own field) — introducing a second axis
  (time or index) would require a conversion layer for no consumer that needs it. `lap_comparison`'s
  own alignment (M6 §8.2) already made distance the canonical shared axis for exactly this reason.
- **`source`** exists purely to let a chart's own sync effect skip re-`dispatchAction`-ing itself
  (§8) — it is never rendered.
- **No `visible` boolean is needed**: `distanceM === null` *is* "not visible." A separate flag would
  be a second source of truth for the same fact.
- **No session/comparison identity field in the store itself** — reset semantics (§6.1) are handled
  by each page's own mount-time effect, not by the store tracking scope internally. Matches
  `ComparisonPage`'s and `TrackMapPage`'s existing pattern of owning their own reset logic (e.g.
  `ComparisonPage` already resets `selectionB` on a session change) rather than pushing scope-
  tracking into a store that has no way to know what "the current session" even means.

### 6.1 Reset semantics

- **`TrackMapPage`**: `cursorStore.clearCursor()` on mount and whenever `sessionId`/`driverId`/
  `lapNumber` changes (the same dependency array `TrackMapPage`'s own data-fetch effect already
  uses) — a stale marker from the previous lap must never appear on the next one.
- **`ComparisonPage`**: `comparisonStore.clearCursor()` (renaming/repurposing today's unused
  `setHoverDistance(null)` call site) whenever the *resolved* `comparison` object's identity changes
  — i.e. on every new successful `useLapComparison` fetch, not on every keystroke of picking a new
  driver/lap. This covers session A/B changes, driver/lap changes, and the swap button uniformly,
  since all of them produce a new `comparison` object through the same hook.
- Leaving a chart (mouse leaves the container) does **not** clear the cursor — see §10 (matches
  standard synchronized-cursor UX; briefly moving off one chart onto another shouldn't flicker the
  marker on/off).

---

## 7. Event/Data Flow

```
pointer moves over Chart X
  -> Chart X's ECharts "updateAxisPointer" event (or TrackMap's own onMouseMove, mapped to nearest
     trackPoint/lapPoint's distance_m)
  -> useCursorSync's handler calls store.setCursor(distanceM, "chart-x")
  -> store update
  -> every OTHER mounted chart's useCursorSync effect (subscribed to store.distanceM) fires:
       - ECharts charts: dispatchAction({type: "showTip"/"updateAxisPointer", ...}) at that distance
       - TrackMap/TrackMapDelta: compute the (x, y) at that distance (§9), render a marker circle
  -> Chart X's own effect also fires but is a no-op (source === "chart-x", skip self-dispatch)
```

No component ever reads another component's DOM or ECharts instance directly — everything flows
through the one store per page, per §5's resolution of the "competing sources of truth" risk (§12).

---

## 8. ECharts Integration

**Decision: B — ECharts' native `group`/`axisPointer.link`/`connect()` is used only as each
instance's own internal multi-grid sync convenience; it is *not* the cross-component
synchronization mechanism. The Zustand cursor store is the sole source of truth.**

Why, concretely, not A or C:

- **Not A (native axisPointer as source of truth):** `TrackMap`/`TrackMapDelta` are plain SVG —
  `echarts.connect()` cannot reach them under any configuration. Since a store-driven mechanism is
  *mandatory* for the SVG map regardless, using `echarts.connect()` *as well* for the ECharts-to-
  ECharts pairs would create exactly the two-source-of-truth risk §12 asks about, for a case
  (`TelemetryCharts` ↔ `DeltaChart`, both mounted only on `ComparisonPage`) that the store already
  handles correctly by itself. One mechanism, used uniformly, is strictly simpler and cannot drift.
- **Not C (don't use ECharts sync features at all):** `TelemetryCharts`' own multiple grids (one
  per channel, each with its own `xAxis`) still benefit from `axisPointer: { link: [{ xAxisIndex:
  "all" }] }` — a single, static option-level config, not a runtime sync mechanism — so that hovering
  one channel's grid shows the crosshair on every other channel's grid *within that one instance*
  for free. This is orthogonal to cross-component sync and costs nothing to keep.

**`useEChartsInstance` must be extended** (backward-compatible, additive) to support this:

```ts
export function useEChartsInstance<T extends EChartsCoreOption>(
  buildOption: () => T,
  deps: DependencyList,
  onEvents?: Record<string, (params: unknown) => void>,
): RefObject<HTMLDivElement> & { dispatch: (action: Payload) => void }
```

`onEvents` (new, optional — every existing call site keeps working unchanged) registers/re-registers
handlers (e.g. `updateAxisPointer`) inside the hook's existing lifecycle effect. A returned `dispatch`
function (closing over the internal `chartRef`, never exposing the raw instance) lets `useCursorSync`
programmatically move a chart's own axisPointer/tooltip when the store changes for a different
reason. This is the one, small, justified change to shared chart infrastructure this design requires
— every other chart component's own `buildOption` function is untouched.

`useCursorSync(distanceM, dispatch, source, storeApi)` (new hook, `components/` — shared, not
duplicated per chart) encapsulates the effect described in §7, parameterized by which store instance
to use (the `comparisonStore` or the new `track-map/cursorStore`) so `TelemetryCharts` itself doesn't
need to know which page it's rendered on.

---

## 9. M13 Integration — the critical section

**The cursor must never assume A and B share sample indices — and, per the current backend, it
never has to.** `LapComparisonResponse.distance_m` is already the *one shared grid* both `channels.a`
and `channels.b` (and `delta_ms`) are pre-aligned onto (`align_lap()`/`build_distance_grid()`,
unchanged by this design — confirmed no `app/services/lap_comparison/` file is touched). A cursor
`distanceM` value therefore already indexes both sides' data identically — there is no "A's grid" vs
"B's grid" to reconcile; **M13 already solved this problem for the comparison view**, this design
just reads the same array the delta/channel charts already render from.

- **Same circuit:** `TrackMapDelta` renders normally today. This design adds a cursor marker to it:
  given `distanceM`, find the nearest (or linearly-interpolated) point in the already-fetched
  `trackPoints` array (the *outline*, not per-lap samples — `TrackMapDelta` never has per-lap x/y,
  confirmed §4) and render one marker there. One new small pure utility
  (`nearestTrackPointAt(trackPoints, distanceM)`), unit-testable, no new fetch.
- **Different circuit:** **unchanged from M13, on purpose.** `TrackMapDelta` already returns early
  and renders the "Track visualization is unavailable" explanation when `warnings` contains
  `different_circuit` (§9 of `docs/m13-design-review.md`) — this design does not touch that branch at
  all. A cursor has nothing to mark on a map that was never shown in the first place. **This design
  does not reopen M13's circuit-warning policy** — the current code already proves the right
  behavior, no change needed.
- **Different distance grids** (in the sense of different *max* distance, e.g. one lap shorter due to
  an in/out-lap): already handled — the shared grid is `min(max_distance_a, max_distance_b)`
  (`build_distance_grid`, unchanged), so `distanceM` is always within range for both sides by
  construction. No new edge case for the cursor to handle.
- **Missing telemetry samples on one side:** cannot occur *for the comparison view specifically* —
  the backend already 404s the whole comparison before a response is ever returned if either side has
  zero telemetry (`laps_compare.py`, unchanged). For `TrackMapPage`'s single-lap case, a lap with
  genuinely sparse samples just yields a coarser nearest-point marker — no special-casing needed
  beyond what "nearest point in the samples array" already does for gaps.
- **Interpolation vs. nearest-point:** **nearest-point is sufficient, interpolation is not required.**
  The existing `LoadingState`/render granularity (`resolution` up to 2000 points for comparisons,
  real per-sample telemetry for the single-lap view) is already fine enough that visually
  interpolating between two adjacent points on a 600×400px SVG track map would be imperceptible.
  Backend-side interpolation (`np.interp` in `align_lap`) exists for building the *comparison data
  itself*; the *cursor marker* is a display-only concern and doesn't need its own interpolation layer.

---

## 10. UX Behavior

- **On hover** over any of `TelemetryCharts`/`DeltaChart`/`ChannelOverlayPanel`: a vertical marker
  (ECharts' own `axisPointer` line, its native rendering, one per instance) appears on every grid in
  every currently-mounted synchronized ECharts instance at the same `distance_m`; the corresponding
  telemetry readout (existing `tooltip` content, unchanged shape) updates on each; the delta chart's
  own crosshair moves to the same point; the track map's marker (a small SVG circle, new) appears at
  the corresponding position.
- **Cursor leaves a chart** (mouse leaves that container, doesn't enter another tracked chart within
  the same page): per §6.1, the cursor is **not** cleared — it stays at the last position. Clearing
  on every mouse-leave would make the synchronized view flicker constantly when moving the pointer
  between charts, which is the opposite of "feels alive." A future refinement (not this design) could
  add an explicit "clear" affordance if real usage shows this is confusing.
- **Cursor is cleared** only on the reset triggers in §6.1 (navigation, new comparison fetch).
- **Static/non-hover contexts**: this design is hover-only, matching the PRD's own V2 scope
  (`docs/success-metrics.md`: *"Hovering any telemetry chart moves a synchronized cursor"* — no
  touch/tap-drag equivalent is named). Touch devices simply don't get the synchronized marker, same
  as they don't get ECharts' native tooltip-on-hover today — explicitly out of scope, not a
  regression.

---

## 11. Discoverability Addendum (M13)

**Minimal, additive, no new navigation system, no API change.**

Two entry points, both reusing `SessionPicker` and `ComparisonPage`'s existing query-param contract
exactly as M13 already built it:

1. **`SessionListForEventPage`** (`/seasons/:season/events/:eventId`): each session card gains one
   small secondary action, "Compare," alongside its existing `<Link>` to `/sessions/:sessionId` —
   navigating to `/laps/compare?sessionA=<that session's id>`, identical to what `Sidebar`'s link
   already produces today, just reachable one step earlier in the navigation trail (before drilling
   into a specific driver) instead of only after.
2. **`Sidebar`'s existing "Lap Comparison" link** (`/laps/compare?sessionA=${sessionId}`) — its
   label changes to **"Compare Sessions"**, a one-word copy change, so it reads as an invitation to
   pick a second session rather than "compare within this session" (which is what its current label
   implies, even though the destination page has always supported cross-session comparison since
   M13 shipped).

**Explicitly not done:** no `Sidebar` redesign, no new route, no change to `SessionPicker`'s own
component, no change to `/laps/compare`'s API contract. Both changes are copy/link additions to
already-existing pages.

**State transitions:** clicking either entry point behaves exactly as `ComparisonPage` already
handles a `sessionA`-only query string today (§ per M13's own implementation) — `sessionIdB` starts
unset, the Session B slot shows "Select session," opening `SessionPicker` exactly as it already does.
No new state shape anywhere.

---

## 12. Testing Strategy

Matching this project's established Vitest/RTL conventions (mocked ECharts internals where existing
tests already do, e.g. `ChannelOverlayPanel.test.tsx`'s `TelemetryCharts` stub pattern):

- **`cursorStore.test.ts` / `track-map/cursorStore.test.ts`**: `setCursor`/`clearCursor` update state
  correctly; `source` is recorded; multiple `setCursor` calls overwrite cleanly.
- **`useCursorSync.test.ts`** (new hook, unit-tested against a mocked `dispatch`/store pair): hover
  event → store update; store update (not self-sourced) → `dispatch` called with the right action;
  store update (self-sourced) → `dispatch` **not** called (no feedback loop).
- **`useEChartsInstance.test.ts`** (extend existing, if one exists, else new): `onEvents` handlers are
  registered against the real chart instance; `dispatch` forwards to `chart.dispatchAction`.
- **Chart-A-to-chart-B synchronization** (`TrackMapPage`-level integration test, mocking the two
  chart components similarly to how `ComparisonPage.test.tsx` already mocks `DeltaChart`/
  `TrackMapDelta`): simulate a hover event from `TelemetryCharts`' stub, assert `TrackMap`'s stub
  receives the updated cursor prop.
- **`DeltaChart`/`ChannelOverlayPanel` synchronization** (`ComparisonPage`-level, same mocking
  pattern): hover in one, assert the store (or the other stub's received prop) reflects it.
- **`TrackMap`/`TrackMapDelta` marker rendering** (component-level, real component not mocked):
  given a `distanceM` prop, assert the marker renders at the geometrically-correct `(x, y)` — reusing
  `TrackMap.test.tsx`'s existing `xScale`/`yScale` fixture conventions.
- **Cursor clear/reset**: session/lap change → cursor resets to `null` (both pages).
- **Different distance grids / missing samples**: a comparison fixture with unequal `max_distance_a`/
  `max_distance_b` (already exercised indirectly by existing `test_lap_comparison_alignment.py`
  fixtures backend-side) → cursor stays within the shared grid's bounds by construction; assert no
  out-of-range marker position is ever computed frontend-side.
- **Same-circuit track marker**: `TrackMapDelta` with no `different_circuit` warning → marker
  renders.
- **Different-circuit suppression**: `TrackMapDelta` with the warning present → **unchanged from
  M13's own existing test** (`TrackMapDelta.test.tsx`'s two circuit tests) — this design adds no new
  case here, just confirms the existing one still passes with the cursor prop wired through.
- **M13 discoverability entry point**: `SessionListForEventPage.test.tsx` — new "Compare" link
  present per session card, navigates to the correct `sessionA=` URL; `Sidebar.test.tsx` — label
  text updated.

**No backend tests** — nothing in this design touches the API contract, confirmed in §4/§9.

---

## 13. Performance

Directly inspected: comparison responses carry up to `MAX_COMPARE_RESOLUTION = 2000` points per
channel (`backend/app/models/lap_comparison.py`, unchanged); single-lap `TelemetrySample` arrays are
real per-sample data, typically several hundred to low thousands of points per lap (consistent with
M6/M11's own recorded real-data counts throughout this project's history, e.g. hundreds-of-thousands
of *raw* samples per session but a few hundred per single *lap*'s already-fetched array).

- **Cursor updates can safely stay in React/Zustand state.** Zustand's own subscription model
  (components `useStore(selector)`) only re-renders subscribers, not the whole tree, and there are at
  most 3–4 chart components subscribed per page — this is not a scenario needing to bypass React.
- **High-frequency pointer movement is the one real risk**, but ECharts already solves the expensive
  part internally: `updateAxisPointer` events and `dispatchAction` calls are ECharts' own
  hover-handling path, already throttled/batched by ECharts itself for its own tooltip/crosshair
  rendering — this design doesn't add a second, competing rendering loop, it taps into the one
  ECharts already runs. The only *new* per-event work is one Zustand `set()` call (cheap, a single
  object write) and, for the SVG map, one React re-render computing one interpolated point — not a
  measurable cost at this data scale.
- **No `requestAnimationFrame`/manual throttling is justified by evidence** at this data volume and
  component count; if real usage later shows jank (not predicted here), the fix is a `lodash.throttle`
  wrapper on `setCursor` itself — a small, local, later change, not a reason to add complexity now.

---

## 14. Risks

- **The `useEChartsInstance` extension is the one piece of genuinely shared infrastructure this
  design touches** — a bug there affects every chart using it (`DeltaChart`, `TelemetryCharts`, and
  the out-of-scope session-analytics/tyre-performance charts too, since they share the same hook).
  Must be purely additive (verified: `onEvents` optional, existing call sites need zero changes) and
  tested in isolation before any chart component is touched.
- **`TrackMapDelta`'s marker-position utility (§9) is new, untested-until-built logic** (interpolating
  a track-outline point from `distanceM`) — the correctness bar is a straightforward "nearest point in
  a sorted array," but it's the one place this design introduces genuinely new math, unlike the rest
  of the design which is wiring.
- **Two independent stores (§5) is a real design bet** — if a future milestone ever wants one
  telemetry view to show both a single lap and a comparison side-by-side (not currently possible or
  planned), this would need reconciling. Not a concern for any currently-planned milestone.

## Resolved: competing sources of truth (native axisPointer vs. Zustand)

Per §8: **not competing.** ECharts' native mechanism is scoped strictly to *within one instance's own
multiple grids* (a static option, `axisPointer.link`); the Zustand store is the *only* mechanism used
*across* components/instances. There is exactly one source of truth for any given piece of state —
this was resolved by the concrete fact that the SVG map cannot participate in ECharts' own connect()
mechanism under any configuration, which made the "store as the only cross-component channel" choice
not a preference but a structural necessity once decided consistently.

---

## 15. Acceptance Criteria

- Hovering `TelemetryCharts` (single-lap page) moves `TrackMap`'s marker to the correct position.
- Hovering `DeltaChart` or `ChannelOverlayPanel` (comparison page) moves the other and
  `TrackMapDelta`'s marker (when shown) to the correct position.
- Delta and channel traces show coherent values at the synchronized cursor position via each chart's
  own existing tooltip, unchanged in content/shape.
- Same-session comparison (`session_id_a == session_id_b`) cursor sync works identically to a
  genuinely cross-session comparison.
- Cross-session comparison with different max-distance laps: cursor stays within the shared grid,
  never produces an out-of-range marker.
- Different-circuit comparison: `TrackMapDelta` still shows exactly M13's existing suppression +
  explanation, unaffected by this design; no marker is ever attempted.
- Cursor clears on session/lap/comparison change (§6.1), never bleeds across a navigation.
- `app/services/lap_comparison/` has zero diff (verified by inspection, as in M13).
- `SessionListForEventPage` gains a working "Compare" entry point; `Sidebar`'s existing link is
  relabeled; no new route, no API change.
- No backend, schema, repository, or dependency change anywhere.

---

## 16. Documentation Impact (after implementation — not now)

- `docs/success-metrics.md`: V2's criteria move from "not required" to "shipped."
- `README.md`: milestone table gains M14 (or "V2" framing reconciled — see §17); "no hover-driven
  cursor sync yet (that's V2)" line in the quickstart section becomes stale and must be corrected.
- `CHANGELOG.md`: new entry — and, given the audit's own finding that M13 was never entered either,
  this is a reasonable point to also backfill the missing M13 entry in the same pass, not silently.
- `docs/architecture.md`: §1's data-flow diagram doesn't need a new node (still frontend-only), but
  the "V2... deferred" language sprinkled through several existing component docstrings
  (`chartOptions.ts`, `DeltaChart.tsx`, `TrackMap.tsx`, `TrackMapDelta.tsx`) becomes stale and should
  be updated to point at this shipped design instead of a future one.

## 17. Open Decisions (flagged, not resolved here)

- **Milestone numbering/versioning reconciliation** (raised in the Stage A audit, §A): whether this
  ships as "M14" (continuing the ad-hoc M8+ sequence) or is retroactively folded into a formal "V2"
  label the PRD already reserved. Cosmetic to the implementation, real for the docs pass (§16) — the
  user's call, not inferable from existing docs.
- **Whether the discoverability addendum's exact copy** ("Compare Sessions" vs. some other label) is
  final — a genuinely small UX judgment call, not an architectural one; easy to adjust at
  implementation time without touching this design's structure.

## 18. Implementation Boundaries

**Expected, confirmed by this design:** frontend-only. No API changes. No repository changes. No
database/schema/migration changes. No ingestion changes. No new dependency (ECharts' own
`dispatchAction`/event API and `axisPointer.link` are already available in the version already in
use; ADR-0008 stands unmodified).

**Explicitly preserved:** `app/services/lap_comparison/` unchanged; `selectionStore` remains
separate from both cursor stores; `SessionPicker` remains exactly M13's mechanism, reused not
modified; the M13 `/laps/compare` API contract (`session_id_a`/`session_id_b`, `DIFFERENT_CIRCUIT`)
is not touched.

---

## Document history

- v1 (this document): initial design, produced against M13's real, shipped state (`790eab4`), with
  every architectural claim checked directly against current source rather than assumed from the
  Stage A audit's own prose.
