# PitWall — M8 Design Review: Driver Performance & Session Analytics

**Status:** Design only — no implementation
**Baseline:** v0.6.0 (M0–M6 complete)
**Author's framing:** senior engineering design review, ready for team sign-off before build

---

## 0. Problem Statement

Through M6, a user can inspect a single lap's telemetry, view the track map, and compare exactly **two laps** against each other. What they cannot do is step back and ask session-wide questions: *who was quickest, who was most consistent, who left the most time on the table, and what did each driver's driving style actually look like across the whole session?*

M8 introduces a **session analytics layer**: derived, descriptive performance metrics computed from lap and telemetry data already present in the Parquet store, aggregated across all drivers and all laps in a session. It is explicitly a **descriptive statistics** milestone — consistency, theoretical-best, and driving-style metrics computed directly from observed data — not a modeling milestone. No degradation curves, no fitted trends, no predictions. That distinction is the spine of this document; it recurs in almost every section below because it is the easiest boundary to accidentally cross once the metrics are in front of you.

M8 sits deliberately between M6 (pairwise, single-comparison) and M9 (tyre/stint degradation modeling, which will need M8's session-level framework — valid-lap filtering, per-driver aggregation, the metrics API surface — as its foundation).

---

## 1. User Experience

### 1.1 Entry point

Add a **"Analytics"** tab/route alongside the existing session view, session-scoped rather than lap-pair-scoped:

- Dedicated route: `/session/:sessionId/analytics`
- Reachable from the existing session navigation (wherever the single-lap view and M6's "Compare" entry point already live) — same navigational tier, not nested under either.

Unlike M6, there is no two-item picker as the entry gate. The page loads with **all drivers who completed at least one valid lap in the session** shown by default; the user narrows down from there.

### 1.2 Layout (top to bottom)

1. **Session header**: session name, circuit, session type (Practice/Quali/Race), lap count, track status summary (if the session had flags — reuse whatever session-level metadata M0–M5 already expose).
2. **Driver summary table** (primary, default view): one row per driver — best lap, theoretical best lap, delta between them ("time left on the table"), consistency score, full-throttle %, valid lap count. Sortable by any column.
3. **Pace distribution chart**: one box/violin per driver, all drivers on a shared axis — makes outlier drivers and tight fields visually obvious without reading the table row by row.
4. **Driver drill-down panel** (appears on row click/select): switches the page's lower section to a single-driver view —
   - lap-by-lap table: lap time, delta to own theoretical best, delta to own median, outlier flag, full-throttle %, brake event count
   - a trend chart: lap time across the session for that driver only (no fitted line — raw points, connected, that's it)
5. **No track map view in M8** — see §1.5, this is a deliberate scope cut, not an oversight.

### 1.3 Interaction

- Table sort/filter is pure client-side (data for the whole session is a small payload — see §12).
- Row click drives the drill-down panel; no route change, no refetch (drill-down data is either already in the session-wide payload or fetched lazily per driver, see §3).
- No cross-chart cursor sync requirement in M8 — unlike M6, there's no shared distance axis across all the visuals here (a box plot and a per-driver lap-time trend don't share an axis in any meaningful way). Don't build `useCursorSync`-style plumbing for M8; it would be solving a problem this milestone doesn't have.

### 1.4 What good looks like

A user opens the Analytics tab for a race session, immediately sees a sorted table showing driver X has the best theoretical lap but never actually strung it together (large best-lap-vs-theoretical-best delta), clicks their row, and sees exactly which lap(s) had the outlier pace that dragged their consistency score down.

### 1.5 Explicit UX decision: no track map in M8

M6 established `TrackMap` with a `colorBy` prop for spatial delta visualization. It would be tempting to reuse it here — e.g., color track segments by "average speed variance across the session." Recommend **not doing this in M8**:

- Meaningful spatial breakdown below the existing sector level requires sub-sector/corner segmentation, which M6 explicitly deferred (§13 of the M6 design: *"corner-level would require track-specific metadata not yet established in the app"*). That metadata still doesn't exist. Building a session-wide spatial view on top of it now would mean inventing exactly the thing M6 correctly punted on, as a side effect of an analytics milestone rather than as its own considered piece of work.
- Sector-level (not corner-level) spatial coloring is possible without new metadata, but it duplicates the driver summary table's sector-adjacent information without adding a new question the user couldn't already answer from the table.

If sub-sector track metadata is introduced later (plausibly alongside M9's stint work, where per-corner tyre stress might matter), a spatial session-analytics view becomes cheap to add on top of the metrics this milestone produces. M8 produces the numbers; a future milestone can decide to also draw them on the map.

---

## 2. Data Flow

```
┌─────────────┐   session_id           ┌──────────────────┐
│   Frontend   │ ───────────────────▶  │  FastAPI backend  │
│ (Analytics   │                       │ /sessions/{id}/    │
│    View)     │ ◀───────────────────  │   analytics/*      │
└─────────────┘   aggregated payload   └──────────────────┘
                                              │
                                    Parquet-backed repository
                                    (existing lap + telemetry access)
                                              │
                                    ┌─────────────────────┐
                                    │ Session analytics    │
                                    │ domain module (new)  │
                                    │ - filter valid laps  │
                                    │ - per-lap metrics    │
                                    │   (theoretical-best  │
                                    │    delta, throttle % │
                                    │    brake events)     │
                                    │ - per-driver          │
                                    │   aggregation         │
                                    │   (consistency,       │
                                    │    theoretical best)  │
                                    └─────────────────────┘
```

**Key decision: compute server-side, same as M6, for the same reasons** — one implementation, one set of unit tests, no risk of the frontend silently computing "consistency" differently than the backend's definition. This is not a close call; M6 already established the precedent and there is no new argument for doing it differently here.

**A genuine difference from M6, worth calling out explicitly:** M6's delta computation is triggered by and scoped to a specific user-chosen lap pair — combinatorially large, cheap per call, no reason to cache. M8's session-wide metrics are scoped to a **session**, not a user selection — every user looking at the same session's Analytics tab gets the identical payload, and that payload doesn't change once the session's data is fully ingested. This is a materially different caching argument than M6's, and §12 revisits it rather than reflexively deferring caching the way M6 did.

---

## 3. API Requirements

### New endpoints

```
GET /api/v1/sessions/{session_id}/analytics/drivers
GET /api/v1/sessions/{session_id}/analytics/drivers/{driver}/laps
```

**Design note on splitting into two endpoints rather than one nested payload:** the driver summary table (endpoint 1) is needed immediately on page load for every driver; the lap-by-lap drill-down (endpoint 2) is only needed for the driver the user clicks into. Returning full lap-by-lap detail for all ~20 drivers on initial load multiplies the payload by driver count for data most users will never look at for most drivers. Fetch summary eagerly, drill-down lazily per click — same "don't send what isn't needed" instinct M6 applied to `resolution` capping, applied here at the endpoint-granularity level instead.

#### `GET /analytics/drivers`

**Query params:**
| param | type | notes |
|---|---|---|
| `min_valid_laps` | int (optional, default `1`) | drivers with fewer valid laps than this are excluded from consistency-based rankings (see §10) but still listed with available fields |

**Response shape (conceptual):**
```jsonc
{
  "session_id": "...",
  "session_lap_count": 58,
  "drivers": [
    {
      "driver": "VER",
      "valid_lap_count": 55,
      "best_lap_ms": 91234,
      "theoretical_best_lap_ms": 90980,
      "theoretical_best_delta_ms": 254,       // best_lap - theoretical_best; always >= 0
      "median_lap_ms": 92310,
      "consistency_ms": 187.4,                // stddev of valid lap times, see §8.1
      "consistency_cv": 0.0203,                // coefficient of variation, see §8.1
      "full_throttle_pct": 62.1,               // session-average, see §8.3
      "outlier_lap_count": 2
    }
  ],
  "warnings": ["HAM: only 1 valid lap, consistency metrics omitted"]
}
```

#### `GET /analytics/drivers/{driver}/laps`

**Response shape (conceptual):**
```jsonc
{
  "session_id": "...",
  "driver": "VER",
  "laps": [
    {
      "lap_number": 12,
      "lap_time_ms": 91234,
      "is_valid": true,
      "is_outlier": false,
      "delta_to_theoretical_best_ms": 254,
      "delta_to_own_median_ms": -1076,
      "full_throttle_pct": 63.4,
      "brake_event_count": 6,
      "compound": "SOFT"
    }
  ]
}
```

**Design notes:**
- Reuse existing session/driver/lap identifier conventions from M0–M6 — no new ID schemes, same as M6's stated principle.
- `warnings` follows M6's **structured** convention established in the M6 implementation plan (§0.4 of that doc: `warning_code` + optional `detail`), not the free-text list the M6 *design* originally proposed before that review corrected it. M8 should use the already-corrected structured shape from day one rather than repeating a mistake the team already caught once.
- GET with query params, matching the precedent M6's implementation plan resolved (§0.3 of that doc: confirm existing convention, default to GET for cacheable reads). No open question here — M6 already did this legwork; M8 inherits the answer.
- Add both endpoints to the existing typed API client as `getSessionAnalytics(sessionId, params)` and `getDriverLapMetrics(sessionId, driver)`, sitting alongside `compareLaps` and the single-lap client methods, sharing the same base fetch/error-handling wrapper.

---

## 4. State Management

Following the pattern M6's implementation plan settled on (confirm-then-match the actual M0–M6 frontend pattern; do not reintroduce an assumption M6 already resolved):

**Server state (cached, keyed by request params):**
- `useSessionAnalytics(sessionId, {minValidLaps})` — fetches and caches the driver-summary payload.
- `useDriverLapMetrics(sessionId, driver)` — fetched lazily on drill-down selection, cached per driver so re-selecting a previously viewed driver doesn't refetch.

**Client/UI state (local to the analytics feature):**
- Selected driver for drill-down (or none, for the default table+distribution view)
- Table sort column/direction
- `min_valid_laps` filter, if exposed as a user control (see §10 — recommend a sensible default and not exposing this as raw user input in M8; see that section for why)

No high-frequency state comparable to M6's hover-cursor position exists in this milestone — there is no synced-cursor mechanic (§1.3) — so §4 here is materially simpler than M6's. Don't build the isolation machinery M6 needed; there's no re-render-storm risk to isolate against.

---

## 5. Component Hierarchy

```
SessionAnalyticsPage
 ├─ SessionAnalyticsHeader          (session name, circuit, type, lap count)
 ├─ DriverSummaryTable              (sortable, drives drill-down selection)
 ├─ PaceDistributionChart           (ECharts boxplot, one box per driver)
 └─ DriverDrillDown                 (rendered when a driver is selected)
     ├─ DriverLapTable              (lap-by-lap metrics)
     └─ LapTimeTrendChart           (ECharts line, raw points, no fitted trend)
```

Notably flat compared to M6's hierarchy — no `Provider` wrapping cursor-sync context (§4), no per-channel overlay panel. This is a genuine simplicity difference between the milestones, not an omission; resist the urge to add structure the feature doesn't need.

---

## 6. File Structure

```
backend/
  app/
    api/
      routes/
        session_analytics.py       # new route module
    domain/
      session_analytics/
        __init__.py
        filtering.py                # valid-lap selection, exclusion rules (§10)
        theoretical_best.py         # per-driver theoretical best lap
        consistency.py              # stddev, CV, outlier detection
        driving_style.py            # full-throttle %, brake event counting
        aggregation.py              # rolls per-lap metrics up to per-driver summary
    schemas/
      session_analytics.py          # Pydantic request/response models
  tests/
    domain/
      session_analytics/
        test_filtering.py
        test_theoretical_best.py
        test_consistency.py
        test_driving_style.py
        test_aggregation.py
    api/
      test_session_analytics_route.py

frontend/
  src/
    features/
      session-analytics/
        SessionAnalyticsPage.tsx
        components/
          SessionAnalyticsHeader.tsx
          DriverSummaryTable.tsx
          PaceDistributionChart.tsx
          DriverDrillDown.tsx
          DriverLapTable.tsx
          LapTimeTrendChart.tsx
        hooks/
          useSessionAnalytics.ts
          useDriverLapMetrics.ts
        api/
          sessionAnalytics.ts        # typed client calls
        types.ts
```

Mirrors M6's `backend/app/domain/<feature>/` + `frontend/src/features/<feature>/` convention exactly. No changes to `components/charts/` or `components/track-map/` are required for M8 — see §1.5 and §7; this milestone adds one new ECharts series type usage (boxplot) but no new shared component.

---

## 7. Reusable Code Opportunities

- **Parquet repository / lap + telemetry access**: reused as-is. M8 introduces no new repository methods beyond what M0–M6 already expose, *unless* per-lap `is_valid`/track-status data (M6's Open Question 4) still doesn't exist — see §10, this is the one place M8 could inherit a real scope question from M6 rather than resolving cleanly.
- **Typed API client base wrapper**: extended, not forked, same as M6.
- **Error-response envelope**: reused from M0–M6, not reinvented.
- **`warning_code` structured warnings shape**: reused directly from the pattern M6's implementation plan corrected the design into (§3 above) — this is the clearest "M8 stands on M6's shoulders, including its self-corrections" example in this document.
- **ECharts instance**: same charting library, new series type (`boxplot`) for the pace distribution chart — no new charting dependency, just a series type PitWall hasn't used yet.
- **What is explicitly *not* reused**: `TelemetryChart` and `TrackMap` are not touched in M8 (§1.5, §5). This is worth stating plainly because the instinct after M6 might be "generalize everything shared-component-shaped"; M8 doesn't need either component, and forcing a connection would be scope invention, not reuse.

---

## 8. Metric Definitions

This is the technical core of the milestone and, like M6's §8, deserves precise, testable definitions — these numbers will be read closely and any ambiguity here becomes a support burden later.

### 8.1 Consistency

For a driver's set of **valid** laps (§10) in the session, excluding declared outliers if outlier exclusion is applied (see below — recommend it is *not* applied to the headline consistency number, only used for the separate `outlier_lap_count` field):

```
consistency_ms = stddev(valid_lap_times_ms)
consistency_cv = consistency_ms / mean(valid_lap_times_ms)
```

**Explicit decision: report both, and do not collapse them into a single score.** Standard deviation in milliseconds is directly comparable across drivers *within the same session* (same track, same conditions) but not across sessions or circuits. Coefficient of variation is dimensionless and more defensible if this data is ever compared cross-session — which M8 doesn't do, but the field existing now costs nothing and avoids a schema change later. Do not invent a composite "consistency score" (e.g., 0–100 scale) in M8 — that's an editorial/normalization choice with no obvious correct answer, and inventing one now would be exactly the kind of unjustified modeling decision this milestone is supposed to avoid.

**Outlier detection**, used only for `is_outlier` / `outlier_lap_count`, not for filtering the consistency calculation itself:
```
IQR-based: lap is an outlier if lap_time < Q1 - 1.5*IQR or lap_time > Q3 + 1.5*IQR
```
Recommend IQR over z-score: robust to the very outliers it's trying to detect (a z-score threshold is dragged around by the same extreme values it's meant to flag), and it's a standard, easily-explained, easily-tested method — no modeling judgment call required, consistent with the "descriptive, not predictive" boundary (§0).

### 8.2 Theoretical Best Lap

```
theoretical_best_lap_ms = best(sector_1_times) + best(sector_2_times) + best(sector_3_times)
                          (each best taken independently across the driver's valid laps)

theoretical_best_delta_ms = best_lap_ms - theoretical_best_lap_ms   // always >= 0
```

**Note, and a genuine simplification versus M6:** this metric needs only per-lap **sector times**, not sector **distances**. M6's Open Question 1 (*"does session metadata expose sector-boundary distances, or only sector times?"*) doesn't block M8's theoretical-best calculation at all — sector times are the standard timing-data field and should already exist from whatever session/lap ingestion M0–M1 built. If that assumption is wrong and only cumulative lap time exists with no sector split, that's a real gap worth surfacing before implementation, but it would be a gap in the base ingestion pipeline (M1), not something specific to M8's design.

Sanity invariant: `theoretical_best_delta_ms >= 0` always, since the theoretical best is a lower bound by construction (best-of-each-sector can never be slower than any single actual lap). This is the M8 equivalent of M6's sign-convention invariant (§8.2 step 4 in the M6 doc) — the one number where a subtle bug (e.g., accidentally including invalid laps in the "best sector" search) produces a plausible-looking but wrong result. Flag it the same way M6 flagged sign convention: in the schema docstring, in a code comment, and in a dedicated test.

### 8.3 Driving Style Metrics

Computed per lap from existing telemetry channels (throttle, brake — both already ingested and used by M0–M6):

```
full_throttle_pct = (samples where throttle >= 99) / total_samples * 100
brake_event_count = count of rising edges in a binarized brake signal
                     (brake > threshold, e.g. 0 -> nonzero transition)
```

**Explicit decision: threshold-based, not modeled.** `throttle >= 99` (not `== 100`) accounts for sensor noise near full throttle without introducing any fitted or learned threshold — a fixed, documented constant, matching M6's approach to fixed constants like the `resolution` cap (M6 implementation plan §0.3: "not a spec until it's a concrete number"). Recommend `99` for throttle and a brake threshold of `> 0` (binary brake channels are common in this kind of telemetry; if PitWall's actual brake channel is continuous/pressure-based rather than binary, this constant needs revisiting against the real data in an investigation phase, same as M6's Phase 0 pattern — flagged as an open question below, not assumed away here).

**What this section deliberately does not include:** corner-by-corner braking-point analysis, brake pressure trend modeling, or any "driving style clustering." Those require either the sub-sector track metadata M6 deferred (§1.5) or genuine modeling (§0, §13) — out of scope for the same reasons already stated twice in this document.

---

## 9. ECharts Visualization Strategy

- **Pace distribution chart**: ECharts native `boxplot` series, one box per driver, computed from each driver's valid lap times. ECharts' `dataset` transform can compute the five-number summary client-side from raw lap times if the API sends raw arrays, or the backend can send pre-computed quartiles — **recommend backend sends raw valid lap times per driver** (already a small array, tens of values) and lets ECharts' `boxplot` transform do the summary computation, avoiding a second independent quartile implementation on the backend that could disagree with a library's own boxplot conventions (whisker definition varies by convention — Tukey vs. min/max — and it's safer to let one library own that choice consistently than to hand-roll it server-side and hope it matches what the chart renders).
- **Lap time trend chart**: single ECharts line series per driver drill-down, raw lap times over lap number. **No trend line, no regression overlay, no smoothing** — this is the single most important instruction for this chart, given the milestone's explicit non-goal of predictive/degradation modeling (§0). A well-meaning implementer adding a dashed "trend" overlay to this chart would silently reintroduce M9's scope into M8. Call this out in code review, not just in this doc.
- **Driver summary table**: not an ECharts concern — a standard sortable data table component, reusing whatever table primitive M0–M6 already established elsewhere in the app (if one exists; if not, this is worth a one-line flag as the first table-shaped UI in the app, since it's a small but real precedent-setting choice).

---

## 10. Edge Cases

| Case | Handling |
|---|---|
| Driver has 0 valid laps (e.g., DNF before setting a timed lap, mechanical retirement) | Listed with `valid_lap_count: 0`; `best_lap_ms`, `theoretical_best_lap_ms`, `consistency_ms`, `consistency_cv` all `null`; not an error, not excluded from the roster. |
| Driver has exactly 1 valid lap | `consistency_ms`/`consistency_cv` are undefined for a single point — return `null`, not `0`. A single-lap "consistency" of zero is misleading (implies perfect consistency, not insufficient data) — this is a real correctness trap, treat it as seriously as M6 treated its sign-convention risk. |
| Session with very few laps overall (e.g., a red-flagged qualifying session) | No special-case backend logic; the above per-driver rules already degrade gracefully. Frontend should render "insufficient data" states rather than empty/broken charts for low-lap-count drivers, and the boxplot chart should simply omit drivers with fewer than 2 valid laps (a box needs a distribution) — surfaced via `warnings`, following the same structured-warning convention as §3. |
| Out-lap / in-lap included in raw lap data | Excluded from `valid_lap_count` and all aggregate metrics — reuse the exact same `is_valid` / lap-classification convention M6 already established (M6 §10: *"Surface `lap.is_valid` from existing lap metadata"*), do not invent a second definition of validity for M8. |
| Yellow flag / safety car lap included in raw lap data | M6 chose to disclose, not exclude, for its raw two-lap delta view. M8 makes a **different, and more defensible, choice**: exclude yellow-flag-affected laps from consistency/theoretical-best calculations (they're not representative of the driver's actual pace), but still list them, flagged, in the per-driver lap table for transparency. This divergence from M6's precedent is deliberate — M6 was showing a *specific, requested* comparison the user chose (disclosure suffices, since the user opted into those two exact laps); M8 is producing an aggregate ranking metric, where a single distorted lap silently corrupts a statistic the user did *not* individually vet. Worth confirming with the team as a genuine judgment call, not a default — see Open Questions. |
| Track status / yellow-flag data doesn't actually exist yet in the Parquet schema | Falls back to the same fork M6's implementation plan already established for its `warnings` field (M6 plan §0.3): ship the exclusion logic as a no-op (nothing gets excluded on this basis) rather than fabricating track-status data, and file a follow-up rather than expanding M8 to include new pipeline plumbing. |
| Driver only present for part of the session (e.g., red flag ended the session early for everyone, or a driver retired mid-session) | Metrics are computed over whatever valid laps exist; no assumption that all drivers have comparable lap counts — `valid_lap_count` in the response makes this visible in the UI rather than hidden. |
| Two drivers have identical `theoretical_best_lap_ms` | No special handling needed — sortable table, ties render in whatever stable order the sort implementation produces; not worth engineering around. |
| `min_valid_laps` filter excludes a driver from ranking consideration entirely | Driver still appears in the roster (transparency — a user shouldn't wonder "where did this driver go") but is visually or programmatically flagged as excluded from ranked comparisons rather than silently dropped from the response. |

---

## 11. Test Strategy

**Backend (highest priority, same reasoning as M6 — this is where quietly-wrong numbers hide):**

- `test_filtering.py`: synthetic laps with a mix of valid/invalid/out-lap/yellow-flag flags → assert exactly the expected subset survives into aggregate calculations; a dedicated test for the "listed but excluded from consistency" out-lap case, since silently dropping a row entirely vs. excluding-from-stats-but-still-listing are easy to conflate in implementation.
- `test_theoretical_best.py`:
  - hand-constructed sector times across several laps → assert `theoretical_best_lap_ms` equals the manually-computed best-of-each-sector sum.
  - invariant test: `theoretical_best_delta_ms >= 0` for randomized/property-based synthetic sector data (same style as M6's property test for delta-at-zero, §11 of the M6 doc) — this is M8's single highest-value fuzz test.
- `test_consistency.py`:
  - known lap-time array with hand-computed stddev/CV → assert match within floating-point tolerance.
  - single-lap driver → assert `null`, not `0` (§10 — this deserves its own explicit test given how easy it is to get wrong).
  - zero-valid-lap driver → assert `null` fields, not an exception.
  - IQR outlier detection against a hand-constructed array with a known planted outlier → assert exactly that lap is flagged.
- `test_driving_style.py`: synthetic throttle/brake channel arrays with a known full-throttle percentage and a known number of brake-engagement rising edges → assert computed values match exactly (these are simple enough to make exact-match assertions reasonable, not just tolerance-based).
- `test_aggregation.py`: end-to-end per-driver rollup from synthetic multi-lap fixtures → assert the summary response matches hand-computed expected values across all fields simultaneously (a single higher-level test catching wiring bugs the unit-level tests above wouldn't).
- `test_session_analytics_route.py`: integration test against fixture Parquet data (reuse existing M0–M6 fixtures where possible), full request/response contract test including `warnings` population for known edge-case fixtures (a driver with one valid lap, a session with a yellow-flag lap, if such fixtures exist or can be extended from M6's).

**Frontend:**
- `useSessionAnalytics` / `useDriverLapMetrics`: mock API responses → correct cache key behavior, correct lazy-fetch-on-drill-down behavior (i.e., assert the per-driver endpoint is *not* called until a driver is selected).
- `DriverSummaryTable`: render with fixture data, assert sort behavior and correct handling of `null` consistency fields (should render as "—" or similar, not `NaN` or `0`).
- `PaceDistributionChart`: render with fixture data, assert the correct number of boxes and that drivers with insufficient laps are omitted (§10), not just that the component doesn't crash.
- `LapTimeTrendChart`: assert exactly one series is rendered per driver drill-down and that no trend/regression series exists — this is worth an explicit negative assertion given §9's warning about scope creep, not just a snapshot that happens not to show one today.

**Explicitly not in scope for automated tests:** pixel-level chart rendering, table visual styling — covered by manual QA, consistent with M6's stated boundary (M6 §11).

---

## 12. Performance Considerations

- **Payload size**: the driver summary endpoint returns one row per driver (typically ≤20–24) with a handful of scalar fields each — trivially small, no pagination or capping needed, unlike M6's telemetry-point capping concern.
- **Backend compute**: stddev/CV/theoretical-best over tens of laps per driver, times ~20 drivers, is negligible — sub-millisecond territory, same order of magnitude as M6's interpolation cost assessment.
- **The driving-style metrics are the one place M8 touches real telemetry volume**: full-throttle percentage and brake-event counting require iterating per-lap telemetry samples (thousands of points per lap) for potentially every lap of every driver if the summary endpoint eagerly includes them. **Recommend**: the summary endpoint (`/analytics/drivers`) includes only the *session-average* `full_throttle_pct` per driver (computed once, cached per session — see below), while per-lap driving-style detail lives in the already-lazy `/analytics/drivers/{driver}/laps` endpoint, so a page load doesn't force full-telemetry iteration across every lap of every driver just to render a summary table.
- **Caching — a deliberate departure from M6's default.** M6 explicitly deferred caching (M6 §12: *"recommend deferring this unless profiling shows it's needed"*), and that was correct for M6 because its cache key includes user-chosen lap-pair parameters — a combinatorially large space with no guarantee of repeat hits. M8's session-summary endpoint has none of that shape: **the entire response is a pure function of `session_id` alone** (once a session's data is fully ingested, it never changes), and *every* user opening that session's Analytics tab requests the identical payload. This is close to the textbook case for a simple cache, not a premature one. Recommend a straightforward in-process cache keyed on `session_id` (with a short TTL or manual invalidation tied to the ingestion pipeline's completion signal, whatever that looks like in M0–M1), and call this a genuine departure from M6's precedent, explicitly justified, rather than either blindly copying M6's "no cache" stance or blindly adding caching because it seems modern — see Open Questions, since this touches the ingestion pipeline's invalidation story, which this document can't fully specify without seeing it.
- **Frontend**: no high-frequency state (§4), no re-render-storm risk comparable to M6's hover-cursor concern. The boxplot and table both render once per data-load; no special memoization strategy is needed beyond ordinary React hygiene.

---

## 13. Explicitly Out of Scope for M8

- **Tyre/stint degradation modeling, fuel-load correction, or any fitted/trend-line pace model** — this is M9, and is the primary reason this boundary is repeated so many times above; M8 provides the valid-lap filtering and per-driver aggregation framework M9 will build on, but computes no model of its own.
- **Any predictive metric** (projected lap time, predicted tyre cliff, etc.) — descriptive statistics only, full stop.
- **Corner-level / sub-sector spatial analysis or track-map visualization of any kind** (§1.5) — blocked on track metadata M6 already deferred and M8 doesn't introduce.
- **Cross-session or cross-event comparison** (e.g., a driver's consistency in Quali vs. Race, or across a season) — M8 is single-session scoped, consistent with M6's single-session restriction on comparison.
- **Weather/track-temperature normalization** — carried forward unchanged from M6's out-of-scope list.
- **A composite/normalized "consistency score"** (§8.1) — reporting raw stddev and CV only; no invented 0–100 scale or letter grade.
- **User-configurable metric definitions** (e.g., letting a user change the outlier IQR multiplier, or the throttle threshold, via the UI) — constants are fixed and documented (§8.3), not exposed as settings, in M8.
- **Live/in-progress session analytics** — post-session/historical only, consistent with the existing app's scope through M6.
- **Export/share/permalink of an analytics view** — carried forward unchanged from M6.
- **Driving-style clustering, style comparison across drivers beyond the raw per-driver numbers, or any qualitative "driving style" label** — the metrics in §8.3 are reported as numbers; no synthesis into a style category or narrative.

---

## Open Questions for Team Review

1. **Sector times vs. sector distances (again, but easier this time):** does the existing session/lap model expose per-lap sector *times* directly? (§8.2 needs only this, not the distance data M6's Open Question 1 was actually about — worth confirming the simpler assumption holds before Phase 0 of an eventual implementation plan.)
2. **Brake channel shape**: is the existing brake telemetry channel binary (on/off) or continuous (pressure/percentage)? This determines whether `brake_event_count` (§8.3) needs a threshold constant tuned against real data, and what that constant should be.
3. **Yellow-flag/track-status data availability**: does this already exist in the Parquet schema (as M6's Open Question 4 asked and, per that document, left unresolved), or does §10's yellow-flag-exclusion behavior need to ship as a no-op fallback in M8 as well? If M6 shipped with the empty-list fallback, M8 inherits the same gap and should say so plainly rather than re-asking the question as if it were new.
4. **Session-ingestion-complete signal**: for the caching recommendation in §12, is there an existing signal (event, timestamp, pipeline status field) that reliably indicates a session's Parquet data is finalized and safe to cache indefinitely, or does M8's cache need a manual/TTL-based invalidation strategy instead? This is worth resolving against the actual M0–M1 pipeline before committing to the caching approach in an implementation plan.
5. **Table component precedent**: does the app already have a shared sortable-table primitive from M0–M6, or is `DriverSummaryTable` (§9) the first one? If the latter, it's worth a short explicit design conversation of its own before M8 builds it as a one-off, since it will likely be reused by M9's per-driver stint tables.
6. **Yellow-flag exclusion divergence from M6 (§10)**: confirming the team agrees M8 should *exclude* yellow-flag-affected laps from aggregate stats where M6 chose to *disclose-not-exclude* for its pairwise view — this is a deliberate design choice in this document, not a default, and deserves explicit sign-off given it sets precedent M9 will likely follow or deviate from.