# M44 Design Review

## Stage C — Documentation Reconciliation Implementation

Implemented exactly per the approved Stage B design, including both "recommended" §5/success-metrics.md extensions (approved explicitly in the Stage C task).

### Files Changed

```
 M CHANGELOG.md
 M README.md
 M docs/prd.md
 M docs/success-metrics.md
?? docs/m44-design-review.md
```

Exactly the approved scope — no other file touched.

### Implementation Summary

- **`README.md`**: "Current milestone" line → M43; 5 new table rows (M39–M43); "M8–M38" → "M8–M43" (both occurrences in the roadmap-extent paragraph); the §194–197 pointer paragraph rewritten to fix the stale "M15" pointer and two active falsehoods — corner highlighting no longer described as deferred (correctly credited to M14/M22), position history no longer lumped into "still unbuilt" (correctly credited to M34/M35/M38), gaps and weather still accurately described as unbuilt, no implication that weather or race-control shipped.
- **`CHANGELOG.md`**: `[Unreleased]` → M43; 5 new entries inserted in the file's established newest-first order — M43, M42, M41, M40, then the retroactive M39 entry — immediately before the existing M38 entry.
- **`docs/prd.md`**: §3a heading "M8–M38" → "M8–M43"; 5 new §3a table rows (M39–M43); design-review citation list extended with `docs/m44-design-review.md`; §5's position-history row "Related:" sentence extended to credit M40 (approved recommended edit); new `v9 (M44, ...)` document-history entry appended.
- **`docs/success-metrics.md`**: V3 section's "Related:" sentence extended to credit M40 (approved recommended edit); one indentation fix applied during implementation (the two wrapped continuation lines needed the file's established 2-space bullet-continuation indent, which the first-pass edit omitted — caught and corrected before validation).
- **M44 does not add its own entry** to README's table, CHANGELOG, or prd.md §3a — per the established convention (confirmed from M39's own commit body: each reconciliation pass documents the *previous* pass's own missing entry, never itself). M44's own entry is M45's responsibility.

### Validation Results

- **Full diff review**: every changed file's diff read in full, cross-checked against Stage B §7's exact proposed wording — matches exactly, plus the one indentation correction noted above.
- **README milestone ordering**: verified — table proceeds M34→M43 ascending, consistent with every existing row.
- **CHANGELOG ordering/formatting**: verified — new entries proceed M43→M42→M41→M40→M39 (newest-first), matching the file's established convention exactly; each entry's `### Added`/`### Changed`/`### Fixed` structure matches sibling entries' style.
- **M39–M43 dates/subjects cross-checked against real git history**: all five commit hashes/subjects/dates independently re-verified via `git log`/`git show` in Stage B §2 and re-confirmed unchanged at Stage C time — every CHANGELOG entry's technical content matches the actual shipped implementation, not a guessed summary.
- **Stale-claim sweeps** (all re-run after editing, all clean):
  - `M39`/`M40`/`M41`/`M42`/`M43` omission check — present everywhere required (7/10/7/1 occurrences across README/CHANGELOG/prd.md/success-metrics.md respectively; success-metrics.md's single M40 mention is the approved "Related:" extension, the only place it was ever supposed to appear).
  - `"M32" as current` — zero matches.
  - `"updated through M15"` — zero matches.
  - `"corner highlighting is still deferred"` — zero matches.
  - `"position history"` described as unbuilt — zero matches (the only remaining "position history" occurrences are in already-correct historical/document-history text, e.g. the pre-existing M39 document-history entry describing what M39 itself fixed).
  - Weather/race-control implying shipped — manually reviewed every remaining `"weather"` hit across all four files: every one still correctly says not-required/not-yet-built/needs-different-source-data. None implies race-control shipped (race-control was never mentioned in these docs to begin with — confirmed absent).
- **Markdown table structural consistency**: every new row in all three tables (README milestone table, prd.md §3a) has the same column count (3) and pipe/alignment shape as its siblings — verified by direct read.
- **`git diff --check`**: clean.
- **No behavioral tests run/added** — documentation-only change, matching this project's own established convention (M16/M20/M23/M28/M33/M39 each added zero tests).
- **No source/static checks run** — confirmed zero source files in the diff (`git diff --stat -- pipeline/ backend/ frontend/` empty).

### Safety Confirmation

- `docs/data-model.md`, `docs/api-model.md`, `docs/backlog.md`, `docs/architecture.md`, `docs/m9-design-review.md` — all zero diff, confirmed via direct `git diff`.
- No source, test, pipeline, backend, or frontend file touched — confirmed.
- No dependency file (`pyproject.toml`/`package.json`/lockfiles) touched — confirmed.
- `data/` — zero diff, confirmed.
- No ingestion, backfill, PostgreSQL write, or Parquet write performed at any point.
- Nothing staged (`git diff --cached --stat` empty).
- Nothing committed, nothing pushed.
- `HEAD == origin/main == de384612a5a6d2815f23d6ec0100a96188ab5c00` — unchanged throughout Stage C (verified before and after all edits).

### Deviations from Stage B

None material. One implementation-time correction (not a design deviation): the first-pass edit to `docs/success-metrics.md` omitted the file's established 2-space continuation indent on two wrapped lines — caught during the diff-review validation step and fixed before finalizing, so the committed content matches Stage B's intended wording with correct Markdown formatting.

### Stage C Stop Condition — Confirmed

- Only the approved files modified/untracked: `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`, `docs/m44-design-review.md`.
- No source file touched.
- Nothing staged, committed, or pushed.
- `docs/m9-design-review.md`, `data/` untouched.
- `HEAD == origin/main == de384612a5a6d2815f23d6ec0100a96188ab5c00`.

**Stage C complete. Stopping here per instruction. Awaiting explicit approval before any git operation.**

---

## Stage B — Documentation Reconciliation Design

**Baseline at start:** `HEAD == origin/main == de384612a5a6d2815f23d6ec0100a96188ab5c00`, working tree clean except `docs/m44-design-review.md` (untracked, this file), nothing staged, `docs/m9-design-review.md` zero diff.

### 1. Independent Verification of the Stage A Recommendation

Re-confirmed directly: `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md` are all last substantively touched by M39 (`354b974`, 2026-08-22, "docs(m39): reconcile documentation through M38"). Zero entries/rows exist for M39 itself or for M40–M43 anywhere in these four files. `docs/data-model.md`/`docs/api-model.md` are independently confirmed still current through M42/M43 (re-verified by direct grep in this stage, not trusted from Stage A). `docs/backlog.md`/`docs/architecture.md` contain no milestone-specific claims contradicted by M40–M43. The recommendation holds.

### 2. Commit Cross-Check

Verified directly via `git log`/`git show` (not from prior design-doc summaries):

| Milestone | Commit | Subject |
|---|---|---|
| M39 | `354b974977ffc1e200d5b83affebd7eba86a2e28` | `docs(m39): reconcile documentation through M38` |
| M40 | `a946c4780505c9245a0ba599ab0294edb08e6551` | `feat(m40): add track-limits lap exclusion` |
| M41 | `692b36ae49cab23664e2350181b0813bd1c0895a` | `fix(m41): exclude flagged laps from tyre aggregates` |
| M42 | `d845c865a49dcf8a64701ce39f9c734bcecb305f` | `feat(m42): add qualifying segment results` |
| M43 | `de384612a5a6d2815f23d6ec0100a96188ab5c00` | `fix(m43): surface yellow-flag/track-limits exclusion in lap comparison` |

All five commits are dated 2026-08-22 in `git log`.

**M39's own commit body is important evidence** (`git show 354b974` — read in full): it states it added "a retroactive M33 entry that was never added by M33 itself (following the established pattern where each reconciliation milestone's own entry is added by the next one)." This confirms, from the project's own history, that **a reconciliation milestone does not document itself** — its own CHANGELOG/README/§3a entry is added retroactively by the *next* reconciliation pass. Since M39 added M33's entry but has no entry of its own anywhere, **M44 must add M39's retroactive entry** — the same gap M39 closed for M33. Symmetrically, M44 must **not** add its own entry to CHANGELOG/README's milestone table/§3a's table — that is M45's job, per this same established convention. (Full reasoning and the one exception found — the `docs/m{N}-design-review.md` citation list and the document-history log, both of which *do* self-reference immediately — is in §6/§7 below.)

M39's commit also touched `pipeline/pitwall_pipeline/normalize.py` (comment-only docstring fix) — confirming that a documentation-reconciliation milestone *can* legitimately include a source comment/docstring correction when one is genuinely stale. §5 below addresses whether M44 needs one (it does not).

### 3. Stale/False Claims Found

**`README.md`:**
- Line 32 — `"Current milestone: M38 — Backfill historical classification analytics — complete."` **False**: 5 milestones stale.
- Lines 34–74 — milestone table ends at the M38 row. **Incomplete**: missing M39–M43.
- Line 76 (paragraph spanning 76–80) — `"M8–M38 extend beyond the original V1 roadmap (...) §3a records M8–M38 (...)"` — two occurrences of `"M8–M38"`. **Stale**: should track §3a's actual current range.
- Lines 193–197 — the `docs/prd.md` §5 pointer paragraph. **Multiply false**, not merely stale:
  - `"updated through M15"` — should reflect the current reconciliation point, not M16-era's own edit (M16 through M39 all left this specific occurrence untouched — this exact phrase has been wrong for 28 consecutive milestones).
  - `"corner highlighting is still deferred"` — **actively false**: corner highlighting shipped in **M22**, and `docs/prd.md` §5 has correctly shown it as `"Shipped — M22"` since **M23** (`docs/m23-design-review.md`'s own explicit correction). This README line was never updated to match, even though the source of truth it's summarizing was fixed 21 milestones ago.
  - `"weather and position/gap history are still unbuilt"` — **actively false** for the "position" half: position history shipped in M34/M35, backfilled in M38, and `docs/prd.md` §5 has correctly shown it as `"Shipped — M34/M35/M38"` since **M39**. Weather remains genuinely unbuilt; gaps (`results.Time`) remain genuinely unbuilt — but lumping "position" into the same "still unbuilt" clause is false and must not survive the fix.

**`CHANGELOG.md`:**
- Line 9–12 — `[Unreleased]` still names M38 as most recent. **False**: M43 is the true most-recently-completed milestone.
- Zero entries exist for M39 (a genuine gap per §2 above — not a stale entry, a *missing* one), M40, M41, M42, M43.

**`docs/prd.md`:**
- Line 88 — `"## 3a. Milestone History Beyond V1 (M8–M38)"` heading. **Stale**: table's actual content should extend through M43.
- §3a table (lines 96–128) — ends at M38. **Incomplete**: missing M39–M43 rows.
- Lines 130–132 — the "see these design reviews for the reconciliation passes this table is part of" sentence lists `m16`/`m20`/`m23`/`m28`/`m33`/`m39`-design-review.md. **Incomplete**: per the self-referencing convention M39 itself already used here (it *did* cite itself in this specific sentence, unlike the table rows — see §2), this list should include `docs/m44-design-review.md`.
- §5 (line 166), the "Position history" row's "Related: M36/M37..." sentence — **not false**, but incomplete: M40 added a second, independent exclusion source of the exact same kind M36/M37 are already credited with here. See §4's classification.
- Document-history (line 177–186) — no entry exists for M44's own work yet (naturally — it's being written now). Needs a new `v9` entry, matching every prior reconciliation pass's own self-documenting entry there (this section, unlike §3a's table, has always self-referenced immediately — M39's own `v8` entry proves it).

**`docs/success-metrics.md`:**
- Lines 47–50, 59–65 (V3 section) — **already accurate** for M34/M35/M38 (corrected by M39). The "Related: M36/M37..." sentence (line 64–65) has the same completeness gap as `docs/prd.md`'s parallel sentence — M40 is a sibling exclusion mechanism, not yet mentioned. Same classification as above.
- No other stale claim found — V1/V2/V4/V5 sections are unaffected by M39–M43.

**`docs/backlog.md`, `docs/architecture.md`:** No milestone-specific claim found that M40–M43 makes false. **No change.**

**`docs/data-model.md`, `docs/api-model.md`:** Independently re-verified (grep-swept in this stage): both already correctly document M40's `Lap.deleted`/`deleted_reason` and M42's `Driver.q1_seconds`/`q2_seconds`/`q3_seconds`, including precedence, sourcing, and no-backfill caveats. M43's own Stage C deliberately left `docs/api-model.md`'s `/laps/compare` section untouched (it was never a complete `WarningCode` enumeration) — re-confirmed still the correct call; no new WarningCode value has any frontend behavioral side effect that would change that reasoning. **No change to either file.**

**Source code comments/docstrings:** Swept `pipeline/` and `backend/app/` for stale-claim patterns (`"no yellow-flag"`, `"not yet built"`, `"no historical backfill"`, `"never emits them"`, `"does not exist anywhere"`). Every hit found is a currently-true, specific statement about one field's own backfill status (e.g. `"None for any session ingested before M42 -- no historical backfill"` — still accurate, matching the confirmed 0/704 and 0/164 real-data gaps). **No stale source comment found** — unlike M39, M44 requires no source-code change.

### 4. Exact Scope Classification

| Edit | File | Classification |
|---|---|---|
| "Current milestone" line → M43 | `README.md` | **Definitely required** |
| Milestone table: add M39–M43 rows | `README.md` | **Definitely required** |
| "M8–M38" → "M8–M43" (×2, one paragraph) | `README.md` | **Definitely required** |
| §5-pointer paragraph rewrite (milestone number + 2 false claims) | `README.md` | **Definitely required** |
| `[Unreleased]` → M43 | `CHANGELOG.md` | **Definitely required** |
| New M39 entry (retroactive) | `CHANGELOG.md` | **Definitely required** |
| New M40 entry | `CHANGELOG.md` | **Definitely required** |
| New M41 entry | `CHANGELOG.md` | **Definitely required** |
| New M42 entry | `CHANGELOG.md` | **Definitely required** |
| New M43 entry | `CHANGELOG.md` | **Definitely required** |
| §3a heading "M8–M38" → "M8–M43" | `docs/prd.md` | **Definitely required** |
| §3a table: add M39–M43 rows | `docs/prd.md` | **Definitely required** |
| §3a design-review citation list: add `m44-design-review.md` | `docs/prd.md` | **Definitely required** |
| §5 position-history row: extend "Related" sentence with M40 | `docs/prd.md` | **Recommended** (not false without it; completeness/consistency only) |
| Document-history: add `v9` (M44) entry | `docs/prd.md` | **Definitely required** |
| V3 section: extend "Related" sentence with M40 | `docs/success-metrics.md` | **Recommended** (same reasoning as above) |
| Any other edit to `docs/backlog.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/api-model.md` | — | **Unnecessary** — confirmed current, no false claim |
| New prose paragraph narrating M40–M43 in README's "Current capabilities" section | `README.md` | **Unnecessary** — M20–M38 never got prose paragraphs either (only table rows); M40–M43 should match that established precedent, not invent a new one |
| Any source comment/docstring correction | pipeline/backend | **Unnecessary** — none found stale (§3) |
| README/CHANGELOG/§3a: add M44's own row/entry | — | **Unnecessary this milestone** — deferred to M45 by the established self-reference convention (§2) |

### 5. Source-Code/Comment Corrections Required

**None.** See §3's sweep above.

### 6. Exact Stage C File List

| File | Why it changes | What's being corrected |
|---|---|---|
| `README.md` | 4 stale/false items (§3) | "Current milestone" line; milestone table (+5 rows); "M8–M38" paragraph (2 occurrences); §5-pointer paragraph (milestone number + 2 false claims) |
| `CHANGELOG.md` | Missing M39 entry + 4 missing entries + stale `[Unreleased]` | `[Unreleased]` blurb; new M39/M40/M41/M42/M43 entries (exact wording, §7) |
| `docs/prd.md` | §3a stale through M38; document-history missing M44's own entry | §3a heading; §3a table (+5 rows); §3a citation list (+1); §5 "Related" sentence (recommended); document-history (+1 entry) |
| `docs/success-metrics.md` | Completeness gap only | V3 "Related" sentence (recommended) |
| `docs/m44-design-review.md` | This document itself | Finalized with Stage C results at the end of Stage C |

**Explicitly must remain untouched:**
- `docs/backlog.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/api-model.md` — confirmed current, no stale claim (§3).
- `docs/m9-design-review.md`.
- Every `docs/m{N}-design-review.md` for N ≠ 44 — historical record, never edited retroactively.
- All pipeline/backend/frontend source and test files — no code change of any kind.
- `data/`, `backfill_m38.py`, any PostgreSQL/Parquet/ingestion tooling.
- `pyproject.toml`/`package.json`/lockfiles — no dependency change.

### 7. Exact Proposed Wording

#### 7.1 `README.md`

**Line 32**, replace:
```
**Current milestone: M38 — Backfill historical classification analytics — complete.**
```
with:
```
**Current milestone: M43 — Surface yellow-flag/track-limits exclusion in lap comparison — complete.**
```

**After line 74** (the M38 table row), insert 5 new rows before the closing of the table:
```
| M39 | Documentation & roadmap reconciliation (M34–M38) | ✅ Done |
| M40 | Track-limits lap exclusion (`Lap.deleted`/`deleted_reason`) | ✅ Done |
| M41 | Fix: tyre/stint aggregate stats exclude yellow-flag/track-limits laps | ✅ Done |
| M42 | Qualifying Q1/Q2/Q3 segment results | ✅ Done |
| M43 | Fix: lap-comparison warnings surface yellow-flag/track-limits exclusion | ✅ Done |
```

**Lines 76–80**, replace the paragraph:
```
M8–M38 extend beyond the original V1 roadmap (`docs/prd.md` §3 covers M0–M7; §3a records M8–M38
without implying they were part of the original V1–V5 schedule); each has its own design review
under `docs/` (`m8-design-review.md` onward). See `docs/releases/` for per-milestone summaries
(currently covering M1–M5; later milestones' records are their own design-review/implementation-plan
docs plus `CHANGELOG.md`).
```
with:
```
M8–M43 extend beyond the original V1 roadmap (`docs/prd.md` §3 covers M0–M7; §3a records M8–M43
without implying they were part of the original V1–V5 schedule); each has its own design review
under `docs/` (`m8-design-review.md` onward). See `docs/releases/` for per-milestone summaries
(currently covering M1–M5; later milestones' records are their own design-review/implementation-plan
docs plus `CHANGELOG.md`).
```

**Lines 193–197**, replace:
```
Full rationale for what's deferred and why lives in `docs/prd.md` §5, which also records current
shipped/unshipped status per feature (updated through M15 — e.g. V2's synchronized cursor shipped in
M14, corner highlighting is still deferred; V3's stint/pit-stop comparison shipped in M10/M11/M15,
weather and position/gap history are still unbuilt). `docs/success-metrics.md` mirrors the same
per-version status.
```
with:
```
Full rationale for what's deferred and why lives in `docs/prd.md` §5, which also records current
shipped/unshipped status per feature (updated through M43 — e.g. V2's synchronized cursor and corner
highlighting have both shipped, in M14 and M22 respectively; V3's stint/pit-stop comparison shipped
in M10/M11/M15 and position history shipped in M34/M35/M38, while weather and gaps — time behind
leader/car ahead — are still unbuilt). `docs/success-metrics.md` mirrors the same per-version status.
```

#### 7.2 `CHANGELOG.md`

**Lines 9–12**, replace:
```
## [Unreleased]

Nothing in progress — M38 is the most recently completed milestone (see `README.md`'s Project
status).
```
with:
```
## [Unreleased]

Nothing in progress — M43 is the most recently completed milestone (see `README.md`'s Project
status).
```

**Immediately after the `[Unreleased]` section** (before the existing `## M38 —` heading), insert, in this exact order (newest first, matching the file's existing convention):

```
## M43 — Surface Yellow-Flag/Track-Limits Exclusion in Lap Comparison — 2026-08-22

See `docs/m43-design-review.md` for the full design record.

### Added

- `WarningCode.YELLOW_FLAG_LAP_A`/`_B`, `TRACK_LIMITS_LAP_A`/`_B` — `collect_warnings()`
  (`app/services/lap_comparison/validation.py`) now imports and calls `classify_lap()` (M36/M40's
  `app/services/session_analytics/filtering.py`, the same cross-service precedent M41 established),
  surfacing the same yellow-flag/track-limits exclusion signal for each compared lap independently.
  `is_accurate`-based warnings are unchanged and coexist with the new ones.

### Changed

- None to any existing endpoint contract beyond the four additive `WarningCode` members —
  `ComparisonWarning`/`LapComparisonResponse`'s shape, and every other route, are unaffected.

## M42 — Add Qualifying Segment Results — 2026-08-22

See `docs/m42-design-review.md` for the full design record.

### Added

- `Driver.q1_seconds`/`q2_seconds`/`q3_seconds` — three additive fields sourced from
  `ff1_session.results`' `Q1`/`Q2`/`Q3` columns (already loaded for every session). `None` for
  session types FastF1 doesn't populate them for (Race/Sprint/Practice), for a driver eliminated
  before reaching a given segment, and for any session ingested before M42 (no historical backfill).
- `DriverSelectPage` now surfaces each qualifying segment time a driver reached, independently.

### Changed

- None to any existing endpoint contract beyond the three additive `Driver` fields.

## M41 — Exclude Flagged Laps from Tyre Aggregates — 2026-08-22

See `docs/m41-design-review.md` for the full design record.

### Fixed

- `trend_eligible_positions()` (`app/services/tyre_performance/stint_eligibility.py`) now also
  excludes laps with a non-null `exclusion_reason` (yellow-flag or track-limits), not just inaccurate
  laps — `TyrePerformancePage`/`StintPacePage` aggregate stats were silently corrupted by flagged laps
  before this fix. `valid_positions()` is unchanged (still the pure `is_accurate` signal, feeding
  `AnnotatedLap.is_valid` directly, a deliberately different population).

## M40 — Add Track-Limits Lap Exclusion — 2026-08-22

See `docs/m40-design-review.md` for the full design record.

### Added

- `Lap.deleted`/`Lap.deleted_reason` — additive fields sourced from `ff1_session.laps`'
  `Deleted`/`DeletedReason` columns (already loaded for every session, populated from race-control-
  message parsing; not session-type-restricted).
- `"track_limits"` `ExclusionReason` — `classify_lap()` now resolves `exclusion_reason` from
  `lap.deleted` (M40) or `lap.track_status` (M36), in that precedence order: a lap that is both
  track-limits-deleted and yellow-flag-affected displays `"track_limits"`.

### Changed

- None to any existing endpoint contract beyond the two additive `Lap` fields and the widened
  `ExclusionReason` values. No historical backfill in M40 itself.

## M39 — Documentation & Roadmap Reconciliation (M34–M38) — 2026-08-22

See `docs/m39-design-review.md` for the full design record.

### Changed

- Reconciled `README.md`, `CHANGELOG.md`, `docs/prd.md`, and `docs/success-metrics.md` through M38 —
  including a retroactive M33 entry (below) that M33 itself never added.
- Corrected an active false statement: `docs/prd.md` §5 and `docs/success-metrics.md` both still said
  position history was "not yet built" after M34/M35 had already shipped it and M38 had backfilled
  it.
- Corrected `docs/data-model.md`/`docs/api-model.md`'s stale "no historical backfill was performed"
  statements, now false since M38, and their M34/M35 applicability claims to the
  empirically-confirmed Race/Sprint-only scope.
- `pipeline/pitwall_pipeline/normalize.py` — comment-only docstring correction matching the above (no
  executable change).

```

(The blank line at the end separates this block from the existing `## M38 —` heading, which follows unmodified.)

#### 7.3 `docs/prd.md`

**Line 88**, replace:
```
## 3a. Milestone History Beyond V1 (M8–M38)
```
with:
```
## 3a. Milestone History Beyond V1 (M8–M43)
```

**After line 128** (the M38 table row), insert 5 new rows:
```
| M39 | Documentation & roadmap reconciliation (`docs/m39-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
| M40 | Track-limits lap exclusion (`Lap.deleted`/`deleted_reason`, `"track_limits"` `ExclusionReason`, precedence over yellow-flag) | Not itself named in the original roadmap; extends M36's session-analytics correctness capability to a second, independent exclusion source |
| M41 | Fix: tyre/stint-performance aggregate stats now exclude yellow-flag/track-limits laps (`trend_eligible_positions()`) | Bug fix, not itself V-scoped; corrects a gap where M36/M40's exclusion signal was computed but not consumed by tyre-performance/stint-pace aggregate statistics |
| M42 | Qualifying Q1/Q2/Q3 segment times (`Driver.q1_seconds/q2_seconds/q3_seconds`) | Not itself named in the original roadmap; a new session-classification capability extending M34's pattern to qualifying-session segment times |
| M43 | Fix: `/laps/compare` warnings now surface yellow-flag/track-limits exclusion (`WarningCode.YELLOW_FLAG_LAP_A/B`, `TRACK_LIMITS_LAP_A/B`) | Bug fix, not itself V-scoped; corrects a gap where `collect_warnings()` computed only accuracy, never the same exclusion signal M36/M40/M41 already surface for their own consumers |
```

**Lines 130–132**, replace:
```
See `docs/m16-design-review.md`, `docs/m20-design-review.md`, `docs/m23-design-review.md`,
`docs/m28-design-review.md`, `docs/m33-design-review.md`, and `docs/m39-design-review.md` for the
reconciliation passes this table is part of.
```
with:
```
See `docs/m16-design-review.md`, `docs/m20-design-review.md`, `docs/m23-design-review.md`,
`docs/m28-design-review.md`, `docs/m33-design-review.md`, `docs/m39-design-review.md`, and
`docs/m44-design-review.md` for the reconciliation passes this table is part of.
```

**§5, line 166 (Recommended)** — within the "Position history" row, replace the trailing sentence:
```
Related: M36/M37 add yellow-flag/Safety Car/VSC/red-flag lap exclusion (`Lap.track_status`), also backfilled by M38. |
```
with:
```
Related: M36/M37 add yellow-flag/Safety Car/VSC/red-flag lap exclusion (`Lap.track_status`), also backfilled by M38; M40 adds a second, independent exclusion source, track-limits lap-time deletion (`Lap.deleted`/`deleted_reason`), taking precedence over yellow-flag when both apply to the same lap — not backfilled (`docs/m40-design-review.md` §24). |
```

**After line 186** (the v8/M39 document-history entry), append:
```
- v9 (M44, `docs/m44-design-review.md`): extended §3a through M43 (M40 track-limits lap exclusion,
  M41 tyre/stint aggregate exclusion-consistency fix, M42 qualifying Q1/Q2/Q3 results, M43
  lap-comparison exclusion warnings) — plus M39's own retroactive entry (in `CHANGELOG.md` and
  `README.md`), previously missing, following the same pattern M39 itself used for M33. §5's
  position-history row extended to also credit M40 [IF the recommended §5 edit above is taken; if
  not, this clause reads: "§5 re-verified against current source with no edit needed"]. No scope or
  architecture change — documentation reconciliation only.
```

(Stage C: resolve the bracketed clause to whichever branch matches the actual decision on the recommended §5 edit — do not leave the bracket in the committed text.)

#### 7.4 `docs/success-metrics.md`

**Lines 64–65 (Recommended)** — within the V3 section, replace:
```
red-flag lap exclusion (`Lap.track_status`), also backfilled by M38.
```
with:
```
red-flag lap exclusion (`Lap.track_status`), also backfilled by M38. M40 adds a second, independent
exclusion source, track-limits lap-time deletion (`Lap.deleted`/`deleted_reason`), taking precedence
over yellow-flag when both apply — not backfilled.
```

### 8. Historical Accuracy of M40–M43 (Cross-Checked Against Real Source, Not Prior Design Docs)

- **M40** — `Lap.deleted`/`Lap.deleted_reason`, sourced from `ff1_session.laps`' `Deleted`/`DeletedReason` columns; `classify_lap()` resolves `exclusion_reason` with track-limits precedence over yellow-flag when both apply to the same lap. No historical backfill (confirmed 0/704 real laps have the column, per Stage A §5). Re-verified directly in `backend/app/services/session_analytics/filtering.py` this stage.
- **M41** — `trend_eligible_positions()` (`stint_eligibility.py`) now excludes laps with any non-null `exclusion_reason`, closing a gap where tyre/stint aggregate statistics silently included yellow-flag/track-limits-affected laps. `valid_positions()` deliberately unchanged (feeds `AnnotatedLap.is_valid` directly, a different population by design).
- **M42** — `Driver.q1_seconds`/`q2_seconds`/`q3_seconds`, sourced from `ff1_session.results`' `Q1`/`Q2`/`Q3` columns. No session-type gating, no Sprint-Qualifying special-casing, no historical backfill (confirmed 0/164 in-scope real sessions have the columns, per Stage A §5).
- **M43** — `collect_warnings()` (`app/services/lap_comparison/validation.py`) now imports `classify_lap()` and emits `YELLOW_FLAG_LAP_A`/`_B`/`TRACK_LIMITS_LAP_A`/`_B`, closing the same "sibling consumer ignores `exclusion_reason`" gap M41 closed for tyre aggregates. Re-verified directly in `backend/app/services/lap_comparison/validation.py` this stage, matching its now-committed form exactly.

### 9. Validation Plan (Stage C)

- `git diff` review of every changed file, read in full, cross-checked line-by-line against §7's exact proposed wording above — no edit beyond what's specified here.
- Stale-claim grep sweep, re-run after editing: `grep -rn "M38" README.md docs/prd.md docs/success-metrics.md` should show only genuinely-still-accurate M38 references (e.g. "backfilled by M38"), never a "current state" claim; `grep -n "M15\|M38" README.md` should show zero remaining stale current-milestone/pointer references.
- Milestone/date cross-check: every new entry's commit hash/date matches §2's table exactly (already verified against real `git log`/`git show` output, not guessed).
- Markdown table consistency: every new/edited table row has the same column count and alignment as its siblings; render-check by eye (no linter enforces Markdown table shape in this repo).
- `git diff --check` (trailing-whitespace/conflict-marker sweep).
- No source/static check applies — §5 confirmed no source file changes.
- No behavioral test is invented — documentation-only change, matching this project's own established convention (M16/M20/M23/M28/M33/M39 added zero tests each).

### 10. Non-Goals

Weather implementation; race-control implementation; `results.Time`/gaps implementation; any new product feature; historical backfill (of any milestone's fields); dependency upgrades; unrelated technical debt (including the already-tracked CI/Docker Python-version mismatch — stays in `docs/backlog.md`, not touched here); UI changes; backend/pipeline behavior changes; adding M44's own row/entry to README/CHANGELOG/§3a (deferred to M45 per the established convention, §2); touching `docs/data-model.md`, `docs/api-model.md`, `docs/backlog.md`, or `docs/architecture.md` (all confirmed current).

### 11. Risks

Low. The only judgment call left open for Stage C is the "recommended" (not required) §5/success-metrics.md extensions — both are small, low-risk, and their inclusion/exclusion is explicitly resolved by the document-history entry's bracketed clause (§7.3), so there's no ambiguity in what the committed state should say either way. All other edits are "definitely required" with exact, unambiguous replacement text.

### 12. Deviations from Stage A

None material. Stage A recommended "documentation reconciliation through M43, mirroring M39's exact scope" across the four core files; Stage B confirms this exactly, and additionally discovers (not anticipated in Stage A's candidate-level scope) that M39 itself has no CHANGELOG/README/§3a entry — a concrete, evidence-based scope refinement following the project's own established convention, not an expansion beyond it.

### 13. Stage C Stop Condition (for Stage C to verify)

- Only the exact files in §6 modified: `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`, `docs/m44-design-review.md`.
- No source file touched.
- Nothing staged/committed/pushed until explicit approval.
- `data/`, `docs/m9-design-review.md` untouched.
- `git diff --check` clean.
- `HEAD == origin/main == de384612a5a6d2815f23d6ec0100a96188ab5c00` unchanged throughout Stage C's edits (changes only, not committed).

---

## Stage A — Product / Architecture Audit

**Baseline at start:** `HEAD == origin/main == de384612a5a6d2815f23d6ec0100a96188ab5c00` (the M43 commit — "fix(m43): surface yellow-flag/track-limits exclusion in lap comparison"), working tree clean, nothing staged, `docs/m9-design-review.md` zero diff, `docs/m44-design-review.md` did not exist. Verified by direct `git` commands before any research began.

Conducted via four parallel read-only investigations: (1) roadmap/documentation and M34–M43 capability chain, (2) correctness hunt + Q1/Q2/Q3 post-ship verification, (3) historical-data/backfill coverage + unused FastF1 data, (4) architecture/tech-debt/dependency/test-quality/performance. Findings below are synthesized and cross-checked, not taken from any prior milestone's self-report on trust.

---

### 1. Product / Roadmap State

Roadmap-level staleness has **grown, not shrunk**, since M43's own audit assessed it as "borderline, 3 milestones, not clearly over threshold":

- `README.md:32` — still "Current milestone: M38 — complete." Milestone table (`README.md:34-74`) still ends at M38.
- `README.md:194-196` — the specific stale claim ("weather and position/gap history are still unbuilt... updated through M15") was flagged by **M40's** audit, confirmed still-unfixed by **M41's**, **M42's**, and **M43's** audits, and is **still unfixed now** — 4 consecutive audits have carried this item forward without action.
- `CHANGELOG.md` — `[Unreleased]` still says M38 is the most recent milestone. Zero entries for M39, M40, M41, M42, or M43.
- `docs/prd.md` §3a milestone history table — still ends at M38 (last extended by M39's own v8 revision). §5's deferred-features table is not stale (M40–M43 were never deferred-table candidates).
- `docs/success-metrics.md` — same pattern, last touched by M39.
- `docs/backlog.md` — unchanged since M43's audit, same items (CI permissions block, missing empty-state tests, `get_telemetry` cost, Dockerfile/CI Python-version mismatch — already tracked here, a minor correction to M43's audit calling it "not previously flagged in any design doc"; it was flagged, just in `backlog.md` rather than a design doc — no CONTRIBUTING.md).
- `docs/api-model.md`'s `/laps/compare` section still only documents `DIFFERENT_CIRCUIT` — confirms M43's own decision to leave it untouched still holds, consistent with that doc's already-selective convention.

**Net: the gap is now 5 milestones (M39–M43)** in README/CHANGELOG/prd.md/success-metrics.md. This project's own historical reconciliation-trigger range is 2–5 milestones (M20 after 3 with zero edits needed, M23 after 2, M28 after 4, M33 after 4, **M39 after 5**). Five milestones is now at the exact top of that historical range — the same gap size that triggered M39 itself — and includes one item specifically flagged and left unfixed across 4 consecutive audits, which is a new signal beyond raw milestone-count: this is no longer just "documentation is old," it's "a known, specific inaccuracy has been repeatedly noted and repeatedly deferred."

### 2. M34–M43 Capability Audit

Backend: 22 routes (11 registered routers), unchanged. Frontend: 17 routes (a recount corrects M43's audit's "16" — a miscounted prior figure, not a regression; same route set, same page components, no orphans, no dead links).

**Full M34–M43 chain, re-verified against current committed source:**
- M34–M38: unchanged, present (independently re-verified in the M43 audit with zero regressions; spot-checked again this cycle).
- M40/M41: `filtering.py`'s `classify_lap()` precedence intact; `stint_eligibility.py`'s exclusion logic intact.
- M42: unchanged (M43's diff never touched it).
- M43: confirmed end-to-end in its now-committed form — `WarningCode` has all 7 members (3 original + 4 new), `collect_warnings()` correctly imports and calls `classify_lap()`, `client.ts`'s type includes all 7 literals.

**Sibling-consumer hunt** (M43's own flagged watch-item: "are there other consumers still ignoring `exclusion_reason`?"): exhaustive grep across every backend service and every frontend `.tsx` file. Every current `Lap`-validity/exclusion consumer — `session_analytics/aggregation.py` (and its callees `consistency.py`/`driving_style.py`/`theoretical_best.py`, which never need their own check because `summarize_driver()` pre-filters before calling them), `tyre_performance/stint_eligibility.py` and its callers, `lap_comparison/validation.py` (now fixed), and the frontend's sole consumer `DriverLapTable.tsx` — is correctly wired through `classify_lap()`/`filter_for_aggregate_stats()`/`filter_valid_laps()`, or correctly renders `exclusion_reason`. **No further instance of the M41/M43 defect pattern was found.** M41 and M43 together appear to have closed this gap completely across the codebase.

### 3. Correctness Audit

**No defect found.** This is the first of the M40/M41/M42/M43 audit cycle to find zero new correctness defects — every aggregate/statistical consumer, every `track_status`/`deleted` consumer, and the Q1/Q2/Q3 fields were independently re-verified against current source with no drift, no duplicated/reimplemented classification logic outside `filtering.py`, and no frontend/backend nullability disagreement.

### 4. Qualifying Q1/Q2/Q3 Post-M42 Audit

Fully correct and complete: populated (no session-type gating, no Sprint-Qualifying special-casing), persisted, exposed (`.get()`-based nullable-safe), and rendered (three independently-gated spans, unmodified by any later milestone). The field is read in **exactly one place** repo-wide (`DriverSelectPage.tsx`), matching M34's classification-field precedent by design — there is no second consumer to silently mishandle partial data, so there's nothing to break. **No meaningful follow-on gap found**, beyond the already-known historical-backfill coverage gap (§5).

### 5. Historical Data / Backfill Audit

Re-counted directly: 704 total sessions (race 142, qualifying 142, sprint 28, sprint_qualifying 22, practice_1 141, practice_2 118, practice_3 111) — unchanged from M43's audit, as expected (no ingestion ran). M38's target population (334) still matches exactly. M40's `deleted`/`deleted_reason` coverage: still **0/704**. M42's `q1_seconds`/`q2_seconds`/`q3_seconds` coverage: still **0/164**. M43's own commit (`de384612`) touched zero files under `pipeline/` or `data/` — confirmed to have **zero historical-data implications** (it operates purely on already-loaded `Lap` objects at request time).

**Backfill justification is stable, not fresher this cycle**: both gaps are exactly where they were at M43's audit. The case for a dedicated backfill milestone rests on the same evidence as before — genuinely justified in absolute terms, but nothing new pushes it forward specifically this cycle, unlike documentation reconciliation's gap, which measurably grew.

### 6. Unused FastF1 Data Audit

`weather_data` and `race_control_messages`: still zero references anywhere in current source, still no dormant stub despite two prior milestones (M40, M42) reading real RCM data ad hoc during audits. `results.Position`/`results.Time`/`results.Laps`: confirmed genuinely unused (verified against `normalize_drivers()`'s exact read list). Full cross-check against the installed FastF1 library's `SessionResults._COLUMNS` surfaced no previously-uncataloged field beyond `BroadcastName`/`DriverId`/`TeamColor`/`TeamId`/`HeadshotUrl`/`CountryCode` — `TeamColor`/`HeadshotUrl` are explicitly out of scope per this repo's own top-level constraint (no official liveries/broadcast graphics), the rest are internal FastF1 identifiers with no evident product use case. Zero TODO/FIXME/XXX markers repo-wide, confirming no field here was ever scoped for a planned milestone.

`results.Time` is structurally the cheapest-to-extend candidate (same already-loaded DataFrame, same `Driver`-model/`DriverSelectPage` surface, same additive-nullable pattern M42 already proved) — but this is an observation about *feasibility*, not *justification*: there is no demand evidence, no product-pressure signal, and no correctness reason to build it now.

### 7. Architecture / Technical Debt

All duplication remains within this project's established rule-of-three threshold: `_optional_*` helpers (2 instances, unchanged), `_to_stint_pace` (2 instances, unchanged). `classify_lap` is now imported into 2 sibling services (`tyre_performance`, `lap_comparison`) plus used natively in its home module — this is reuse-via-import, not duplication, and doesn't trigger the threshold (the logic itself is never copied). No import cycles: confirmed `session_analytics`/`filtering.py` mention "lap_comparison" only in docstring prose, never as an actual import. No new API-boundary violation, no new N+1/N², no oversized components (M43 added ~185 lines total). The CI/Docker Python-version mismatch (3.10 pinned vs. 3.12 shipped) remains unfixed but low-severity, already tracked in `docs/backlog.md`. No new accessibility surface (M43 was backend + type-only frontend).

### 8. Security / Dependencies

`npm audit`: **0 vulnerabilities** at every severity (366 total deps). Python deps: only minor/patch drift, no CVE indicators from available tooling (`pip-audit` still not installed in this sandbox, unresolvable read-only). **Nothing milestone-forcing.**

### 9. Test / Quality State

Exact fresh counts against the now-committed M43 state, matching the pre-commit baseline exactly: pipeline 172 passed / 15 errors (Postgres-only), backend 405 passed / 1 failed / 15 errors (Postgres-only), frontend 572 passed across 86 files. All static checks clean (ruff/mypy/tsc/eslint/prettier), 3 pre-existing warnings only on gitignored `dist/`. **Zero regressions.**

### 10. Performance

No fresh evidence from any section makes performance decision-relevant. Not investigated further.

---

### 11. Candidate Matrix

| Candidate | Category | Evidence strength | User/product impact | Correctness impact | Complexity | Risk | Arch. readiness | Milestone size | Prior deferrals | New evidence since M43 | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Documentation reconciliation** (README/CHANGELOG/prd.md/success-metrics.md) | Documentation | Strong — 5-milestone gap now at the top of this project's own historical 2-5 milestone trigger range, plus one item (README:194-196) flagged and unfixed across 4 consecutive audits | Medium — no functional impact, but a specific, repeatedly-flagged inaccuracy persisting this long is itself a process signal | None | Low | Low | High | Small | Deferred at M40 (borderline), M41 (borderline), M42 (borderline), M43 (borderline, "3 milestones, not clearly over") | **Yes — gap grew from 3→5 milestones, now unambiguously at the historical trigger point** | **Recommended — see §13** |
| Historical backfill (M40 `deleted`/M42 `q1/q2/q3_seconds`) | Data completeness | Strong but static — same 0/704, 0/164 gaps as M43's audit | Medium | Medium | Medium-high (real Parquet writes) | Medium | High (`backfill_m38.py` extensible) | Medium-large | Flagged at M43, unchanged | No — stable, not fresher this cycle | Strong candidate, but not this cycle's most-justified pick — defer to M45 |
| `results.Time`/`results.Laps` as new Driver fields | Product feature | Weak — no demand evidence, purely a feasibility observation | Unknown/speculative | None | Low (proven pattern from M42) | Low | High | Small | Newly surfaced this cycle as a feasibility note | Feasible but unjustified — no threshold crossed |
| Weather | Product feature | None new | Unknown/speculative | None | High — full-stack net-new | Medium | None | Large | Repeatedly deferred M39-M44 | No | Not justified |
| Race-control timeline | Product feature | None new | Unknown/speculative | None | High — full-stack net-new | Medium | None | Large | Repeatedly deferred M39-M44 | No | Not justified |
| CI/Docker Python-version fix | Tech debt | Real, stable, already tracked in `docs/backlog.md` | Low | Low | Low | Low | High | Tiny | Tracked since before M43 | No | Not milestone-sized alone; a fast standalone fix whenever convenient, not M44 |
| Do nothing / finalize | — | — | — | — | — | — | — | — | — | — | Not recommended — documentation reconciliation has genuinely crossed threshold |

### 12. Special Decision Questions

**A. What is the highest-value next milestone genuinely justified by evidence after M43?**
Documentation reconciliation covering M40–M43 (mirroring M39's own scope and pattern). It is the only candidate whose evidence *strengthened* since the last audit cycle — the gap grew from 3 to 5 milestones, crossing into the range that has always triggered this exact milestone type before.

**B. Is there a newly discovered correctness defect comparable in strength to M40, M41, or M43?**
No. This audit found zero new correctness defects — the first cycle in the M40–M44 sequence to do so. The sibling-consumer pattern M41 and M43 each fixed appears to be fully closed.

**C. Is Qualifying Q1/Q2/Q3 now complete enough to defer further work?**
Yes. Fully correct, single-consumer by design, no follow-on gap beyond the (already-known, stable) historical-backfill question.

**D. Is a dedicated historical backfill milestone now justified, or is the current partial coverage still acceptable?**
Justified in absolute terms (both gaps are real and total), but not fresher or more urgent than at M43's audit — no new evidence pushes it ahead of documentation reconciliation this specific cycle. Recommended for M45, not M44.

**E. Are weather or race-control finally justified, or are they still merely available data without sufficient product pressure?**
Still merely available-in-principle (and in fact not even that — zero dormant scaffolding exists for either). No product-pressure evidence has appeared across 5 consecutive audits (M39–M44) that have all considered them.

**F. Is the project still in active product-development mode, hardening/completion mode, or approaching finalization?**
Hardening/completion, more clearly than at M43's audit. With zero new correctness defects found this cycle and no product feature clearing any evidence threshold, the strongest remaining candidate is explicitly about keeping the project's own record of itself accurate — a finalization-adjacent activity, not new development.

**G. What is the smallest coherent milestone that delivers meaningful value without manufacturing scope?**
Documentation reconciliation — small, real, evidence-backed (not manufactured: the threshold genuinely crossed), and touches no source code, no data, no schema.

### 13. Recommendation

**Recommend M44 = documentation reconciliation through M43**, mirroring M39's exact scope and pattern: `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`. This includes fixing `README.md:194-196`'s specific, repeatedly-flagged stale claim.

**Exact problem statement:** these four documents have not been updated since M39; they currently misrepresent the project's shipped state by 5 milestones (M39 itself, plus M40, M41, M42, M43), including one specific factual claim ("weather and position/gap history are still unbuilt... updated through M15") that four consecutive milestone audits (M40→M41→M42→M43) have flagged as false and left unfixed.

**Evidence:** §1 above — direct read of all four documents, cross-checked against actual shipped commits (`git log`), confirming the gap and its size.

**User impact:** low-functional, but real — anyone reading this project's own README or CHANGELOG today gets an inaccurate picture of what's shipped, including a specifically false claim about capabilities that do exist.

**Why this beats every other candidate:** no correctness defect exists this cycle (unlike every prior M40–M43 cycle, where a defect legitimately outranked documentation work every time) — so the tie-break criterion that has repeatedly deferred this exact candidate no longer applies. Historical backfill remains valid but has no fresher evidence than last cycle; nothing else clears any evidence threshold at all.

**Likely files:** `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`. (Exact edit list is a Stage B decision.)

**Likely tests:** none — pure documentation, no source change.

**Data/schema/API implications:** none.

**Explicit non-goals:** no source-code changes; no `docs/backlog.md` changes (M39 didn't touch it either — separate, still-current); no `docs/data-model.md`/`docs/api-model.md` changes (both already current through M42/M43); no `docs/m9-design-review.md`; no historical backfill; no weather/race-control; no CI/Docker fix (tracked separately in `docs/backlog.md`, not a documentation-reconciliation item); no dependency changes; no unrelated cleanup.

**Validation strategy:** Stage C should cross-check every updated claim against actual shipped commits/source (the same rigor this and every prior audit applied), not just against milestone reports; confirm no source file is touched; `git diff --check`.

**Major risks:** low. The main judgment call is scope precision — updating exactly what's stale without re-litigating already-correct sections (`data-model.md`/`api-model.md` must stay untouched, per §1's confirmation they're still current).

---

### Stop-Condition Verification

Re-verified after completing the audit and before stopping:

- Only new/untracked file: `docs/m44-design-review.md` — confirmed.
- No source files modified — confirmed.
- Nothing staged — confirmed.
- Nothing committed, nothing pushed — no `git commit`/`git push` invoked at any point in this stage.
- `data/` untouched — confirmed (read-only `pd.read_parquet` inspection only, no writes).
- No ingestion, no backfill, no PostgreSQL writes, no Parquet writes — none performed.
- No dependency changes — none performed (`npm audit`/`pip list --outdated` are read-only).
- `docs/m9-design-review.md` untouched — confirmed.
- `HEAD == origin/main == de384612a5a6d2815f23d6ec0100a96188ab5c00` — confirmed at both start and end of this stage.

**Stage A complete. Stopping here per instruction. Not proceeding to Stage B.**
