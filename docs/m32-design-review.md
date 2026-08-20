# PitWall — M32 Design Review: Shared `FILTERABLE_SESSION_TYPES` Constant

**Status:** Design review — implementation follows in Stage C.
**Baseline:** M31 complete (`6e43358acbb0ac8a1a78d0fca157015080b5a91f`), React Router 7 migration shipped.

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `6e43358acbb0ac8a1a78d0fca157015080b5a91f`, re-verified at the start of this stage.
- `git status --short --branch`: clean, tracking `origin/main`, nothing else.
- `git diff --cached --stat`: empty.
- `docs/m32-design-review.md` did not exist before this file was written.
- No source, test, dependency, data, or other doc file has been modified. Every command run this stage was read-only: `git status`/`diff`, `grep`, `sed`, `md5sum` (on process-substitution extracts, not files), `ls`, `find`.

## 2. Stage A Finding — Independently Re-Verified, Not Assumed

Stage A reported 4 byte-identical copies of `FILTERABLE_SESSION_TYPES`. This stage re-derived that finding directly from source rather than trusting the prior report:

- **Byte-identical, confirmed via `md5sum`** on the extracted declaration block (`const FILTERABLE_SESSION_TYPES ... ];`) from all four files — all four hashes are identical (`680f61ef4ca5a2c861fccf5b1fa19500`):
  - `frontend/src/features/driver-trends/DriverSeasonPaceTrendPage.tsx`
  - `frontend/src/features/driver-trends/DriverSeasonTyreTrendPage.tsx`
  - `frontend/src/features/driver-trends/DriverPaceTrendComparisonPage.tsx`
  - `frontend/src/features/driver-trends/DriverTyreTrendComparisonPage.tsx`
- **Exact value and order** (must be preserved verbatim):
  ```ts
  const FILTERABLE_SESSION_TYPES: SessionType[] = [
    "race",
    "sprint",
    "qualifying",
    "sprint_qualifying",
    "practice_1",
    "practice_2",
    "practice_3",
  ];
  ```
- **No fifth copy exists anywhere in `frontend/src`** — `grep -rl "FILTERABLE_SESSION_TYPES" frontend/src` returns exactly these 4 files.
- **`SessionType` (the array's element type) is a single source of truth**, `frontend/src/api/client.ts:16`, a 7-member string-literal union (`practice_1`/`practice_2`/`practice_3`/`qualifying`/`sprint_qualifying`/`sprint`/`race`) — `FILTERABLE_SESSION_TYPES` is a complete, reordered enumeration of every member of that union, not a filtered subset. All four copies type-annotate against the same imported `SessionType`.
- **Usage is compatible and read-only across all four consumers** — every usage site is either `.map((type) => ...)` (rendering `<option>` elements) or `(FILTERABLE_SESSION_TYPES as string[]).includes(sessionTypeParam)` (validating a URL query param). No mutation method (`push`/`pop`/`sort`/`reverse`/`splice`/`shift`/`unshift`) is called on the array anywhere — confirmed by grep across all four files, zero matches. All four consumers require the identical constant for the identical purpose (populating and validating the page's "Session type" filter `<select>`).
- **No hidden local transformation** — each file's usage is copy-identical in shape (`.map` to build `<option>`s, `.includes` to validate), differing only in surrounding page-specific logic (which chart/list component renders, which hook is called), never in how the constant itself is read.
- **The sibling `SESSION_TYPE_LABELS` extraction is real and directly relevant** — `frontend/src/components/sessionTypeLabels.ts` exists, exports `SESSION_TYPE_LABELS: Record<Session["session_type"], string>`, and is already imported by all four of these same files for the same filter control (each `<option>`'s visible text comes from `SESSION_TYPE_LABELS[type]`, and empty-state copy uses `SESSION_TYPE_LABELS[sessionType]`). This is the direct, already-established precedent for exactly this kind of small, cross-feature, non-component constant.
- **No test references `FILTERABLE_SESSION_TYPES` (or `sessionTypeLabels`/`SESSION_TYPE_LABELS`) directly** — `grep -rn "FILTERABLE_SESSION_TYPES" frontend/src --include="*.test.*"` returns nothing. All four pages' existing tests exercise the constant only *behaviorally*, through the rendered DOM (`screen.getByLabelText("Session type")`, `fireEvent.change(..., { target: { value: "qualifying" } })`, asserting the resulting fetch call uses `"qualifying"`) — never by importing or inspecting the array itself.

No deviation from Stage A's finding — every claim is confirmed, with one addition: `sessionTypeLabels.ts` has no dedicated test file of its own, which is itself evidence for §4's test decision.

## 3. Module Placement Decision

**Decision: add `FILTERABLE_SESSION_TYPES` to the existing `frontend/src/components/sessionTypeLabels.ts`** — not a new `sessionTypeFilters.ts`.

Evidence considered:

- `frontend/src/components/` is this project's established home for exactly this kind of module — it already holds `sessionTypeLabels.ts`, `teamColor.ts`, and `urlSearchParams.ts`, each a small, cross-feature, non-component constant/pure-function module. M27's own design review named this precedent explicitly: `urlSearchParams.ts` was placed there because it plays "the same role teamColor.ts and sessionTypeLabels.ts already play." No ADR or `docs/architecture.md` text specifically governs shared-UI-constant placement, but the de facto convention is unambiguous and directly on point.
- **All four consumers already import `SESSION_TYPE_LABELS` from `sessionTypeLabels.ts` and use it together with `FILTERABLE_SESSION_TYPES` for the exact same UI element** (the session-type `<select>`: `FILTERABLE_SESSION_TYPES` supplies the option list and order, `SESSION_TYPE_LABELS` supplies each option's display text). They are two halves of one filter control's data, not two unrelated concepts that happen to share a domain.
- Placing both in one file **reduces**, not adds, import surface: two of the four files (`DriverSeasonPaceTrendPage.tsx`, `DriverSeasonTyreTrendPage.tsx`) currently import `SESSION_TYPE_LABELS` on its own line; after this change they import both names from the same module on one line. The other two (`DriverPaceTrendComparisonPage.tsx`, `DriverTyreTrendComparisonPage.tsx`) already import `SESSION_TYPE_LABELS` on its own line alongside a separate multi-line `SessionType`/other-types import from `api/client.ts` — that second import is untouched (§3 below), only the `sessionTypeLabels` import line gains one more name.
- A separate `sessionTypeFilters.ts` was considered and rejected: it would create a second file for a single seven-element literal array with no logic of its own, split from the sibling constant every consumer already pairs it with, for no coherence benefit — exactly the "theoretical separation" the Stage B brief said to avoid. `SESSION_TYPE_LABELS` is a `Record` (lookup by type) and `FILTERABLE_SESSION_TYPES` is an `Array` (iteration order + inclusion check) — different shapes, but the same domain, same consumers, same UI purpose, and the existing file's docstring ("Shared human-readable labels for `Session["session_type"]`") already frames it as a `Session["session_type"]`-scoped module, not narrowly a "labels-only" file by architectural rule.
- **This is the smaller, more coherent design**: one file touched instead of two, no new file added to the repository, no new directory-level decision to document.

## 4. Complete Consumer Trace

Fresh search across `frontend/src` for `FILTERABLE_SESSION_TYPES`, `SESSION_TYPE_LABELS`, `sessionTypeLabels`, `sessionTypeFilters` confirms exactly these files are in scope; no other reference exists anywhere (no `sessionTypeFilters.ts` currently exists, confirmed by `find`).

| File | Current declaration | Current usage | Import change | `SessionType` import affected? | Test change needed? |
|---|---|---|---|---|---|
| `DriverSeasonPaceTrendPage.tsx` | Local `const FILTERABLE_SESSION_TYPES: SessionType[] = [...]` (line 12) | `.includes()` guard (line 42), `.map()` render (line 83) | `import { SESSION_TYPE_LABELS } from "../../components/sessionTypeLabels"` (line 7) → `import { SESSION_TYPE_LABELS, FILTERABLE_SESSION_TYPES } from "../../components/sessionTypeLabels"` | No — `import type { SessionType } from "../../api/client"` (line 2) stays; `SessionType` is still used at lines 41/43 independently of the removed array declaration | No |
| `DriverSeasonTyreTrendPage.tsx` | Local `const FILTERABLE_SESSION_TYPES: SessionType[] = [...]` (line 12) | `.includes()` guard (line 51), `.map()` render (line 92) | Same pattern as above (line 7) | No — same reasoning, `SessionType` used at lines 50/52 | No |
| `DriverPaceTrendComparisonPage.tsx` | Local `const FILTERABLE_SESSION_TYPES: SessionType[] = [...]` (line 19) | `.includes()` guard (line 78), `.map()` render (line 134) | `import { SESSION_TYPE_LABELS } from "../../components/sessionTypeLabels"` (line 13) → adds `FILTERABLE_SESSION_TYPES` to that same import; the separate multi-line `import { listSeasons, type SeasonPaceTrendResponse, type SeasonSummary, type SessionType } from "../../api/client"` (lines 3–8) is untouched | No — `SessionType` still used at lines 77/79 | No |
| `DriverTyreTrendComparisonPage.tsx` | Local `const FILTERABLE_SESSION_TYPES: SessionType[] = [...]` (line 19) | `.includes()` guard (line 69), `.map()` render (line 125) | Same pattern as `DriverPaceTrendComparisonPage.tsx` (line 13) | No — `SessionType` still used at lines 68/70 | No |

One additional textual note: `DriverSeasonTyreTrendPage.tsx` line 30 has a doc comment reading *"...control, reusing the same FILTERABLE_SESSION_TYPES/SESSION_TYPE_LABELS..."* — this comment already describes the constant as shared/reused and requires no correction; it remains accurate after the extraction (if anything, more accurate, since both names are now genuinely imported from one shared module rather than each being a locally re-declared copy).

**No type annotation or import becomes unused as a result of this extraction** in any of the four files — confirmed by grepping every `SessionType` occurrence per file (§2): each file uses the `SessionType` type independently, at the `sessionType: SessionType` binding and the `as SessionType` cast, both unrelated to the array literal being removed.

## 5. Test Coverage Decision

**No new test is needed.** Evidence, weighed against this project's own two established precedents:

- **M27 precedent** (add a focused test): applied when the extracted code has its own nontrivial *logic* worth asserting directly — `urlSearchParams.ts`'s `getParam`/`setOrDelete` have real edge-case behavior (empty-string-to-`null` normalization, set-vs-delete branching) that a page-level DOM test wouldn't exercise precisely, so M27 added `urlSearchParams.test.ts`.
- **M29 precedent** (add no test): applied when the extraction is a pure relocation of already-covered behavior — `to_driver_strategy_summary`'s three call sites were already asserted end-to-end by each route's own response-shape test, so M29 added nothing beyond confirming those three tests still pass.
- `FILTERABLE_SESSION_TYPES` has **zero logic** — it is a static literal array, not a function. Its only two behaviors ("does this array contain the right values, in the right order, for `.map()` and `.includes()`") are already exercised end-to-end by all four pages' existing tests, each of which drives the real `<select>` via `screen.getByLabelText("Session type")` and `fireEvent.change(..., { target: { value: "qualifying" } })`, then asserts the resulting fetch call receives `"qualifying"` — this only passes today because `"qualifying"` is genuinely present in the constant. A regression in the constant's content (wrong value, missing value, wrong type) would fail these existing tests directly, not silently.
- **Directly confirming the precedent**: `sessionTypeLabels.ts` — the sibling constant this extraction is modeled on — has no dedicated test file of its own (`find frontend/src -iname "sessionTypeLabels*"` returns only the source file), despite being consumed by the same four pages in the same way. This project has already made this exact call once before, for the exact same class of module.

**Conclusion: this milestone matches the M29 precedent, not the M27 precedent.** No new test file, no new test case, no modification to any of the four existing `*.test.tsx` files.

## 6. API / Data / Behavioral Analysis

- No backend file is touched — this is a pure `frontend/` change.
- No API route, request, or response contract changes in any way.
- No URL contract change — the `session_type`/`sessionType` query-param names, values, and validation logic (`.includes()` against the same 7-value set) are unchanged; only *where* the array is declared changes, not what it contains or how it's read.
- No database or schema implication — no backend/pipeline file is in scope.
- No ingestion implication.
- **No runtime behavior change of any kind.** The constant's value and declaration order are preserved exactly (§2's `md5sum`-verified content, copied verbatim into the shared module, not retyped). The rendered `<option>` order, the set of valid filter values, and the empty-state/default-selection logic in all four pages are byte-identical in behavior before and after.

## 7. Scope Lock

**Stage C may create or modify only:**
- `frontend/src/components/sessionTypeLabels.ts` — add the `FILTERABLE_SESSION_TYPES` export (and broaden its header comment to reflect the file now holding two related session-type constants, not rename the file).
- `frontend/src/features/driver-trends/DriverSeasonPaceTrendPage.tsx` — remove local declaration, update import.
- `frontend/src/features/driver-trends/DriverSeasonTyreTrendPage.tsx` — remove local declaration, update import.
- `frontend/src/features/driver-trends/DriverPaceTrendComparisonPage.tsx` — remove local declaration, update import.
- `frontend/src/features/driver-trends/DriverTyreTrendComparisonPage.tsx` — remove local declaration, update import.
- `docs/m32-design-review.md` — this file (no further Stage C edit expected).

**No test file is in scope** (§5) unless Stage C's actual validation run surfaces something this design didn't predict.

**Explicitly out of scope** (per the approved direction and independently re-confirmed as not evidenced during this stage's investigation):
- `SESSION_TYPE_LABELS` itself — untouched in content and export shape, only the file it shares gains one more export.
- Trend-hook consolidation (`useDriverSeasonPaceTrend`/`useDriverSeasonTyreTrend`/`useDriverPaceTrendComparison`/`useDriverTyreTrendComparison`) — confirmed in M32 Stage A to be genuinely different implementations, not duplicates.
- `_to_stint_pace` — still 2 copies, below this project's 3-copy evidence threshold.
- Any React Router file or behavior — M31 is closed, not reopened here.
- Any dependency version change.
- Bundle-size / code-splitting work.
- Any documentation reconciliation (README/CHANGELOG/`docs/prd.md`/`docs/api-model.md`/`docs/architecture.md`).
- Any backend or API file.
- Any new feature or capability.
- Any unrelated formatting/refactor beyond the mechanical consequence of this exact extraction (i.e., no drive-by cleanup in any touched file beyond the import/declaration change itself).

## 8. Validation Plan (Stage C)

In order:
1. `npx vitest run` — full existing suite; expect the same pass count as the current baseline (549, per M31's last confirmed run), no test added or removed by this milestone.
2. `npx tsc -b --noEmit` — must stay clean.
3. `npx eslint .` — must stay clean.
4. `npx prettier --check .` (or the project's `npm run format`) — must stay clean; if the edit leaves any line needing reflow (e.g. an import line growing past the project's line-length convention), run `prettier --write` scoped to only the touched files, matching the precedent already used in M31 Stage C.
5. `git diff --check` — no trailing-whitespace/conflict-marker issues.

**Targeted checks proving the extraction is complete and correct:**
- `grep -rn "const FILTERABLE_SESSION_TYPES" frontend/src` returns **exactly one** match, in `frontend/src/components/sessionTypeLabels.ts`.
- `grep -rln "FILTERABLE_SESSION_TYPES" frontend/src` returns **exactly five** files: the shared module plus the four consumers (import sites only, no local `const` remaining in any of the four).
- Diff each of the four consumer files and confirm the only changes are: the import line and the deletion of the local `const FILTERABLE_SESSION_TYPES` block — no other line changed.
- `SESSION_TYPE_LABELS`'s own export, value, and every existing consumer's usage of it are confirmed unchanged (its content is not touched by this milestone; only its file gains a neighboring export) — a diff of `sessionTypeLabels.ts` should show only an addition, not a modification, to the existing `SESSION_TYPE_LABELS` block.

**No browser test is required.** Nothing in this extraction can alter runtime behavior in a way `vitest`'s existing DOM-level assertions (`fireEvent.change` + fetch-call assertions, §5) wouldn't already catch — there is no new rendering path, no new network call shape, and no new user interaction being introduced.

## 9. Risk Assessment

- **Import-path mistake** (e.g. wrong relative path from the two different directory depths — all four consumer files are at the same `features/driver-trends/` depth, so the relative path `../../components/sessionTypeLabels` is identical across all four, low risk of a path error).
- **Accidental value/order change** — mitigated by copying the array verbatim (byte-identical, §2) into the shared module rather than retyping it, and by the targeted `md5sum`/diff checks in §8.
- **Unused import left behind** — not expected per §4's per-file trace (every file's `SessionType` type import stays genuinely used elsewhere), but `eslint`'s `noUnusedLocals`-equivalent TS check (`tsc -b --noEmit` with `noUnusedLocals: true` per `tsconfig.app.json`) would catch this immediately as a build failure, not a silent bug.
- **Test impact** — none expected (§5); if a test does fail, it would fail loudly (a fetch-call assertion mismatch), not silently.
- **Rollback** — trivial: this is a pure, mechanical extraction touching 5 files with no external dependency, API, or data change. A failed validation at any point rolls back with `git checkout -- <the 5 files>`, no commit will exist yet.

## 10. Deviations from Stage A

None. Every finding Stage A reported was independently re-verified in this stage (§2) and confirmed accurate, with one additional supporting data point found during this stage's own investigation: `sessionTypeLabels.ts` has no dedicated test file, directly reinforcing the "no new test" decision in §5 beyond what Stage A's report alone established.

---

**STOP — awaiting explicit approval before Stage C.**
