# PitWall — M33 Design Review: Documentation Reconciliation (M28–M32)

**Status:** Complete — Stage C implemented and validated; awaiting explicit approval for commit/push.
**Baseline:** M32 complete (`cc7326c1f7065a19910f3579724456a6d149711a`), shared session-type filter constant shipped.

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `cc7326c1f7065a19910f3579724456a6d149711a`, re-verified at the start of this stage.
- `git status --short --branch`: clean, tracking `origin/main`, nothing else.
- `git diff --cached --stat`: empty.
- `git diff -- docs/m9-design-review.md`: empty — untouched.
- `docs/m33-design-review.md` did not exist before this file was written.
- No source, test, dependency, data, or existing documentation file has been modified. Every command run this stage was read-only: `git show`/`diff` against the five named commits, `grep`, `sed`, and one live `npm audit --json` re-check (no `fix`, no write).

## 2. Why M33 Is Justified

Stage A found the documented milestone history (README's "Current milestone" line, the milestone table, `docs/prd.md` §3a, `CHANGELOG.md`) stops at M27, while five real milestones (M28–M32) have shipped and merged since. This gap has been explicitly named and deliberately deferred three separate times on the record:
- M29 §8 (`docs/m29-design-review.md`): *"documentation reconciliation is its own periodic milestone type — M16, M20, M23, M28... should be picked up the next time a docs-reconciliation milestone runs"*
- M30 §12 (`docs/m30-design-review.md`): *"that gap is real but explicitly out of scope for this dependency-focused milestone and belongs to a future dedicated reconciliation pass"*
- M31 §19 (`docs/m31-design-review.md`): names the same still-outstanding gap as deferred follow-up

This is the same recurring milestone type this project has already run four times (M16, M20, M23, M28), each covering a comparable 3–5-milestone span. M28 itself covered exactly 5 milestones (M23–M27); this pass covers 5 (M28–M32) — the same scale, not an outlier.

## 3. M28–M32 Verified From Actual Git History

Every fact below was pulled directly from `git show <commit>` (title, date, exact file list) plus source inspection where the file list alone was insufficient — not copied from prior design-review summaries.

### M28 — `b0d0e26f3dbb879941ff5229c03f30410a1039a6`
- **Commit subject**: `docs(m28): reconcile project documentation`
- **Date**: 2026-08-19
- **Files changed**: `CHANGELOG.md`, `README.md`, `docs/api-model.md`, `docs/prd.md`, `docs/m28-design-review.md` (new)
- **Nature**: documentation-only — confirmed by the file list itself (no `backend/`, `frontend/`, `pipeline/`, dependency, or test file touched).
- **What it actually did**: reconciled README/CHANGELOG/`docs/prd.md` §3a/`docs/api-model.md` through M27 (the same four files, not `docs/architecture.md` or `docs/success-metrics.md` — a narrower file set than M23's own reconciliation pass, which touched six files. This distinction matters for M33's own CHANGELOG entry, §4).
- **API/route change**: none.
- **Frontend behavior change**: none.
- **Facts appropriate for README/CHANGELOG/PRD history**: it reconciled docs through M27, corrected `docs/prd.md` §3a's stale heading range, added the M25/M26 route rows to `docs/api-model.md`.
- **Must not claim**: any application capability — it shipped none.

### M29 — `dfa9525b384ce6409daf5fc34126c79c997096ec`
- **Commit subject**: `refactor(m29): extract shared driver strategy mapper`
- **Date**: 2026-08-19
- **Files changed**: `backend/app/api/_mappers.py` (new), `backend/app/api/driver_trends.py`, `backend/app/api/stints_compare.py`, `backend/app/api/tyre_performance.py`, `docs/m29-design-review.md` (new)
- **Nature**: backend-only refactor. **No test file appears in the commit** — confirmed directly from the file list, matching M29's own design review claim that existing route tests already covered the extracted mapper's behavior end-to-end and needed no modification.
- **What it actually did**: `_to_driver_strategy_summary` (three near-identical copies) collapsed into one `to_driver_strategy_summary` in the new `app/api/_mappers.py`, imported by all three original call sites.
- **API/route change**: none — response shape is byte-identical (the whole point of the extraction); confirmed no route file's `@router` decorators or response models changed.
- **Frontend behavior change**: none — backend-internal only.
- **Facts appropriate for history**: the mapper's new location and the three consumers it now serves.
- **Must not claim**: any API contract change, any new route, any test addition.

### M30 — `7162a3fa6890ac018e1c8eab5d8813875b7c1888`
- **Commit subject**: `fix(m30): upgrade frontend dependencies`
- **Date**: 2026-08-20
- **Files changed**: `docs/backlog.md`, `docs/m30-design-review.md` (new), `frontend/package-lock.json`, `frontend/package.json`
- **Nature**: frontend dependency/security remediation only.
- **Exact `package.json` diff** (verified via `git show 7162a3f -- frontend/package.json`):
  - `echarts`: `^5.5.0` → `^6.1.0`
  - `@vitejs/plugin-react`: `^4.3.0` → `^4.7.0`
  - `vite`: `^5.4.0` → `^6.4.3`
  - `vitest`: `^2.0.0` → `^3.2.7`
  - **`react-router-dom` is absent from this diff** — confirmed directly: M30 did **not** touch React Router's declared range at all (it only moved transitively, `6.30.4`→`6.30.6`, both still inside the vulnerable range per M30's own finding).
- **`docs/backlog.md` diff** (verified via `git show`): the security bullet changed from *"13 known `npm audit` vulnerabilities (6 high, 6 moderate, 1 critical)"* to *"2 known `npm audit` vulnerabilities remain (both moderate)"* — the residual 2 being the React Router advisories, explicitly **not** resolved by M30.
- **API/route change**: none.
- **Frontend behavior change**: none intended (dependency versions only; ECharts/Vite/Vitest majors, no source file touched).
- **Must not claim**: that M30 shipped any React Router version change, or that M30 reached 0 vulnerabilities. It shipped **2 remaining moderate vulnerabilities**, both React Router — resolved later, in M31.

### M31 — `6e43358acbb0ac8a1a78d0fca157015080b5a91f`
- **Commit subject**: `fix(m31): migrate React Router to v7`
- **Date**: 2026-08-20
- **Files changed** (22 total, verified via `git show --stat`): `docs/backlog.md`, `docs/m31-design-review.md` (new), `frontend/package-lock.json`, `frontend/package.json`, `frontend/src/main.tsx`, and 17 test files (`App.test.tsx`, `components/Sidebar.test.tsx`, and 15 `features/**/*.test.tsx` files).
- **Exact `package.json` diff**: `react-router-dom`: `^6.30.4` → `^7.18.2` — the only dependency line changed.
- **What it actually did**: removed the now-invalid `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` prop (obsoleted by react-router 7.18.2's actual shipped types, which replaced it with a `useTransitions?: boolean` default) from `main.tsx` and all 17 test files. No route path, hook signature, or URL-state behavior changed (verified in M31's own Stage B investigation against the real shipped `.d.ts`).
- **`docs/backlog.md` diff**: the React Router vulnerability bullet was **removed entirely** (22 lines deleted, 0 added) — the item was closed, not edited.
- **API/route change**: none — frontend-only.
- **npm audit end state**: **0 vulnerabilities** — re-confirmed live this session (`npm audit --json` → `{'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0, 'total': 0}`), matching M31's own claimed result.
- **Must not claim**: any route, URL contract, or data-router API change — none occurred.

### M32 — `cc7326c1f7065a19910f3579724456a6d149711a`
- **Commit subject**: `refactor(m32): share driver trend session type filters`
- **Date**: 2026-08-20
- **Files changed**: `docs/m32-design-review.md` (new), `frontend/src/components/sessionTypeLabels.ts`, and the four `frontend/src/features/driver-trends/*.tsx` pages (`DriverPaceTrendComparisonPage.tsx`, `DriverSeasonPaceTrendPage.tsx`, `DriverSeasonTyreTrendPage.tsx`, `DriverTyreTrendComparisonPage.tsx`)
- **Nature**: frontend-only refactor, no test file in the commit (matching M32's own design review: existing page tests already covered the constant's behavior end-to-end).
- **What it actually did**: `FILTERABLE_SESSION_TYPES` (four byte-identical local copies) collapsed into one export from `frontend/src/components/sessionTypeLabels.ts`, alongside the pre-existing `SESSION_TYPE_LABELS` export; all four pages now import it from there.
- **API/route change**: none.
- **Data change**: none — the constant's value and order are unchanged (verified byte-for-byte in M32's own Stage B/C).
- **Must not claim**: any new capability, any API/data change, any test addition.

## 4. README.md — Design

Current structure (verified fresh, lines 32–69 of the current file):
- Line 32: `**Current milestone: M27 — Comparison-surface consistency pass — complete.**`
- A `| # | Milestone | Status |` table ending at the M27 row.
- The paragraph immediately below the table states `M8–M27 extend beyond the original V1 roadmap...` (two occurrences of "M8–M27" in that paragraph, per direct grep).

**Planned changes** (minimum accurate diff, same style/terminology as every prior row):
1. Line 32 → `**Current milestone: M32 — Shared session-type filter constant — complete.**`
2. Append five rows after the existing M27 row:

   | # | Milestone | Status |
   |---|---|---|
   | M28 | Documentation & roadmap reconciliation (M23–M27) | ✅ Done |
   | M29 | Shared driver-strategy mapper extraction (backend) | ✅ Done |
   | M30 | Frontend dependency & security remediation | ✅ Done |
   | M31 | React Router 6→7 migration | ✅ Done |
   | M32 | Shared session-type filter constant (frontend) | ✅ Done |

3. Update both "M8–M27" occurrences in the paragraph below the table to "M8–M32" — mirrors exactly how M23's and M28's own README edits updated the prior range each time.

**No other README content is touched** — "Current capabilities," Quick start, Docker, Documentation table, ADR index, and Disclaimer sections describe V1-level capability that M28–M32 did not change.

## 5. CHANGELOG.md — Design

Current structure (verified fresh): `[Unreleased]` reads *"Nothing in progress — M27 is the most recently completed milestone..."*, immediately followed by `## M27 — Comparison-Surface Consistency Pass — 2026-08-19` and its `### Added`/`### Changed` sections.

**Planned changes:**
1. `[Unreleased]` → *"Nothing in progress — M32 is the most recently completed milestone (see `README.md`'s Project status)."* — same sentence shape as every prior update.
2. Insert five new `## Mxx — Title — Date` sections, in reverse-chronological order, immediately above the existing `## M27` header (matching the file's own established ordering and the exact `### Added`/`### Changed` structure every prior entry uses), grounded strictly in §3's verified facts:

   - `## M32 — Shared Session-Type Filter Constant — 2026-08-20` — `### Added`: `FILTERABLE_SESSION_TYPES` exported from `frontend/src/components/sessionTypeLabels.ts`. `### Changed`: the four driver-trends pages now import it instead of each declaring a local copy; no API/data change.
   - `## M31 — React Router 6→7 Migration — 2026-08-20` — `### Changed`: `react-router-dom` `6.30.4`→`7.18.2`; removed the now-invalid `future={{...}}` prop from `main.tsx` and 17 test files; `npm audit` 2→0 vulnerabilities. No route, hook, or URL-contract change.
   - `## M30 — Frontend Dependency / Security Remediation — 2026-08-20` — `### Changed`: `vite` 5.4.0→6.4.3, `vitest` 2.0.0→3.2.7, `@vitejs/plugin-react` 4.3.0→4.7.0, `echarts` 5.5.0→6.1.0, plus transitive patch-level fixes; `npm audit` 13→2 vulnerabilities (both moderate, React Router — not resolved by this milestone, resolved by M31).
   - `## M29 — Shared Driver-Strategy Mapper — 2026-08-19` — `### Added`: `backend/app/api/_mappers.py`. `### Changed`: `driver_trends.py`/`stints_compare.py`/`tyre_performance.py` now import the shared `to_driver_strategy_summary`; no API/response-contract change.
   - `## M28 — Documentation & Roadmap Reconciliation (M23–M27) — 2026-08-19` — `### Changed`: reconciled `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/api-model.md` through M27 (four files — not `docs/architecture.md`/`docs/success-metrics.md`, per §3's verified file list).

3. **No existing entry (M0–M27) is edited, reordered, or reworded** — additions only, matching every prior reconciliation pass's own discipline.

## 6. `docs/prd.md` — Design

Current structure (verified fresh): §3a's heading reads `## 3a. Milestone History Beyond V1 (M8–M27)`, its table ends at the M27 row, and its trailing pointer sentence lists `docs/m16-design-review.md`, `docs/m20-design-review.md`, `docs/m23-design-review.md`, and `docs/m28-design-review.md`.

**Planned changes:**
1. §3a heading → `## 3a. Milestone History Beyond V1 (M8–M32)`.
2. Append five rows after the existing M27 row, matching the table's exact two-column ("What shipped" / "Relationship to the original roadmap") convention every existing row uses:

   | Milestone | What shipped | Relationship to the original roadmap |
   |---|---|---|
   | M28 | Documentation & roadmap reconciliation (`docs/m28-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
   | M29 | Shared `to_driver_strategy_summary` backend mapper extraction | Not itself named in the original roadmap; maintainability-only, no capability change |
   | M30 | Frontend dependency/security remediation (Vite, Vitest, `@vitejs/plugin-react`, ECharts) | Not itself named in the original roadmap; security/maintainability debt, no capability change |
   | M31 | React Router 6→7 migration | Not itself named in the original roadmap; closes the security debt M30 left open, no capability change |
   | M32 | Shared `FILTERABLE_SESSION_TYPES` frontend constant | Not itself named in the original roadmap; maintainability-only, no capability change |

3. Trailing pointer sentence: append `docs/m33-design-review.md`.
4. Document-history block: append one `v7` entry, matching the exact phrasing pattern of `v3`–`v6`, e.g.: *"v7 (M33, `docs/m33-design-review.md`): extended §3a through M32 (M28 docs reconciliation, M29 shared strategy-mapper extraction, M30 dependency/security remediation, M31 React Router 7 migration, M32 shared session-type filter constant). §5 re-verified against current source with no edit needed. No scope or architecture change — documentation reconciliation only."*

**§5 (deferred-features table): no edit.** Re-verified fresh this session (§7 below) — every row is still accurate; none of M28–M32 shipped, changed, or invalidated anything §5 describes.

**§1–§4: untouched** — none of M28–M32 changed vision, scope, the original V1 roadmap, or engineering risks.

## 7. `docs/api-model.md` — No Change Required

Fresh, direct verification this session:
- Backend route enumeration (`grep -rc "@router\.\(get\|post\|put\|delete\)" backend/app/api/*.py`, summed): **22** routes.
- `docs/api-model.md`'s documented `| GET |` rows: **21** (plus `/health`, deliberately and correctly excluded from this table per its own established convention) = **22**.
- The two most recent routes documented (M25/M26's `pace-trend/compare` and `tyre-trend/compare`) are already present, added by M28's own reconciliation pass.
- M29, M30, M31, and M32 are independently confirmed, from their exact git-verified file lists (§3), to have added **zero** new routes: M29 touched only route *implementation* files without changing any `@router` decorator or response model (its own design review's explicit invariant); M30/M31 touched only frontend dependency/router-library files; M32 touched only a frontend constant.

**Conclusion: `docs/api-model.md` requires no change.** The route table already exactly matches the current API.

## 8. Other Documentation

- **`docs/architecture.md`**: grepped fresh for any M27–M32 or React-Router-version reference — the only routing-related line is `| Routing | react-router-dom | ADR-0010 |`, which names the library, not a version, so M31's version bump does not make it false. `_mappers.py` is an implementation detail of the anti-corruption boundary ADR-0009 already describes generically, not a named file this document commits to. **No edit required.**
- **`docs/success-metrics.md`**: grepped fresh for M27–M32 — zero mentions. Every V1–V5 success criterion it states is unaffected by M28–M32 (none of them shipped a V-criterion). **No edit required**, matching M28's own precedent finding the same thing.
- **`docs/backlog.md`**: read fresh this session — its current four items (CI `permissions:` block, `test_health.py` deprecation warning, two empty-state test gaps, `get_telemetry` construction cost, Docker Python-version mismatch, no-`CONTRIBUTING.md`) are unchanged by M28–M32 and remain accurate as written; the one item M28–M32 *did* affect (the React Router vulnerability bullet) was already correctly removed by M31 itself, not left for this milestone. **No edit required** — nothing in this file is stale or incorrect because of M28–M32.

## 8a. Truthfulness Validation Method

Every claim in §3–§7 was checked against one or more of: `git show <commit>` (title, date, exact file list), a targeted `git show <commit> -- <file>` diff (for `package.json` and `docs/backlog.md` specifically), direct source/route enumeration (`grep -rc "@router\..." backend/app/api/*.py`), and a live `npm audit --json` re-run. No claim in this design review, and none planned for Stage C, is sourced from a prior design review's summary text alone without this independent check — per the explicit instruction, milestone reports were not trusted where git/source evidence could instead be consulted directly.

## 9. Approved Stage C File Scope

**Definitely required:**
- `README.md`
- `CHANGELOG.md`
- `docs/prd.md`
- `docs/m33-design-review.md` (already created — this file)

**Not required (explicit no-edit decisions, evidenced in §7/§8):**
- `docs/api-model.md` — route table already exactly matches current API (22/22).
- `docs/architecture.md` — no M28–M32 fact makes any existing statement false.
- `docs/success-metrics.md` — no M28–M32 fact touches any stated success criterion.
- `docs/backlog.md` — no stale or incorrect claim found; the one relevant change (React Router closure) already happened in M31.

**Forbidden, per explicit instruction:** any backend, frontend, test, dependency manifest (`package.json`/`package-lock.json`), data, pipeline, CI, or Docker file.

## 10. Validation Plan (Stage C)

Documentation-only — no frontend/backend test suite run is required or appropriate.

1. `git diff --check` — no trailing-whitespace/conflict-marker issues.
2. `grep -n "M27" README.md CHANGELOG.md` and confirm the "current milestone"/"most recently completed" statements no longer name M27 as current.
3. Confirm M28–M32 each appear **exactly once**, in the expected section, in all three edited files.
4. Confirm milestone ordering: README's table strictly ascending M0→M32; CHANGELOG strictly descending (newest first) with M32 immediately above the pre-existing M27 entry; `docs/prd.md` §3a strictly ascending.
5. `grep -n "M8–M27\|M8–M19"` across the three edited files — confirm no obsolete range remains where it should now read "M8–M32".
6. Re-run this stage's own git-verification steps (§3) against the *final* edited text — confirm every new claim still matches `git show`, not just the plan.
7. Spot-check internal links referenced or added (`docs/m28-design-review.md` through `docs/m32-design-review.md`, `docs/m33-design-review.md`) actually exist as files.
8. Confirm no capability claim was introduced anywhere that M28–M32 did not actually ship (cross-check against §3's "must not claim" lines for each milestone).

## 11. Risks

- **Date-formatting risk**: none — every one of M28–M32's actual commit dates was pulled directly from `git show`, not assumed; CHANGELOG's existing date-only granularity convention is preserved.
- **Over-claiming risk**: mitigated by §3's explicit "must not claim" line per milestone (especially M30 not claiming React Router 7, and M29/M32 not claiming any API/data change) — the single biggest truthfulness risk in this kind of pass, and the one this stage spent the most verification effort on.
- **Scope-creep risk**: mitigated by §9's explicit no-edit list with evidence for each; nothing is added to Stage C's file scope "to make the reconciliation feel complete."
- **Rollback**: trivial — three documentation files, no code, no dependency, no schema; `git checkout -- README.md CHANGELOG.md docs/prd.md` fully reverses Stage C if needed, before anything is committed.

## 12. Explicit Non-Goals

`FILTERABLE_SESSION_TYPES` (already done, M32); `_to_stint_pace` extraction (still 2 copies, below threshold); trend-hook consolidation (confirmed non-duplicative in M32's own Stage A); any dependency upgrade; any React Router work; bundle-size/performance work; CI `permissions:` fix; Docker fixes; weather/position/standings/race-control; exports; AI/NL; live timing; any API or application-code change of any kind.

## 13. Deviations from Stage A

None. Stage A's scoping (README/CHANGELOG/`docs/prd.md` as the likely-required set, `docs/api-model.md` as "possibly required, pending fresh verification") is confirmed exactly: `docs/api-model.md` needed no edit, verified precisely in §7, not assumed.

## 14. Stage C — Actual Implementation

**Final scope, exactly as approved — no deviation:**
- `README.md` — modified
- `CHANGELOG.md` — modified
- `docs/prd.md` — modified
- `docs/m33-design-review.md` — this file, finalized
- No other file touched: `docs/api-model.md`, `docs/architecture.md`, `docs/success-metrics.md`, `docs/backlog.md`, `docs/m9-design-review.md`, and every backend/frontend/test/dependency/CI/Docker/pipeline/data file remain byte-identical to the M32 baseline — confirmed by `git diff --name-only` returning exactly the three approved files (§15).

**Per-file changes actually made:**

*README.md*: "Current milestone" line changed from M27 to *"M32 — Shared session-type filter constant — complete."*; five rows appended to the milestone table (M28–M32, using the exact titles planned in §4); both "M8–M27" occurrences in the paragraph below the table updated to "M8–M32."

*CHANGELOG.md*: `[Unreleased]` updated to name M32 as most recently completed; five new sections (`## M32` down to `## M28`) inserted in reverse-chronological order immediately above the pre-existing `## M27` entry, each grounded in §3's git-verified facts — in particular, M30's entry states plainly that its 2 residual vulnerabilities were *not* resolved by that milestone, and M29/M32's entries both explicitly state "no API/data change." No existing M0–M27 entry was edited, reordered, or reworded.

*docs/prd.md*: §3a heading changed to "(M8–M32)"; five rows appended to the milestone-history table; the trailing pointer sentence now also names `docs/m33-design-review.md`; one new `v7` document-history entry appended, matching the exact phrasing convention of `v3`–`v6`. §1–§2, §3, §4, and §5 were not touched — §5 was re-read fresh this stage and confirmed still accurate (no edit needed, matching the plan).

## 15. Validation Results (Stage C)

1. `git diff --check` — clean, exit 0.
2. `git diff --name-only` — exactly `CHANGELOG.md`, `README.md`, `docs/prd.md`. No other file appears.
3. Stale-reference check: `grep -n "Current milestone" README.md` → names M32, not M27. `grep -n "M8–M27" README.md` → no matches (the range reference was fully updated). `grep -n "M27 is the most recently" CHANGELOG.md` → no matches. `docs/prd.md`'s only remaining "M8–M27" text is inside the `v6` document-history entry, which correctly and historically describes what M28 itself extended §3a to at the time — not a live claim about current state.
4. Ordering verified directly: CHANGELOG's five new `## Mxx` headers read M32, M31, M30, M29, M28 top-to-bottom (strictly descending, immediately above the untouched M27 entry); README's and `docs/prd.md`'s new rows are in strictly ascending M28→M32 order.
5. Every M28–M32 claim was cross-checked against `git show <commit>` a second time at the start of this stage (§3's facts re-confirmed: commit subjects and dates all matched exactly) before any file was edited, and again via the post-edit greps above.
6. No capability claim exceeds what its commit's file list shows it shipped — in particular, M30's entry does not mention React Router, and M29/M32's entries both explicitly state no API/data change, matching §3's "must not claim" constraints exactly.
7. Internal links: `docs/m28-design-review.md` through `docs/m32-design-review.md`, and `docs/m33-design-review.md` itself, all confirmed to exist on disk (§15 file-existence check, all six `OK`).
8. Frontend/backend test suites were **not** run — correctly, since this is a documentation-only change with zero source-file impact.

No browser or runtime testing was performed or claimed — not applicable to a documentation-only change.

## 16. Deviations from Plan

None. Stage C implemented exactly the scope Stage B approved, with no file added to or removed from the plan, and no claim beyond what §3's git-verified facts support.

---

**STOP — Stage C complete. Awaiting explicit approval before `git add`/`commit`/`push`.**
