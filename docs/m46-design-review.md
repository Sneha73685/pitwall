# M46 Design Review

## Stage C — Implementation and Validation

Implemented exactly per the approved Stage B design. No deviations required a product/architecture decision.

### Exact Files Changed

```
 M frontend/src/features/session-analytics/components/DriverLapTable.test.tsx
 M frontend/src/features/session-analytics/components/DriverLapTable.tsx
?? docs/m46-design-review.md
```

Exactly the approved scope — no other file touched.

### Exact Implementation

- **`DriverLapTable.tsx`**: added `ExclusionReason` to the existing `client.ts` type import; added the module-scope `EXCLUSION_REASON_LABELS: Record<ExclusionReason, string>` constant (`yellow_flag` → `"Yellow Flag"`, `track_limits` → `"Track Limits"`) and the `exclusionLabel(reason)` helper (`null` → `"excluded"`, byte-identical to the prior fallback; a mapped reason → its label; an unmapped reason → the raw value itself, via `?? reason`). Changed exactly one render-site expression: `({lap.exclusion_reason ?? "excluded"})` → `({exclusionLabel(lap.exclusion_reason)})`. The tag's outer gating condition, `data-testid`, and every other column are untouched.
- **`DriverLapTable.test.tsx`**: added `ExclusionReason` to the type import. Updated 3 existing assertions' expected text (`yellow_flag` and `track_limits` cases, both the valid-lap and the invalid-lap-with-yellow-flag case) from the raw machine values to the new humanized labels. Left the `null`-exclusion-reason and the `is_valid=false`/`exclusion_reason=null` (`(excluded)`) tests completely unchanged, since neither's expected behavior or text changed. Added one new test for the unmapped-value fallback, using a type-asserted `"safety_car" as ExclusionReason` to simulate a hypothetical frontend/backend version skew.

### Test Results

- Targeted (`DriverLapTable.test.tsx`): **6 passed** (was 5 pre-M46 — exactly +1 net new: 3 updated in place, 2 unchanged, 1 truly new).
- Full frontend suite: **581 passed** across 86 files (was 580 pre-M46 — exactly +1, matching the targeted-file delta, zero regressions elsewhere).

### Static-Check Results

- `tsc -b --noEmit`: clean. (The `Record<ExclusionReason, string>` literal's own compile-time exhaustiveness check — anticipated in Stage B §3/§13 — passed silently, confirming both keys are present and correctly spelled.)
- `eslint .`: clean.
- `prettier --check .`: one formatting issue found in the newly-edited test file on the first pass (line-length in the new fallback test's `lap({...})` call), fixed via `prettier --write` on that file, re-verified clean. Remaining warnings are the pre-existing gitignored `dist/` build artifacts only (3 files), unrelated and present in every prior audit's baseline.
- `git diff --check`: clean.

### Presentation-Only Confirmation

Inspected the complete diff directly (reproduced in full during this stage, not summarized from memory): exactly 2 files changed, totaling 40 insertions / 6 deletions. The only production-code change is: one new type import, one new module-scope constant, one new helper function, and one render-site expression swap. No JSX structure, no gating condition, no `data-testid`, no CSS class, and no other table column was touched. `Lap.exclusion_reason`'s value, `is_valid`, `classify_lap()`, and every backend/pipeline file are completely absent from the diff — confirmed genuinely presentation-only, not merely asserted.

### Safety Confirmation

- No ingestion or backfill was run — this stage performed no pipeline invocation of any kind.
- No PostgreSQL or Parquet writes occurred — no repository/database code was touched or executed for writing.
- `data/` — zero diff, confirmed via `git diff -- data/` and `git status --short -- data/`.
- `docs/m9-design-review.md` — zero diff, confirmed.
- No backend, pipeline, `frontend/src/api/client.ts`, or dependency file (`pyproject.toml`/`package.json`/`package-lock.json`/`uv.lock`) changed — confirmed via `git diff --stat` scoped to each.
- `DriverLapTable.module.css` — zero diff, confirmed (no new CSS class was needed, per the Stage B decision).
- No other frontend feature/page touched — confirmed, only the two `session-analytics/components/DriverLapTable.*` files appear in the diff.

### Deviations from Stage B

None. Implementation matches the approved design exactly: same constant name, same two labels, same fallback behavior for both `null` and unmapped values, same single render-site change, same test matrix (6 cases, 3 updated in place + 2 unchanged + 1 new, exactly as designed).

### Final Git Status

```
 M frontend/src/features/session-analytics/components/DriverLapTable.test.tsx
 M frontend/src/features/session-analytics/components/DriverLapTable.tsx
?? docs/m46-design-review.md
```

Nothing staged, nothing committed, nothing pushed. `HEAD == origin/main == 2f790313761310727dca268183a90f82f2ec948e` (unchanged throughout Stage C).

**Stage C complete. Stopping here per instruction. Not performing any git operation.**

---

## Stage B — Implementation Design

**Baseline at start:** `HEAD == origin/main == 2f790313761310727dca268183a90f82f2ec948e`, working tree clean except `docs/m46-design-review.md` (untracked, this file), nothing staged, `docs/m9-design-review.md` zero diff.

### 1. Root-Cause Confirmation

Read `frontend/src/features/session-analytics/components/DriverLapTable.tsx` in full, fresh (not trusted from Stage A's own carried-over note):

```tsx
{(!lap.is_valid || lap.exclusion_reason !== null) && (
  <span data-testid={`lap-excluded-${lap.lap_number}`} className={styles.excludedTag}>
    {" "}
    ({lap.exclusion_reason ?? "excluded"})
  </span>
)}
```

Confirmed exact current behavior for every reachable state:

| `is_valid` | `exclusion_reason` | Current rendered text |
|---|---|---|
| `true` | `null` | tag absent (condition false) |
| `true` | `"yellow_flag"` | `(yellow_flag)` |
| `true` | `"track_limits"` | `(track_limits)` |
| `false` | `null` | `(excluded)` |
| `false` | `"yellow_flag"` or `"track_limits"` | the specific raw reason (same as the `true` row above — `is_valid` doesn't change which text is chosen, only whether the tag can appear at all) |

`frontend/src/api/client.ts:283` — `ExclusionReason` is already a closed type: `export type ExclusionReason = "yellow_flag" | "track_limits";`, and `DriverLapMetrics.exclusion_reason: ExclusionReason | null` (line 289). Confirmed: exactly 2 known machine values today, matching the backend's `filtering.py`'s `Literal["yellow_flag", "track_limits"]` exactly (re-confirmed in Stage A, unchanged).

**Root cause confirmed exactly as Stage A described**: this is a pure presentation gap. The data is correct, typed, and already reaches the component; only the displayed text is unhumanized.

### 2. Existing Architectural Precedent

Checked directly for existing label-mapping conventions before deciding an approach:

- `frontend/src/features/lap-comparison/ComparisonPage.tsx:20-31` (M45) and `frontend/src/features/stint-comparison/StintComparisonPage.tsx:16-20` (M15) both use an identical shape: a module-scope `Record<Code, string>` constant, consulted at render time, no shared/imported label-mapping utility between them (each page owns its own map).
- Grepped the whole frontend for any generic string-humanization helper (`humanize`, `toTitleCase`, `snakeToTitle`, `capitalize`) — **none exists**. Every prior instance of this exact problem (M45, M15) was solved with its own small local map, never a shared utility.
- Grepped for any existing `yellow_flag`/`track_limits` label text elsewhere in the frontend — found only M45's own `WARNING_LABELS` entries (`"Lap A: affected by yellow flag"`, `"Lap B: time deleted for track limits"`, etc.), which are full sentences sized for a warning banner, not a compact inline tag — not directly reusable verbatim, but a useful terminology anchor ("yellow flag", "track limits" as the human phrases) to stay consistent with.

**Decision: a small local `Record<ExclusionReason, string>` constant, defined at module scope inside `DriverLapTable.tsx` itself.** This is not a new pattern — it is the third instance of an already-twice-proven convention (M15, M45), and per Stage A's own explicit instruction ("do not manufacture reuse merely for deduplication"), extracting a shared cross-page label-mapping utility now, for a third small and context-specific map, would be premature abstraction the codebase has deliberately avoided twice already. **No new global formatting system is introduced or required.**

### 3. Exact Rendering / Design Decision

Keep the existing `.excludedTag` span, its CSS, its `data-testid`, and its outer gating condition (`!lap.is_valid || lap.exclusion_reason !== null`) **entirely unchanged** — only the text computation inside the parentheses changes. A small local helper function resolves the display text:

```tsx
const EXCLUSION_REASON_LABELS: Record<ExclusionReason, string> = {
  yellow_flag: "Yellow Flag",
  track_limits: "Track Limits",
};

function exclusionLabel(reason: ExclusionReason | null): string {
  if (reason === null) return "excluded";
  return EXCLUSION_REASON_LABELS[reason] ?? reason;
}
```

Render site changes from `({lap.exclusion_reason ?? "excluded"})` to `({exclusionLabel(lap.exclusion_reason)})` — the only line touched in the JSX itself.

### 4. Exact Label Mapping

| Machine value (`ExclusionReason`) | User-facing label |
|---|---|
| `"yellow_flag"` | `Yellow Flag` |
| `"track_limits"` | `Track Limits` |

Title Case, short, matching the compact inline-tag context (unlike M45's full-sentence banner text, which has room for a longer phrase) while staying in the same vocabulary ("yellow flag", "track limits") M45 already established for the equivalent backend concept, so a user sees consistent terminology across the app's two exclusion-aware surfaces.

### 5. Fallback Behavior

- **`exclusion_reason === null` (pure telemetry-inaccuracy exclusion, `is_valid === false`)**: renders exactly `(excluded)`, lowercase, **byte-identical to current behavior** — deliberately not re-cased to match the two Title Case labels, per the explicit instruction to preserve this exact existing behavior rather than harmonize it. This is a conscious, disciplined choice: presentation-only means changing only what was asked to change.
- **An unrecognized/future `exclusion_reason` value** (a hypothetical third backend value the frontend `ExclusionReason` type hasn't been updated to include yet — the same "type/runtime can diverge" risk `client.ts`'s own doc comments have repeatedly flagged elsewhere in this codebase): `EXCLUSION_REASON_LABELS[reason] ?? reason` falls back to displaying the **raw value itself** — i.e., exactly today's pre-M46 behavior for every value. This guarantees the component can never crash or silently drop a lap for an unmapped reason; worst case, it degrades gracefully to the current, already-shipped, already-safe display.

### 6. Test Matrix

Extends the existing `DriverLapTable.test.tsx` (existing `lap(overrides)` fixture helper, existing `data-testid` + `toHaveTextContent` assertion style) — no new test file, no new fixture convention. **Four of the five existing tests need their expected text updated** (not just extended) since they currently assert the pre-M46 raw text; this is called out explicitly, not silently folded into "add tests":

| # | Case | Change to existing test | Expected text |
|---|---|---|---|
| 1 | `yellow_flag` renders its human-readable label | Update existing "renders the exclusion tag for a valid lap with a yellow-flag exclusion reason" assertion | `(Yellow Flag)` (was `(yellow_flag)`) |
| 2 | `track_limits` renders its human-readable label | Update existing "renders the exclusion tag for a valid lap with a track-limits exclusion reason" assertion | `(Track Limits)` (was `(track_limits)`) |
| 3 | `null` exclusion reason preserves current behavior | Existing "does not render the exclusion tag for a valid lap with no exclusion reason" — **unchanged**, no text to update (asserts absence) | tag absent |
| 4 | `is_valid=false`, `exclusion_reason=null` preserves `(excluded)` | Existing "renders the exclusion tag for an invalid lap with no exclusion reason" — **unchanged**, text is already `(excluded)` and stays that way | `(excluded)` |
| 5 | Existing "invalid lap that also has a yellow-flag exclusion reason" | Update expected text | `(Yellow Flag)` (was `(yellow_flag)`) |
| 6 | Unknown/future exclusion value doesn't disappear or crash | **New test** — pass an out-of-union string via a type assertion (`"safety_car" as ExclusionReason`, mirroring how a real frontend/backend version-skew would actually present itself: a value the current `ExclusionReason` type doesn't know about yet) | `(safety_car)` — the raw value, unchanged, proving the fallback path |
| 7 | Existing lap-table rendering remains unaffected | No new test needed — every other column's assertions are absent from all 6 cases above and were never touched, so their correctness is unchanged by construction, not by a new assertion |

### 7. Exact Stage C File List

Determined from the actual repository, not assumed:

**Definitely modified:**
- `frontend/src/features/session-analytics/components/DriverLapTable.tsx` — add `EXCLUSION_REASON_LABELS` + `exclusionLabel()`, change the one render-site expression.
- `frontend/src/features/session-analytics/components/DriverLapTable.test.tsx` — update 3 existing assertions (§6 rows 1, 2, 5), add 1 new test (§6 row 6); rows 3 and 4 need no edit.

**Explicitly untouched:**
- `frontend/src/features/session-analytics/components/DriverLapTable.module.css` — `.excludedTag`'s styling is unchanged; no new class needed (confirmed: the existing plain colored-text style, not `StatusChip`, is DriverLapTable's own established convention, and Stage A's instruction not to manufacture reuse applies here too — no reason to switch to `StatusChip` for this table).
- `frontend/src/api/client.ts` — `ExclusionReason`/`DriverLapMetrics` already correctly typed; no change needed.
- `backend/**`, `pipeline/**` — no data/schema/API-contract implication anywhere in this design.
- Every other frontend feature/page — this change is scoped to exactly one component.
- `data/`, `docs/data-model.md`, `docs/api-model.md`, `docs/m9-design-review.md` — no implication.
- `docs/backlog.md`, `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md` — no reconciliation, per non-goals.
- Dependency files — no dependency change.
- The separately-identified stale `frontend/src/api/client.ts:192-193` comment (a different file's different, unrelated issue, found in Stage A §2) — deliberately kept out per the single-purpose-milestone convention this design explicitly preserves.

### 8. Accessibility Considerations

No change to the accessibility profile: the tag remains a plain `<span>` with always-visible text (never color-only — `.excludedTag`'s `color: var(--pw-status-error)` is paired with real text both before and after this change), no ARIA attribute added or removed, matching this exact component's own pre-existing accessibility posture (a static data-table cell, not an alert or live region). Humanizing the text is, if anything, a small accessibility improvement — a screen reader announcing "Yellow Flag" is more informative than announcing "yellow underscore flag" (or however "yellow_flag" would be read aloud), a positive side effect of this change, not a design goal requiring new work.

### 9. Performance Impact

None. `exclusionLabel()` is a single object-property lookup (`EXCLUSION_REASON_LABELS[reason]`) with a trivial fallback, evaluated per already-rendered row — no new data, no new fetch, no new computation of any meaningful cost, identical in kind to `formatMs()`/`formatPct()`, the two formatting helpers this exact file already calls once per row today.

### 10. Backward Compatibility

The API contract (`exclusion_reason: ExclusionReason | null`) is completely unchanged — this is a pure frontend-rendering change over an already-correct, already-typed field. Every currently-stored real lap (per repeated Stage A confirmation across M43–M46: 0/704 with `deleted` populated, and the large majority pre-M36 with `track_status` absent) has `exclusion_reason === null` today, so for the overwhelming majority of real data this change has zero visible effect at all — the tag simply doesn't render, exactly as before. For the subset of laps that do carry a resolved `exclusion_reason` once backfilled or freshly ingested, the only change is the displayed text, not whether the tag appears or what condition triggers it.

### 11. Explicit Confirmation: Presentation-Only

- `Lap.exclusion_reason`, the API contract, `classify_lap()`, `filter_valid_laps()`/`filter_for_aggregate_stats()`, and every backend file are untouched — confirmed by the file list (§7): zero backend/pipeline files appear anywhere in this design.
- `is_valid`'s value and the tag's outer gating condition (`!lap.is_valid || lap.exclusion_reason !== null`) are byte-for-byte unchanged — only the text inside the parentheses changes.
- No precedence logic (track-limits over yellow-flag) is touched, reimplemented, or even read by this change — the component still receives whatever single, already-resolved `exclusion_reason` the backend sends, exactly as before.

### 12. Risks and Rollback

**Risks**: very low. The only real risk is a typo in the two label strings or a missed test-assertion update — both are caught immediately by the targeted test run (§6) before any commit. The `?? reason` fallback (§5) eliminates the only category of risk that would matter (a crash or blank render on an unexpected value).

**Rollback**: trivial — this is a two-file, single-component, presentation-only diff with no data or contract dependency. Reverting the commit fully restores the exact prior behavior with no follow-up cleanup required anywhere else (no migration, no cache invalidation, no other component depends on the new label text).

### 13. Validation Plan

- Targeted: `npx vitest run DriverLapTable.test.tsx` (or the equivalent path-scoped run), covering all 6 cases in §6.
- Full frontend suite — expect the established baseline (580 passed pre-M46) plus 1 net-new test (3 updated, not added; 1 truly new), zero regressions elsewhere.
- `tsc -b --noEmit` — the `Record<ExclusionReason, string>` literal gives a free compile-time exhaustiveness check against `ExclusionReason`'s 2 known values, the same mechanism M45's `WARNING_LABELS` already relies on.
- `eslint .`, `prettier --check .` — full frontend scope.
- `git diff --check`.
- **No backend/pipeline suite required** — confirmed zero files touched in either workspace (§7), matching M45's own precedent of skipping ceremony suites when genuinely nothing there changed.

### Deviations from Stage A

None material. Stage A's candidate-level scope (§16 of Stage A) anticipated exactly this shape — a `Record<ExclusionReason, string>`-style mapping mirroring `WARNING_LABELS`'s now-twice-proven pattern — and Stage B confirms it directly against source rather than assuming it. The one refinement not explicitly anticipated in Stage A: the fallback needs `?? reason`, not just a null-check, to safely handle a hypothetical future/unmapped value without crashing — a natural consequence of Stage A's own test-matrix requirement (#5), not a new decision.

### Stage B Stop-Condition Verification

- Only untracked/modified file: `docs/m46-design-review.md` — confirmed.
- No implementation file changed — confirmed (all source reads this stage were read-only `Read`/`grep`/`Bash` calls, zero edits to `DriverLapTable.tsx`, `client.ts`, or any test file).
- Nothing staged — confirmed.
- Nothing committed, nothing pushed.
- `data/` untouched — confirmed.
- No ingestion, no backfill, no database, no Parquet operations — none performed.
- `docs/m9-design-review.md` untouched — confirmed.
- `HEAD == origin/main == 2f790313761310727dca268183a90f82f2ec948e` — confirmed.

**Stage B complete. Stopping here per instruction. Not proceeding to Stage C.**

---

## Stage A — Product / Architecture Audit

**Baseline at start:** `HEAD == origin/main == 2f790313761310727dca268183a90f82f2ec948e` (the M45 commit — "feat(m45): render lap comparison warnings"), working tree clean, nothing staged, `docs/m9-design-review.md` zero diff, `data/` zero diff, `docs/m46-design-review.md` did not exist. Verified by direct `git` commands before any research began.

Conducted via four parallel read-only investigations: (1) M34–M45 capability chain + M43/M45 warning-flow + session-analytics/tyre-performance exclusion correctness, (2) historical backfill + qualifying reconfirmation + unused-FastF1-data sweep, (3) sibling-consumer correctness-gap hunt + frontend surface audit, (4) architecture/tech-debt + dependency/security + test-quality + documentation state. Two findings were independently re-verified by direct source read after the forks reported, not taken on trust. This is a fresh, evidence-first audit — no prior recommendation was assumed correct going in.

---

### 1. M34–M45 Regression / Capability Chain

Every milestone traced against actual current production source, not design-doc summaries. **No regression found anywhere in the chain** — M34 (classification), M35 (position), M36 (track-status exclusion), M37 (exclusion rendering), M38 (backfill, zero diff since shipping), M40 (track-limits exclusion, correct precedence), M41 (tyre/stint aggregate exclusion), M42 (Q1/Q2/Q3), M43 (lap-comparison warnings, `collect_warnings()` correctly imports `classify_lap`), M45 (warning UI, `WARNING_LABELS` has all 7 keys, render gate intact) — all confirmed present and correctly wired.

### 2. M43/M45 Lap-Comparison Warning Flow, Source to Screen

Traced fresh, full chain: FastF1's `TrackStatus`/`Deleted` columns → `normalize.py` → `Lap.track_status`/`deleted` → `filtering.py`'s `classify_lap()` → `validation.py`'s `collect_warnings()` → `WarningCode`/`ComparisonWarning` → route → `client.ts`'s typed response → `ComparisonPage.tsx`'s `WARNING_LABELS` render. Every link intact and correct.

**One concrete, fresh finding, independently re-verified by direct read (not just from the research fork):** `frontend/src/api/client.ts:192-193`'s comment on the `WarningCode` type still reads *"Not rendered in the UI yet — no consumer currently reads any code besides different_circuit."* This is now **false** — M45 shipped exactly that rendering. M45's own Stage B correctly decided the `WarningCode` *type* needed no change (confirmed still true), but the explanatory *comment* attached to it was never updated when the surrounding fact changed. A stale engineering comment, not a functional defect — flagged for the candidate matrix, not a standalone recommendation on its own (too small to be milestone-sized by itself).

### 3. Session-Analytics Exclusion Correctness

`filtering.py` and `aggregation.py` re-read in full. `classify_lap()`'s precedence (track-limits over yellow-flag) correct and unchanged; `is_valid` still derived solely from `is_accurate`; `filter_valid_laps()`/`filter_for_aggregate_stats()` remain correctly distinct. `aggregation.py` is confirmed the **only** file in `session_analytics/` importing any of `classify_lap`/`filter_valid_laps`/`filter_for_aggregate_stats` — `consistency.py`, `driving_style.py`, `theoretical_best.py` have zero independent lap-quality logic, safe by construction. **No defect found.**

### 4. Tyre-Performance Aggregate Eligibility Correctness

`stint_eligibility.py` and every consumer (`orchestration.py`, `stint_consistency.py`, `compound_aggregation.py`, `driver_compound_comparison.py`, `strategy_summary.py`, `boundary_laps.py`, `stint_join.py`) re-read. `trend_eligible_positions()` and `valid_positions()` remain correctly distinct and correctly consumed everywhere — no reimplemented filter found anywhere. **No defect found.**

### 5. Historical Backfill Coverage and Threshold Check

Re-counted directly: 704 total sessions, unchanged breakdown; M38's 334-session population still matches on-disk exactly, `backfill_m38.py` zero diff. M40's `deleted` coverage: still **0/704**. M42's `q1_seconds` coverage: still **0/164**. M43/M44/M45 confirmed to have zero historical-data implications.

**This is now the third consecutive audit cycle (M44, M45, M46) with this exact question asked and this exact evidence found.** Honest assessment, not a repeat of "no new evidence": the underlying facts are exactly as compelling as at M44's audit — no more, no less. Stability across cycles does not, by itself, manufacture new urgency; it means nothing has changed. The only things that would genuinely strengthen this case are (a) a new consumer shipping that actually depends on the unbackfilled fields — none has, both M40's and M42's fields remain narrowly-scoped or single-consumer — or (b) the deferral count reaching this project's own tolerance for a *different* recurring-candidate category (documentation reconciliation tolerated 2–5 cycles before triggering; backfill is at 3). Continued deferral is a real prioritization cost worth naming honestly, but it is not itself new evidence this cycle.

### 6. Qualifying Q1/Q2/Q3 Correctness and Historical Coverage

Fully reconfirmed fresh: no session-type gating, no Sprint-Qualifying special-casing, `.get()`-based nullable-safe deserialization, three independently-gated spans in `DriverSelectPage.tsx`. Historical coverage: 0/164 (§5). **No regression, no gap.**

### 7. Remaining Unused FastF1 Signals

`weather_data`/`race_control_messages`: still zero real references anywhere. `results.Position`/`Time`/`Laps`: still unused. FastF1 version unchanged (3.8.3, `uv.lock` pin confirmed). Previously-catalogued unused `SessionResults` columns list unchanged.

**Genuinely new finding this cycle**: prior audits focused almost entirely on `Results`-level columns; this cycle's cross-check of the `Laps` DataFrame's own columns against `normalize_laps()`'s actual read list surfaced fields never previously catalogued:
- `SpeedI1`/`SpeedI2`/`SpeedFL`/`SpeedST` (speed-trap readings) — genuinely product-relevant, but would need a new `Lap` field plus a new consuming UI surface, comparable complexity to M42 but with zero current consuming-page plan.
- **`FreshTyre`** (bool — whether the tyre was fresh at stint start) — unused, and structurally cheaper than any previously-catalogued candidate: it sits on the exact same already-loaded `Laps` row as the already-shipped, already-consumed `Compound`/`TyreLife` fields, meaning it would extend an **already-proven, already-consumed surface** (tyre-performance pages) rather than requiring a new one — a meaningfully different position than `results.Time`, which has always needed a wholly new display concept.
- Other unused `Laps` fields (`Time`, per-sector session times, `Team`, lap-start timestamps) — lower product relevance, redundant with data sourced elsewhere or internal bookkeeping.

Zero TODO/FIXME/XXX markers repo-wide, unchanged.

### 8. Sibling-Consumer Correctness Gap Hunt

This cycle's most important negative result. Enumerated **every** `*Warning*`-shaped backend type (exactly 3 exist: `WarningCode`/`ComparisonWarning`, `SessionAnalyticsWarningCode`/`SessionAnalyticsWarning`, `StintComparisonWarningCode`/`StintComparisonWarning`) and checked each for a frontend consumer:

- `WarningCode` (lap-comparison): rendered since M45. Confirmed.
- `StintComparisonWarningCode`: rendered since M15 (`StintComparisonPage.tsx`). Confirmed still true.
- **`SessionAnalyticsWarningCode`/`insufficient_laps`**: a specific hypothesis was raised and rigorously investigated this cycle — is this the same "computed but never rendered" shape M45 just fixed for lap-comparison? **The hypothesis is false.** `backend/app/api/session_analytics.py:43-91` triggers it at `valid_lap_count == 1`; `frontend/src/features/session-analytics/SessionAnalyticsPage.tsx:81-91` **already renders it**, in a dedicated "Warnings" card. Fully wired, both session-wide and per-driver. (One minor, non-milestone-worthy note: `DriverDrillDown.tsx` doesn't independently re-display the same warning in its own per-driver panel — but the identical information is already visible elsewhere on the same page, so this is a redundant-path omission, not an invisibility defect.)

Also re-checked: every `Lap.compound` consumer (extensively wired across 15 `.tsx` files in the tyre-performance domain; its absence from `DriverLapTable.tsx` is a deliberate, documented M8-era design decision, not an oversight); every `Driver.q1_seconds`/`q2_seconds`/`q3_seconds` consumer (still exactly one, `DriverSelectPage.tsx`, unchanged).

**No new "computed but silently ignored/invisible" defect was found anywhere, in either the M40/M41/M43 shape (backend consumer ignores it) or the M45 shape (frontend never renders it).** This is the first cycle in the series where a *specific, concrete hypothesis* for this exact pattern was raised and then refuted by direct evidence, rather than a general sweep finding nothing.

### 9. Frontend Surface Audit

Backend: 22 routes across 11 registered routers — unchanged count, no orphan or duplicate found in what was checked. Frontend: 17 routes — unchanged count. No dead link found in the routes spot-checked. (Note: this pass did not do an exhaustive route-by-route cross-check of every single `client.ts` caller against every route; nothing was found wanting in what was checked, but this is not claimed as a 100%-exhaustive clean bill — no evidence of a problem, but not a fully closed search either.)

### 10. Architecture / Technical Debt

All duplication confirmed stable within the established rule-of-three threshold (`_optional_*`: 2, `classify_lap` cross-service imports: 2 reuse-via-import, `_to_stint_pace`: 2). No import cycle, no new API-boundary violation, no new N+1/N², no new Zustand state inconsistency (M45 added zero new state). CI/Docker Python-version mismatch confirmed still present, unfixed, still tracked in `docs/backlog.md` — 7 entries, zero new ones.

### 11. Dependencies / Security, Test / Quality State

`npm audit`: 0 vulnerabilities. Python deps: only minor/patch drift, no CVE indicator (`pip-audit` still unavailable in this sandbox). Fresh test run, exact counts, **all matching the established baseline exactly**: pipeline 172 passed/15 errors (Postgres-only), backend 405 passed/1 failed/15 errors (Postgres-only), frontend 580 passed across 86 files. All static checks clean. **Zero real regressions.**

### 12. Documentation / Reconciliation State

README's "Current milestone" line still correctly reads M43 (M44 and M45 both correctly not self-naming, per the established convention). CHANGELOG has zero M45 entry — correct/expected, matching how M40–M43 were each only added retroactively by M44's own reconciliation pass, never by their own commits. `docs/prd.md` §3a still ends at M43, correctly. **Unreconciled-milestone count: 2** (M44's own missing self-entry, plus M45) — well below this project's historical 2–5 milestone reconciliation-trigger range (and M39 itself waited until 5). **Documentation reconciliation remains clearly premature.**

The one stale item found is the `client.ts` comment (§2), which is a source-comment accuracy issue, not a documentation-reconciliation-scope item (it's inside application source, not one of the four reconciliation-scope docs).

### 13. Performance / Backlog

No fresh evidence anywhere. `get_telemetry`'s per-call cost: unchanged assessment, no new evidence (no telemetry-heavy work shipped since). Bundle size: 880.31 kB JS (up ~0.6 kB from 879.71 kB, consistent with M45's small additive change) — informational only, no regression threshold exists to compare against.

---

### 14. Candidate Matrix

| Candidate | Category | Evidence strength | User impact | Correctness impact | Complexity | Risk | Milestone size | Prior deferrals | New evidence this cycle | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| **Humanize `DriverLapTable`'s exclusion-reason display** | UI completion (M37/M45-shaped) | Real, independently re-verified fresh this cycle (not just carried over) — `DriverLapTable.tsx:48` still renders the raw `"yellow_flag"`/`"track_limits"` string, not a humanized label | Low-medium — objectively worse presentation than a humanized label, though the underlying information is present and correct | None (not a wrong-answer defect) | Very low — reuses the exact `Record<Code, string>` labeling pattern this project has now built twice (M37, M45) | Very low | Small | Flagged (not recommended) at M45's own audit | Re-confirmed still real and unaddressed | **Yes — see §16** |
| `FreshTyre` field (extends tyre-performance) | Product feature (data completeness) | New this cycle — genuinely uncatalogued before, cheaper than any prior unused-data candidate since it extends an already-consumed surface | Modest — a real, if narrow, analytical-completeness gap (can't currently distinguish a stint that started on scrubbed tyres) | None | Low (proven `Compound`/`TyreLife`-adjacent pattern) | Low | Small-medium | None — brand new | Yes, but weaker than the UI-completion candidate: no demand evidence, first cycle raised, not yet the standing best alternative across multiple cycles the way M42 was before it was picked | Considered, not recommended this cycle — see §15 for why |
| Stale `client.ts` comment fix | Documentation/comment accuracy | Real, concrete, independently re-verified | None (comment-only) | None | Trivial | None | Too small to be its own milestone | New this cycle | Not recommended as M46 on its own — too small to justify the full Stage A/B/C process; noted as a fast, low-risk item worth fixing whenever convenient, not manufacturing a milestone around |
| Historical backfill (M40 `deleted`/M42 `q1/q2/q3_seconds`) | Data completeness | Strong but static — same 0/704, 0/164 gaps, stable across 3 consecutive audit cycles now | Medium | Medium | Medium-high (real Parquet writes) | Medium | Medium-large | Flagged M44/M45, unchanged | No — stable, not fresher, honestly assessed in §5 | Genuinely justified whenever prioritized, but still not this cycle's strongest evidence |
| Speed-trap fields (`SpeedI1/I2/FL/ST`) | Product feature | New this cycle, real data | Unknown/speculative | None | Medium-high — needs a new field AND a new consuming surface | Medium | Medium | None — brand new | No demand evidence, and no existing surface to extend (unlike `FreshTyre`) | Not justified |
| Weather | Product feature | None new | Unknown/speculative | None | High — full-stack net-new | Medium | Large | Repeatedly deferred, now 7 consecutive audits | No | Not justified |
| Race-control timeline | Product feature | None new | Unknown/speculative | None | High — full-stack net-new | Medium | Large | Repeatedly deferred, now 7 consecutive audits | No | Not justified |
| Documentation reconciliation | Documentation | None — only 2 unreconciled milestones, below historical trigger range | — | — | — | — | — | — | No | Clearly premature |
| Do nothing / portfolio finalization | — | Genuinely worth naming: 3 consecutive cycles (M44, M45, M46) with zero new correctness defects, and this cycle specifically found zero UI-completion gaps after a rigorous, specific hypothesis-driven search | — | — | — | — | — | — | This cycle's own negative results | A legitimate, defensible alternative reading of the same evidence — see §15 |

### 15. Special Decision Questions

**Was a real correctness/completion defect comparable to M40/M41/M43/M45 found?** No — and this was tested rigorously, not just asserted. A specific, concrete hypothesis (`insufficient_laps` following the same shape M45 just fixed) was raised and directly refuted by evidence. This is the first cycle in the M40→M46 sequence where zero defects of any kind (backend-consumer-ignores-it, or frontend-never-renders-it) were found anywhere.

**Should M46 be correctness/hardening, a new capability, historical-data completion, documentation reconciliation, or finalization?**

This is genuinely the closest call of the entire audit series so far, and it deserves an honest answer rather than a forced one. The strongest candidate found this cycle — humanizing `DriverLapTable`'s exclusion display — is real but is the *weakest-evidenced* milestone in this entire M40–M46 sequence: it has no correctness impact, no demand signal, and had already been explicitly considered-and-deferred once (at M45) as too minor to be a primary pick on its own. Every other candidate is either no-fresher (backfill), no-demand (`FreshTyre`, speed-trap fields), too-small-to-be-a-milestone (the comment fix), or clearly-premature (documentation). **Portfolio-finalization is a legitimate, defensible reading of this same evidence** — three consecutive rigorous audit cycles finding progressively less to fix is exactly the pattern that should eventually lead there, and this cycle's specific, hypothesis-driven negative result (§8) is meaningfully stronger evidence for "the codebase is in good shape" than a general "found nothing" would be.

Given that, the honest characterization is: **the project is now firmly in hardening/completion mode, at or very near the point of diminishing returns for further milestone-sized work.** M46 is recommended as a small, final completion item (§16) precisely because it is the last concrete, real, already-once-flagged loose end from this exact "shipped but not fully presented" pattern that has been this series' most reliable and legitimate category of finding (M37, M45, now this) — not because it clears a high bar on its own merits. If the answer preferred is finalization instead, that is an equally well-supported reading of the identical evidence gathered here, and should be treated as a live option, not a fallback.

**Has historical backfill reached a point where another dedicated pass is now justified?** Not fresher this cycle (§5) — the case is real but static, and continued stability isn't new urgency.

**Is `results.Time`/`Position`/`Laps`, or the newly-found `FreshTyre`/speed-trap fields, worth promoting despite the absence of current demand?** No for the first two (unchanged verdict) and no for speed-trap fields (no existing surface to extend, no demand). `FreshTyre` is the closest any unused-data candidate has come to clearing the bar, but "cheaper than the alternatives" still isn't "justified" on its own — it hasn't yet earned multiple-cycle standing-candidate status the way M42 had before it was picked.

### 16. Recommendation

**Recommend M46 = humanize `DriverLapTable`'s exclusion-reason display**, with the explicit, honest caveat (§15) that this is the weakest-evidenced pick in the M40–M46 series, and that portfolio-finalization is an equally legitimate alternative reading of this cycle's evidence.

**Why this beats the alternatives, given the evidence available:** it is the only candidate that is simultaneously real (independently re-verified fresh, not carried over on trust), concrete (an exact file:line, an exact current behavior), previously vetted (explicitly considered and correctly deferred once already, at M45, not a first-cycle guess), and in the one category (shipped-but-underpresented) that has produced every genuinely justified milestone in this series apart from the pure backend-correctness fixes. `FreshTyre` is newer and cheaper to build, but has no comparable track record and no demand signal — the same "cheap is not evidence of value" standard this series has consistently applied to `results.Time` applies here too, just less severely. The stale comment is real but categorically too small to be its own milestone. Backfill and documentation are both explicitly, honestly assessed as not-fresher-this-cycle.

**Candidate-level scope:**
- **Likely files/layers**: `frontend/src/features/session-analytics/components/DriverLapTable.tsx` (the rendering); possibly its own CSS module if a label/tag styling adjustment is needed; its test file, extended.
- **Expected tests**: extend `DriverLapTable.test.tsx` (or equivalent) with cases for each humanized label (`yellow_flag` → a readable string, `track_limits` → a readable string) and confirm the fallback `"excluded"` case (pure telemetry-inaccuracy, no `exclusion_reason`) is unaffected.
- **API/data implications**: none — this is a pure frontend presentation change over an already-correct, already-typed field (`exclusion_reason`). No backend, schema, or API-contract change.
- **Explicit non-goals**: no backend change; no change to `classify_lap()`/exclusion semantics; no change to any other table/page; no bundling of the separately-identified stale `client.ts` comment fix (different file, different feature, kept out per this project's own established single-purpose-milestone convention); no new data field (`FreshTyre` or otherwise); no historical backfill; no documentation reconciliation.
- **Validation approach**: targeted + full frontend test suite; `tsc`/`eslint`/`prettier`; no backend/pipeline suite needed if genuinely zero files change there (to be confirmed in Stage B/C, matching M45's own precedent of skipping ceremony suites when nothing changed).
- **Major risks**: very low. The only real design question for Stage B is the exact label wording and whether a `Record<ExclusionReason, string>`-style mapping (mirroring `WARNING_LABELS`'s now-twice-proven pattern) is the right shape here too — a small, low-risk decision, not an open architectural one.

---

### Stop-Condition Verification

Re-verified after completing the audit and before stopping:

- Only new/untracked file: `docs/m46-design-review.md` — confirmed.
- No source files modified — confirmed (the two direct-source-reads performed in this stage, for `DriverLapTable.tsx` and `client.ts`, were read-only `grep`/`Read` calls, no edits).
- Nothing staged — confirmed.
- Nothing committed, nothing pushed — no `git commit`/`git push` invoked at any point in this stage.
- `data/` untouched — confirmed (read-only `pd.read_parquet` inspection only, no writes, performed by research forks).
- No ingestion, no backfill, no PostgreSQL writes, no Parquet writes — none performed.
- No dependency changes — none performed (`npm audit`/`uv pip list --outdated` are read-only).
- `docs/m9-design-review.md` untouched — confirmed.
- `HEAD == origin/main == 2f790313761310727dca268183a90f82f2ec948e` — confirmed at both start and end of this stage.

**Stage A complete. Stopping here per instruction. Not proceeding to Stage B.**
