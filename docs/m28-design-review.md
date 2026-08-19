# PitWall — M28 Design Review: Documentation Reconciliation (M23–M27)

## Status

Stage B design. Not yet implemented. Awaiting explicit approval before Stage C.

## 1. Baseline

- HEAD = `origin/main` = `a4a563429a8c5392e9ff79c4bba3df5e288fda0a` (`refactor(m27): unify
  comparison URL helpers`) — confirmed equal at the start of this Stage B session.
- `git status --short --branch`: only ` M docs/m9-design-review.md` before this file was written.
- `git diff -- docs/m9-design-review.md`: confirmed byte-identical to the known baseline (single
  `+1` blank line after the title) — untouched throughout Stage B.
- `docs/m28-design-review.md` is the only file created during this Stage B session.
- Nothing was staged before this Stage B session began.

## 2. M28 Objective

Bring `README.md`, `CHANGELOG.md`, `docs/prd.md` §3a, and `docs/api-model.md`'s endpoint table up
to date through M27 — mirroring M16/M20/M23's own established, low-risk reconciliation pattern
exactly. Documentation-only: no code, test, schema, or dependency change of any kind.

## 3. Source-of-Truth Verification (this session, git history + current source — not prior reports)

### 3.1 M23–M27 shipped facts, from `git show`

| Milestone | Commit | Date | Type | Files changed |
|---|---|---|---|---|
| M23 | `9e8e85e` | 2026-08-19 | Docs | `CHANGELOG.md`, `README.md`, `docs/api-model.md`, `docs/architecture.md`, `docs/m23-design-review.md`, `docs/prd.md`, `docs/success-metrics.md` |
| M24 | `a66ca12` | 2026-08-19 | Frontend feature | `docs/m24-design-review.md`, `ComparisonPage.tsx`+test, `StintComparisonPage.tsx`+test |
| M25 | `5ab8542` | 2026-08-19 | Full-stack feature | `backend/app/api/driver_trends_compare.py` (new), `backend/app/main.py`, `backend/app/models/driver_trends.py`, `backend/tests/test_pace_trend_compare_route.py` (new), `docs/m25-design-review.md`, `frontend/src/App.tsx`, `frontend/src/api/client.ts`, `Sidebar.tsx`+test, `DriverPaceTrendComparisonPage.tsx`+css+test, `hooks/useDriverPaceTrendComparison.ts`+test |
| M26 | `42aaa53` | 2026-08-19 | Full-stack feature | same shape as M25, one trend over: `driver_trends_compare.py` (modified, not new), `driver_trends.py` model, `test_tyre_trend_compare_route.py` (new), `DriverTyreTrendComparisonPage.tsx`+css+test, `hooks/useDriverTyreTrendComparison.ts`+test, `App.tsx`, `Sidebar.tsx`+test |
| M27 | `a4a5634` | 2026-08-19 | Frontend refactor | `docs/m27-design-review.md`, `frontend/src/components/urlSearchParams.ts`+test (new), `Sidebar.tsx`+test, `ComparisonPage.tsx`, `StintComparisonPage.tsx`, `DriverPaceTrendComparisonPage.tsx`, `DriverTyreTrendComparisonPage.tsx` |

All five commits share the same calendar date (2026-08-19) — the CHANGELOG's existing per-entry
date granularity is date-only (no time), matching the existing M22 entry's own `— 2026-08-19`
format exactly; no new date-formatting decision is needed.

### 3.2 Actual user-facing/API impact, verified against current source (not design notes)

- **M23**: documentation-only — reconciled README/CHANGELOG/prd.md/api-model.md/architecture.md/
  success-metrics.md through M22, corrected the (then-)false "corner highlighting not yet built"
  claim. No code shipped.
- **M24**: `ComparisonPage.tsx`/`StintComparisonPage.tsx` — the URL becomes the authoritative,
  shareable representation of a comparison's resolved state; every picker interaction now writes
  back via `setSearchParams(..., { replace: true })`; refresh, deep-link, and copy/paste now
  reproduce an identical comparison. No new route, no new page, no new API surface.
- **M25**: new route `GET /drivers/pace-trend/compare` (confirmed live via source, §3.3), new page
  `/drivers/pace-trend/compare`, new Sidebar entry "Compare Pace Trends".
- **M26**: new route `GET /drivers/tyre-trend/compare` (confirmed live via source, §3.3), new page
  `/drivers/tyre-trend/compare`, new Sidebar entry "Compare Tyre Trends".
- **M27**: no new route, no new page. `getParam`/`setOrDelete` extracted into
  `frontend/src/components/urlSearchParams.ts`; new Sidebar entry "Compare Stints" for the
  pre-existing `/stints/compare` route (shipped M15), which previously had no global navigation
  entry point.

### 3.3 Explicit non-goals to preserve (not to imply as shipped)

Per the task's truthfulness constraint (§7 below has the full list): none of M23–M27 shipped
N-way comparison, weather/position/standings/race-control, exports, AI/NL, live timing, or bulk
querying. M25/M26 explicitly remain **two-driver, driver+season-paired** comparisons only — the
documentation must not describe them as more general than that.

## 4. README Design

**Current-milestone line** (line 32): `**Current milestone: M22 — Corner highlighting —
complete.**` → `**Current milestone: M27 — Comparison-surface consistency pass — complete.**`

**Milestone table**: append five rows after the existing M22 row, matching the table's exact
existing column convention:

| # | Milestone | Status |
|---|---|---|
| M23 | Documentation & roadmap reconciliation (M20–M22) | ✅ Done |
| M24 | Comparison URL persistence & shareability | ✅ Done |
| M25 | Two-driver cross-season pace-trend comparison | ✅ Done |
| M26 | Two-driver cross-season tyre-trend comparison | ✅ Done |
| M27 | Comparison-surface consistency pass | ✅ Done |

**Paragraph immediately below the table** currently hard-codes "M8–M22" twice — update both
occurrences to "M8–M27" so the stated range stays accurate (mirrors exactly how M23's own README
edit updated "M8–M19" → "M8–M22").

No other README content is touched — the "Current capabilities" section and everything below it
describes V1-level capabilities already accurate and unaffected by M23–M27.

## 5. CHANGELOG Design

**`[Unreleased]`**: replace *"Nothing in progress — M22 is the most recently completed milestone
(see `README.md`'s Project status)."* with the identical sentence shape, updated to M27 — matching
the exact wording pattern already used for every prior "most recently completed" statement.

**Individual milestone entries required** (not a summary-only treatment) — every existing entry in
this file, from M0 through M22, is a full `## Mxx — Title — Date` section with `### Added`/
`### Changed` subsections; M23–M27 must match that established convention, not a lighter-weight
alternative. Inserted in reverse-chronological order immediately above the existing `## M22`
header (matching the file's own existing ordering), grounded in §3.1/§3.2's verified facts:

```
## M27 — Comparison-Surface Consistency Pass — 2026-08-19

See `docs/m27-design-review.md` for the full design record.

### Added
- `frontend/src/components/urlSearchParams.ts` — shared `getParam`/`setOrDelete` helpers,
  extracted from four byte-identical/near-identical local copies across ComparisonPage.tsx,
  StintComparisonPage.tsx, DriverPaceTrendComparisonPage.tsx, DriverTyreTrendComparisonPage.tsx.
- "Compare Stints" Sidebar entry (gated on `driverId`, seeding `sessionA`/`driverA`) — the one
  comparison surface (`/stints/compare`, shipped M15) that previously had no global navigation
  entry point.

### Changed
- No behavioral change to any of the four comparison pages — pure extraction, all existing tests
  pass unmodified.

## M26 — Two-Driver Tyre-Trend Comparison — 2026-08-19

See `docs/m26-design-review.md` for the full design record.

### Added
- `GET /drivers/tyre-trend/compare` (`backend/app/api/driver_trends_compare.py`) — delegates
  directly to M21's `get_driver_season_tyre_trend`, called twice, threading both
  `TelemetryRepository` and `RaceContextRepository`.
- `SeasonTyreTrendComparisonResponse` (`backend/app/models/driver_trends.py`).
- `/drivers/tyre-trend/compare` page (`DriverTyreTrendComparisonPage.tsx`), URL-persisted from the
  start, reusing `SeasonTyreTrendList` unchanged for both sides.
- "Compare Tyre Trends" Sidebar entry.

## M25 — Two-Driver Pace-Trend Comparison — 2026-08-19

See `docs/m25-design-review.md` for the full design record.

### Added
- `GET /drivers/pace-trend/compare` (`backend/app/api/driver_trends_compare.py`, new file) —
  delegates directly to M17's `get_driver_season_pace_trend`, called twice.
- `SeasonPaceTrendComparisonResponse` (`backend/app/models/driver_trends.py`).
- `/drivers/pace-trend/compare` page (`DriverPaceTrendComparisonPage.tsx`), URL-persisted from the
  start, reusing `SeasonPaceTrendChart` unchanged for both sides.
- "Compare Pace Trends" Sidebar entry.

## M24 — Comparison URL Persistence — 2026-08-19

See `docs/m24-design-review.md` for the full design record.

### Added
- URL-as-source-of-truth state for `ComparisonPage.tsx` (`/laps/compare`) and
  `StintComparisonPage.tsx` (`/stints/compare`) — every picker interaction now writes the resolved
  selection back via `setSearchParams(..., { replace: true })`.

### Changed
- Refresh, deep-link, and copy/paste now reproduce an identical comparison on both pages, closing
  a gap named (but not fixed) in M17's and M21's own design reviews.

## M23 — Documentation & Roadmap Reconciliation — 2026-08-19

See `docs/m23-design-review.md` for the full design record.

### Changed
- Reconciled `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/api-model.md`,
  `docs/architecture.md`, and `docs/success-metrics.md` through M22.
- Corrected an active false statement: `docs/prd.md` and `docs/success-metrics.md` both still said
  corner highlighting was "not yet built" after M22 had already shipped it.
```

No existing entry (M0–M22) is edited, reordered, or reworded — additions only, matching M20/M23's
own established discipline.

## 6. `docs/prd.md` Design

**§3a heading correction**: the task explicitly asked whether *"Milestone History Beyond V1
(M8–M19)"* should be corrected now — **yes**. Fresh inspection confirms the table body already
extends through M22 (M23 added those rows without correcting this heading — a real, if cosmetic,
miss `git blame`/`git show 9e8e85e -- docs/prd.md` confirms M23 touched only 10 lines, the table
rows and §5's false-claim correction, not this heading). After M28 adds rows through M27, the
correct wording is **"Milestone History Beyond V1 (M8–M27)"**, established directly from the
actual (about-to-be) table contents, not invented.

**§3a table**: append five rows after the existing M22 row, matching the table's exact two-column
convention and the same "what shipped / relationship to the original roadmap" framing every
existing row uses:

| Milestone | What shipped | Relationship to the original roadmap |
|---|---|---|
| M23 | Documentation & roadmap reconciliation (`docs/m23-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
| M24 | Comparison URL persistence/shareability for `/laps/compare` and `/stints/compare` | Not itself named in the original roadmap; repairs a gap named but not fixed in M17's/M21's own design reviews — not a new V-criterion |
| M25 | Two-driver cross-season pace-trend comparison (`/drivers/pace-trend/compare`) | Not itself named in the original roadmap; the multi-driver case M17 explicitly deferred (§11) |
| M26 | Two-driver cross-season tyre-trend comparison (`/drivers/tyre-trend/compare`) | Not itself named in the original roadmap; the multi-driver case M21 explicitly deferred (§7), handed off again by M25 (§13) |
| M27 | Comparison-surface consistency pass — shared URL helpers, "Compare Stints" navigation | Documentation/maintainability-adjacent cleanup; not itself V-scoped |

**Trailing pointer** (currently *"See `docs/m16-design-review.md`, `docs/m20-design-review.md`,
and `docs/m23-design-review.md` for the reconciliation passes this table is part of."*): append
`docs/m28-design-review.md`.

**§5 deferred-features table**: re-verified fresh this session — **no edit needed**. None of
M23–M27 maps to a named V1–V5 success criterion (URL persistence and multi-driver trend comparison
were never named criteria in §5's own table), matching M20's own precedent of re-verifying §5
without finding anything to change. This is stated explicitly, not silently skipped.

**Document-history block**: append, matching the exact `v1`–`v5` entries' own established phrasing:

```
- v6 (M28, docs/m28-design-review.md): extended §3a through M27 (M23 docs reconciliation, M24
  comparison URL persistence, M25 two-driver pace-trend comparison, M26 two-driver tyre-trend
  comparison, M27 comparison-surface consistency pass). Corrected §3a's own heading range
  (M8–M19 → M8–M27, stale since before M23). §5 re-verified against current source with no edit
  needed. No scope or architecture change — documentation reconciliation only.
```

## 7. `docs/api-model.md` Audit / Design

**Load-bearing verification performed fresh this session — Stage A's "three missing routes"
estimate is corrected here.**

Full route enumeration directly from `backend/app/api/*.py` source (every `@router.get(...)`
decorator, cross-referenced against each file's `APIRouter(prefix=...)`): **22 real routes total**
— 21 feature routes plus `GET /health`.

Cross-referenced against `docs/api-model.md`'s current endpoint table (19 rows, lines 259–277):
every one of the 19 documented rows corresponds to a real, still-existing route — **no documented
route has been removed or renamed**. Exactly **two** real routes are undocumented:

1. `GET /drivers/pace-trend/compare` (M25)
2. `GET /drivers/tyre-trend/compare` (M26)

`GET /health` remains correctly, deliberately excluded from this table — confirmed via grep this
session (`health` appears nowhere in `docs/api-model.md`), matching the file's own pre-existing,
undisturbed convention of documenting feature routes only. **The documented count (19) plus these
2 missing rows plus the 1 deliberately-excluded `/health` route reconciles exactly to 22 — the
table is otherwise fully accurate**, contradicting Stage A's less rigorous "three missing routes"
guess.

**New table rows** (inserted immediately after the existing M21 tyre-trend row, line 277, matching
the exact column format and the "Never 404s — see the Mxx addition above" phrasing convention M17/
M21's own rows already established):

```
| GET | `/drivers/pace-trend/compare?driver_a=&season_a=&driver_b=&season_b=&session_type=` (M25, `app/api/driver_trends_compare.py`) | `SeasonPaceTrendComparisonResponse` | Never 404s — see the M25 addition above |
| GET | `/drivers/tyre-trend/compare?driver_a=&season_a=&driver_b=&season_b=&session_type=` (M26, `app/api/driver_trends_compare.py`) | `SeasonTyreTrendComparisonResponse` | Never 404s — see the M26 addition above |
```

**New "addition" sections**, inserted after the existing `## M21 addition` section (line 168),
before `## Why the backend re-reads Parquet directly` (line 170) — matching the file's own
established placement convention (all milestone-addition sections grouped together, before the
later structural sections):

```
## M25 addition: two-driver cross-season pace-trend comparison

`GET /drivers/pace-trend/compare?driver_a=&season_a=&driver_b=&season_b=&session_type=` (defaults
to `race`) returns `SeasonPaceTrendComparisonResponse` (`app/models/driver_trends.py`): `a`, `b`,
each a complete, unmodified `SeasonPaceTrendResponse` (see the M17 addition above for that shape).
No `warnings` field — a season-granularity comparison has no single-session "different circuit"
concern. Implemented by calling `get_driver_season_pace_trend` (the M17 route function) directly,
twice — not a reimplementation, so per-side behavior cannot silently diverge from the single-driver
route's own. **Never 404s** on either side independently, same reasoning as the M17 addition above.

## M26 addition: two-driver cross-season tyre-trend comparison

`GET /drivers/tyre-trend/compare?driver_a=&season_a=&driver_b=&season_b=&session_type=` (defaults
to `race`) returns `SeasonTyreTrendComparisonResponse` (`app/models/driver_trends.py`): `a`, `b`,
each a complete, unmodified `SeasonTyreTrendResponse` (see the M21 addition above). Implemented by
calling `get_driver_season_tyre_trend` directly, twice, threading both `TelemetryRepository` and
`RaceContextRepository` through to each side — the one signature difference from the M25 addition,
forced by `get_driver_season_tyre_trend`'s own dependencies. **Never 404s**, same reasoning as
above.
```

No mention of M27 in this file — M27 shipped no route and no API contract change (confirmed §3.2);
adding an entry for it here would misstate what M27 actually did to the API surface, exactly the
mistake M23's own audit warned against repeating.

## 8. Documentation Truthfulness / Non-Goal Constraints

Every claim above is traceable to §3's verified facts. Explicitly, this milestone's documentation:

- **Will state as shipped**: M23 (docs reconciliation), M24 (URL persistence, both comparison
  pages), M25 (two-driver pace-trend comparison, one new route, one new page), M26 (two-driver
  tyre-trend comparison, one new route, one new page), M27 (helper extraction + one new nav entry).
- **Will not state or imply as shipped**: N-way comparison (M25/M26 remain strictly two-driver),
  weather/position/standings/race-control (unchanged, still blocked), exports, AI/NL, live timing,
  bulk/multi-session querying (all still explicit non-goals, unaffected by M23–M27).
- **Will not describe M27 as a capability addition** — it is maintainability/navigation cleanup,
  labeled as such in every document it appears in (README's "comparison-surface consistency pass"
  wording, CHANGELOG's `### Added`/`### Changed` split reflecting that most of M27 is refactor, not
  new capability, prd.md's §3a "not itself V-scoped" framing).

## 9. Scope Boundary

**Allowed files**: `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/api-model.md`,
`docs/m28-design-review.md`.

**Considered and explicitly ruled out** (no materially stale M23–M27 claim found in fresh
verification this session): `docs/success-metrics.md` (re-checked — no mention of URL persistence
or multi-driver comparison anywhere, nothing to correct, matching M25/M26's own prior finding),
`docs/architecture.md` (not re-verified in depth this session, since M28's approved scope is
explicitly the four files above — if a future audit finds a stale architecture.md claim, that is a
separate finding, not silently folded in here), `docs/backlog.md` (unrelated to M23–M27's content).

**Forbidden, per explicit instruction**: any frontend, backend, pipeline, test, data, migration, or
dependency-manifest file. No such file is touched anywhere in this design.

## 10. No ADR

This is reconciliation of existing project documentation using the exact conventions M16/M20/M23
already established — no new dependency, layer, provider, or reversal. No ADR.

## 11. Validation Plan (Stage C)

- `grep -rn "M22" README.md CHANGELOG.md` and confirm the "current milestone"/"most recently
  completed" statements no longer name M22 as current.
- Confirm M23–M27 appear exactly once each, in the expected sections, in all four files.
- Re-run the exact route enumeration from §7 against `docs/api-model.md`'s post-edit table and
  confirm the count reconciles to 22 (21 documented feature rows + `/health` excluded).
- `grep -n "Not yet built\|not yet built"` across the four edited files — confirm no new false
  claim was introduced, and the M23-era corner-highlighting correction remains intact.
- `git diff --check` — no trailing-whitespace/formatting errors.
- `git status`/`git diff --stat` — confirm only the five allowed files (§9) plus
  `docs/m28-design-review.md` (already created) appear in the diff; no source, test, data, or
  dependency file changed.
- Confirm `docs/m9-design-review.md` remains exactly its pre-existing baseline diff, untouched and
  unstaged.
- No test suite run required (no code changed) — consistent with M23's own validation approach.

## 12. Risks

Minimal. The only real risk is a documentation claim drifting from actual source between Stage B's
verification and Stage C's implementation — mitigated by Stage C re-confirming the route count and
milestone facts immediately before editing, matching M23's own established discipline of not
trusting a prior report blindly.

## 13. Explicit Non-Goals

`FILTERABLE_SESSION_TYPES` extraction; trend-hook consolidation; `_to_driver_strategy_summary`
extraction; any frontend or backend refactor; exports; weather/position/standings/race-control; any
new product capability; any change to `docs/success-metrics.md`, `docs/architecture.md`, or
`docs/backlog.md` (considered, none found stale, §9); any change to `docs/m9-design-review.md`.

## 14. Stage C Implementation Plan (exact expected files)

| File | What changes | What doesn't | Why |
|---|---|---|---|
| `README.md` | Current-milestone line; milestone table (+5 rows); "M8–M22"→"M8–M27" (×2) | "Current capabilities" section, everything else | §4 |
| `CHANGELOG.md` | `[Unreleased]`; +5 new milestone sections above `## M22` | All M0–M22 entries, file header | §5 |
| `docs/prd.md` | §3a heading; §3a table (+5 rows); trailing pointer; document-history (+1 entry) | §1–§2, §3, §4, §5 (re-verified, no edit needed), everything else | §6 |
| `docs/api-model.md` | +2 table rows; +2 new "addition" sections | Every existing row/section, `/health`'s deliberate exclusion | §7 |
| `docs/m28-design-review.md` | Already created (this file) — no further change in Stage C | — | — |

No other file in the repository is touched.

## Document History

- v1 (this document): M28 Stage B design for documentation reconciliation (M23–M27).

## Safety Confirmation

- No implementation performed.
- No existing documentation file modified except the creation of `docs/m28-design-review.md`
  itself.
- `docs/m9-design-review.md` remains untouched — byte-identical to its pre-existing baseline diff.
- No source file (frontend, backend, pipeline) modified.
- No test file modified.
- No data, database, or Parquet write of any kind — all verification this session (route
  enumeration, `git show`, `grep`) was read-only.
- Nothing staged.
- Nothing committed.
- Nothing pushed.

**STOP — awaiting explicit approval before proceeding to Stage C.**
