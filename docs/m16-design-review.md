# PitWall — M16 Design Review: Documentation & Roadmap Reconciliation

**Status:** Design note — documentation-only implementation follows immediately. No application
source, test, schema, migration, dependency, or data file is touched by this milestone.
**Baseline:** M15 complete (`7dbf915`) — cross-session stint & tyre-strategy comparison.
**Author's framing:** senior engineering review, matching the M12–M15 design-review precedent —
every claim below is checked directly against the current, real source and the current, real
documentation, not assumed from a prior audit's prose.

---

## 0. Problem

Three consecutive shipped milestones — M13 (cross-session lap/telemetry comparison), M14
(synchronized telemetry cursor), M15 (cross-session stint/tyre-strategy comparison) — have zero
corresponding record in `docs/prd.md`, `docs/success-metrics.md`, `README.md`, or `CHANGELOG.md`.
This is not scattered drift: M14's own design review explicitly named this gap and proposed
closing it "after implementation — not now" (§16); that pass never happened, and M15 shipped with
the same gap on top, three milestones deep. The M16 Stage A audit (approved) found this to be the
single most concrete, self-aware, evidence-backed finding in the repository, including load-bearing
docs that now state things that are simply false: `README.md`'s quickstart still says "no
hover-driven cursor sync yet" (false since M14); `docs/success-metrics.md`'s V2 criterion still
describes `echarts.connect()`/`axisPointer` linking as the cross-chart sync mechanism, which M14's
design review explicitly rejected in favor of Zustand cursor stores; `README.md`'s "Current
milestone" line says M12, three behind.

## 1. Motivation

Shipping a fourth undocumented milestone on top of this gap would make the roadmap actively
misleading for anyone using it to plan the next one — including a future Stage A audit, which is
supposed to read these documents as ground truth. The M16 Stage A audit's own explicit instruction
was: if the correct conclusion is that documentation reconciliation should happen before another
feature milestone, say so rather than forcing a feature. That conclusion was reached and approved.
This design records the scope of that reconciliation before it's carried out, per this project's own
process convention (design before code, `CLAUDE.md` §Process) — applied here to documentation
changes, since they're still a milestone-shaped unit of work with a scope that needs stating
up front, even though no code is touched.

## 2. Current product/roadmap split (verified against code, not docs, at HEAD `7dbf915`)

`docs/prd.md` only ever tabled **V1** (M0–M7, §3); M8 onward were never added to that table and the
document doesn't reference them. Checked directly against the shipped code (this session's own
implementation work for M14/M15, plus direct file reads for M13):

| Milestone | What actually shipped | Relationship to the original V1–V5 roadmap |
|---|---|---|
| M8 | Session-wide driver performance analytics | Not itself named in the original roadmap |
| M9 | Professional telemetry UI (frontend redesign) | Presentational; not V-scoped |
| M10 | Postgres + Parquet hybrid storage; stints/pit-stops (single-session, per-driver) | Begins V3's "tire strategy, stints, pit stops" deliverable |
| M11 | Descriptive tyre & stint performance analytics (single-session) | Continues V3's stint/pit-stop deliverable |
| M12 | Multi-season/event/session discovery; 704-session historical backfill (2020–2026) | Infrastructure; not itself V-scoped |
| M13 | Cross-session lap/telemetry comparison (`/laps/compare` generalized to two independent sessions) | Extends V1's two-lap comparison beyond what the original V1 scope specified (single-session only) |
| M14 | Synchronized telemetry cursor, Zustand-based | Delivers V2's synchronized-cursor criterion — via a different mechanism than the PRD/ADR-0008 originally specified |
| M15 | Cross-session stint/tyre-strategy comparison (`/stints/compare`) | Completes V3's stint/pit-stop deliverable's cross-session case — not originally specified in V3's text at all |

This table is the basis for §5 of this document (exact edits) — it records what shipped without
implying any of M8–M15 were part of the original, dated V1–V5 schedule as written. The original V1
table (`docs/prd.md` §3, M0–M7) is a historical record and is not edited by this milestone.

## 3. Files in scope (exactly five)

1. `docs/prd.md` — add a milestone-history section (§2's table above) distinct from the original V1
   table; update §5's deferred-features table with current shipped/unshipped status.
2. `docs/success-metrics.md` — correct V2's cursor-sync mechanism description to the real M14
   architecture; add V3's M10/M11/M15 shipped status; leave V1/V4/V5 untouched (no drift found there).
3. `README.md` — correct "Current milestone," the milestone table, and the stale quickstart
   cursor-sync line; add M13/M14/M15 paragraphs to "Current capabilities," matching the existing
   per-milestone-paragraph style.
4. `CHANGELOG.md` — backfill M13, M14, M15 entries in the existing per-milestone format; correct the
   `[Unreleased]` blurb.
5. `docs/m16-design-review.md` — this document.

## 4. Explicit non-goals

- No application source, test, schema, migration, dependency, or data file is touched.
- No fix to `docs/m9-design-review.md`, `docs/m13-design-review.md`, `docs/m14-design-review.md`,
  `docs/m15-design-review.md`, `docs/m12-implementation-plan.md`, `docs/backlog.md`,
  `docs/architecture.md`, `docs/data-model.md`, or `docs/api-model.md` — those are historical
  per-milestone records or separately-scoped living docs, not this milestone's target set.
- No new success metric is introduced. Every edit either (a) records a status against an
  **already-existing** criterion (shipped/not-shipped), or (b) records a milestone's real shipped
  scope where it went beyond what an existing criterion specified (M13/M15's cross-session
  generalization) — framed explicitly as "not originally specified above," never folded in as if it
  had been the original ask.
- No resolution of any M12 §18 open question (Postgres `season`/`event_name` denormalization,
  round-number stability, earliest reliably-supported season) — all three remain exactly as open as
  the M15 Stage A audit found them; this milestone generates no new evidence either way.
- No implementation recommendation, roadmap re-prioritization, or M17+ proposal is added to any
  living doc — this is a factual reconciliation of what already shipped, not a planning document.
- No ADR — nothing architectural is being decided here, only recorded (§9).

## 5. Verification methodology

Every factual claim added to the four living docs is checked against one of: the real commit history
(`git log`, `git show -s --format=...` for exact dates — M13/M14/M15 all landed `2026-08-16` per
their real commit metadata), the real shipped code (routes, models, components — re-read directly for
this milestone, not recalled from the M16 Stage A audit's prose), or the corresponding milestone's own
design-review doc (`docs/m13-design-review.md`, `docs/m14-design-review.md`,
`docs/m15-design-review.md`) for scope/rationale that isn't independently re-derivable from a diff.
Where a claim could not be directly verified against current source (e.g., a subjective "why"), it is
attributed to the milestone's own design doc rather than stated as this document's own assertion.

## 6. M12 §18 open-question disposition

Unchanged. This milestone touches no backend, pipeline, or Postgres code and generates no new query
pattern — none of the three questions (denormalized `season`/`event_name` columns, round-number
stability across a season, earliest reliably-supported FastF1 season) become concretely actionable by
a documentation-only pass. They remain recorded as open in `docs/prd.md`/`docs/m12-design-review.md`
exactly as before; this document does not restate or re-decide them, only confirms their status is
unaffected.

## 7. Acceptance criteria

- `docs/prd.md`, `docs/success-metrics.md`, `README.md`, `CHANGELOG.md` all accurately reflect M8–M15
  as shipped, without misrepresenting any of them as having been part of the original, dated V1–V5
  schedule.
- V2 in both `docs/prd.md` §5 and `docs/success-metrics.md` states: synchronized telemetry cursor
  shipped in M14 (via Zustand, not `echarts.connect()`); corner highlighting remains deferred.
- V3 in both documents states: stints/pit-stops/tyre performance shipped in M10/M11; cross-session
  stint/strategy comparison shipped in M15; weather and position/gap remain unimplemented.
- V4 and V5 are unchanged — still recorded as future/unimplemented, no drift found there.
- `README.md`'s "Current milestone" line and quickstart cursor-sync line are corrected; M13/M14/M15
  are added to the milestone table and "Current capabilities" narrative.
- `CHANGELOG.md` gains M13/M14/M15 entries in the established per-milestone format; `[Unreleased]`
  is corrected to reference M15, not M12.
- `git diff --check` is clean; no stale statement identified by the M16 Stage A audit remains
  uncorrected in the five in-scope files.
- No file outside the five listed in §3 is modified.

## 8. No ADR required

No new dependency, no new architectural layer, no reversal of a prior decision — this milestone
records documentation state, it doesn't make or change an engineering decision. Matches every prior
milestone's own "no ADR trigger met" finding when the same test was applied to genuinely
implementation-level or, here, documentation-level work.

## 9. No code/data/schema changes

Confirmed by construction: this milestone's own scope (§3) lists five Markdown files and nothing
else. No ingestion runs, no Postgres write occurs, no Parquet file is touched, no `backend/`,
`frontend/`, or `pipeline/` file is modified.

---

## Document history

- v1 (this document): initial design, produced against M15's real, shipped state (`7dbf915`), per
  the approved M16 Stage A audit's recommendation to reconcile documentation before another feature
  milestone.
