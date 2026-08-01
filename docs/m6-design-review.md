# PitWall — M6 Design Review: Lap Comparison & Delta Analysis

**Status:** Design only — no implementation
**Baseline:** v0.5.0 (M0–M5 complete, audit passed)
**Author's framing:** senior engineering design review, ready for team sign-off before build

---

## 0. Problem Statement

A user has already selected a session and can inspect a single lap's telemetry and track map. M6 must let them pick **two laps** and answer, quantitatively and visually: *where on the lap did time get gained or lost, and by how much?*

The centerpiece is a **distance-aligned delta-time trace** (the classic "purple/yellow squiggle" seen in F1 broadcast graphics and tools like Multiviewer), backed by a correct, testable interpolation algorithm, plus supporting overlays (speed, throttle/brake) and a track map colored by where time was lost.

---

## 1. User Experience

### 1.1 Entry point
Add a **"Compare"** action alongside the existing single-lap view (not a replacement). Two entry paths:

- From the existing lap table/list: multi-select exactly two laps → "Compare Selected" button appears once 2 are checked.
- A dedicated **Comparison** route (`/session/:sessionId/compare`) with two independent Driver → Lap pickers (Lap A = "reference", Lap B = "comparison"), defaulting to each driver's fastest lap if available.

Cross-driver comparison and same-driver (e.g., Q2 vs Q3) comparison are both first-class — the picker does not assume same driver.

### 1.2 Layout (top to bottom)
1. **Header bar**: driver A vs driver B chips (team-colored), lap numbers, lap times, overall delta (e.g. "+0.312s"), compound/tyre if available.
2. **Delta chart** (primary, largest): cumulative time delta vs distance, zero-line, shaded gain/loss regions.
3. **Telemetry overlay chart(s)**: speed by default; togglable channels (throttle, brake, gear, RPM) either stacked as separate synced panes or one at a time via a channel selector — decision: **stacked, collapsible panes**, so a user can add/remove without losing delta context.
4. **Track map**: same SVG map used elsewhere, now colored by a delta gradient (e.g. diverging color scale, driver-A-faster vs driver-B-faster) rather than single-color line.
5. **Sector/mini-sector breakdown table**: per-sector delta, best sector highlighted.

### 1.3 Interaction
- **Synced cursor**: hovering any chart (delta, speed, throttle) shows a vertical guide at the same distance across all charts, and a marker on the track map at that position. This is the single most important UX mechanic — without it, the feature is just three unrelated charts.
- Click-drag to zoom into a distance range on the delta chart; other charts and the track map follow the zoom (track map could highlight the corresponding path segment).
- "Swap A/B" button flips reference and sign convention instantly, no refetch needed if both laps' data are already cached client-side.

### 1.4 What good looks like
User can glance at the delta chart, see a steep downward step through "Turn 8," hover it, see driver B was 15 km/h faster there, and see the corresponding track segment highlighted red on the map.

---

## 2. Data Flow

```
┌─────────────┐   session/lap ids    ┌──────────────────┐
│   Frontend   │ ───────────────────▶ │  FastAPI backend  │
│ (Comparison  │                      │ /laps/compare      │
│    View)     │ ◀─────────────────── │                   │
└─────────────┘   aligned payload     └──────────────────┘
                                              │
                                    Parquet-backed repository
                                    (existing telemetry access)
                                              │
                                    ┌─────────────────────┐
                                    │ Delta computation    │
                                    │ module (new, backend)│
                                    │ - load both laps     │
                                    │ - validate/clean     │
                                    │ - build common       │
                                    │   distance grid      │
                                    │ - interpolate        │
                                    │ - compute delta(d)   │
                                    │ - compute sector     │
                                    │   deltas             │
                                    └─────────────────────┘
```

**Key decision: compute delta server-side, not client-side.**

Rationale:
- The interpolation/alignment logic is subtle (see §8) and should live in one place with unit tests, not be duplicated in TypeScript.
- Raw per-lap telemetry can be a few thousand samples per channel; sending both raw laps *and* doing the math in the browser is wasted transfer + duplicated logic.
- Backend already owns the Parquet repository and typed models; it is the natural owner of "what is a valid lap for comparison."

Frontend receives an already distance-aligned, delta-computed payload and is purely a rendering layer. This keeps the frontend simple and keeps a single source of truth for "how is delta computed" (important for trust in the numbers).

---

## 3. API Requirements

### New endpoint
```
GET /api/v1/sessions/{session_id}/laps/compare
```

**Query params:**
| param | type | notes |
|---|---|---|
| `lap_a` | int (lap number) | required |
| `driver_a` | string (driver code/number) | required |
| `lap_b` | int | required |
| `driver_b` | string | required |
| `channels` | string[] (optional, default `["speed","throttle","brake","gear","rpm"]`) | which telemetry channels to include beyond distance/time |
| `resolution` | int (optional, default e.g. `1000`) | number of points in the common distance grid, capped server-side (e.g. max 2000) |

**Response shape (conceptual, Pydantic model):**
```jsonc
{
  "session_id": "...",
  "lap_a": { "driver": "VER", "lap_number": 12, "lap_time_ms": 91234, "compound": "SOFT", "is_valid": true },
  "lap_b": { "driver": "LEC", "lap_number": 9,  "lap_time_ms": 91546, "compound": "MEDIUM", "is_valid": true },
  "track_length_m": 5412.0,
  "distance": [0, 5.4, 10.8, ...],          // common grid, meters
  "delta_ms": [0, 2.1, 4.8, ...],           // cumulative delta at each distance point
  "channels": {
    "speed":    { "a": [...], "b": [...] },
    "throttle": { "a": [...], "b": [...] },
    "brake":    { "a": [...], "b": [...] },
    "gear":     { "a": [...], "b": [...] },
    "rpm":      { "a": [...], "b": [...] }
  },
  "sectors": [
    { "sector": 1, "delta_ms": 45, "faster": "a" },
    { "sector": 2, "delta_ms": -12, "faster": "b" },
    { "sector": 3, "delta_ms": 82, "faster": "a" }
  ],
  "warnings": ["lap_b was under yellow flag conditions in sector 2"]
}
```

**Design notes:**
- Reuse existing session/driver/lap identifier conventions already established in M0–M5 — do not invent new ID schemes.
- `warnings` is important: it's how the backend surfaces "this comparison may be misleading" (yellow flags, pit lane inclusion, invalid lap) without blocking the response — see §10.
- Consider whether this should be a POST (body) instead of GET with many query params, if the existing API style favors POST for multi-parameter reads. **Assumption: follow whatever precedent M0–M5 already set for multi-parameter lap queries; this doc assumes GET with query params for cacheability (HTTP caching, back-button friendliness).**
- Add to the typed API client (existing codegen or hand-written types — whichever pattern the client currently uses) as `compareLaps(sessionId, params): Promise<LapComparisonResponse>`.

---

## 4. State Management

*(Assumption stated up front: the existing frontend state pattern is not specified in the prompt. This design assumes a **server-state cache** — e.g. React Query/TanStack Query — for API data, plus lightweight local component/store state for UI selection, consistent with a typed-API-client architecture. If M0–M5 already established a different pattern, e.g., Redux Toolkit Query, substitute directly; the shape below is library-agnostic.)*

**Server state (cached, keyed by request params):**
- `useLapComparison(sessionId, {driverA, lapA, driverB, lapB, channels})` — fetches and caches the `/compare` payload. Cache key includes all params so swapping A/B or changing channels re-fetches only when needed (channel changes could also be handled by requesting the superset once and filtering client-side — see §7).

**Client/UI state (local to the Comparison feature, not global app state):**
- Selected driver/lap pairs (A and B)
- Active/visible telemetry channels (toggle set)
- Hover distance (the synced-cursor position) — this is the highest-frequency-updating piece of state and must be isolated so it doesn't re-render the whole tree (see §12).
- Zoom/brush range on the delta chart

**Explicit decision:** hover/cursor position should **not** live in the main comparison store if that store is also driving chart re-renders elsewhere; isolate it (e.g. a small context, or ECharts' own `axisPointer` group-sync mechanism, or a ref-based pub/sub) so mouse-move doesn't cascade re-renders through selection state.

---

## 5. Component Hierarchy

```
ComparisonPage
 └─ ComparisonProvider                 (cursor-sync context, channel visibility)
     ├─ LapPairSelector
     │   ├─ DriverLapPicker (A)        (reused from existing lap-selection UI)
     │   └─ DriverLapPicker (B)
     ├─ ComparisonHeader                (names, lap times, overall delta, swap button)
     ├─ DeltaChart                      (ECharts, primary)
     ├─ ChannelOverlayPanel
     │   ├─ TelemetryChart (speed)      (generalized existing single-lap chart component)
     │   ├─ TelemetryChart (throttle)
     │   ├─ TelemetryChart (brake)
     │   └─ ChannelToggleControls
     ├─ TrackMapDelta                   (extends existing SVG TrackMap component)
     └─ SectorBreakdownTable
```

`DriverLapPicker` and `TelemetryChart` should be the existing single-lap components, generalized (see §7), not new components duplicating logic.

---

## 6. File Structure

```
backend/
  app/
    api/
      routes/
        laps_compare.py            # new route module
    domain/
      lap_comparison/
        __init__.py
        alignment.py               # distance-grid construction + interpolation
        delta.py                   # delta_ms computation
        sectors.py                 # sector-level delta aggregation
        validation.py              # lap comparability checks, warnings
    schemas/
      lap_comparison.py            # Pydantic request/response models
  tests/
    domain/
      lap_comparison/
        test_alignment.py
        test_delta.py
        test_sectors.py
        test_validation.py
    api/
      test_laps_compare_route.py

frontend/
  src/
    features/
      lap-comparison/
        ComparisonPage.tsx
        ComparisonProvider.tsx
        components/
          LapPairSelector.tsx
          ComparisonHeader.tsx
          DeltaChart.tsx
          ChannelOverlayPanel.tsx
          TrackMapDelta.tsx
          SectorBreakdownTable.tsx
        hooks/
          useLapComparison.ts
          useCursorSync.ts
        api/
          compareLaps.ts            # typed client call
        types.ts
    components/
      charts/
        TelemetryChart.tsx           # generalized, shared with single-lap view
      track-map/
        TrackMap.tsx                 # extended with color-by-value prop
```

Keep the `lap-comparison` feature self-contained; only touch shared components (`TelemetryChart`, `TrackMap`) at their prop-API boundary.

---

## 7. Reusable Code Opportunities

- **`TelemetryChart`** (existing single-lap chart): generalize to accept an array of series (currently probably one). Add props for `series: {label, data, color}[]` instead of a single dataset. The single-lap view then just passes an array of length 1 — no behavior change for existing usage.
- **`TrackMap`** (existing SVG): add an optional `colorBy: (distanceFraction) => color` prop, or a `segments: {start, end, color}[]` prop, defaulting to current single-color behavior when absent.
- **`DriverLapPicker`**: extract the driver+lap selection dropdown pair used in the existing single-lap flow into a standalone component parameterized by a label ("Lap A" / "Lap B"), reused twice.
- **Typed API client**: extend rather than fork; `compareLaps` sits alongside existing lap/telemetry client methods, sharing the same base fetch/error-handling wrapper.
- **Backend distance/time utilities**: if M0–M5 already computed per-lap distance channels for the track map or single-lap charts, reuse that exact computation for alignment — do not re-derive distance independently, or the two views (single-lap vs comparison) could silently disagree.

---

## 8. Delta Calculation Algorithm

This is the technical core and deserves a precise, testable spec.

### 8.1 Inputs
For each lap: a time-ordered telemetry series with at least:
- `time` (or `date`) — elapsed time since lap start, ms
- `distance` — cumulative distance since lap start, meters (assumed monotonically non-decreasing under normal conditions)
- plus whichever channels are requested (speed, throttle, brake, gear, rpm)

### 8.2 Core idea
Two laps have different time profiles but should be compared **as a function of distance**, not time — that's what makes the delta trace meaningful ("who was ahead *at this point on track*").

**Algorithm:**

1. **Validate monotonicity.** Distance must be non-decreasing for both laps. If not (e.g., a spin, reversing, or a data glitch), either:
   - reject the comparison with a clear error, or
   - clip/repair by dropping the non-monotonic segment and flag a `warning`.
   Decision: **reject outright** for now (see §13 — repair heuristics are out of scope for M6); simplicity and correctness over cleverness.

2. **Build a common distance grid.** Choose `N` evenly spaced points from `0` to `min(max_distance_a, max_distance_b)` (use the shorter of the two, e.g. if one lap's telemetry is truncated). `N` = `resolution` query param, default ~1000, capped at ~2000 server-side to bound payload size.

3. **Interpolate each lap's `time` onto the common grid**, using linear interpolation over (distance → time) for each lap independently:
   `t_a(d)` = interp(lap A's distance/time arrays) evaluated at each grid point `d`
   `t_b(d)` = interp(lap B's distance/time arrays) evaluated at each grid point `d`

4. **Compute delta:**
   `delta_ms(d) = (t_b(d) - t_a(d)) * 1000`
   Sign convention: **positive delta means lap A is faster (ahead) at that distance** (lap B has taken more time to reach the same point). Document this convention prominently in the response schema and in the UI legend — sign-convention bugs are the #1 way these charts get misread.

5. **Interpolate the requested telemetry channels similarly** (distance → channel value, linear interpolation) onto the same common grid, for both laps, so channel overlays and the delta trace share an x-axis (distance) with byte-for-byte aligned sample points — this is what makes hover-sync trivial on the frontend (same array index = same distance across every series).

6. **Sector deltas:** using session sector-boundary distances (already known from session metadata, if available) or clock-based sector splits converted to distance via the same interpolation, compute `delta_ms` at each sector boundary and diff consecutive boundary values to get per-sector delta.

### 8.3 Why linear interpolation (not spline)
Telemetry sampling is typically dense enough (e.g., ~4–20 Hz) that linear interpolation error is negligible relative to timing precision needs, and it is monotonic-safe, cheap, and has no overshoot artifacts near sharp braking events (a cubic spline can overshoot and invert delta sign near hard braking transients — a real risk to correctness). **Linear only for M6.**

### 8.4 Complexity
O(N log M) per channel per lap for interpolation (binary search per grid point) or O(N + M) with a merge-style walk since both arrays are sorted — negligible at these data sizes (thousands of points).

### 8.5 Pseudocode
```python
def align_lap(lap: LapTelemetry, grid: np.ndarray) -> np.ndarray:
    # lap.distance strictly non-decreasing (validated upstream)
    return np.interp(grid, lap.distance, lap.time)

def compute_delta(lap_a, lap_b, resolution: int) -> DeltaResult:
    max_d = min(lap_a.distance[-1], lap_b.distance[-1])
    grid = np.linspace(0, max_d, resolution)
    t_a = align_lap(lap_a, grid)
    t_b = align_lap(lap_b, grid)
    delta_ms = (t_b - t_a) * 1000
    channels = {
        name: {
            "a": np.interp(grid, lap_a.distance, lap_a.channel(name)),
            "b": np.interp(grid, lap_b.distance, lap_b.channel(name)),
        }
        for name in requested_channels
    }
    return DeltaResult(distance=grid, delta_ms=delta_ms, channels=channels)
```

---

## 9. ECharts Visualization Strategy

- **Delta chart**: single ECharts line series over the common distance x-axis.
  - Zero reference line via `markLine`.
  - Fill-below/above styling: since a single series can't trivially have two-tone fill by sign in stock ECharts, use **`visualMap` (piecewise, on the `value` dimension)** to color the line/area segments above/below zero differently, or split into two series (`delta_positive`/`delta_negative`, one filled with NaN-gaps above/below zero respectively) — **recommend the two-series-with-NaN-gaps approach**, it's more predictable than visualMap piecewise for area fills and easier to test.
- **Telemetry overlay charts**: one ECharts instance per channel (speed, throttle, brake), each with two series (lap A, lap B) in the drivers' team/line colors, sharing the same x-axis domain as the delta chart.
- **Cross-chart cursor sync**: use ECharts' built-in `group` + `echarts.connect(group)` mechanism so `axisPointer` (the hover crosshair) is synchronized across all chart instances automatically, keyed on the shared distance x-axis. This avoids hand-rolled event plumbing for the common case.
- **Track map delta coloring**: the track map is SVG, not ECharts — extend the existing SVG rendering to map each path segment's delta sign/magnitude to a color via the same `colorBy` prop mentioned in §7 (e.g. a diverging scale: driver-A-color tint → neutral → driver-B-color tint), rather than trying to force the map into ECharts' geo/graph chart types, which is not a valid comparison; **the map's cursor marker should still respond to the same shared distance/hover state as the ECharts instances**, using the `useCursorSync` hook rather than an ECharts-specific mechanism.
- **Downsampling for rendering**: even though the API can return up to ~2000 points, consider ECharts' `large: true` / `sampling: 'lttb'` series option for the telemetry line charts if channel count × points ever gets large; the delta chart itself at ~1000–2000 points needs no special handling.

---

## 10. Edge Cases

| Case | Handling |
|---|---|
| Laps of different track configurations (e.g., different session, different circuit) | Reject at the API layer with a clear 400 — comparison is only valid within the same session/circuit variant. |
| One lap is an out-lap/in-lap (partial distance, includes pit lane) | Flag via `warnings`; still compute over the overlapping distance range (§8.2 step 2 already handles unequal max distance). |
| Invalid lap (track limits, red flag, not a representative timed lap) | Surface `lap.is_valid` from existing lap metadata; do not block comparison, but show a prominent warning badge in the UI — user might deliberately want to compare an invalid lap. |
| Yellow flag / safety car during one lap | Surface in `warnings` if session data marks track status per lap; do not attempt to "correct" the delta — just disclose it (correction is out of scope, §13). |
| Non-monotonic distance (spin, off-track excursion, data glitch) | Reject with a specific error message identifying which lap and roughly where; do not silently repair (§8.2). |
| Missing telemetry channel for one lap (e.g., no RPM sensor data) | Omit that channel from the response for both laps (or return null arrays) rather than partial-align; frontend hides the toggle for unavailable channels. |
| Identical lap selected for A and B | Allowed (delta ≡ 0 everywhere) — useful as a sanity check / no-op state; no special-case rejection needed. |
| Laps from different compounds/fuel loads/track evolution | Not corrected for — this is a raw time-delta tool, not a normalized pace model; make this explicit in UI copy ("raw delta, not tyre/fuel corrected") so users don't over-interpret. |
| Very short session with only one valid lap per driver | A/B pickers should simply have limited options; not a special backend case. |
| Track length mismatch due to sensor drift between two laps of "the same" circuit | Use `min(max_distance_a, max_distance_b)` as established; do not attempt cross-lap distance recalibration in M6. |

---

## 11. Test Strategy

**Backend (highest priority — this is where correctness bugs hide):**
- `test_alignment.py`: synthetic laps with known analytic distance/time relationships (e.g., constant speed, known accel/decel profile) → assert interpolated values match expected within tolerance.
- `test_delta.py`:
  - identical laps → delta ≡ 0 everywhere.
  - lap B uniformly `k` seconds slower at every point → delta ≡ `k*1000` constant.
  - lap B faster only in a known sub-region → delta should be flat outside that region and move only within it; assert sign convention matches §8.2 step 4 explicitly (a dedicated test asserting sign, not just magnitude, since this is the easiest thing to silently invert).
- `test_sectors.py`: known synthetic sector boundaries → per-sector delta equals hand-computed values.
- `test_validation.py`: non-monotonic distance triggers rejection; mismatched circuits triggers 400; missing channel handled gracefully.
- `test_laps_compare_route.py`: integration test against fixture Parquet data (reuse existing test fixtures from M0–M5's repository layer if present) — full request/response contract test, including `warnings` population for a known yellow-flag fixture lap if such fixtures exist.
- Property-based test (if the project already uses one, e.g. Hypothesis): random monotonic distance/time series → delta at `d=0` is always the negative of... actually delta at d=0 should always be ≈0 (both laps start the clock at distance 0) — good invariant to fuzz-test.

**Frontend:**
- `useLapComparison` hook: mock API response → correct cache key behavior on param change (swap A/B, channel toggle).
- `DeltaChart` / `TelemetryChart`: render with fixture data, assert series count/labels (React Testing Library + snapshot or explicit assertions, not pixel snapshotting).
- `useCursorSync`: simulate hover event on one chart, assert shared cursor state updates without triggering unrelated re-renders (can assert via render-count spies).
- `LapPairSelector`: selecting a lap fires the expected callback/query param change.

**Explicitly not in scope for automated tests:** pixel-level ECharts visual regression, cross-browser SVG rendering — covered by manual QA only.

---

## 12. Performance Considerations

- **Payload size**: capping `resolution` (§3) bounds response size regardless of raw telemetry density; default ~1000 points × ~5 channels × 2 laps is a small JSON payload (tens of KB), well within normal API latency budgets.
- **Backend compute**: interpolation over a few thousand points is sub-millisecond in numpy; no caching layer strictly required for M6, but consider a simple in-process LRU cache on `(session_id, driver_a, lap_a, driver_b, lap_b, resolution, channels)` since users will often toggle channels or hover without changing the underlying selection — **recommend deferring this** unless profiling shows it's needed; premature caching adds invalidation complexity for a first version.
- **Frontend re-render cost**: the synced cursor updates on every `mousemove` over any chart. This must not re-render the full `ComparisonPage` tree. Isolate cursor state (§4) and let only the small set of components that draw the crosshair/marker subscribe to it — via ECharts' native axisPointer group-sync (§9) for the chart instances themselves (no React re-render involved at all for those), and a narrowly-scoped subscription for the `TrackMapDelta` marker.
- **Track map re-coloring**: computing per-segment color from delta values should be memoized on the delta array reference, not recomputed on every hover/render.
- **Large multi-channel view**: if a user enables all 5 channels simultaneously, that's 4 ECharts instances (delta + 3 overlay, say) each independently mounted; verify `echarts.connect` scales fine at this count (it does, this is well within ECharts' normal use case) but avoid re-creating chart instances on unrelated state changes (memoize chart option objects).

---

## 13. Explicitly Out of Scope for M6

- **More than two laps** (multi-lap/stint comparison) — a plausible M7+.
- **Cross-session comparison** (e.g., quali lap vs race lap, or different events entirely) — restricted to same session in M6.
- **Tyre/fuel/track-evolution normalized ("corrected") pace comparison** — M6 shows raw time delta only, with a UI disclaimer.
- **Automatic repair/interpolation-through of non-monotonic distance data** (spins, off-track excursions) — rejected with an error, not silently patched.
- **Weather/track-temperature normalization.**
- **Export/share/permalink of a specific comparison view.**
- **Real-time/live-session comparison** (comparing a lap currently in progress against a reference) — M6 is post-session/historical only, consistent with existing app capabilities.
- **Mobile-specific layout optimization** for the multi-chart comparison view (should not break, but bespoke mobile UX is not a goal of this milestone).
- **Server-side caching/memoization layer** beyond what naturally falls out of the API design — deferred pending real usage data.
- **Corner-by-corner named annotations** (e.g., auto-labeling "Turn 8") — sector-level only in M6; corner-level would require track-specific metadata not yet established in the app.

---

## Open Questions for Team Review

1. Does session metadata already expose sector-boundary distances, or only sector *times*? This affects whether §8.2 step 6 needs a distance-conversion step or can use existing data directly.
2. What is the actual current frontend state-management library? §4's design is written to be substitutable but should be confirmed before implementation.
3. Should GET vs POST for `/compare` follow existing precedent from M0–M5's other multi-parameter lap endpoints, or is this the first such endpoint?
4. Is there existing "lap validity" / track-status-per-lap data available to populate `warnings`, or does that require new data plumbing from the Parquet repository (which would itself be a scope addition worth flagging before build starts)?