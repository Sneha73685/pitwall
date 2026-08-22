# M45 Design Review

## Stage C — Lap-Comparison Warning UI Implementation

Implemented exactly per the approved Stage B design. No deviations required a product/architecture decision.

### Exact Implementation

- **`frontend/src/features/lap-comparison/ComparisonPage.tsx`**: imported `StatusChip` and the `WarningCode` type; added a module-scope `WARNING_LABELS: Record<WarningCode, string>` constant with the 7 approved labels; inserted the warnings-rendering block (`{comparison.warnings.length > 0 && (<div className={styles.warnings} data-testid="lap-comparison-warnings">{comparison.warnings.map((warning) => (<StatusChip key={warning.code} tone="warning">{WARNING_LABELS[warning.code]}</StatusChip>))}</div>)}`) as the first child of the existing `{comparison && (<div className={styles.workspace}>...)}` block, immediately before `<ComparisonHeader>`. `hasCircuitMismatch`'s derivation and its existing `TrackMapDelta`-gating usage are byte-for-byte unchanged.
- **`frontend/src/features/lap-comparison/ComparisonPage.module.css`**: added `.warnings { display: flex; flex-wrap: wrap; gap: var(--pw-space-2); }`, copied verbatim from `StintComparisonPage.module.css`'s own `.warnings` class.
- **`frontend/src/features/lap-comparison/ComparisonPage.test.tsx`**: extended the existing "does not fetch track points when session A/B are at different circuits" test with one additional assertion proving the `different_circuit` label now also renders visibly, alongside its unchanged existing assertions. Added a new `describe("comparison warnings", ...)` block with: an empty-warnings case, a parameterized `it.each` covering all 6 M43 codes, and a mixed-A/B multiple-warnings case — 8 new test cases total, using the existing `sampleComparison` fixture and `client.compareLaps` mock-override pattern throughout, no new fixture or convention.

### Final File List

```
 M frontend/src/features/lap-comparison/ComparisonPage.module.css
 M frontend/src/features/lap-comparison/ComparisonPage.test.tsx
 M frontend/src/features/lap-comparison/ComparisonPage.tsx
?? docs/m45-design-review.md
```

Exactly the approved scope — confirmed via `git diff --stat -- backend/ pipeline/ frontend/src/api/client.ts` (empty) and a scan of the rest of `frontend/` for any file outside `lap-comparison/` (none found).

### Test Results

- Targeted (`ComparisonPage.test.tsx`): **27 passed** (was 19 pre-M45 — exactly +8 new cases).
- Full frontend suite: **580 passed** across 86 files (was 572 pre-M45 — exactly +8, matching the targeted-file delta, zero regressions elsewhere).

### Static-Check Results

- `tsc -b --noEmit`: clean. (The `Record<WarningCode, string>` literal's own compile-time exhaustiveness check — anticipated in Stage B §14 — passed silently, confirming all 7 keys are present and correctly spelled.)
- `eslint .`: clean.
- `prettier --check .`: one formatting issue found in the newly-written test file on the first pass (line-wrapping in the new `it.each` block), fixed via `prettier --write` on that file, re-verified clean. Remaining warnings are the pre-existing gitignored `dist/` build artifacts only (3 files), unrelated and present in every prior audit's baseline.
- `git diff --check`: clean.

### Direct Production-Call-Path Verification

Ran `collect_warnings()` directly against the real, unmodified backend code (not a mock or a re-derivation):

```
Real backend collect_warnings() output: [('yellow_flag_lap_a', 'Lap A is affected by yellow_flag.')]
```

Confirmed `warning.code.value` (`"yellow_flag_lap_a"`) matches exactly the string the new frontend `WARNING_LABELS[warning.code]` lookup indexes into — proving the existing `/laps/compare` response already contains, and the new UI path correctly consumes, the same warning codes end-to-end.

### API/Backend/Pipeline Behavior Confirmation

Confirmed unchanged: `git diff --stat -- backend/ pipeline/ frontend/src/api/client.ts` is empty. No route, model, service, or type contract touched. No backend or pipeline test suite was run, per Stage B's own validation plan (§14) — genuinely zero files changed in either workspace, so running either suite would have been ceremony, not verification.

### Backward-Compatibility Confirmation

`sampleComparison`'s default fixture (`warnings: []`) is used unmodified by every pre-existing test in the file — none of them needed updating, and all pass unchanged, confirming the new rendering block is a no-op (renders nothing) whenever `warnings` is empty, exactly as designed. The `different_circuit` test's pre-existing assertions (track-map-fetch-skipped behavior) are also unchanged and still pass, confirming no regression to that already-shipped behavior.

### Safety Confirmation

- `backend/`, `pipeline/`, `frontend/src/api/client.ts`, every other frontend feature — all zero diff, confirmed directly.
- `data/` — zero diff.
- `docs/m9-design-review.md`, `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md` — all zero diff.
- No dependency file touched.
- No ingestion, backfill, PostgreSQL write, or Parquet write performed at any point.
- Nothing staged, committed, or pushed.
- `HEAD == origin/main == 186bd64be8c437352cc40416d3e3d5ae13250235` — unchanged throughout Stage C.

### Deviations from Stage B

None. Implementation matches the approved design exactly: same placement, same wording, same component ownership (no new component file), same CSS (copied verbatim from the sibling page), same test matrix (expanded from Stage B's 9 illustrative rows into 8 concrete `it`/`it.each` cases plus one extended pre-existing assertion — a 1:1 mapping, not a scope change).

### Stage C Stop Condition — Confirmed

- Only the approved files modified/untracked: `ComparisonPage.tsx`, `ComparisonPage.module.css`, `ComparisonPage.test.tsx`, `docs/m45-design-review.md`.
- No backend/pipeline/other-frontend-feature file touched.
- Nothing staged, committed, or pushed.
- `docs/m9-design-review.md`, `data/` untouched.
- `HEAD == origin/main == 186bd64be8c437352cc40416d3e3d5ae13250235`.

**Stage C complete. Stopping here per instruction. Not performing any git operation.**

---

## Stage B — Lap-Comparison Warning UI Design

**Baseline at start:** `HEAD == origin/main == 186bd64be8c437352cc40416d3e3d5ae13250235`, working tree clean except `docs/m45-design-review.md` (untracked, this file), nothing staged, `docs/m9-design-review.md` zero diff.

### 1. Root-Cause / Call-Graph Verification

Traced directly from source, not from M43's design review:

1. `frontend/src/api/client.ts:373-380` — `compareLaps()` calls `GET /laps/compare` and returns the parsed JSON typed as `LapComparisonResponse`, which already includes `warnings: ComparisonWarning[]` (line 220).
2. `backend/app/api/laps_compare.py:159-162` — `collect_warnings(lap_a_model, lap_b_model)` is called, then `_circuit_mismatch_warning(...)` is appended if applicable; the full list is returned unmodified as `LapComparisonResponse.warnings`.
3. `backend/app/services/lap_comparison/validation.py:83-132` — `collect_warnings()` (re-read in full this stage) still imports and calls `classify_lap()`, correctly emitting all 4 M43 codes plus the 2 pre-existing accuracy codes, independently per side.
4. `backend/app/models/lap_comparison.py:56-86` — `WarningCode` (re-read in full) has exactly 7 members: `INVALID_LAP_A`, `INVALID_LAP_B`, `YELLOW_FLAG_LAP_A`, `YELLOW_FLAG_LAP_B`, `TRACK_LIMITS_LAP_A`, `TRACK_LIMITS_LAP_B`, `DIFFERENT_CIRCUIT`.
5. **The data disappears at exactly one point**: `frontend/src/features/lap-comparison/ComparisonPage.tsx:79-80` — `const hasCircuitMismatch = comparison?.warnings.some((w) => w.code === "different_circuit") ?? false;` is the **only** place `comparison.warnings` is ever read. It reduces the entire array to one boolean, used only to skip a track-geometry fetch (line 94-103) — never rendered as visible text, and the other 6 possible entries in the array are never even inspected. Nothing between the API response and the DOM discards or transforms the data incorrectly — it simply has zero consumer beyond this one narrow boolean check.

### 2. Enum / Contract Audit

- **All 7 `WarningCode` values are already known to TypeScript**: `frontend/src/api/client.ts:185-197` (re-read in full) — the type union includes `"invalid_lap_a"`, `"invalid_lap_b"`, `"different_circuit"`, and all 4 M43 values, with a comment explicitly noting *"Not rendered in the UI yet — no consumer currently reads any code besides different_circuit."* This is the exact gap confirmed.
- **`ComparisonWarning` is fully exposed**: `{ code: WarningCode; detail: string | null }` (`client.ts:199-202`), and `LapComparisonResponse.warnings: ComparisonWarning[]` is a top-level field of the object `useLapComparison` already returns and holds in state.
- **No frontend code receives-but-ignores the array** beyond the one boolean derivation above — confirmed by grep, `comparison.warnings` has exactly one reference site in the entire lap-comparison feature.
- **No exhaustive switch or rendering abstraction exists** for `WarningCode` in the lap-comparison feature today.
- **An established, directly reusable pattern exists in a sibling feature**: `frontend/src/features/stint-comparison/StintComparisonPage.tsx:16-20,161-169` (M15) already solves this exact problem for `/stints/compare`'s own `StintComparisonWarningCode` (`different_circuit`, `no_stint_data_a`, `no_stint_data_b`): a module-scope `const WARNING_LABELS: Record<StintComparisonWarningCode, string> = {...}`, rendered as `{comparison.warnings.length > 0 && (<div className={styles.warnings} data-testid="stint-comparison-warnings">{comparison.warnings.map((warning) => (<StatusChip key={warning.code} tone="warning">{WARNING_LABELS[warning.code]}</StatusChip>))}</div>)}`. This is the exact shape M45 should mirror.

**No backend semantics are duplicated by this design** — the mapping is presentation-only strings, not a reimplementation of `classify_lap()`/exclusion logic.

### 3. Current UI Audit

- Comparison response is fetched via `useLapComparison` (`frontend/src/features/lap-comparison/hooks/useLapComparison.ts`), called once in `ComparisonPage.tsx:70-77`; `comparison` is held in that hook's own state and passed down to every child component (`ComparisonHeader`, `TrackMapDelta`, `DeltaChart`, `SectorBreakdownTable`, `ChannelOverlayPanel`).
- `DIFFERENT_CIRCUIT` has exactly one existing UI treatment: the `hasCircuitMismatch` boolean (§1), which is threaded into `TrackMapDelta` as a prop to suppress track-outline rendering — never surfaced as visible text anywhere.
- `INVALID_LAP_A`/`INVALID_LAP_B` have **zero** existing UI treatment — confirmed by the same grep sweep, no component reads either code.
- **`StatusChip`** (`frontend/src/components/StatusChip.tsx`) is the existing reusable badge component: `tone: "positive" | "neutral" | "warning" | "error"`, renders `<span className={\`${styles.chip} ${styles[tone]}\`}>{children}</span>` — a plain visual pill wrapping caller-supplied text, no ARIA attributes, color paired with always-visible text (never color-only). This is exactly the "existing alert/badge pattern suitable for reuse" the task asks about.
- `ComparisonPage.module.css` (re-read in full) has `.page`, `.heading`, `.sessionPickers`, `.sessionSlot*`, `.workspace`, `.mapAndDelta` — no warnings-related class yet. `StintComparisonPage.module.css`'s sibling `.warnings` class is `{ display: flex; flex-wrap: wrap; gap: var(--pw-space-2); }` — a trivial flex-wrap row, directly portable.

### 4. UX Design

**Placement**: directly inside `ComparisonPage.tsx`'s existing `{comparison && (<div className={styles.workspace}>...)}` block, as the first child — immediately before `<ComparisonHeader ... />` — mirroring `StintComparisonPage.tsx`'s exact placement (its warnings block is the first thing rendered once `comparison` resolves, before its own `.columns` content). No new component file: `StintComparisonPage.tsx` itself doesn't extract a separate component for this, so the parallel, most-consistent choice is to inline it in `ComparisonPage.tsx` too.

**Requirements satisfied:**
- All 6 previously-invisible codes become visible (plus `DIFFERENT_CIRCUIT` gains visible text for the first time, in addition to its existing boolean-gate behavior — see §9, no behavior change to the existing gate).
- Lap A vs Lap B distinction: preserved by baking the side into each label's text (matching `WarningCode`'s own naming convention and `StintComparisonPage`'s exact precedent of doing the same for `no_stint_data_a`/`_b`).
- Invalid-telemetry vs yellow-flag vs track-limits distinction: preserved by three genuinely distinct phrasings per pair (see exact wording below).
- Multiple warnings coexist: the `.map()` over the full array renders every entry — this is automatic, not a special case, and was already proven correct by the backend's own test suite (M43's `test_collect_warnings_flags_both_sides_independently_when_both_excluded`, etc.).
- `DIFFERENT_CIRCUIT`'s existing behavior (hiding `TrackMapDelta`'s track outline) is untouched — `hasCircuitMismatch`'s derivation and usage are not modified, only supplemented with a rendered label alongside every other warning.
- No comparison-calculation change: this is a pure additive render, touching no numeric/alignment/delta code.
- No new route/page: everything happens within the existing `/laps/compare` page.
- No redesign: one new block inserted at one point in the existing layout; every other section of the page is untouched.

**Exact user-facing wording** — a module-scope `Record<WarningCode, string>` covering all 7 values, following `StintComparisonPage`'s established tone (sentence case, matter-of-fact, no trailing period, "Lap A"/"Lap B" matching `ComparisonHeader.tsx`'s own existing driver-identity labels):

```
invalid_lap_a:       "Lap A: telemetry not marked accurate"
invalid_lap_b:       "Lap B: telemetry not marked accurate"
yellow_flag_lap_a:   "Lap A: affected by yellow flag"
yellow_flag_lap_b:   "Lap B: affected by yellow flag"
track_limits_lap_a:  "Lap A: time deleted for track limits"
track_limits_lap_b:  "Lap B: time deleted for track limits"
different_circuit:   "Sessions are at different circuits"
```

`different_circuit`'s text is reused **verbatim** from `StintComparisonPage`'s own `WARNING_LABELS`, for consistency across the app's two comparison surfaces that both emit this exact code with this exact meaning.

### 5. Warning Mapping

**Decision: a small local `Record<WarningCode, string>` mapping, frontend-owned, not derived from backend `detail` text.** This is not a novel choice — `backend/app/models/lap_comparison.py:57-59`'s own `WarningCode` docstring already states the architectural intent explicitly: *"the frontend renders its own copy/iconography per code rather than displaying backend prose directly."* `StintComparisonPage.tsx` already implements exactly this pattern for its own warning codes. M45 follows the identical, already-established convention — not inventing a new one, and not reading `ComparisonWarning.detail` at all (matching `StintComparisonPage`'s own choice to ignore `detail` entirely in favor of its own fixed label).

### 6. Component Architecture

**Owner: `ComparisonPage.tsx` itself — no new component file.**

- **Why this component is the correct owner**: it already holds `comparison` in scope (via `useLapComparison`), already derives one fact from `comparison.warnings` at this exact level (`hasCircuitMismatch`), and is the direct sibling-pattern match to `StintComparisonPage.tsx`, which owns its own warnings rendering at the same page level rather than delegating to `StrategyColumn` or any other child.
- **Why rendering should not happen in the API client**: `client.ts` is a pure typed-fetch layer (per `CLAUDE.md`'s own architecture rule — "Components access the API only through the typed client... never call `fetch` directly from a component") with zero React/JSX/presentation responsibility anywhere in the file; every other `.tsx`-facing decision in this codebase (formatting, labeling, rendering) happens in feature components, never in `client.ts`.
- **Why backend changes are unnecessary**: the data is already correct, already computed by M43, already serialized correctly (proven end-to-end by M43's own route-level test). This is purely a presentation gap on data that already exists.
- **Why no new state/store is required**: `comparison.warnings` is already present in the `comparison` object `useLapComparison`'s existing state already holds — no new fetch, no new Zustand slice, no new local `useState`.

### 7. Accessibility

**Decision: plain `StatusChip` rendering, no `role="alert"`/`aria-live`, matching `StintComparisonPage`'s own precedent exactly.** This codebase has an established, deliberate semantic split: `ErrorState` (`frontend/src/components/ErrorState.tsx`) uses `role="alert"` for **blocking** errors (a request that failed); `StatusChip`, used by every non-blocking "disclose, don't block" warning surface in this app (confirmed: `StintComparisonPage` is `StatusChip`'s only current lap/stint-comparison consumer), never uses `role="alert"` or `aria-live` — because these warnings don't interrupt or block anything, an assertive live-region announcement would be inappropriate. Meaning is never color-only: `StatusChip`'s text is always visible regardless of color perception. This matches the M45 warnings' own nature exactly (M6/M13's own established "disclose, don't block" architecture, referenced directly in `laps_compare.py`'s and `lap_comparison.py`'s docstrings) — introducing a heavier ARIA abstraction here would be inventing new precedent for a small warning surface, which the task explicitly says not to do.

### 8. Test Design

Extending `frontend/src/features/lap-comparison/ComparisonPage.test.tsx` (existing file, existing `sampleComparison` fixture with `warnings: []`, existing `client.compareLaps` mock-override pattern) — no new test file, no new fixture convention, mirroring `StintComparisonPage.test.tsx`'s own exact assertion style (`data-testid` container + `within(...).getByText(/regex/i)`):

| Case | Setup | Assertion |
|---|---|---|
| No warnings | `sampleComparison` (existing default, `warnings: []`) | `queryByTestId("lap-comparison-warnings")` absent |
| `DIFFERENT_CIRCUIT` — existing behavior preserved | Reuse the existing "different circuits" test's mock (`warnings: [{ code: "different_circuit", ... }]`) | `hasCircuitMismatch`-driven behavior (no track-map fetch, `TrackMapDelta` prop) unchanged **and** the warnings container now also shows "Sessions are at different circuits" |
| `INVALID_LAP_A` | `warnings: [{ code: "invalid_lap_a", detail: "..." }]` | Container shows "Lap A: telemetry not marked accurate" |
| `INVALID_LAP_B` | `warnings: [{ code: "invalid_lap_b", detail: "..." }]` | Container shows "Lap B: telemetry not marked accurate" |
| `YELLOW_FLAG_LAP_A` | `warnings: [{ code: "yellow_flag_lap_a", detail: "..." }]` | Container shows "Lap A: affected by yellow flag" |
| `YELLOW_FLAG_LAP_B` | `warnings: [{ code: "yellow_flag_lap_b", detail: "..." }]` | Container shows "Lap B: affected by yellow flag" |
| `TRACK_LIMITS_LAP_A` | `warnings: [{ code: "track_limits_lap_a", detail: "..." }]` | Container shows "Lap A: time deleted for track limits" |
| `TRACK_LIMITS_LAP_B` | `warnings: [{ code: "track_limits_lap_b", detail: "..." }]` | Container shows "Lap B: time deleted for track limits" |
| Multiple warnings simultaneously | `warnings: [{ code: "invalid_lap_a", ... }, { code: "track_limits_lap_b", ... }]` | Both labels present in the container, mirroring `StintComparisonPage.test.tsx`'s own "renders each warning as a status chip" case |
| Mixed A/B warnings | Covered by the multiple-warnings case above (one A-side code, one B-side code, both rendered independently) — no separate case needed, avoiding duplicate coverage |

**End-to-end/backend test: not required.** The backend contract is unchanged (§9), and M43's own `test_compare_laps_yellow_flag_lap_emits_warning_end_to_end` already proves the real `/laps/compare` route serializes `yellow_flag_lap_b` correctly end-to-end. Adding a redundant backend test here would duplicate existing coverage for zero new risk surface.

### 9. API / Type Impact

**No change to `frontend/src/api/client.ts`.** Confirmed directly (§2): `WarningCode`'s type union already includes all 7 values (added by M43), `ComparisonWarning`/`LapComparisonResponse` are already fully and correctly typed. Making any edit here would be a redundant contract change the task explicitly warns against.

### 10. Styling

- **File to modify**: `frontend/src/features/lap-comparison/ComparisonPage.module.css`.
- **Reuse**: `StatusChip`'s existing `tone="warning"` styling (`StatusChip.module.css`'s `.warning` class, using `--pw-status-warning`/`--pw-status-warning-muted` tokens) is reused unmodified — no new chip/badge visual style needed.
- **One new class required**: `.warnings` — copied verbatim from `StintComparisonPage.module.css`'s own `.warnings` (`display: flex; flex-wrap: wrap; gap: var(--pw-space-2);`), for the container that lays out multiple chips in a wrapping row. This is the only new CSS.

### 11. Performance

Confirmed: the design reads `comparison.warnings`, a field already present in the exact same `comparison` object `useLapComparison` already fetches once per comparison (unchanged fetch count, unchanged request). No new endpoint, no new fetch, no polling, no computation beyond a single `.map()` over an array already in memory and a plain object-literal lookup per entry.

### 12. Exact Stage C File List

**Definitely modified:**
- `frontend/src/features/lap-comparison/ComparisonPage.tsx` — add the `WARNING_LABELS` constant and the warnings-rendering block.
- `frontend/src/features/lap-comparison/ComparisonPage.module.css` — add the `.warnings` class.
- `frontend/src/features/lap-comparison/ComparisonPage.test.tsx` — add the test matrix (§8); extend the existing "different circuit" test rather than duplicating it.

**Conditionally modified:** none identified — this milestone's scope is fully containable within the three files above, per the direct `StintComparisonPage` precedent requiring exactly the same three-file shape (page component, its CSS module, its test file).

**Explicitly untouched:**
- `frontend/src/api/client.ts` — already correctly typed (§9).
- `backend/**` (all files) — backend contract unchanged, data already correct since M43.
- `frontend/src/components/StatusChip.tsx`/`.module.css` — reused unmodified.
- `frontend/src/features/stint-comparison/**` — the pattern is mirrored, not modified.
- `frontend/src/features/lap-comparison/components/ComparisonHeader.tsx` and every other child component — warnings render at the page level, not inside any of them.
- `data/`, `docs/data-model.md`, `docs/api-model.md`, `docs/m9-design-review.md` — no data/schema/API-doc implication.
- `pipeline/**` — no ingestion/pipeline implication.
- Dependency files — no dependency change.

### 13. Non-Goals

Backend warning semantics (`classify_lap()`/`collect_warnings()` unmodified); `WarningCode` redesign (all 7 values keep their existing names/values); comparison calculation changes (alignment/delta/sector logic untouched); a new API endpoint; weather; race control; historical backfill; qualifying (M42) changes; unrelated accessibility cleanup beyond this one surface; a global/generic alert-component refactor (reuses `StatusChip` exactly as-is); documentation reconciliation; dependency changes.

### 14. Validation Plan

- Targeted: `npx vitest run ComparisonPage.test.tsx` (or the equivalent path-scoped run) covering the full matrix in §8.
- Full frontend suite (`npx vitest run`) — expect the established baseline (572 passed pre-M45, +10 new cases from §8) with zero regressions elsewhere.
- `tsc -b --noEmit` — confirms the (unmodified) `WarningCode` type still covers every key used in the new `WARNING_LABELS` record (a `Record<WarningCode, string>` literal will fail to compile if any of the 7 keys is missing or misspelled — this is a free exhaustiveness check from TypeScript itself, requiring no manual switch/exhaustiveness utility).
- `eslint .`, `prettier --check .` — full frontend scope.
- `git diff --check`.
- **No backend/pipeline suite run required** — genuinely zero files touched in either workspace (§12), so running either suite would be ceremony, not verification, per the task's own instruction.
- **Direct production-call-path verification**: re-confirm, by reading the actual current `backend/app/services/lap_comparison/validation.py` and `backend/tests/test_laps_compare_route.py::test_compare_laps_yellow_flag_lap_emits_warning_end_to_end` (both already exist, both already passing, both unmodified by this milestone), that the real `/laps/compare` response the frontend fetches already contains `yellow_flag_lap_b` today — this was directly re-read in §1 above, not assumed.

### Risks

Low. The `Record<WarningCode, string>` shape gives a compile-time guarantee against a missing/mistyped code (§14), which is the main category of risk in this kind of mapping. The only real judgment call — exact wording (§4) and exact placement (§4/§6) — is fully resolved here, not left open for Stage C.

### Deviations from Stage A

None material. Stage A's candidate-level scope anticipated "Stage B should check first whether `SessionAnalyticsWarning`'s own frontend consumer... already establishes a reusable warning-rendering pattern." That specific check found `SessionAnalyticsWarning` itself has **no** frontend consumer (still unrendered, out of scope for M45) — but it led directly to finding `StintComparisonPage.tsx`'s `StintComparisonWarningCode` pattern instead, which is an even closer structural match (a comparison-page warnings array, not a driver-scoped one). This is Stage A's own anticipated investigation resolving to a better answer than guessed, not a deviation from the recommended scope.

### Stage B Stop-Condition Verification

- Only untracked/modified file: `docs/m45-design-review.md` — confirmed.
- No application source changed — confirmed (zero other files touched).
- Nothing staged — confirmed.
- Nothing committed, nothing pushed.
- `data/` untouched — confirmed.
- No backend/pipeline source changed — confirmed.
- No ingestion, no backfill, no PostgreSQL writes, no Parquet writes — none performed.
- No dependency changes — none performed.
- `docs/m9-design-review.md` untouched — confirmed.
- `HEAD == origin/main == 186bd64be8c437352cc40416d3e3d5ae13250235` — confirmed.

**Stage B complete. Stopping here per instruction. Not proceeding to Stage C.**

---

## Stage A — Product / Architecture Audit

**Baseline at start:** `HEAD == origin/main == 186bd64be8c437352cc40416d3e3d5ae13250235` (the M44 commit — "docs(m44): reconcile documentation through M43"), working tree clean, nothing staged, `docs/m9-design-review.md` zero diff, `docs/m45-design-review.md` did not exist. Verified by direct `git` commands before any research began.

Conducted via four parallel read-only investigations: (1) roadmap/product state + M40–M44 regression audit, (2) correctness-first hunt + M42 qualifying reconfirmation, (3) historical data/backfill + unused FastF1 data + product surface audit, (4) architecture/tech-debt + dependency/security + test-quality + performance. Findings below are synthesized and cross-checked against source, not taken from any prior milestone's self-report on trust.

---

### 1. Roadmap / Product State

**Zero drift found.** M44 is the tip of history — nothing has shipped since, so no new staleness is possible, and this was confirmed directly rather than assumed:

- `README.md`: "Current milestone" reads M43 (correctly not self-naming M44, per the established convention); milestone table ends at M43; the §194–197 pointer paragraph is accurate through M43, with no false claim.
- `CHANGELOG.md`: `[Unreleased]` correctly names M43; entries present for M39 (retroactive), M40, M41, M42, M43.
- `docs/prd.md`: §3a extends through M43; citation list includes `docs/m44-design-review.md`; §5's deferred-features table matches exactly the expected state — **Weather** and **Gaps** (`results.Time`) are the only two rows still "Not yet built"; every other row shows Shipped. Document-history's `v9 (M44)` entry present and accurate.
- `docs/success-metrics.md`: M40 correctly credited in the V3 "Related:" sentence.
- `docs/backlog.md`: re-read in full — 7 entries across 4 categories, all unchanged, zero new entries (CI `permissions:` block; `StarletteDeprecationWarning`; `DriverSelectPage.test.tsx`/`LapSelectPage.test.tsx` missing empty-state tests; `get_telemetry` per-call cost; Dockerfile Python-version mismatch; no non-root Dockerfile `USER`; no `CONTRIBUTING.md`).

**Another reconciliation is obviously premature** — there is nothing to reconcile.

### 2. M40–M44 Regression Audit

Traced fresh against actual current production source (not design-doc summaries):

- **M40** — `filtering.py` read in full: `classify_lap()` still resolves `_track_limits_reason(lap) or _yellow_flag_reason(lap)` (track-limits precedence intact); `is_valid` still derived solely from `is_accurate`. Byte-identical to prior audits.
- **M41** — `stint_eligibility.py` read in full: `trend_eligible_positions()` still excludes on `classify_lap(position.lap).exclusion_reason is None`; `valid_positions()` remains the pure `is_accurate` signal. Intact.
- **M42** — no regression signal encountered; independently re-confirmed in full by §4 below.
- **M43** — `lap_comparison/validation.py` read in full: `collect_warnings()` still imports `classify_lap`, still emits all 4 side-specific codes correctly, the two `is_accurate` checks unchanged. Intact.
- **M44** — `git show 186bd64 --stat` confirms exactly 5 files changed, all documentation, **zero source-code diff**.

**Sibling-consumer sweep (fresh, not trusted from prior audits):** every remaining `session_analytics`/`tyre_performance` module re-checked. `aggregation.py` correctly applies `classify_lap`/`filter_for_aggregate_stats`; `consistency.py`/`driving_style.py`/`theoretical_best.py` are safe by construction (never receive unfiltered laps); `orchestration.py`/`stint_consistency.py`/`compound_aggregation.py` correctly route through `stint_eligibility`. Frontend: `DriverLapTable.tsx` remains the only session-analytics consumer, still correct. **No further instance found — the pattern M41 and M43 each fixed remains fully closed.**

### 3. Correctness-First Audit

**No new defect found**, via an exhaustive fresh sweep (not a repeat of prior conclusions):

- Every `.is_valid` usage (7 hits, backend-wide) confirmed to be on `LapValidity`/`AnnotatedLap`-shaped objects, never a direct `Lap` attribute (the field genuinely doesn't exist on `Lap`).
- `track_status`/`.deleted`/`deleted_reason` read **only** inside `filtering.py`'s two resolver functions plus the repository deserialization/type-declaration layer — no sibling reimplementation anywhere.
- `exclusion_reason` has exactly three consumers, all correct: `session_analytics/aggregation.py`, `tyre_performance/stint_eligibility.py`, `lap_comparison/validation.py`.
- A previously-uninspected frontend file, **`StintPaceLapTable.tsx`**, was read in full this cycle: it correctly renders `"invalid"` for `!lap.is_valid` (accuracy) and separately `"excluded"` for `!lap.is_trend_eligible` (exclusion) — two independently-sourced flags mirroring the backend split exactly, with `is_trend_eligible` traced back to M41's `trend_eligible_positions()`. Correctly wired, not a defect.
- `lap_comparison/delta.py`, `sectors.py`, `alignment.py` — zero references to validity/exclusion, by design (the numeric comparison is unconditional; only `validation.py` produces advisory warnings, matching M6's "disclose, don't block" architecture).

### 4. M42 Qualifying Audit

Fully reconfirmed end-to-end: `normalize.py` (no session-type gating, no Sprint-Qualifying special-casing), pipeline/backend `Driver` models, `.get()`-based nullable-safe repository deserialization, `client.ts`'s optional-typed fields, `DriverSelectPage.tsx`'s three independently-gated spans. Repo-wide grep (excluding tests) confirms **exactly 6 files** reference these fields — the 4 pipeline/backend layer files plus `client.ts` and `DriverSelectPage.tsx`, which remains the **only** UI consumer, matching M34's established one-consumer precedent. No gap.

### 5. Historical Data / Backfill Audit

Re-counted directly: 704 total sessions, unchanged breakdown. M38's 334-session target population still matches on-disk exactly; `backfill_m38.py` has zero diff since M38 shipped. M40's `deleted` coverage: still **0/704**. M42's `q1_seconds` coverage: still **0/164**. M43 and M44 both confirmed to have zero historical-data implications (neither touched `pipeline/` or `data/`). **The backfill case is stable across two consecutive audit cycles (M44, M45) with no new evidence either time.**

### 6. Unused FastF1 Data Audit

`weather_data` and `race_control_messages`: still zero real references anywhere. `results.Position`/`results.Time`/`results.Laps`: still unused, confirmed against `normalize_drivers()`'s exact read list. Full `SessionResults._COLUMNS` cross-check against the installed FastF1 version (**3.8.3**, confirmed unchanged/matches `uv.lock` — no dependency drift): unused fields unchanged from prior audits (`BroadcastName`, `DriverId`, `TeamColor`, `TeamId`, `HeadshotUrl`, `CountryCode`, plus `Position`/`Time`/`Laps`). Zero TODO/FIXME/XXX markers repo-wide. `results.Time` remains the cheapest-to-extend candidate (same proven Q1/Q2/Q3-on-`DriverSelectPage` pattern) but this is a feasibility observation, not new demand evidence.

### 7. Product Surface Audit

Backend: 22 routes, unchanged, all documented, no orphans, no duplicates. Frontend: 17 routes, unchanged.

**Two concrete UI-completeness findings, both newly and precisely checked this cycle:**

- **`DriverLapTable.tsx`'s exclusion-reason display**: renders the lap's `exclusion_reason` value, but as the **raw snake_case enum string** (literally `"yellow_flag"`/`"track_limits"` inside the tag), not a humanized label ("Yellow Flag"/"Track Limits"). The distinction *is* present and correct — this is a presentation-polish gap, not a missing feature or a defect.
- **M43's lap-comparison warnings have zero UI surface**, confirmed by grepping every `.tsx` file under `frontend/src/features/lap-comparison/` for every `WarningCode` value: only `different_circuit` is ever read, and only as a boolean gate to skip a track-map fetch — never rendered as visible text. **All 6 warning codes** (`invalid_lap_a`/`invalid_lap_b`, and all 4 of M43's new `yellow_flag_lap_a/b`/`track_limits_lap_a/b`) are computed by the backend and returned in every response, but **nothing in the UI ever shows them to a user.** A user comparing a yellow-flag-affected or track-limits-deleted lap gets the exact same silent, unqualified comparison as a fully clean one — even though the backend has, since M43, computed precisely the signal needed to warn them.

### 8. Architecture / Technical Debt

All confirmed unchanged, no new evidence: `_optional_*` helpers (2 instances), `classify_lap` cross-service imports (2, reuse-via-import not duplication), `_to_stint_pace` (2 instances) — all within the established rule-of-three threshold. No import cycle, no new API-boundary violation, no new N+1/N², no accessibility gap found in a fresh spot-check. CI/Docker Python-version mismatch (3.10 pinned vs. 3.12 shipped) confirmed still present, unfixed, still tracked in `docs/backlog.md` unchanged. `get_telemetry`'s per-call cost still flagged in `docs/backlog.md`, still unaddressed by any milestone. Bundle size: fresh build measured at 879.71 kB JS / 290.59 kB gzip — informational only, no established baseline to regress against.

### 9. Dependencies / Security

`npm audit`: **0 vulnerabilities** at every severity. Python deps: only minor/patch drift, no CVE indicator available (`pip-audit` still not installed in this sandbox). **Nothing milestone-forcing.**

### 10. Test / Quality State

Fresh run, exact counts, **all matching the established baseline exactly**: pipeline 172 passed/15 errors (Postgres-only), backend 405 passed/1 failed/15 errors (Postgres-only), frontend 572 passed across 86 files. All static checks clean. **Zero real regressions.**

### 11. Performance

No fresh evidence from any section makes performance decision-relevant. Not investigated further.

---

### 12. Candidate Matrix

| Candidate | Category | Evidence strength | User impact | Correctness impact | Complexity | Risk | Milestone size | Prior deferrals | New evidence this cycle | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| **Render lap-comparison exclusion warnings in the UI** | UI-completeness (M37-shaped) | Strong — verified directly: 6 warning codes computed, 0 rendered, confirmed by exhaustive grep | Medium-high — a user comparing an affected lap gets no warning at all today | None (not a wrong-answer defect — the backend is correct; the gap is pure non-disclosure) | Low — pure frontend rendering, no new data, no schema/API change | Low | Small | None — newly found this cycle | **Yes — see §14** |
| Humanize `DriverLapTable`'s raw `exclusion_reason` text | UI polish | Real but minor — information is present, just not humanized | Low | None | Very low | Very low | Tiny | None — newly found this cycle | Considered, not recommended as the primary M45 pick — smaller and less impactful than the lap-comparison gap; could be folded in only if Stage B finds it trivially adjacent, not a reason to expand scope on its own |
| Historical backfill (M40 `deleted`/M42 `q1/q2/q3_seconds`) | Data completeness | Strong but static — same 0/704, 0/164 gaps, stable across 2 consecutive audit cycles | Medium | Medium | Medium-high (real Parquet writes) | Medium | Medium-large | Flagged M44, unchanged | No — stable, not fresher | Genuinely justified whenever prioritized, but not this cycle's strongest evidence |
| `results.Time`/`Position`/`Laps` as new fields | Product feature | Weak — feasibility only, no demand | Unknown/speculative | None | Low (proven pattern) | Low | Small | Repeatedly noted, never promoted | No | Not justified |
| Weather | Product feature | None new | Unknown/speculative | None | High — full-stack net-new | Medium | Large | Repeatedly deferred | No | Not justified |
| Race-control timeline | Product feature | None new | Unknown/speculative | None | High — full-stack net-new | Medium | Large | Repeatedly deferred | No | Not justified |
| CI/Docker Python-version fix | Tech debt | Real, stable, tracked in `docs/backlog.md` | Low | Low | Low | Low | Tiny | Tracked since before M43 | No | Not milestone-sized alone |
| `get_telemetry` cost | Performance/tech debt | Real, tracked since M20 | Low (no user-facing evidence of slowness reported) | None | Medium | Low | Medium | Tracked since M20, never promoted | No | Not justified without fresh performance evidence |
| Documentation reconciliation | Documentation | None — zero drift, M44 is the tip of history | — | — | — | — | — | — | No | Obviously premature |
| Do nothing / finalize | — | — | — | — | — | — | — | — | — | Not recommended — a genuine, well-scoped, evidence-backed candidate exists |

### 13. Special Decision Questions

**A. What is the highest-value next milestone genuinely justified after M44?**
Rendering M43's lap-comparison exclusion warnings in the UI. It is the only candidate with fresh, concrete, newly-discovered evidence this cycle, is cheap and low-risk, and directly completes a capability that was shipped incomplete two milestones ago.

**B. Is there a new correctness defect comparable to M40/M41/M43?**
No. An exhaustive fresh sweep — including a previously-uninspected file (`StintPaceLapTable.tsx`) — found nothing. This is the second consecutive audit cycle (M44, M45) to find zero new correctness defects.

**C. Has the exclusion-reason consumer audit finally reached closure, or is another sibling consumer still wrong?**
Closure confirmed, fresh, for the second consecutive cycle. Every backend and frontend consumer of `Lap` validity/exclusion data is correctly wired.

**D. Are M42 qualifying results now complete enough to defer further work?**
Yes, fully reconfirmed, single-consumer by design, no gap.

**E. Is historical backfill now justified as a dedicated milestone?**
Justified in absolute terms, but with no fresher evidence than at M44's audit — the case is stable, not urgent, and outranked this cycle by a smaller, cheaper, more concretely-evidenced candidate.

**F. Are weather/race-control finally justified by actual product evidence?**
No. Zero new evidence across now 6 consecutive audits (M39 onward) that have considered them.

**G. Is `results.Time`/`Position`/`Laps` worth promoting despite the absence of current demand?**
No. "Cheap to build" is not evidence of value; no demand signal exists.

**H. Is the project now primarily in hardening/completion mode or active feature-development mode?**
Hardening/completion mode. The strongest candidate this cycle is itself a completion task — finishing what M43 shipped incomplete — in the same spirit M37 finished what M36 shipped incomplete. No new-feature candidate cleared any evidence bar.

**I. What is the smallest coherent milestone that delivers meaningful value without manufacturing scope?**
Rendering the lap-comparison warnings — small, real, evidence-backed, touches no data/schema/API.

### 14. Recommendation

**Recommend M45 = render M43's lap-comparison exclusion warnings in the UI.**

**Exact problem:** `LapComparisonResponse.warnings` has carried `YELLOW_FLAG_LAP_A`/`_B` and `TRACK_LIMITS_LAP_A`/`_B` since M43 shipped, and `INVALID_LAP_A`/`_B` since M6 — but the frontend renders none of them. A user comparing two laps where one was affected by a yellow flag, safety car, VSC, red flag, or an official track-limits time deletion sees an identical, unqualified comparison to a fully clean one.

**Evidence:** §7 above — direct grep of every `.tsx` file under `frontend/src/features/lap-comparison/`, confirming only `different_circuit` is ever read, and only as a non-visible boolean gate.

**User impact:** medium-high within the affected scope — every comparison involving a flagged lap is silently under-qualified today; the fix requires no new backend work, since the data has been correct and available since M43.

**Architectural fit:** clean. This is a pure frontend rendering addition consuming an already-correct, already-returned API field — no new endpoint, no new backend logic, no schema change. It follows the exact shape of M37 ("Fix: yellow-flag exclusion tags render in driver lap table") — a rendering-completion fix for data a prior milestone already computed correctly.

**Likely files:** `frontend/src/features/lap-comparison/ComparisonPage.tsx` and/or a new small warnings-display component under `frontend/src/features/lap-comparison/components/`; possibly `ComparisonHeader.tsx` if warnings belong near the lap summary; a CSS module for styling. (Stage B should check first whether `SessionAnalyticsWarning`'s own frontend consumer — if one exists — already establishes a reusable warning-rendering pattern to follow, rather than inventing a new one from scratch.)

**Likely tests:** extend `ComparisonPage.test.tsx` and/or the new component's own test file with cases for each warning code rendering, non-rendering when `warnings` is empty, and multiple simultaneous warnings (mirroring the backend's own already-tested "both sides independently excluded" shape).

**Data/API/schema implications:** none. Purely consumes the existing, unmodified `ComparisonWarning`/`WarningCode` contract.

**Explicit non-goals:** no backend change of any kind; no new warning code; no change to `collect_warnings()`/`classify_lap()`; no historical backfill; no weather/race-control; no humanizing `DriverLapTable`'s exclusion-reason text (a separate, smaller, lower-priority finding — not bundled here unless Stage B finds it trivially in-scope); no redesign of the comparison page beyond adding the warnings display.

**Validation strategy:** frontend tests for the new rendering (all warning codes, empty case, multiple-simultaneous case); full frontend suite for regression; `tsc`/`eslint`/`prettier`; no backend/pipeline change means no backend test/static-check impact.

**Major risks:** low. The main open question for Stage B is exactly where/how to render the warnings (inline per-lap-summary vs. a shared banner) and whether `different_circuit`'s existing non-visible treatment should also gain visible text now, or stay a pure gate — a real design decision, not guessed here.

**Why it beats every alternative:** it is the only candidate with fresh, concrete evidence this cycle; it is cheaper and lower-risk than historical backfill (no data write); it has no correctness-defect competitor (none was found, for the second cycle running); and it is more evidence-backed than any speculative feature (weather, race-control, `results.Time`), none of which cleared any threshold.

---

### Stop-Condition Verification

Re-verified after completing the audit and before stopping:

- Only new/untracked file: `docs/m45-design-review.md` — confirmed.
- No source files modified — confirmed.
- Nothing staged — confirmed.
- Nothing committed, nothing pushed — no `git commit`/`git push` invoked at any point in this stage.
- `data/` untouched — confirmed (read-only `pd.read_parquet` inspection only, no writes).
- No ingestion, no backfill, no PostgreSQL writes, no Parquet writes — none performed.
- No dependency changes — none performed (`npm audit`/`uv pip list --outdated` are read-only).
- `docs/m9-design-review.md` untouched — confirmed.
- `HEAD == origin/main == 186bd64be8c437352cc40416d3e3d5ae13250235` — confirmed at both start and end of this stage.

**Stage A complete. Stopping here per instruction. Not proceeding to Stage B.**
