# PitWall — M39 Design Review: Documentation Reconciliation (M33–M38)

## 1. Objective

Bring `README.md`, `CHANGELOG.md`, `docs/prd.md`, and `docs/success-metrics.md` current through
M38, correcting every statement M33–M38 made stale or actively false — not a rewrite, a targeted
reconciliation, matching the established pattern of M16/M20/M23/M28/M33.

## 2. Stage A Findings (Carried Forward)

M39 Stage A found the M33→M38 gap (6 milestones) to be the largest in the project's history (prior
gaps: 4, 3, 5, 5), combined with an active, worsening false statement in `docs/prd.md` and
`docs/success-metrics.md` claiming position history is "not yet built" — false since M35 shipped it
and more false since M38 backfilled it historically. No product/data/tech-debt candidate cleared an
equivalent evidence bar. Stage A characterized `docs/data-model.md`/`docs/api-model.md` as "already
current through M36" — **Stage B found this needs a correction; see §9 Deviations.**

## 3. Exact Documentation Drift (Verified Against Source)

| Doc | Claim | Reality | Severity |
|---|---|---|---|
| `README.md:32` | "Current milestone: M32 ... complete." | M38 is the last shipped milestone (`fa06118`) | Stale |
| `README.md` table | Ends at M32; no M33–M38 rows | 6 milestones shipped since | Stale |
| `README.md:70` | "M8–M32 extend beyond..." | Should read M8–M38 | Stale |
| `CHANGELOG.md:11` | "M32 is the most recently completed milestone" | M38 is | Stale |
| `CHANGELOG.md` | No M33 entry at all | M33 shipped (`2a8a50b`, 2026-08-20, `docs(m33): reconcile project documentation`) but never got its own retroactive entry | **Gap, not previously flagged — see §9** |
| `CHANGELOG.md` | No M34–M38 entries | All five shipped, verified via `git show --stat` on each commit | Stale |
| `docs/prd.md` §3a | Table ends at M32 | 6 milestones unrecorded | Stale |
| `docs/prd.md` §5 | "Weather, position history, gaps ... **Not yet built** — no ingestion, provider method, or schema exists for any of these." | Position history (classification + running-order) **is** built (M34/M35) and historically backfilled (M38); gaps (`results.Time`) and weather are still genuinely unbuilt | **Actively false**, confirmed by M39 Stage A's direct empirical inspection of `normalize.py` and real FastF1 data |
| `docs/success-metrics.md:48` | "weather and position/gap have no code anywhere" | Position/classification has real, shipped, tested, backfilled code | **Actively false** |
| `docs/success-metrics.md:57` | "Weather and position/gap history are viewable alongside lap data. **Not yet built**" | Same as above | **Actively false** |
| `docs/data-model.md:43,52,55` | "no historical backfill was performed" (M34/M35/M36, three places) | M38 performed exactly this backfill, 332/334 sessions | **Stale as of M38 — see §9** |
| `docs/data-model.md:42` | M34 fields "`None` for session types FastF1 doesn't populate them for, e.g. Practice" | Real applicability is Race/Sprint only (Qualifying and Sprint Qualifying also return empty/None, confirmed empirically during M38) — "e.g. Practice" undersells the real scope | **Imprecise — see §9** |
| `docs/api-model.md:247,251,254` | Same three "no historical backfill" clauses, mirrored | Same | **Stale as of M38** |
| `docs/backlog.md` | No M34–M38-related item present | Confirmed correct — nothing to add or remove | Clean, no edit needed |
| `docs/architecture.md` | Mentions M12's backfill machinery, no M34–M38 claim | Confirmed accurate, unrelated to M38's separate tool | Clean, no edit needed |
| `pipeline/pitwall_pipeline/normalize.py:370-373` | `normalize_drivers()` docstring: "populated by FastF1 for Race/Sprint/Qualifying-family sessions" | False — Race/Sprint only, empirically confirmed during M38's trial run (`docs/m38-design-review.md` §14.1) | **Stale, comment-only — see §8** |

## 4. Verified M34–M38 History (from `git show --stat` on each commit)

- **M34** (`a818c61`, 2026-08-20, "feat(m34): add session race classification"): `Driver.classified_position/grid_position/status/points`, sourced from `ff1_session.results` (already loaded, no new FastF1 call). Backend model + repository + API + frontend (`DriverSelectPage`) changes. No historical backfill at ship time.
- **M35** (`f6be5df`, 2026-08-20, "feat(m35): add lap-by-lap position chart to session analytics"): `Lap.position`, sourced from `ff1_session.laps`' `Position` column. New `PositionTrendChart` on `SessionAnalyticsPage`. No historical backfill at ship time.
- **M36** (`b2e61a7`, 2026-08-21, "feat(m36): activate yellow-flag/track-status lap exclusion"): `Lap.track_status`, sourced from `ff1_session.laps`' `TrackStatus` column; `session_analytics/filtering.py` extended to compute `exclusion_reason` from it (yellow flag/SC/VSC/red flag). No historical backfill at ship time.
- **M37** (`819dcce`, 2026-08-21, "fix(m37): render yellow-flag lap exclusions"): one-line fix in `DriverLapTable.tsx` — exclusion tag now renders on `exclusion_reason !== null` independent of `is_valid`, closing a bug where M36's data was computed correctly but never shown.
- **M38** (`fa06118`, 2026-08-22, "feat(m38): backfill historical classification analytics"): new `pipeline/pitwall_pipeline/backfill_m38.py` tool — stage → verify → atomic-swap mechanism, offline FastF1 cache only, zero PostgreSQL writes. 332 of 334 approved historical sessions (142 Race + 142 Qualifying + 28 Sprint + 22 Sprint Qualifying, 2020–2026) backfilled; 2 sessions (`2023_s_o_paulo_grand_prix_sprint`, `2026_british_grand_prix_sprint`) are a documented, permanent, genuine external Ergast-data-source gap in the cached snapshot — not a PitWall defect, not retried. All 370 Practice sessions untouched by design (M34/M35 never apply to Practice).

## 5. Proposed Exact Wording

### 5.1 README.md

- Line 32: `**Current milestone: M32 — Shared session-type filter constant — complete.**` → `**Current milestone: M38 — Backfill historical classification analytics — complete.**`

  *(Per the established pattern — confirmed by inspecting M33's own commit, `2a8a50b` — a reconciliation milestone sets the pointer to the last **pre-reconciliation** milestone, i.e. M38, not to itself. M39's own row/pointer update is left for the next reconciliation pass, exactly as M33 left its own.)*

- Table: add six rows after the M32 row:

  ```
  | M33 | Documentation & roadmap reconciliation (M28–M32) | ✅ Done |
  | M34 | Session race classification (finishing position, grid, status, points) | ✅ Done |
  | M35 | Lap-by-lap running-order/position chart (session analytics) | ✅ Done |
  | M36 | Yellow-flag / Safety Car / VSC / red-flag lap exclusion | ✅ Done |
  | M37 | Fix: yellow-flag exclusion tags render in driver lap table | ✅ Done |
  | M38 | Historical backfill of M34–M36 fields (332/334 sessions) | ✅ Done |
  ```

- Line 70: `M8–M32 extend beyond...` → `M8–M38 extend beyond...` (and `§3a records M8–M32` → `§3a records M8–M38`).

- **No new "Current capabilities" narrative paragraphs.** Verified against the three most recent precedents: M23, M28, and M33 all reconciled real, user-facing capability milestones (M21, M22, M24, M25, M26 — corner highlighting, two-driver comparisons) **without** adding "Current capabilities" prose for any of them; the last such paragraph addition was M20 reconciling M17–M19. Matching the established recent convention (not the older M16/M20 one) keeps this edit minimal and consistent with what the project has actually been doing for five milestones running.

### 5.2 CHANGELOG.md

- `[Unreleased]` blurb: `Nothing in progress — M32 is the most recently completed milestone` → `Nothing in progress — M38 is the most recently completed milestone`.

- Six new entries inserted above the existing `## M32` heading, newest first (M38 → M33), each following the file's exact established format (`## MXX — Title — YYYY-MM-DD`, link to that milestone's own design review, `### Added`/`### Changed` bullets):

  - **M38 — Backfill Historical Classification Analytics — 2026-08-22.** `### Added`: `pipeline/pitwall_pipeline/backfill_m38.py` — targeted historical backfill for M34–M36 fields, stage→verify→atomic-swap mechanism, offline-cache-only. `### Changed`: 332 of the approved 334-session population (142 Race + 142 Qualifying + 28 Sprint + 22 Sprint Qualifying, 2020–2026) now carry `classified_position`/`grid_position`/`status`/`points` (Race/Sprint only) and `track_status` (all 334); 2 sessions remain a documented, permanent external Ergast-data-source gap; all 370 Practice sessions untouched; no PostgreSQL writes.
  - **M37 — Render Yellow-Flag Lap Exclusions — 2026-08-21.** `### Fixed`: `DriverLapTable.tsx` now renders the exclusion tag on `exclusion_reason !== null`, independent of `is_valid` — M36's `track_status`/`exclusion_reason` data was correct but never surfaced.
  - **M36 — Activate Yellow-Flag/Track-Status Lap Exclusion — 2026-08-21.** `### Added`: `Lap.track_status` (`ff1_session.laps`' `TrackStatus`); `session_analytics/filtering.py` computes `exclusion_reason` (yellow flag/Safety Car/VSC/red flag) from it.
  - **M35 — Add Lap-by-Lap Position Chart to Session Analytics — 2026-08-20.** `### Added`: `Lap.position` (`ff1_session.laps`' `Position`); `PositionTrendChart` on `SessionAnalyticsPage`.
  - **M34 — Add Session Race Classification — 2026-08-20.** `### Added`: `Driver.classified_position/grid_position/status/points` (`ff1_session.results`); surfaced on `DriverSelectPage`.
  - **M33 — Documentation & Roadmap Reconciliation (M28–M32) — 2026-08-20** *(retroactive — see §9)*. `### Changed`: Reconciled `README.md`, `CHANGELOG.md`, and `docs/prd.md` through M32 (`2a8a50b`).

  Each entry's exact prose to be drafted from the real commit diffs already inspected in §4, matching the file's existing density and citation style — not invented.

### 5.3 docs/prd.md

**§3a** — six new rows appended after M32, same table shape:

```
| M33 | Documentation & roadmap reconciliation (M28–M32) | Documentation-only reconciliation pass; not itself V-scoped |
| M34 | Session race classification (`classified_position`, `grid_position`, `status`, `points`) | Not itself named in the original roadmap; a new session-classification capability that M35's position-history criterion builds on |
| M35 | Lap-by-lap running-order/position chart (`Lap.position`) | Delivers V3's "position history" criterion (§5) for the Race/Sprint session population — via FastF1's own already-loaded session data, not the Jolpica-f1/Ergast source originally anticipated for this criterion |
| M36 | Yellow-flag/Safety Car/VSC/red-flag lap exclusion (`Lap.track_status`, session-analytics filtering) | Not itself named in the original roadmap; a new session-analytics correctness capability, not a V-criterion |
| M37 | Fix: yellow-flag exclusion tags render in driver lap table | Bug fix, not itself V-scoped |
| M38 | Historical backfill of M34–M36 fields across 332 of 334 applicable historical sessions (2 permanently excluded — genuine external data-gap) | Historical-data completion, not itself V-scoped; extends M34–M36's coverage across the 2020–2026 corpus M12 ingested |
```

**§5** — split the single "Weather, position history, gaps" row into three, since their real status now diverges:

```
| Position history (classification, running-order) | V3 | Needs different source data (Ergast/Jolpica) | **Shipped — M34/M35/M38**, via FastF1's own already-loaded session data (`ff1_session.results`/`.laps`), not Jolpica-f1/Ergast as originally anticipated. `Driver.classified_position/grid_position/status/points` (M34) and `Lap.position` (M35) — both populated for Race/Sprint sessions only, matching real FastF1 semantics. M38 backfilled both across 332 of the 334 applicable historical sessions (2 permanently excluded — a genuine external Ergast-data-source gap in the cached snapshot, not a PitWall defect). Related: M36/M37 add yellow-flag/Safety Car/VSC/red-flag lap exclusion (`Lap.track_status`), also backfilled by M38. |
| Gaps (time behind leader/car ahead) | V3 | Needs different source data | Not yet built — `results.Time` is available from the same already-loaded FastF1 data M34 uses, but is not currently extracted, normalized, or exposed anywhere (confirmed by direct inspection, M39 Stage A). |
| Weather | V3 | Needs different source data (weather feeds) | Not yet built — no ingestion, provider method, or schema exists (confirmed by direct inspection of real cached session data, M39 Stage A). |
```

**Document history** — new line: `- v8 (M39, docs/m39-design-review.md): extended §3a through M38 (M33 docs reconciliation — its own retroactive entry, previously missing — M34 session classification, M35 position chart, M36 yellow-flag exclusion, M37 exclusion-rendering fix, M38 historical backfill). Corrected §5's "Weather, position history, gaps" row, false since M35/M38 shipped position history — split into three accurate rows (position history: shipped; gaps: not built; weather: not built). No scope or architecture change — documentation reconciliation only.`

### 5.4 docs/success-metrics.md

**V3 section status line**: `**Status (M16 reconciliation, ...): partially shipped.** The stint/pit-stop half shipped (M10/M11/M15); weather and position/gap have no code anywhere.` → `**Status (M16 reconciliation, docs/m16-design-review.md; position-history status corrected M39, docs/m39-design-review.md): partially shipped.** The stint/pit-stop half shipped (M10/M11/M15); position/classification shipped (M34/M35/M38); weather and gaps (time behind leader/car ahead) remain unbuilt.`

**Bullet replacing the false claim**:

```
- Position history is viewable alongside lap data. **Shipped — M34/M35/M38**: session classification
  (`classified_position`, `grid_position`, `status`, `points`) and lap-by-lap running-order
  (`Lap.position`) are both sourced from FastF1's own already-loaded session data (not Jolpica-f1 as
  originally anticipated here), for Race/Sprint sessions. M38 backfilled both fields across 332 of the
  334 applicable historical sessions (2 permanently excluded — a genuine external Ergast-data-source
  gap in the cached snapshot). Related: M36/M37 add yellow-flag/Safety Car/VSC/red-flag lap exclusion
  (`Lap.track_status`), also backfilled by M38.
- Gaps (time behind leader/car ahead) and weather are **not yet built** — `results.Time` (gaps) is
  available from the same already-loaded FastF1 data M34 uses but is not currently extracted; weather
  has no ingestion, provider method, or schema (confirmed by direct inspection of real cached session
  data, M39 Stage A).
```

### 5.5 docs/data-model.md — two surgical edits

**Driver bullet** (line ~42-44), replace the parenthetical:

- Old: `(all `None` for session types FastF1 doesn't populate them for, e.g. Practice, and for any session ingested before M34 — no historical backfill was performed, see docs/m34-design-review.md §6).`
- New: `(populated by FastF1 for Race/Sprint sessions only — Qualifying and Sprint Qualifying return empty/`None` values in every era, confirmed empirically during M38's execution; `None` for every other session type. `None` for any session ingested before M34 that M38 did not backfill — M38 backfilled 332 of the 334 applicable historical sessions; 2 are a permanent, genuine external Ergast-data-source gap, see docs/m38-design-review.md §14.1/§14.4).`

**Lap bullet** (line ~50-56), replace the M35/M36 clause:

- Old: `— `None` for session types FastF1 doesn't rank (Qualifying/Practice) and for any session ingested before M35 (no historical backfill, see docs/m35-design-review.md §7) — and an additive M36 field, `track_status: str | None`, sourced from `ff1_session.laps`' `TrackStatus` column (a concatenated string of every status code active during the lap, e.g. `"1"`, `"241"`; not session-type-restricted) — `None` for any session ingested before M36 (no historical backfill, see docs/m36-design-review.md §7).`
- New: `— populated for Race/Sprint sessions only (Qualifying, Sprint Qualifying, and Practice all return `None`, confirmed empirically during M38); `None` for any session ingested before M35 that M38 did not backfill (332 of 334 applicable sessions backfilled, 2 permanently excluded — see docs/m38-design-review.md §14.1/§14.4) — and an additive M36 field, `track_status: str | None`, sourced from `ff1_session.laps`' `TrackStatus` column (a concatenated string of every status code active during the lap, e.g. `"1"`, `"241"`; not session-type-restricted). `None` for any session ingested before M36 that M38 did not backfill (same 332/334 population).`

### 5.6 docs/api-model.md — mirrored edits

Same two corrections, same wording pattern, applied to the `Driver` bullet (line ~244-247) and `Lap` bullet (line ~248-256).

## 6. normalize.py Docstring — Decision: INCLUDE

**Included.** This is comment-only (zero executable-behavior change) and is the exact same false claim being corrected everywhere else in §5.5/§5.6 — leaving the source docstring wrong while every doc describing the same fact gets fixed would leave M39 having created a fresh inconsistency of its own. It is tiny (one paragraph), does not touch any other part of the file, and is not being used as license for any other cleanup in `normalize.py`.

Exact replacement, `normalize_drivers()`'s docstring (`pipeline/pitwall_pipeline/normalize.py:368-373`):

- Old: `These four columns are only populated by FastF1 for Race/Sprint/ Qualifying-family sessions; for Practice (and any other session type FastF1 doesn't populate them for) they're present but NaN, which normalizes to None like any other missing value here -- never an error.`
- New: `These four columns are only populated by FastF1 for Race/Sprint sessions (confirmed empirically against real cached data during M38's execution, correcting this docstring's earlier, untested "Race/Sprint/Qualifying-family" claim -- Qualifying and Sprint Qualifying return empty strings/NaN in every era); for every other session type they're present but NaN, which normalizes to None like any other missing value here -- never an error.`

No test added or modified for this change (a docstring has no behavior to test); the existing `test_normalize.py` suite is re-run as a safety net only (§7).

## 7. Validation Plan

- `git diff` review of every changed file, read in full before Stage C reports completion.
- `grep -rn "M32\|M27"` across README.md/CHANGELOG.md to confirm no stale "current milestone" pointer remains outside the historical per-milestone entries (which correctly stay as-is — CHANGELOG entries are a historical record, not something to rewrite).
- `grep -rn "not yet built\|no historical backfill was performed"` across `docs/` to confirm no remaining false claim about position history / M34–M36 backfill status.
- Cross-check every new wording claim against the actual commits (`git show --stat`) — already done in §4, re-verify at Stage C apply time in case `main` has moved.
- Markdown table structure check (row/column count consistent with each table's existing rows).
- `git diff --check` (no whitespace/trailing-space errors).
- If `normalize.py` is touched: `ruff format --check`, `ruff check`, `mypy` on that one file, and `cd pipeline && .venv/bin/pytest tests/test_normalize.py -q` as a safety net (expected: no change in pass count, since no behavior changed).
- No new tests added anywhere; no API test, no frontend test, no pipeline behavior test.

## 8. Explicit Non-Goals

No new product capability; no Q1/Q2/Q3; no weather; no race-control timeline; no historical backfill (M38 already ran); no database changes; no Parquet changes; no dependency updates; no frontend changes; no unrelated technical-debt cleanup (`_to_stint_pace`/trend-hook duplication, CI permissions, Docker/Python mismatch all remain untouched, unresolved, and correctly still in `docs/backlog.md`); no PRD redesign — §5's row-split preserves every original rationale column verbatim; no new ADR (no architectural statement was found false).

## 9. Deviations from Stage A

1. **`docs/data-model.md`/`docs/api-model.md` are not fully current, contrary to Stage A's characterization.** Stage A's own audit ran before it inspected these two files against M38's actual shipped backfill; Stage B's direct read found three "no historical backfill was performed" clauses in each file that M38's execution made stale, plus one imprecise applicability claim ("e.g. Practice" undersells the real Race/Sprint-only scope). Both files are now in Stage C's definite scope (§5.5/§5.6), not left untouched as Stage A anticipated.
2. **M33 itself was never given a retroactive CHANGELOG entry or README table row** — a genuine, pre-existing gap discovered while cross-checking `git log` against both files (M33's own commit, `2a8a50b`, reconciled M28–M32 but — matching the established pattern where each reconciliation milestone's entry is added by the *next* one — never added its own; no reconciliation has run since). Not flagged in Stage A. Recommended for inclusion in Stage C at zero incremental file-touch cost, since M39 is already the correctly-positioned next reconciliation pass to close it, exactly mirroring how M20 retroactively closed M16's own gap, M23 closed M20's, and M28 closed M23's.

## 10. Exact Stage C File List

**Definitely modified:**
- `README.md`
- `CHANGELOG.md`
- `docs/prd.md`
- `docs/success-metrics.md`

**Conditionally modified (recommended for inclusion, per §6/§9):**
- `docs/data-model.md`
- `docs/api-model.md`
- `pipeline/pitwall_pipeline/normalize.py` (docstring only)

**Created:**
- `docs/m39-design-review.md` (this document)

**Explicitly untouched:**
- `docs/architecture.md` — verified accurate, no false claim found
- `docs/backlog.md` — verified accurate, no M34–M38 item to add or remove
- `docs/m9-design-review.md` and every other existing design-review doc (`m34`–`m38`) — historical record, not rewritten
- Every application source file other than the one `normalize.py` docstring
- Every test file
- Every ADR
- All frontend/backend code, Parquet data, PostgreSQL, dependencies

## 11. Stage C Acceptance Criteria

- Every file in "Definitely modified" reflects the exact wording in §5 (or a faithful equivalent preserving the same facts and citations).
- If included, the `normalize.py` docstring change matches §6 exactly, with zero other lines touched in that file.
- `git diff --check` clean; no other file appears in `git status`.
- The validation plan in §7 has been run and its results reported.
- No code, data, backfill, database, or dependency changes anywhere.
- `docs/m9-design-review.md` remains untouched.

## 12. Confirmation

No code, data, or backfill work occurs in M39. This milestone is documentation-only (plus one optional, comment-only source docstring correction, explicitly scoped in §6). Stage B performed zero ingestion, zero Parquet writes, zero PostgreSQL writes, zero dependency changes, and modified no file other than this one.
