# PitWall — M20 Design Review: Documentation Reconciliation (M13–M19)

## Status

Design only. Nothing in this document has been implemented. `docs/m9-design-review.md`'s
pre-existing, unrelated single-blank-line modification is untouched by this work. No living
document listed in §3 has been edited yet.

## 1. Baseline and Scope

Verified directly, this session:

- `HEAD` = `origin/main` = `e85b7a22bdef6624ed6a92e7d99d0a099d80b79b` (M19, committed and pushed).
- `git status --porcelain`: only `M docs/m9-design-review.md` (the pre-existing, out-of-scope
  single-blank-line diff). No `docs/m20-design-review.md` existed before this document.
- No application code, test, schema, migration, dependency, pipeline, or data file is touched by
  this design or will be touched by the implementation it describes.

Approved direction (M20 Stage A, confirmed): documentation reconciliation covering the M13–M19
drift, extending — not replacing or re-architecting — the M16 reconciliation pattern
(`docs/m16-design-review.md`), which itself covered exactly five files and explicitly named
`docs/architecture.md`, `docs/api-model.md`, `docs/data-model.md`, and `docs/backlog.md` as
out of its own scope (`docs/m16-design-review.md` §3, §4). M20 picks up exactly those four plus
re-verifies the five M16 touched, now three milestones further stale.

## 2. Documentation Drift Findings (re-verified this session, not assumed from Stage A)

| Doc | Last touched | Drift |
|---|---|---|
| `README.md` | `870ae45` (M16) | "Current milestone: M15"; milestone table stops at M15; **M16, M17, M18, M19 absent** — including M16 itself, which never recorded its own existence. |
| `CHANGELOG.md` | `870ae45` (M16) | `[Unreleased]` still says M15 is most recent. **M16 has no dated entry at all** (only a passing mention inside the stale `[Unreleased]` blurb); **M17, M18, M19 have no entries.** |
| `docs/prd.md` §3a | `870ae45` (M16) | Table stops at M15 row. **M16, M17, M18, M19 absent.** |
| `docs/success-metrics.md` | `870ae45` (M16) | V2/V3 sections correctly reflect M14/M15 (verified against current source, §4 below) — no drift there. **No mention of M16–M19**, but see §4's decision on whether any is warranted. |
| `docs/architecture.md` | `e9846a2` (M12 closeout) | **Unchanged since M12.** M13 (pairwise comparison), M14 (cursor-sync architecture), M15 (stint comparison), M17 (cross-season trend), and the M17→M18→M19 `ParquetRepository` caching/indexing lineage are entirely undocumented. |
| `docs/api-model.md` | `e9846a2` (M12 closeout) | **Unchanged since M12.** `/laps/compare` (M6-era single-session form, then M13's two-session generalization), `/stints/compare` (M15), `/drivers/{d}/seasons/{s}/pace-trend` (M17) are absent. Also pre-existing, unrelated to M13–19: M8's `/analytics/drivers` and `/analytics/drivers/{driver}/laps` were never documented here either — a gap that predates this milestone's scope but sits directly adjacent to the rows this pass is adding. |
| `docs/data-model.md` | `e9846a2` (M12 closeout) | **Unchanged since M12.** No record that M17/M18/M19 added zero persisted schema (true, but unstated) or of what they did add (in-memory, per-instance caches). |
| `docs/backlog.md` | `b130701` (pre-M6 audit) | Its one backend-performance entry describes `_find_session` re-globbing/re-reading on every call — **resolved by M17 (session index) and further improved by M18 (file caches)/M19 (positional index)** — but the entry is still present, unedited, describing a defect that no longer exists in the form written. |

No V1–V5 success criterion is contradicted by current code. No new drift beyond what M18/M19
Stage A audits already found — this table is a re-verification, not a new discovery.

## 3. Exact Files to Be Modified During Implementation

Exactly eight, matching the approved Stage A/B scope, plus this document (already created):

1. `README.md`
2. `CHANGELOG.md`
3. `docs/prd.md`
4. `docs/success-metrics.md`
5. `docs/architecture.md`
6. `docs/api-model.md`
7. `docs/data-model.md`
8. `docs/backlog.md`

No other file. `docs/m9-design-review.md` and every `docs/mNN-design-review.md`/
`docs/mNN-implementation-plan.md`/`docs/mNN-frontend-design-note.md` historical record is
explicitly out of scope and will not be touched, matching M16's own non-goal (§4 there).

## 4. Exact Intended Changes Per File

### 4.1 `README.md`

- `**Current milestone: M15...**` → `**Current milestone: M19 — Telemetry lookup optimization — complete.**`
- Milestone table: add rows for M16, M17, M18, M19 (✅ Done), matching the existing table's exact
  column shape (`#`, `Milestone`, `Status`).
- "Current capabilities" section: add a paragraph for M17 (cross-season pace-trend page, its route,
  its entry point from `DriverSelectPage`), matching the existing one-paragraph-per-milestone style
  (M10/M11/M12/M13/M14/M15 each already get one). Add **short** paragraphs for M18 and M19 explicitly
  framed as internal performance work, not new user-facing capability — mirroring the same honest,
  precise register the M14 paragraph already uses for describing what actually changed vs. what
  didn't (§4.1's M14 paragraph already models this: "no change to `/laps/compare`'s API contract").
  M16 gets **no** capabilities paragraph (it shipped no capability — table row + the existing
  cross-reference to `docs/m16-design-review.md` in the "M8–M15 extend beyond..." sentence, updated
  to "M8–M19," is sufficient, matching how M12's own infra-only nature is already handled: it *does*
  get a paragraph today because it added a real navigation capability — M16 shipped nothing
  equivalent).
- Update the paragraph currently reading "M8–M15 extend beyond the original V1 roadmap... each has
  its own design review under `docs/`" → "M8–M19."
- Verify the `## Roadmap` version table (V1–V5) needs no edit — confirmed accurate, no drift there.
- No change to Quick start, Docker, Architecture, Technology stack, Repository structure, ADR index,
  Disclaimer, or License sections — none reference milestone-specific facts that have drifted.

### 4.2 `CHANGELOG.md`

- `[Unreleased]`: replace "Nothing in progress — M15 is the most recently completed milestone... M16
  is a documentation-only reconciliation pass... backfilling this file's M13–M15 entries" with a
  version naming M19 as most recent and M20 (this milestone) as in progress, matching the file's own
  established `[Unreleased]` convention (see how it read at the M15 point, before M16 landed).
- Add four new dated sections, each in the file's own established per-milestone format (`## MXX —
  Title — YYYY-MM-DD`, `See docs/mXX-design-review.md...`, `### Added`/`### Changed`), using the real
  commit dates verified via `git log`:
  - `## M16 — Documentation & Roadmap Reconciliation — 2026-08-16` (commit `870ae45`) — `### Changed`
    only (docs-only milestone, no `### Added`), listing the five files M16 itself touched.
  - `## M17 — Cross-Season Driver Pace Trends — 2026-08-16` (commit `ee7a82c`) — `### Added`:
    `GET /drivers/{driver_id}/seasons/{season}/pace-trend`, `ParquetRepository._index()` session
    lookup, the frontend `DriverSeasonPaceTrendPage` and its `DriverSelectPage` entry point.
    `### Changed`: none to any existing endpoint contract.
  - `## M18 — Per-Session Parquet File Caching — 2026-08-18` (commit `e9ec3c7`) — `### Added`: the
    four per-session file caches and `_cached_read` in `ParquetRepository`. `### Changed`: none to
    any endpoint/interface — internal only.
  - `## M19 — Telemetry Positional Index — 2026-08-19` (commit `e85b7a2`) — `### Added`:
    `_telemetry_index_cache`/`_telemetry_positions`/`_group_telemetry_by_driver_lap` in
    `ParquetRepository`. `### Changed`: none to any endpoint/interface.
- No existing dated section (M0–M15) is rewritten — matches the file's own stated purpose ("notable
  changes... grouped by milestone") and the explicit instruction not to rewrite historical entries.

### 4.3 `docs/prd.md`

- §3a table: add four rows (M16, M17, M18, M19), matching the table's existing two-column shape
  (`What shipped` / `Relationship to the original roadmap`):
  - M16 → "Documentation-only reconciliation pass; not itself V-scoped" (same category the table
    already uses for M12: "Infrastructure; not itself V-scoped").
  - M17 → "Cross-season driver pace-trend analytics" / "Not itself named in the original roadmap; a
    new cross-season capability building on M8's session-analytics pattern" — explicitly the same
    "not originally specified" framing the table already uses for M13/M15, per the Stage B
    instruction not to pretend M17 was originally specified. Resolved: M17 does **not** map to any
    V1–V5 criterion (verified: no V-section mentions per-season or cross-event pace trends anywhere)
    — it is recorded purely as shipped-scope-beyond-the-original-text, identical in kind to M8/M12's
    existing rows, not folded into V3 or any other version.
  - M18 → "Per-session Parquet file-level caching (performance)" / "Infrastructure; not itself
    V-scoped."
  - M19 → "Telemetry driver/lap positional index (performance)" / "Infrastructure; not itself
    V-scoped."
- §5 (deferred-features table): re-verified against current source — **no edit needed**. Every row's
  "Status" column is still accurate (weather/position/gap/standings/race-control/exports still
  unbuilt, corner highlighting still unbuilt, cursor-sync coverage still exactly what M14/M16 already
  recorded). M17 shipped no deferred-list item; M18/M19 aren't on the deferred list at all (they were
  never a deferred *feature*, being pure internal performance work).
- §0–§2 (vision, scope, V1 requirements text): **no edit.** Preserved exactly as originally written,
  per the explicit instruction not to silently rewrite original product requirements.
- Document history: add a `v4` line recording this reconciliation, mirroring the existing `v3 (M16,
  ...)` line's own format and restraint ("No scope or architecture change — documentation
  reconciliation only").

### 4.4 `docs/success-metrics.md`

**Resolved decision: no edit to the V1–V5 section bodies.** Re-verified directly against current
source: the M16-added V2 status block accurately describes M14's real cursor-sync mechanism and its
actual coverage (track-map + M13 lap-comparison only, not session-analytics/tyre-performance) — this
is still true, unchanged by M17/M18/M19, needs no correction. The M16-added V3 status block
accurately describes M10/M11/M15 — also still true, unchanged.

M16, M17, M18, and M19 are **not added** to this document, for the same reason M12 was never added
to it either (confirmed: M12 has zero mentions in current `success-metrics.md`, and that absence
predates this milestone) — this document's own established scope is success criteria for V1–V5, not
a shipped-milestone log (that's `docs/prd.md` §3a's and `CHANGELOG.md`'s job). None of M16–M19 maps
to an existing, stated V1–V5 criterion:

- M16: docs-only, not a criterion.
- M17: cross-season pace trends were never a stated criterion for any version (verified, §4.3
  above) — adding a status line for it here would be exactly the "manufactured success criterion"
  the Stage B instructions explicitly prohibit.
- M18/M19: the only plausibly-relevant existing text is V1's "Load time is dominated by
  network/render, not by live data fetching, because ingestion is pre-computed rather than done at
  request time" — this describes avoiding live FastF1 fetches at request time, a property true since
  M1 and unaffected by M18/M19 (which optimize repeated in-process Parquet reads/filters on an
  M8-added page, not V1's own pages, and don't touch live-fetch behavior at all). No existing
  criterion's truth value changed, so no correction is warranted, and inventing a new criterion here
  would itself be the "manufactured" outcome the instructions warn against.

This is a considered "no change" decision, not an oversight — recorded here so it's an explicit,
reviewable resolution rather than a silent gap.

### 4.5 `docs/architecture.md`

**Decision A (resolved): a concise extension of the document's own existing per-milestone-paragraph
style in §1 and §3, not a new "changelog" section and not full milestone-by-milestone essays.** The
document already does this — §1 has short "M10 adds...", "M12 adds..." paragraphs; §3 already
describes `TelemetryRepository`/`ParquetRepository`/`RaceContextRepository` evolution inline. M20
extends that exact pattern rather than inventing a new structure:

- Header paragraph (currently: "extended in place by each later milestone (M8–M12) rather than
  rewritten") → "M8–M19."
- §1 (System Overview & Data Flow): add short paragraphs, matching the existing M10/M12 paragraph
  length and register:
  - M13: `/laps/compare` generalized to two independently-selected sessions — no new diagram node,
    the existing `API` box already covers it; note the retired single-session route.
  - M14: the one genuinely new architectural element since the diagram was drawn — page-scoped
    Zustand cursor stores as the cross-component sync mechanism, **not** `echarts.connect()`/
    `axisPointer.link` as ADR-0008 originally anticipated (that mechanism can't reach the SVG track
    map — the same finding `docs/m14-design-review.md` §8 and `docs/success-metrics.md`'s V2 status
    already record, restated here at the architecture level for the first time). Explicit coverage
    statement: track-map page and the M13 cross-session comparison page only — session-analytics and
    tyre-performance charts are not part of this synchronized surface, re-verified this session
    (Stage A §6) as still true.
  - M15: `/stints/compare` mirrors M13's pattern exactly — one sentence, no new node.
  - M17: cross-season pace-trend endpoint reuses M8's `summarize_driver` unchanged, adds no new
    repository method beyond M17's own session index (below) — one sentence.
- §3 (Provider & Repository Abstractions): extend the existing `TelemetryRepository`/
  `ParquetRepository` paragraph with the caching/indexing lineage the Stage B instructions
  specifically call out, in one coherent paragraph rather than three separate ones:
  **session index (M17) → per-session file caches (M18) → telemetry driver/lap positional index
  (M19)** — each described in one clause: what it caches, that it's lazy/per-instance/request-scoped
  (tied to the unchanged `get_telemetry_repository()` factory — no `@lru_cache`, no singleton, no
  shared instance across requests/threads), and that none of the three introduced a persistent
  schema change (cross-referenced to `docs/data-model.md`'s new M17–M19 section, §4.7 below) — using
  language the current `ParquetRepository` class docstring already establishes almost verbatim, so
  this is a transcription/summary of already-true, already-written internal documentation into the
  living architecture doc, not new analysis.
- §5 (Repository Structure, the annotated tree): extend the existing `incl. seasons.py (M12)`-style
  inline annotations on `app/api/` to also mention `laps_compare.py (M6/M13)`, `stints_compare.py
  (M15)`, `driver_trends.py (M17)`; extend the frontend tree's `state/` annotation
  (`selectionStore, later cursorStore`) to note `cursorStore` is now real (M14), not merely
  anticipated — the existing annotation already says "later cursorStore," so this is confirming a
  forward reference resolved, not adding new information.
- §6 (Open implementation detail): **no edit** — re-verified, the cache's physical-location question
  is still open, unrelated to M13–19.
- **No new ADR reference is added, and no ADR is created** — per the explicit constraint and per §9
  below's re-verification against CLAUDE.md's own ADR trigger.

### 4.6 `docs/api-model.md`

**Decision B (resolved): use the document's own existing "## MXX addition: ..." section convention
(as M4/M10/M11 already establish), not a full contract rewrite.** Three new sections, each mirroring
the M10/M11 section's own structure (prose description, response-model field list, warning/error
semantics, endpoint table row):

- `## M13 addition: cross-session lap comparison` — `GET /laps/compare` (generalized from the
  retired `GET /sessions/{session_id}/laps/compare`), `session_id_a`/`driver_a`/`lap_a`/
  `session_id_b`/`driver_b`/`lap_b` query params, `LapComparisonResponse` shape, the
  `DIFFERENT_CIRCUIT` non-blocking warning (disclose-don't-block, 200 not 4xx).
- `## M15 addition: cross-session stint/tyre-strategy comparison` — `GET /stints/compare`, its
  `StintComparisonResponse{a, b, warnings}` shape (session_id/driver_id/strategy/stints/pit_stops per
  side), the `DIFFERENT_CIRCUIT`/`NO_STINT_DATA_A`/`NO_STINT_DATA_B` warnings, same
  disclose-don't-block convention.
- `## M17 addition: cross-season driver pace trend` — `GET /drivers/{driver_id}/seasons/{season}/
  pace-trend`, `SeasonPaceTrendResponse{driver_id, season, session_type, points}`, the "never 404s"
  semantics (neither `driver_id` nor `season` is a persisted, independently-checkable resource — same
  reasoning the document already gives for why `/seasons/{season}/events` doesn't 404 either).
- Endpoints table: add rows for the three routes above, plus — resolved as "necessary for
  consistency" per the approved scope's own wording — the two pre-existing, never-documented M8
  routes (`/analytics/drivers`, `/analytics/drivers/{driver}/laps`), since leaving them out while
  adding M13/M15/M17 rows directly around them would read as a fresh omission rather than
  inherited, pre-existing drift. This is the one place this pass's scope reaches slightly earlier
  than M13, justified by direct table-consistency, not scope creep — flagged explicitly here rather
  than done silently.
- **No change** to the M2/M4/M10/M11 sections, the `TelemetryRepository` interface listing (still
  accurate — M17–M19 added no interface method), the session-lookup section, or the testing-approach
  section.

### 4.7 `docs/data-model.md`

**Decision C (resolved): a new section following the document's own established heading pattern**
(`## M11: no new persisted schema`, `## M12 additions: ... (discovery-time only — no new persisted
schema)`) — the document already has a precedent for exactly this kind of "here's what changed, and
here's the explicit no-schema-change statement" section, so M20 uses it rather than inventing a new
structure:

- `## M13–M19: no new persisted schema` — states plainly that none of M13, M14, M15, M16, M17, M18,
  or M19 added a Parquet column, a PostgreSQL table/column, or a migration (re-verified this session:
  zero `pipeline/` changes across that entire span, confirmed via `git diff --stat` from the M15
  commit through HEAD).
- Within that section, the M17–M19 caching/indexing lineage is described explicitly as **runtime,
  in-process, per-`ParquetRepository`-instance state — never written to Parquet, never a schema
  element, gone at the end of every request** (the request-scoped lifecycle is the load-bearing fact
  that makes this true, not an incidental detail — cross-referenced to `docs/architecture.md` §3's
  now-updated lineage paragraph, §4.5 above, so the same fact isn't independently re-derived in two
  places). This directly satisfies the Stage B instruction to be "extremely clear" these aren't
  schema changes.
- One sentence noting M14's cursor-sync is entirely frontend (Zustand) state with no backend/data
  layer involvement at all — included here only to close off any reader inference that a "sync"
  feature might imply a data-model change; it doesn't.
- **No change** to the Entities section, `TelemetryProvider` interface, normalization functions,
  `TrackPoint` derivation, the Parquet cache layout diagram, the M10 additions (`compound`/`Stint`/
  `PitStop`), or the M11/M12 sections — all still accurate.

### 4.8 `docs/backlog.md`

**Decision D (resolved).** The document's own stated policy (line 9): "Items are removed once fixed,
not marked done — this list should always reflect open debt only." The `_find_session` entry is
fixed (M17 session index; further improved by M18/M19) — per the document's **own already-written
convention**, the correct treatment is removal from the active list, not an in-place "resolved ✅"
marker, which would contradict the policy the document already states for itself. This is not
"deleting history to make the backlog look clean" (the Stage B constraint's concern): the permanent
record of the problem and its resolution already exists independently, in `docs/m17-design-review.md`
§1–§3, `docs/m18-design-review.md` §1, `docs/m19-design-review.md` §2–§3, and `CHANGELOG.md`'s new
M17/M18/M19 entries (§4.2 above) — none of that is lost by removing one now-inaccurate paragraph from
a living "open debt only" list.

**Replacement item, not a blank removal:** M20 Stage A's own re-audit (§4 there) found a genuine,
smaller, still-open residual cost at the same call site the removed entry described:
`ParquetRepository.get_telemetry`'s per-call `to_dict("records")` + Pydantic (`TelemetrySample`)
construction, measured at ~2ms/call, ~2.2–3.8s total for a real full-grid `session_analytics`
request (down from the pre-M17 37.7s baseline, but still the slowest page in the app). This is
recorded as a new "Backend / performance" entry, at the same evidentiary bar as the entry it
replaces (a real measurement, not a guess), explicitly framed as informational/deferred — not a task
assignment, not part of M20's own scope, matching the document's own header framing ("identified...
but deliberately not implemented at the time they were found").

No other backlog entry (security/dependencies, testing quality, Docker/deployment, documentation/
process) is touched — all re-verified as still accurate and unrelated to M13–19.

## 5. Architecture Documentation Strategy

Covered in §4.5. Summary: extend existing paragraph-per-milestone style in §1 and the existing
`ParquetRepository` narrative in §3; no new section type; no new diagram nodes except where a real
new architectural element exists (M14's cursor stores only); no future/aspirational content.

## 6. API Documentation Strategy

Covered in §4.6. Summary: reuse the exact `## MXX addition: ...` convention already established by
M4/M10/M11; document real response shapes and warning semantics already shipped; include the two
pre-existing undocumented M8 routes for table consistency, flagged explicitly rather than silently
absorbed; touch nothing else.

## 7. Data-Model Documentation Strategy

Covered in §4.7. Summary: one new section following the exact `## M11:` / `## M12 additions:`
heading precedent; explicit, unambiguous "no new persisted schema" framing for the entire M13–M19
span; M17–M19's caches explicitly labeled as runtime/in-process/request-scoped state, never schema.

## 8. Backlog Resolution Strategy

Covered in §4.8. Summary: remove the stale `_find_session` entry (per the document's own stated
"removed once fixed" policy — the permanent record lives elsewhere, in design-review docs and
`CHANGELOG.md`); replace it with a new, real, measured residual-cost entry from M20 Stage A's own
re-audit, at the same evidentiary bar. No other entry touched.

## 9. Cross-Document Consistency Rules

To keep the eight files from drifting from *each other* the way they drifted from source:

- Every milestone-history table (`README.md`'s table, `docs/prd.md` §3a) gets the **same four new
  rows** (M16–M19), same one-line description each, sourced from `CHANGELOG.md`'s new entries
  (§4.2) so the wording is consistent, not independently reworded three times.
- Every reference to the caching/indexing lineage (architecture.md §3, data-model.md's new section)
  uses the **same three-stage description** — session index (M17) → file caches (M18) → positional
  index (M19) — rather than three independently-drafted summaries that could quietly diverge.
- Every reference to M14's cursor-sync coverage (architecture.md, and the already-correct
  success-metrics.md/README text) states the **same two-page scope** (track-map + M13 comparison
  page; not session-analytics/tyre-performance) — re-verified against current frontend source this
  session (Stage A §6), not copied from a possibly-stale prior doc.
- `git log` commit dates (§2's table) are the single source of truth for every date used in
  `CHANGELOG.md`'s new entries and `docs/prd.md`'s document-history line — not estimated or taken
  from design-review doc headers, which may predate the actual commit.
- The M13/M15/M17 "not originally specified" framing (§4.3) is applied identically wherever any of
  the three is mentioned across the eight files, matching the precedent M16 itself set for M13/M15
  (`docs/m16-design-review.md` §4's own stated non-goal language) and extending it, not varying it,
  for M17.

## 10. Explicit Non-Goals

- No application source, test, schema, migration, dependency, pipeline, or data file changed.
- No frontend file changed.
- No new ADR (§4.5's explicit statement; re-verified in §11).
- No ingestion, no database write, no Parquet write.
- No fix to `docs/m9-design-review.md` or any historical `docs/mNN-*.md` record.
- No product feature work bundled in — every change in §4 is a documentation correction of already-
  shipped, already-verified reality, never a new capability, proposal, or roadmap addition.
- No fix to any *other* backlog item, or to the pre-existing, unrelated `npm audit`/Docker findings
  noticed while reading `docs/backlog.md` — explicitly out of scope, per the Stage B constraint.
- No resolution of any M12 §18 open question — M20 Stage A re-confirmed all seven remain open and
  generates no new evidence; this reconciliation records that fact where relevant (data-model.md's
  new section does not touch it; no other file in scope references those questions) but does not
  attempt to resolve any of them.
- No manufactured V1–V5 success criterion for M17 (§4.4's resolved decision).
- No recursive documentation layer for M16 (§4's M16 rows/entries are one line each, factual,
  matching every other milestone's row — not a re-narration of `docs/m16-design-review.md`'s own
  content).

## 11. Validation Strategy (documentation-focused, to run during implementation)

- `git diff --check` on all eight modified files (trailing-whitespace/conflict-marker safety, same
  gate M16–M19 already used for docs-only and code changes alike).
- Stale-statement search: re-grep for `"M15"`/`"Current milestone"`/`"most recently completed"` etc.
  across the eight files post-edit, confirming no leftover pre-M20 phrasing survives.
- Cross-document milestone/date consistency: verify the four new milestone rows/entries carry
  identical dates and one-line descriptions across `README.md`, `CHANGELOG.md`, and `docs/prd.md`
  §3a (§9's rule, mechanically checked).
- Endpoint inventory vs. `docs/api-model.md`: re-run the same `grep -n "@router\."` sweep across
  `backend/app/api/*.py` used in Stage A, diffed against the post-edit endpoints table to confirm
  every route not explicitly deferred (M13/M15/M17/M8-analytics) is now present, and no route was
  invented that doesn't exist in source.
- Architecture claims vs. actual source: re-verify the M14 cursor-sync coverage claim
  (`grep -rl "useCursorSync\|cursorStore" frontend/src/features`) and the `ParquetRepository`
  lineage claim (re-read `backend/app/repositories/parquet_repository.py`) against the new
  architecture.md text, exactly as this design's own §2/§4.5 evidence was gathered — not assumed
  stable between now and implementation.
- Data-model claims vs. actual repository/schema: `git diff --stat` across `pipeline/migrations/`
  and `data/processed/` structure (directory layout only, no content read) confirming zero schema
  drift, matching the new data-model.md section's claim.
- Backlog resolved-item verification: confirm the replacement entry's cited numbers (~2ms/call,
  ~2.2–3.8s full-grid) still match a fresh read-only re-run of Stage A's benchmark methodology
  before the entry is written, not carried forward from memory alone.
- Ensure no excluded file changed: `git status --short` immediately before staging (at the eventual
  commit stage, not part of this design) must show exactly the eight files in §3 plus the
  pre-existing, untouched `docs/m9-design-review.md`.

## 12. Scope / Deviation Rules

- If implementation surfaces a genuine additional stale statement in one of the eight files not
  anticipated in §4, it may be corrected **only if it is factually about M13–M19 or the M16
  reconciliation's own gaps** (matching this milestone's actual subject) — anything else (e.g. an
  unrelated V4/V5 wording question, or the pre-existing M8 `/analytics` documentation gap beyond the
  one table-consistency exception already granted in §4.6) is logged as a new, separate backlog
  candidate, not fixed inline.
- If any §4 decision turns out to be factually wrong once the actual edit is drafted (e.g. a commit
  date mismatch), the fix is corrected against `git log` directly, not against this design note's
  restated figures.
- No deviation may expand scope to a ninth file without being raised explicitly first.

## 13. Remaining Implementation Decisions

None are load-bearing or ambiguous — every question the Stage B brief posed (A–F) is resolved above
with a specific mechanism, not left open. Two small, non-blocking judgment calls are flagged for
visibility rather than silently decided:

- §4.6's inclusion of the two pre-existing M8 `/analytics` routes reaches slightly outside M13–M19's
  literal boundary for table-consistency reasons — a deliberate, disclosed choice, not an open
  question, but worth the reviewer's explicit attention since it's the one place this pass's edges
  are fuzzy by design.
- §4.8's replacement backlog entry's exact wording (not its substance, which is fixed by Stage A's
  measurement) will be drafted during implementation against a fresh confirmatory benchmark run
  (§11), not against this document's prose, in case real-data numbers shift slightly run-to-run.

## Document History

- v1 (this document): M20 Stage B design, extending `docs/m16-design-review.md`'s reconciliation
  pattern to cover M13–M19 across the eight files it originally left out of scope.

## Safety Confirmation

- Exactly one file was created by this task: `docs/m20-design-review.md`.
- No other file was created, modified, staged, committed, or pushed.
- `docs/m9-design-review.md` remains at its pre-existing baseline diff (`+1` blank line),
  unmodified, unstaged.
- No ingestion, no database write, no Parquet write, no application/frontend/pipeline code change
  occurred.
- Nothing has been committed or pushed.

**Stop.** Awaiting explicit approval before any M20 implementation.
