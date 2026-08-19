# PitWall — M23 Design Review: Documentation Reconciliation (M20–M22)

## Status

Stage B design. Not yet implemented. Awaiting explicit approval before Stage C.

## 1. Baseline and Scope

M23 = documentation reconciliation for three shipped, undocumented milestones, plus correction of
an active false statement.

- M20 commit: `e37a344` — `docs(m20): reconcile project documentation` — 2026-08-19
- M21 commit: `ef2d558` — `feat(m21): add cross-season tyre strategy trends` — 2026-08-19
- M22 commit: `6f29632` — `feat(m22): add corner highlighting` — 2026-08-19
- Current HEAD: `6f2963255b7f2eeb5470a5d25eedc3cd3a2baed5` (== `origin/main`)

This is the same class of milestone as M20 (`docs/m20-design-review.md`) and M16
(`docs/m16-design-review.md`) before it — documentation-only, no code, no schema, no API
implementation change. It follows M20's own established convention exactly (§3–§13 below mirror
M20's design review's own section shape).

Pre-existing, unrelated working-tree state (`docs/m9-design-review.md`, a single +1 blank-line
diff) is out of scope and will not be staged, modified, committed, or touched in any way during
Stage B or Stage C.

## 2. Documentation Drift Findings (re-verified this session, not carried from Stage A)

Re-checked directly against current source and git history:

1. **`README.md`** — "Current milestone" line (32) still says M19; milestone table stops at M19;
   zero mentions of M20/M21/M22 anywhere (`grep -c "M20\|M21\|M22" README.md` → 0).
2. **`CHANGELOG.md`** — `[Unreleased]` section is now doubly stale: it still says M19 is most
   recently completed, *and* it describes M20 as a still-pending reconciliation pass ("M20 is a
   documentation-only reconciliation pass... backfilling this file's M16–M19 entries") even though
   M20 already shipped and those M16–M19 entries already exist in the file (lines 16–109). No
   `## M20`/`## M21`/`## M22` headers exist.
3. **`docs/prd.md`** §3a table (lines 96–109) has rows through M19 only; no M20/M21/M22 rows. Line
   111's "see `docs/m16-design-review.md` and `docs/m20-design-review.md`" pointer needs a third
   reference once M23 exists. §5's deferred-features table, line 143: *"Corner highlighting (via
   `markArea`) | V2 | Same as above | Not yet built — explicit M14 non-goal."* — **false**, M22
   shipped this three commits ago. Document-history block (lines 157–160) stops at "v4 (M20, ...)".
4. **`docs/success-metrics.md`** lines 34–35: *"Corners can be highlighted (via `markArea`)... Not
   yet built — explicit M14 non-goal."* — same false statement, independent copy. Line 18's V2
   status summary ("mostly shipped, in M14") predates M22 and undercounts what's now shipped.
5. **`docs/architecture.md`** — M14's cursor-sync paragraph (lines 76–84) and M17's pace-trend
   paragraph (lines 91–94) exist; no M21 or M22 paragraph. M21 added no new diagram node (reuses
   M11's `driver_strategy_summary` unchanged, same as M17 reused `summarize_driver`) — same
   pattern, needs the same one-paragraph treatment. M22 added no backend/schema architecture at
   all — purely a frontend-only extension of the existing M14 synchronized surfaces — but that
   fact itself is worth stating explicitly, in the same place M14's own paragraph already lives,
   so a reader doesn't have to infer it.
6. **`docs/api-model.md`** endpoint table (lines 241–261): 19 rows for 20 real routes. Missing
   exactly `GET /drivers/{driver_id}/seasons/{season}/tyre-trend` (M21). The file already has a
   per-milestone addition-section convention (`## M17 addition: cross-season driver pace trend`,
   line 140) that M21 has no counterpart for. M22 added no backend route at all — `/sessions/
   {session_id}/track` is unchanged, corner detection is a pure client-side function
   (`frontend/src/features/track-map/detectCorners.ts`) over data that route already returned
   before M22 — so `api-model.md` needs no M22 entry. Confirmed by fresh route enumeration this
   session (20 real routes total, including `/health`) matching Stage A's count exactly.
7. **`docs/backlog.md`** — read in full again this session. Still accurate: its one open item (the
   `ParquetRepository.get_telemetry`'s `to_dict`/Pydantic residual-cost entry from M20) is
   untouched by M21/M22, since neither milestone touched that file (confirmed via `git diff --stat
   e85b7a2..HEAD -- backend/app/repositories/` returning empty). **No change needed.**
8. **`docs/data-model.md`** — zero M20/M21/M22 mentions, and that's correct: none of the three
   milestones changed persisted schema. M21 reuses `Stint`/`DriverStrategySummary` unchanged; M22
   reuses `TrackPoint` unchanged and adds no new persisted or API-response field (corner regions
   are derived in the frontend, never serialized). **No change needed** — confirmed by re-reading
   the file, not assumed from Stage A.

## 3. Exact Files to Be Modified During Implementation

1. `README.md`
2. `CHANGELOG.md`
3. `docs/prd.md`
4. `docs/success-metrics.md`
5. `docs/architecture.md`
6. `docs/api-model.md`

No other file. `docs/backlog.md` and `docs/data-model.md` are explicitly confirmed unchanged (§2
items 7–8). `docs/m9-design-review.md` is explicitly excluded (§1).

## 4. Exact Intended Changes Per File

### 4.1 `README.md`

- Line 32: `**Current milestone: M19 — Telemetry lookup optimization — complete.**` →
  `**Current milestone: M22 — Corner highlighting — complete.**`
- Milestone table: append three rows after M19, matching the existing table's exact column
  convention (`# | Milestone | Status`):

  | # | Milestone | Status |
  |---|---|---|
  | M20 | Documentation & roadmap reconciliation (M13–M19) | ✅ Done |
  | M21 | Cross-season tyre-strategy trends | ✅ Done |
  | M22 | Corner highlighting (V2 completion) | ✅ Done |

- The paragraph immediately below the table ("M8–M19 extend beyond the original V1 roadmap...")
  currently hard-codes "M8–M19" twice — update both to "M8–M22" so the range stays accurate rather
  than silently going stale again next milestone.

### 4.2 `CHANGELOG.md`

- Replace `[Unreleased]`'s body entirely. New text: nothing in progress; M22 is the most recently
  completed milestone; remove the stale forward-reference to "M20 is a documentation-only
  reconciliation pass... backfilling M16–M19 entries" since that already happened and is no longer
  useful framing — the `[Unreleased]` section's job is to describe the *current* state, not narrate
  a milestone three commits in the past.
- Add three new `## M2x — <Title> — <date>` sections, inserted directly above the existing `## M19`
  header (reverse-chronological order, matching the file's existing convention), each pointing to
  its own design review file exactly as every existing entry does:
  - `## M20 — Documentation & Roadmap Reconciliation — 2026-08-19` (date from `git show -s --format=%ci e37a344`)
  - `## M21 — Cross-Season Tyre Strategy Trends — 2026-08-19` (date from `ef2d558`)
  - `## M22 — Corner Highlighting — 2026-08-19` (date from `6f29632`)
  - Each entry's `### Added`/`### Changed` content will be written from that milestone's actual
    design-review/implementation-report content (`docs/m20-design-review.md`,
    `docs/m21-design-review.md`, `docs/m22-design-review.md`), matching the level of technical
    specificity every existing entry already has (e.g. M19's entry above, or M17's/M18's) — not a
    one-line summary.
- No existing entry (M0–M19) is edited, reordered, or reworded — additions only.

### 4.3 `docs/prd.md`

- §3a table (after line 109): append three rows, matching the existing table's exact two-column
  "What shipped / Relationship to the original roadmap" convention:

  | Milestone | What shipped | Relationship to the original roadmap |
  |---|---|---|
  | M20 | Documentation & roadmap reconciliation (`docs/m20-design-review.md`) | Documentation-only reconciliation pass; not itself V-scoped |
  | M21 | Cross-season driver tyre/stint-strategy trend analytics (`/drivers/{driver_id}/seasons/{season}/tyre-trend`) | Not itself named in the original roadmap; extends V3's stint/pit-stop deliverable (§5) to the cross-season case, mirroring M17's cross-season pace-trend pattern |
  | M22 | Corner highlighting on the track map and synchronized charts (`markArea`, client-side geometry detection) | **Delivers V2's corner-highlighting criterion (§5)** — completes the one V2 criterion M14 explicitly left as a non-goal |

- Line 111: update the "see ... for the reconciliation passes this table is part of" pointer to
  add `docs/m23-design-review.md` alongside the existing M16/M20 references.
- §5 deferred-features table, line 143: replace the false status. Exact new wording (matching the
  file's own established "Shipped — M<N>, <how>" pattern used by every other shipped row in this
  table, e.g. line 142's M14 row or line 144's M10/M11 row):

  `| Corner highlighting (via markArea) | V2 | Same as above | **Shipped — M22**, via a geometry-derived, client-side curvature detector (frontend/src/features/track-map/detectCorners.ts) over existing track-point data — no new backend route, repository method, or persisted field. Covers the same two synchronized surfaces as M14's cursor-sync (single-lap track map, M13 cross-session lap comparison); does not extend coverage to session-analytics or tyre-performance charts, matching M14's own coverage boundary. |`

  This explicitly distinguishes what M22 shipped (region-boundary highlighting) from what remains
  unbuilt and unrelated (fitted degradation curves, strategy recommendations — neither was ever a
  V2 criterion in the first place; they belong to V3/V4 territory already covered by other rows in
  this same table and are not conflated with corner highlighting).
- Document-history block: append
  `- v5 (M23, docs/m23-design-review.md): extended §3a through M22 (M20 docs reconciliation, M21
  cross-season tyre-strategy trends, M22 corner highlighting). Corrected §5's corner-highlighting
  row, false since M22 shipped. No scope or architecture change — documentation reconciliation
  only.`
- **No new V1–V5 criterion mapping is invented.** M21 and M20 are recorded in §3a only, the same
  "not itself V-scoped" / "extends an existing deliverable" treatment M16/M17/M18/M19 already
  received — neither is retrofitted into §2/§5's original V-numbered criteria, since neither was
  ever a stated V-criterion.

### 4.4 `docs/success-metrics.md`

- Line 18: update the V2 status summary from "mostly shipped, in M14" to reflect that the
  remaining M14-era non-goal has since shipped too — exact wording: *"Status (M16 reconciliation,
  `docs/m16-design-review.md`; corner-highlighting status corrected M23,
  `docs/m23-design-review.md`): all four criteria below are shipped, across M14 and M22."*
- Lines 34–35: replace the false corner-highlighting status. Exact new wording (matching this
  file's own established per-criterion annotation style, e.g. the M14 rows immediately above it):

  `- Corners can be highlighted (via markArea) with the corresponding chart region highlighting in
  sync. **Shipped in M22** — a geometry-derived corner detector run client-side over existing
  track-point data; highlights the same regions on both the track map and the synchronized
  telemetry/delta charts. Same coverage boundary as M14 (single-lap track map, M13 cross-session
  comparison) — not session-analytics or tyre-performance charts.`

- **No M20/M21 entries are added to this file.** Per the explicit Stage B instruction: M20 is a
  pure documentation pass (no success criterion to annotate) and M21 (cross-season tyre-strategy
  trends) doesn't map to any V1/V2 criterion already defined here — V3's criteria (not yet written
  as a versioned success-metrics section at all; §5 of `prd.md` is the closest analog and already
  covers M15's cross-session stint comparison without a parallel entry in *this* file either,
  confirming that not every shipped milestone gets a success-metrics row). Adding one for M21
  would be scope creep against this file's own stated purpose (defining done-ness *before*
  building, not cataloguing everything ever shipped).

### 4.5 `docs/architecture.md`

- After M17's paragraph (line 94, before `## 2. Layering Principle`), add two new paragraphs in
  the same voice/format as the existing M13/M14/M15/M17 paragraphs:

  - **M21 paragraph**: cross-season tyre/stint-strategy trend endpoint, reusing M11's
    `driver_strategy_summary` unchanged (same "no new diagram node, no new repository method"
    pattern M17's own paragraph already uses for `summarize_driver`) — one sentence, mirroring
    M17's exact structure and length.
  - **M22 paragraph**: extends M14's synchronized-cursor surfaces (referenced directly, not
    restated) with static corner-region highlighting (`markArea`), computed by a new pure
    client-side function (`detectCorners.ts`) over `TrackPoint` data the `/sessions/{session_id}/
    track` route already returned before M22 — **explicitly states M22 introduced no new backend
    route, repository method, schema field, or diagram node**, matching the file's own established
    practice (§2 item 5 above) of saying so explicitly rather than leaving it to be inferred from
    absence.
- No new top-level section. The existing "one paragraph per architecturally-relevant milestone,
  inserted in commit order right after §1's diagram narrative" placement is the file's own
  established convention (M13/M14/M15/M17 all live there) — M21/M22 follow the same placement
  rather than getting a separate "M20–M22" section, since neither introduces enough new structure
  to warrant one and M20 introduces no architecture at all (a pure documentation pass has nothing
  for this file to record).

### 4.6 `docs/api-model.md`

- New section after `## M17 addition: cross-season driver pace trend` (line 153), matching that
  section's exact structure and level of contract detail:

  `## M21 addition: cross-season tyre/stint-strategy trend`

  `GET /drivers/{driver_id}/seasons/{season}/tyre-trend?session_type=` (defaults to `race`) returns
  `SeasonTyreTrendResponse` (`app/models/driver_trends.py`): `driver_id`, `season`, `session_type`,
  `points: list[SeasonTyreTrendPoint]`. Each point (`session_id`, `event_id`, `event_name`,
  `round_number`, `session_date`, `strategy: DriverStrategySummary`) nests M11's
  `DriverStrategySummary` unchanged rather than flattening it, since every one of that model's
  fields is reused (unlike M17's pace-trend point, which flattens a deliberate subset of
  `DriverSummary`). A round the driver didn't compete in is omitted from `points` entirely, same
  roster-absent convention as M17. A round where the driver has zero recorded stints still
  produces a point (`strategy.stint_count == 0`, empty arrays) rather than being omitted — differs
  from the roster-absent case, since `driver_strategy_summary([])` already produces exactly that
  shape with no special-casing. **Never 404s**, same reasoning as M17's pace-trend route.

- New table row, inserted directly after the existing M17 pace-trend row (line 261), same column
  format:

  `| GET | /drivers/{driver_id}/seasons/{season}/tyre-trend?session_type= (M21,
  app/api/driver_trends.py) | SeasonTyreTrendResponse | Never 404s — see the M21 addition above |`

- **No M22 row or section.** Confirmed this session by fresh route enumeration (20 real routes)
  and by reading `app/api/track.py`: M22 added no route, and the existing `/sessions/{session_id}/
  track` row's contract is unchanged (still returns `list[TrackPoint]`, corner detection happens
  entirely downstream of this response, client-side). Adding a section for a route that didn't
  change would misstate what M22 actually did to the API surface.

## 5. Architecture Documentation Strategy

Two short paragraphs (M21, M22), placed exactly where M13/M14/M15/M17's own milestone paragraphs
already live, following the file's own established per-milestone-paragraph convention rather than
introducing a new section. M22's paragraph explicitly states the "no new backend/schema" fact
rather than leaving it implicit — this is the one point in the whole reconciliation where "nothing
changed architecturally" is itself the fact worth recording, since a reader scanning this file for
what changed shouldn't have to cross-reference the API/data-model docs to confirm nothing did.

## 6. API Documentation Strategy

One new milestone-addition section (M21, matching M17's exact template) plus one new table row.
No M22 addition, for the reason stated in §4.6 — M22 changed frontend behavior over an unchanged
API response, and `api-model.md`'s job is the API contract, not frontend rendering.

## 7. Data-Model Documentation Strategy

No change. Confirmed by direct re-reading this session (§2 item 8), not carried from Stage A —
neither M21 nor M22 touched persisted schema, and the file already correctly reflects that by
omission.

## 8. Backlog Resolution Strategy

No change. `docs/backlog.md`'s one open item predates M20 and is untouched by M21/M22 (§2 item 7).

## 9. Cross-Document Consistency Rules

- The corner-highlighting correction must say the same thing in `docs/prd.md` §5 and
  `docs/success-metrics.md`: shipped in M22, same two-surface coverage boundary as M14, no
  extension to session-analytics/tyre-performance charts, no conflation with still-unbuilt fitted
  degradation curves or strategy recommendations (those were never a V2 criterion to begin with).
- `README.md`'s milestone table, `CHANGELOG.md`'s headers, and `docs/prd.md`'s §3a table must use
  the same milestone titles for M20/M21/M22 (verbatim: "Documentation & roadmap reconciliation",
  "Cross-season tyre-strategy trends", "Corner highlighting") so a reader cross-referencing the
  three doesn't encounter three different names for the same milestone.
- Every new/changed claim about M20/M21/M22 must trace to something directly verified this
  session (commit hash, route enumeration, source read) — not restated from M20/M21/M22's own
  design-review reports without a fresh check, matching the discipline M23's Stage A audit already
  applied.

## 10. Explicit Non-Goals

- No code, test, schema, or API implementation change of any kind.
- No refactor of `_to_driver_strategy_summary`'s three-way duplication (Stage A confirmed it's
  real but deliberately out of scope for every milestone that's touched it, including this one).
- No resolution of any M12 §18 open question.
- No new ADR — M20/M21/M22 introduced no new dependency, layer, provider, or reversal (Stage A
  confirmed; re-confirmed here, no new evidence changes that conclusion).
- No addition of a `docs/m21-design-review.md`/`docs/m22-design-review.md` cross-reference audit
  beyond what §4 above already specifies — those files already exist and are not being rewritten,
  only pointed to.
- No change to `docs/backlog.md` or `docs/data-model.md` (§7–§8).
- No change to `docs/m9-design-review.md` or any file outside the six listed in §3.
- No performance work, no frontend change, no pipeline/ingestion change.

## 11. Verification Strategy

To be run during Stage C implementation, before presenting for commit approval:

1. `git diff --stat` after edits shows exactly the six files in §3 changed, nothing else.
2. `git diff -- docs/m9-design-review.md` still shows only the original +1 blank-line diff,
   byte-identical to its state at the start of Stage B.
3. Grep-based consistency check: `grep -c "M20\|M21\|M22"` across README.md/CHANGELOG.md/
   docs/prd.md all return non-zero after the edit (currently all zero).
4. `grep -n "Not yet built" docs/prd.md docs/success-metrics.md` no longer matches the
   corner-highlighting lines specifically (other "Not yet built" rows for genuinely unbuilt
   features, e.g. weather/position-history, are expected to remain and must not be touched).
5. Route-count cross-check: `docs/api-model.md`'s table row count equals the live route count
   confirmed in Stage A (20, including `/health` which the table deliberately doesn't list as a
   feature route — matching its current documented convention).
6. Re-read every edited section once after writing, checking each claim against the specific
   source line it's grounded in (commit hash, file path, route decorator) rather than trusting the
   design doc's own prose.
7. No `ruff`/`eslint`/test run is needed — no code changed — but a final `git status` confirms no
   accidental file was touched (e.g. no stray `.pyc`, no editor swap file).

## 12. Scope-Boundary Decisions

- M20/M21 get §3a-table + CHANGELOG rows only (M21) or the same plus nothing further (M20, already
  fully covered by existing text elsewhere) — neither gets a success-metrics entry, per §4.4's
  reasoning.
- M22 gets the full treatment (README, CHANGELOG, prd.md §3a, prd.md §5 correction,
  success-metrics.md correction, architecture.md paragraph) because it's the one milestone with
  both a false statement to correct and genuine V2-criterion significance.
- `docs/api-model.md` gets a change for M21 only, not M22, because M21 changed the API surface and
  M22 didn't — the file's own scope is the API contract, and extending it to non-API changes would
  blur that boundary.

## 13. Anticipated Deviations from the Stage A Recommendation

None identified. Stage A recommended exactly this scope (§12/§13 of the Stage A report); Stage B's
source verification (commit dates, route contracts, exact current wording of every doc to be
touched) confirmed every finding Stage A's audit made, with one correction of the audit's own
framing (M12 §18's open questions are not all still open — already noted in Stage A's §7 and not
part of M23's scope regardless). No new finding surfaced during Stage B that would change M23's
recommended scope.

## Confirmation: No Code/Schema/API Implementation Changes

Stage C, if approved, will touch exactly six Markdown files (§3), zero of which are source code,
test, configuration, schema, or API implementation files. No `backend/`, `frontend/src/`,
`pipeline/`, or `docs/adr/` file is in scope. No dependency, route, model, or database change of
any kind is intended or will occur.

## Document History

- v1 (this document): M23 Stage B design, scoping documentation reconciliation for M20–M22 and
  correction of the false corner-highlighting statement in `docs/prd.md` and
  `docs/success-metrics.md`.

## Safety Confirmation

No repository file other than this one (`docs/m23-design-review.md`, newly created) was modified,
staged, committed, or pushed during Stage B. `docs/m9-design-review.md` remains exactly as found —
untouched, still showing only its pre-existing +1 blank-line diff. No code, test, schema, or API
change was made or is proposed. Nothing has been staged, committed, or pushed.

**STOP — awaiting explicit approval before proceeding to Stage C.**
