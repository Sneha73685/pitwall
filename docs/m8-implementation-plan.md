# PitWall — M8 Implementation Plan: Driver Performance & Session Analytics

**Status:** Phase 0 complete — **ready for Phase 1** (see 0.0 — milestone renumbered M7 → M8)
**Baseline:** v0.6.0 (M0–M6 complete)
**Source design doc:** `docs/m8-design-review.md` (design reviewed; 5 blocking issues resolved below in Phase 0 rather than by re-drafting the design doc)

This plan follows M6's structure: a Phase 0 investigation/decision phase that closes every open question and design-review blocking issue with a concrete, written answer *before* any domain code is written, followed by build phases in dependency order (filtering → metrics → aggregation → API → frontend → polish).

---

## Phase 0 — Investigation & Decisions

### 0.0 Milestone numbering — RESOLVED (renumbered M7 → M8)

**Original Phase 0 finding:** `docs/prd.md` §3 (Milestone Roadmap) defines **M7 as "Polish & release"** — test coverage pass, docs, deployment, tag `v1.0.0`, demo recording — the final milestone of V1, explicitly described as "release-readiness work, not new features" (`docs/releases/m6-summary.md`, "Next milestone" section). `CHANGELOG.md`'s `[Unreleased]` section already says "Work in progress toward M7 — Polish & release," and the changelog header states semantic version tags begin at `v1.0.0` when M7 ships.

The feature described in this plan and its source design doc — session-wide descriptive analytics (consistency, theoretical-best lap, driving-style metrics, pace distribution) — did not appear anywhere in `docs/prd.md`: not in V1 §2.1 scope, and not in the V2–V5 milestone table in `docs/success-metrics.md` or the "Intentionally Deferred" table in `docs/prd.md` §5. It was a genuinely new feature area with no assigned milestone number in the project's own planning documents.

**Resolution:** `docs/prd.md`'s roadmap is left unchanged — M7 remains "Polish & release," matching the in-progress work reflected in `CHANGELOG.md` and `docs/releases/m6-summary.md`. This feature is renumbered to **M8**, the next available post-V1 milestone slot, per the first option below (the one the team chose). Both source documents were renamed and their internal self-references updated accordingly: `docs/m7-design-review.md` → `docs/m8-design-review.md`, `docs/m7-implementation-plan.md` → `docs/m8-implementation-plan.md` (this file). Because the design doc already used "M8" to refer to a *later*, distinct milestone (tyre/stint degradation modeling — see its §0 and §13), that milestone is bumped to **M9** throughout both documents to preserve the intended sequence: M6 (shipped) → **M8** (this feature) → M9 (tyre/stint degradation modeling, which builds on M8's session-level framework). No scope, metric definition, or other implementation decision made during Phase 0 (§0.1–0.5 below) changes as a result of this renumbering — only the milestone label.

Options that were considered for resolving the conflict (the first was chosen):
- **Renumber (chosen):** ship real "Polish & release" as M7 first (it's already in progress per the changelog), and this analytics feature becomes M8 — requires no change to `docs/prd.md`'s existing M7 entry, since M7 already means "Polish & release" there.
- Insert this feature ahead of polish/release and explicitly re-sequence the roadmap, with `docs/prd.md` updated to say so before any code lands.
- Confirm this is deliberately V1.5/out-of-band work the roadmap doesn't need to reflect — but this would have contradicted CLAUDE.md's "Definition of done" bar ("matches its milestone's entry in `docs/success-metrics.md`"), so it was not chosen.

Phase 1 is unblocked. No implementation code in this phase. Each item below gets a one-paragraph written answer in this doc (filled in during Phase 0), the same way M6's Phase 0 resolved its open questions. Nothing in Phase 1+ starts until every item here has an answer.

### 0.1 Blocking issues from design review (must resolve first)

| # | Issue | Decision needed | Resolution |
|---|---|---|---|
| B1 | Roster definition contradiction (§1.1 vs §10) | Does the default Analytics view list *every* driver in the session (including 0-valid-lap DNFs), or only drivers with ≥1 valid lap? | **Decision: every driver in the session's driver list, regardless of valid lap count.** Update design doc §1.1 to match §10. Rationale: a DNF driver silently vanishing from the roster is worse UX than a row full of nulls with a clear "0 valid laps" state. |
| B2 | `warnings` schema example vs. prose | Fix the `/analytics/drivers` example payload to use the structured `{warning_code, detail}` shape, not a free-text string array. | Correct the design doc's example before anyone copies it into a Pydantic model. |
| B3 | Cache-key vs. `min_valid_laps` query param | Either drop `min_valid_laps` as a server param (compute client-side from `valid_lap_count`, already in every response) or cache on `(session_id, min_valid_laps)`. | **Decision: drop it as a request param.** The full roster is always returned regardless of threshold (per B1/§10), so there's no case where the server needs to know the threshold to produce the response. `min_valid_laps` becomes a pure frontend constant (default `2`, since 1 lap can't produce a consistency figure — see §8.1) applied to the already-fetched `valid_lap_count` field. This also fully restores §12's "pure function of `session_id` alone" caching story with no asterisk. |
| B4 | Missing schema fields for described edge-case behaviors | Add `excluded_from_ranking: bool` to driver summary rows (computed server-side against a fixed internal threshold — see B3, this is *not* the same as removing the param, the exclusion flag is still useful even though the client no longer sends a threshold) — **revised given B3: since ranking-eligibility is now a client-side concern, drop this field too; the client derives it from `valid_lap_count >= MIN_VALID_LAPS_FOR_RANKING`.** Add `exclusion_reason: "out_lap" \| "in_lap" \| "yellow_flag" \| null` to per-lap objects in `/drivers/{driver}/laps`, replacing reliance on `is_valid` alone to represent yellow-flag exclusion. | Finalize field names in schema draft (0.5) below. **Phase 0 correction: `exclusion_reason`'s three named values are not all derivable from the actual schema — see Q3/Q5-adjacent finding below. Only `is_accurate`-derived exclusion is currently possible; `"out_lap"`, `"in_lap"`, and `"yellow_flag"` have no backing data field anywhere in the pipeline or Parquet schema today (confirmed against `pitwall_pipeline/models.py`, `docs/data-model.md`, and the M6 release summary's own "Known limitations"). Shipping this enum as specified would mean the values `null` and (implicitly) some `is_accurate`-derived reason are the only ones ever populated — the other three are speculative until pipeline work adds them. This needs an explicit scope decision, not silent no-op-per-value handling.** |
| B5 | Dual quartile implementation (backend IQR outlier detection vs. ECharts boxplot transform) | Decide the source of truth for box/whisker rendering. | **Decision: backend remains the single source of truth for outlier flags (`is_outlier`, IQR-based, §8.1 — unchanged); frontend boxplot continues to use ECharts' own quartile transform over raw arrays for the *box shape only*, and does not attempt to mark individual points as outliers via chart markers.** The boxplot is a distribution-shape visual; outlier identification is a *table* concern, driven by the backend's `is_outlier` field, not the chart. This avoids needing the backend to hand-roll box/whisker values while removing the visual-disagreement risk, because the chart no longer makes any per-point outlier claim — it only draws the five-number-summary box. Document this explicitly in the `PaceDistributionChart` component so a future contributor doesn't "helpfully" add outlier dot rendering that could disagree with the table.

**Phase 0 correction to B2/§3's premise:** the design doc's claim that M8 should reuse "M6's **structured** convention (`warning_code` + optional `detail`)" misstates M6's actual field name. M6's real Pydantic model (`backend/app/models/lap_comparison.py::ComparisonWarning`) and its TypeScript mirror (`frontend/src/api/client.ts::ComparisonWarning`) both use the field name **`code`**, not `warning_code`. The 0.4 schema draft below (inherited from the design doc's B2 example) must use `code`, matching the actual M6 precedent, not `warning_code`.

**Phase 0 correction, `compound` field:** the design doc's `/drivers/{driver}/laps` example (§3) and this plan's 0.4 draft both include `"compound": "SOFT"` per lap. No compound/tyre field exists anywhere in the schema — `docs/data-model.md` explicitly lists "Tire compound, stints, pit stops, weather, and position/gaps" as "explicitly V3" and states they are "not modeled here, even though FastF1 exposes some of them... pulling them in now would be scope creep." `pitwall_pipeline/models.py::Lap` and `backend/app/models/telemetry.py::Lap` both confirm no `compound` field exists. This field must be dropped from the M8 schema (it cannot be populated without pulling V3-scoped ingestion work forward), and the design doc's example payload is wrong to include it.

### 0.2 Open questions from the design doc

| # | Question | Investigation | Resolution |
|---|---|---|---|
| Q1 | Does the session/lap model expose per-lap sector *times* directly? | Inspect M0–M1 ingestion schema / Parquet columns. | **Yes.** `Lap` (both `pitwall_pipeline/models.py` and `backend/app/models/telemetry.py`) has `sector_1_seconds`, `sector_2_seconds`, `sector_3_seconds` (each `float \| None`), returned as-is by `TelemetryRepository.list_laps`/`GET /sessions/{id}/laps`. §8.2's theoretical-best computation needs no new pipeline work and no distance-to-time conversion — confirms the design doc's own expectation that this is the "easier" question versus M6's Open Question 1. Note the `None`-ability: an incomplete/invalid lap can have `None` sectors, which `theoretical_best.py` must skip rather than treat as `0`. |
| Q2 | Is the brake telemetry channel binary or continuous? | Inspect a sample session's brake channel values directly (histogram of raw values). | **Binary.** `TelemetrySample.brake_active` (both pipeline and backend models) is typed `bool`, not a continuous pressure/percentage value. No debounce window is needed for noise near a threshold — there is no threshold, the channel is already a clean on/off signal. `brake_event_count` (§8.3) is simply a rising-edge count (`False → True` transitions) over the sample sequence in time order — the same "resort by `time_seconds`, not `distance_m`" caveat `validate_monotonic` (M6, `app/services/lap_comparison/validation.py`) already documents applies here too, since `get_telemetry` returns samples distance-sorted. |
| Q3 | Does yellow-flag/track-status data exist in the Parquet schema yet? | Confirm against M6's Open Question 4 resolution — if M6 shipped a no-op fallback, M8 inherits the same gap. | **Confirmed absent**, and this is well-documented already: `docs/releases/m6-summary.md`'s "Known limitations" states plainly "Per-lap track-status data (yellow flag, pit lane) doesn't exist on the lap model yet (Phase 0 finding)." `docs/data-model.md` corroborates: only session/driver/lap identity, lap+sector times, six telemetry channels, and track geometry are modeled in V1. There is also **no out-lap/in-lap flag** of any kind — the only lap-quality signal anywhere in the schema is `is_accurate` (FastF1's own telemetry-integrity heuristic, per `docs/data-model.md`). M8's `filtering.py`/`exclusion_reason` can ship only a no-op for `"yellow_flag"`, and has **no data source at all** for `"out_lap"`/`"in_lap"` as distinct reasons — see the B4 correction above. |
| Q4 | Is there a reliable session-ingestion-complete signal for cache invalidation? | Check M0–M1 pipeline for an event/status field. | **Superseded — see 0.3 (caching deferred).** |
| Q5 | Does a shared sortable-table primitive already exist from M0–M6? | Grep frontend `components/` for existing table components. | **No, and there is no table primitive of any kind, sortable or not.** `frontend/src/components/` is an empty directory (nothing has ever been added there — everything lives under `features/<feature>/`). The only existing table-like UI is `frontend/src/features/lap-comparison/components/SectorBreakdownTable.tsx`: a plain, unstyled semantic `<table>` with no sort behavior, rendering a fixed 3-row array. `DriverSummaryTable` would be the **first sortable table** in the app, not a generalization of an existing sortable one — the design doc's own §9 flag ("worth a one-line flag as the first table-shaped UI in the app") is correct, but it's actually the first table-shaped UI *of any kind* that isn't a 3-row fixed table, which is a slightly bigger first than the design doc implies. Keep it minimal per CLAUDE.md's scope discipline — a generic reusable primitive is tempting given M9's likely reuse, but building one now would be designing for a hypothetical consumer that doesn't exist yet. |

### 0.3 Caching — revised recommendation

Per design review: §12's own performance analysis states backend *compute* is sub-millisecond. The stated caching justification (pure function of `session_id`) is necessary but not sufficient — it doesn't establish that caching is *worth doing*, only that it *would be correct* if worth doing. Absent profiling data on Parquet read cost, and given Q4's invalidation-signal uncertainty:

**Decision: defer caching in M8, matching M6's default.** Ship without a cache. If profiling post-launch shows repeated Parquet reads for the same session are a real cost (multiple users/tabs on the same session, or slow storage), add an in-process cache as a follow-up — at that point also resolve the multi-worker/multi-replica question the design review raised, since an in-process cache is silently wrong in a multi-process deployment. This is an explicit, documented reversal of the design doc's §12 recommendation, made here rather than by re-editing that doc.

### 0.4 Response schema — final draft (post Phase 0)

```jsonc
// GET /sessions/{session_id}/analytics/drivers
// No query params (min_valid_laps removed — see B3).
// No /api/v1 prefix — see 0.4a: no such prefix exists anywhere in this API.
{
  "session_id": "...",
  "session_lap_count": 58,        // total laps in the race/session distance — NOT sum of driver lap records
  "drivers": [
    {
      "driver": "VER",
      "valid_lap_count": 55,
      "best_lap_ms": 91234,
      "theoretical_best_lap_ms": 90980,
      "theoretical_best_delta_ms": 254,
      "median_lap_ms": 92310,
      "consistency_ms": 187.4,
      "consistency_cv": 0.0203,
      "full_throttle_pct": 62.1,
      "outlier_lap_count": 2
    }
  ],
  "warnings": [
    { "code": "insufficient_laps", "driver": "HAM", "detail": "1 valid lap; consistency metrics omitted" }
  ]
}
```
_(field corrected to `code`, matching `ComparisonWarning.code` in `app/models/lap_comparison.py` — see 0.1 B2/§3 correction above; the design doc's `warning_code` was never actually M6's field name.)_

```jsonc
// GET /sessions/{session_id}/analytics/drivers/{driver}/laps
// Returns ALL laps for the driver (valid and invalid), not just valid ones.
{
  "session_id": "...",
  "driver": "VER",
  "laps": [
    {
      "lap_number": 12,
      "lap_time_ms": 91234,
      "is_valid": true,
      "exclusion_reason": null,          // "out_lap" | "in_lap" | "yellow_flag" | null
      "is_outlier": false,
      "delta_to_theoretical_best_ms": 254,
      "delta_to_own_median_ms": -1076,
      "full_throttle_pct": 63.4,
      "brake_event_count": 6
    }
  ],
  "warnings": []
}
```
_(`compound` field removed — no tyre-compound data exists anywhere in the schema; `docs/data-model.md` explicitly scopes it to V3. See 0.1 B5 correction above.)_

Frontend applies `MIN_VALID_LAPS_FOR_RANKING = 2` (constant, not user-configurable — consistent with §13's "no user-configurable metric definitions") to `valid_lap_count` to compute ranking-eligibility for display purposes; the backend does not need to know this threshold.

### 0.4a Backend file structure — corrections against actual repo layout

The design doc's §6 file structure (and this plan's Phase 1–2 file lists) invent a layer naming scheme that does not match either `docs/architecture.md` (the authoritative layout doc, per `CLAUDE.md`) or M6's actual shipped code. Confirmed by reading `docs/architecture.md`'s repo tree, `backend/app/` directly, and `docs/api-model.md`/`docs/releases/m6-summary.md`'s own module listings:

| Design doc / this plan says | Actually exists | Correct path for M8 |
|---|---|---|
| `backend/app/domain/session_analytics/` | No `domain/` directory anywhere in the repo. `docs/architecture.md`'s tree and M6's shipped code both use `app/services/<feature>/` for pure domain logic (`app/services/lap_comparison/`). | `backend/app/services/session_analytics/` |
| `backend/app/schemas/session_analytics.py` | No `schemas/` directory anywhere. Pydantic response models live in `app/models/<feature>.py` (`app/models/telemetry.py`, `app/models/lap_comparison.py`), documented in `docs/architecture.md` as `"models/  # Pydantic schemas (the anti-corruption boundary)"`. | `backend/app/models/session_analytics.py` |
| `backend/app/api/routes/session_analytics.py` | No `api/routes/` subdirectory. Every route module sits directly in `app/api/` (`app/api/sessions.py`, `app/api/laps_compare.py`, etc.), registered individually in `app/main.py` via `app.include_router(...)`. | `backend/app/api/session_analytics.py` |
| `GET /api/v1/sessions/{session_id}/analytics/drivers` | **No `/api/v1` prefix exists anywhere in this API.** Every router is mounted at the root with only its own `prefix="/sessions"` (see `app/main.py`: `app.include_router(sessions.router)` etc., none passed a global prefix). `frontend/src/api/client.ts`'s `API_BASE_URL` points straight at the FastAPI root. | `GET /sessions/{session_id}/analytics/drivers` (no version prefix) |

This is the same shape of correction M6's Phase 0 apparently made silently between its own design/plan (which also proposed `app/domain/lap_comparison/` and `app/schemas/lap_comparison.py`, per `docs/m6-implementation-plan.md` Phase 1) and what actually shipped (`app/services/lap_comparison/`, `app/models/lap_comparison.py`) — M6's plan text was never corrected after the fact, so M8's design/plan copied the stale naming forward instead of the real precedent. `test_session_analytics_route.py` should live at `backend/tests/test_session_analytics_route.py` (flat, matching `backend/tests/test_laps_compare_route.py`), not under a `tests/api/` subdirectory; likewise domain tests belong at `backend/tests/test_session_analytics_*.py` flat, matching `backend/tests/test_lap_comparison_*.py`, not under `tests/domain/session_analytics/`.

### 0.4b Frontend route path — correction

Design doc §1.1 proposes `/session/:sessionId/analytics` (singular "session"). Every existing route in `frontend/src/App.tsx` uses the plural form: `/sessions/:sessionId`, `/sessions/:sessionId/drivers/:driverId`, `/sessions/:sessionId/compare` (M6's own comparison route, plural, per its own docstring: *""/sessions/:sessionId/compare" (plural, matching every other route here)"*). The M8 route should be `/sessions/:sessionId/analytics` to match. (The API path in design doc §3 is already correctly pluralized — only the frontend route in §1.1 has this error.)

### 0.4c Frontend data-fetching / caching — no precedent for the plan's assumed behavior

§4 of the design doc and Phase 3 of this plan describe `useSessionAnalytics`/`useDriverLapMetrics` as caching hooks — "fetches and caches," "cached per driver so re-selecting a previously viewed driver doesn't refetch." **No caching of any kind exists in this codebase's frontend today.** The one precedent (`frontend/src/features/lap-comparison/hooks/useLapComparison.ts`) is a plain `useEffect`+`useState` hook that refetches on every dependency change with no memoization, no cache map, and its own comment states explicitly: *"the same plain `useEffect`+`useState` fetch pattern every existing page already uses... no server-state library exists anywhere in the frontend; confirmed in M6 Phase 0."* `docs/releases/m6-summary.md` repeats this as a settled architectural fact, not a one-off.

This is a real decision point, not a documentation nit: building "cached per driver" behavior for `useDriverLapMetrics` means introducing a new pattern (e.g., a `Map<driver, response>` in component state or a small in-hook cache) that has zero precedent anywhere else in the app. That's not necessarily wrong — the design doc's rationale (avoid refetching on re-selecting a driver in the drill-down) is reasonable — but per M6's own Phase 0 precedent ("whichever pattern already exists... is what the hook will use, full stop") and CLAUDE.md's "New code goes in the layer it architecturally belongs to... not wherever is quickest," this needs an explicit sign-off in Phase 0 rather than being assumed: either (a) introduce a minimal per-driver cache as a deliberate, called-out departure from the `useLapComparison` precedent, justified by the drill-down UX need, or (b) match the existing no-cache convention exactly and accept a refetch on every driver reselection. Recommend (a) — a small `useState<Record<string, DriverLapMetrics>>` cache keyed by driver is a few lines, not a new dependency or library — but this plan should say so explicitly rather than silently assuming caching semantics that don't exist elsewhere in the code.

### 0.5 `full_throttle_pct` aggregation method (session-level)

**Decision: pooled/weighted, not a mean-of-means.** `full_throttle_pct` at the driver-summary level is `(total samples where throttle >= 99 across all valid laps) / (total samples across all valid laps) * 100`, not an unweighted average of each lap's own percentage. This avoids under/over-weighting laps with different sample counts (e.g. slightly different lap durations at a constant sample rate) and matches how the per-lap field is computed (same formula, scoped to one lap instead of all valid laps). Document this formula in the `driving_style.py` docstring and cover it with a test using laps of deliberately different lengths.

---

## Phase 1 — Backend: Filtering & Metric Primitives

Scope: `backend/app/services/session_analytics/` modules, no API surface yet (per 0.4a — `services/`, not `domain/`, matching M6's actual shipped layout).

1. `filtering.py`
   - Valid-lap selection reusing existing `lap.is_accurate` (**corrected per Q3 finding above: the field is `is_accurate`, not `is_valid` — `is_valid` does not exist on the `Lap` model.** This is the same field M6's `collect_warnings` already keys off of, per `app/services/lap_comparison/validation.py`).
   - Yellow-flag exclusion layered on top of `is_accurate` as a *second*, independent filter — implemented as a no-op (excludes nothing) since Q3 confirms track-status data doesn't exist yet, but structured so it activates automatically once that data lands, without a schema change. Note there is likewise no distinct out-lap/in-lap signal to layer in (see Q3/B4 findings) — only the `is_accurate`-derived exclusion and the yellow-flag no-op are implementable today.
   - Produces the `exclusion_reason` value per lap (0.4) so the API layer doesn't need its own filtering logic.
2. `theoretical_best.py`
   - Per-driver theoretical best = sum of best-of-each-sector across valid laps (§8.2, unchanged from design).
   - Sign invariant (`delta_ms >= 0`) enforced and property-tested (Phase 4).
3. `consistency.py`
   - `stddev` / `consistency_cv` over valid laps (yellow-flag-excluded laps do not count as valid for this purpose).
   - IQR outlier detection (§8.1), two-sided — explicitly test both a fast-side and slow-side planted outlier (design-review note).
   - Null handling for 0- and 1-valid-lap drivers (never `0`).
4. `driving_style.py`
   - `full_throttle_pct` per lap and pooled per driver (0.5 formula).
   - `brake_event_count` via rising-edge detection on a binarized brake signal; threshold and (if needed per Q2) debounce window are named constants at the top of the file, not magic numbers inline, so they're easy to retune once Q2's answer is confirmed against real data.
5. `aggregation.py`
   - Rolls per-lap outputs from 1–4 into the per-driver summary row and the per-driver lap list, including `excluded_from_ranking`-equivalent info being pushed to the frontend (not computed here, per B3/0.4).

**Exit criteria:** unit tests for all four modules pass in isolation against synthetic fixtures (no API, no Parquet dependency beyond what's already mocked in M0–M6 test fixtures).

## Phase 2 — Backend: API Layer

1. `app/models/session_analytics.py` — Pydantic models matching 0.4 exactly, including `exclusion_reason` as a literal/enum and structured `warnings` (per 0.4a — `app/models/`, not `schemas/`).
2. `app/api/session_analytics.py` — two GET endpoints, no query params on the summary endpoint (per B3), reusing the existing error-response envelope (§7) including the not-yet-ingested-`session_id` case (design-review nice-to-have — confirm it returns the same shape as other M0–M6 404s). Flat under `app/api/`, not `app/api/routes/` (per 0.4a).
3. Wire into the existing FastAPI router registration alongside M6's routes — no new router-level conventions.

**Exit criteria:** `test_session_analytics_route.py` integration test passes against fixture Parquet data, covering: full roster including a 0-valid-lap driver (B1), a 1-valid-lap driver (null consistency, `warnings` populated), and — if Q3 confirms track-status data exists — a yellow-flag-affected lap showing `exclusion_reason: "yellow_flag"` while still appearing in the lap list.

## Phase 3 — Frontend: Data Layer & Shell

1. `api/sessionAnalytics.ts` — typed client methods `getSessionAnalytics(sessionId)` and `getDriverLapMetrics(sessionId, driver)`, sharing the existing base wrapper.
2. `hooks/useSessionAnalytics.ts`, `hooks/useDriverLapMetrics.ts` — server-state hooks per §4 (lazy fetch on drill-down, cached per driver).
3. Route + `SessionAnalyticsPage.tsx` shell, `SessionAnalyticsHeader.tsx`.
4. Client-side `MIN_VALID_LAPS_FOR_RANKING` constant and the derived ranking-eligibility flag (0.4), computed in the page/table layer, not in a hook — it's a display concern, not fetched data.

**Exit criteria:** page loads real (fixture) data into the header and an unstyled table; no chart work yet.

## Phase 4 — Frontend: Table & Charts

1. `DriverSummaryTable.tsx` — sortable, renders `null` consistency fields as "—" (explicit test per design doc §11), visually distinguishes ranking-ineligible rows without hiding them (B1/B4).
2. `PaceDistributionChart.tsx` — ECharts `boxplot`, raw valid-lap-time arrays from the summary payload, omits drivers with <2 valid laps (design doc §10), **does not render per-point outlier markers** (B5 decision — box shape only; outlier identity lives in the table).
3. `DriverDrillDown.tsx`, `DriverLapTable.tsx`, `LapTimeTrendChart.tsx` — line chart, raw points only, explicit negative test asserting no trend/regression series is present (guards the M9 boundary, per design doc §9).

**Exit criteria:** full UX flow from design doc §1.4 works end-to-end against fixture data.

## Phase 5 — Testing Completion & Property Tests

- `theoretical_best_delta_ms >= 0` property/fuzz test (design doc's "single highest-value test").
- Full-throttle pooled-vs-unweighted regression test (0.5) — deliberately construct laps of different lengths where the two methods would disagree, assert the pooled result.
- Two-sided outlier test (fast-side and slow-side planted outliers) in `test_consistency.py`.
- `test_theoretical_best.py` extended to explicitly cover the single-valid-lap (`delta == 0`) and zero-valid-lap (`null`) cases, not just `test_consistency.py`.
- Frontend: `useSessionAnalytics`/`useDriverLapMetrics` cache-key and lazy-fetch tests; `DriverSummaryTable` null-rendering and ranking-flag tests; `PaceDistributionChart` box-count and omission tests; `LapTimeTrendChart` negative trend-line assertion.

## Phase 6 — Docs & Sign-off

- Update `docs/m8-design-review.md` in place to reflect the B1–B5 decisions made in Phase 0 (so the design doc and implementation don't drift apart the way §1.1/§10 did before this review).
- Confirm all Phase 0 table cells are filled in before merging Phase 1 code.

---

## Explicit non-goals for this implementation (carried forward from design doc §13)

No degradation modeling, no predictive metrics, no corner-level/sub-sector spatial views, no cross-session comparison, no composite consistency score, no user-configurable metric constants, no live/in-progress analytics, no export/share. Any PR that introduces one of these should be flagged in review as M9 scope, not M8.