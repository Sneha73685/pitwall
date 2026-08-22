# PitWall — M41 Design Review: Product / Architecture Audit (Stage A)

## 1. Baseline / Safety — CONFIRMED CLEAN

- `HEAD` = `origin/main` = `a946c4780505c9245a0ba599ab0294edb08e6551` ✓
- Working tree clean, `git diff --cached` empty ✓
- `docs/m9-design-review.md`: zero diff ✓
- `docs/m41-design-review.md`: did not exist before this document ✓
- All investigation performed read-only — no source, data, Parquet, or PostgreSQL writes.

## 2. Post-M40 Regression Audit — CLEAN, ZERO REGRESSIONS

`filtering.py` verified in full: `ExclusionReason = Literal["yellow_flag", "track_limits"]`,
`_track_limits_reason()` gates on `lap.deleted` alone, `classify_lap()` resolves
`_track_limits_reason(lap) or _yellow_flag_reason(lap)` with `is_valid=lap.is_accurate` unchanged.
`filter_valid_laps()`/`filter_for_aggregate_stats()` byte-identical to pre-M40. The two independent
`ExclusionReason` definitions (`filtering.py`, `session_analytics.py`, per ADR-0009's boundary) stay
in sync, no drift. Full M34/M35/M36/M40 chain re-traced end-to-end, intact at every hop, file:line
confirmed. M38's backfill state intact (332 backup dirs, 332 completed in state log). Tests: backend
388 passed / 1 failed + 15 errors (all pre-existing, no-live-Postgres), frontend 569 passed across 86
files — both exactly match the expected post-M40 baseline, no unexpected deltas.

**Documentation**: M40 introduced no new drift (deliberately touched only `data-model.md`/
`api-model.md`, both accurate). The 3 stale "Race/Sprint/pre-2024 Sprint Qualifying" docstring
instances M39 found but declined to fix are still present (`normalize.py`, `models.py`,
`backend/app/models/telemetry.py`) — comment-only, zero behavioral impact, still out of scope for
any single milestone to fix opportunistically. Reconciliation cadence: M40 is only 1 milestone past
M39 — far short of the project's historical minimum gap (3+) — **no reconciliation milestone is
justified yet.**

**Architecture**: 22 backend routes (incl. `/health`), 16 frontend routes — both unchanged from
pre-M40, confirming M40 added no new endpoints. No new duplication, import cycles, or N+1/N²
evidence.

## 3. Qualifying Q1/Q2/Q3 — Deep Investigation

**FastF1 semantics** (verified against installed source, `core.py`): `Q1`/`Q2`/`Q3` declared
`timedelta64[ns]`. Real data across 4 sessions (2023/2024, both Qualifying and Sprint
Qualifying/Shootout): all 20 drivers get `Q1`, a shrinking subset gets `Q2`/`Q3` — **the exact
drop-out count varies by session** (one real sample: 14/20 got Q2, 9/20 got Q3, not a clean 15/10).
Race and Practice sessions confirmed `Q1/Q2/Q3 = NaT` for every driver — no fabrication risk.

**Session-type/era handling**: FastF1's race-like/quali-like session classification is genuinely
year-dependent (2023 "Sprint Shootout" vs. 2024+ "Sprint Qualifying" naming), but **column names are
literally `Q1`/`Q2`/`Q3` in every case** — no `SQ1`/`SQ2`/`SQ3` naming anywhere in the actual
DataFrame. No era-gating needed, unlike M35's earlier (incorrect) sprint-qualifying assumption.

**Data provenance caveat**: plain Qualifying sessions are Ergast-backed; Sprint Qualifying/Shootout's
`Q1/Q2/Q3` are FastF1's own recalculation from raw lap times (confirmed via a real log line:
`"Sprint Shootout is not supported by Ergast! Limited results are calculated from timing data."`).
One real anomaly observed (a 2024 session showing implausible Q3 times relative to Q1/Q2, likely a
genuine weather/red-flag event, not a systemic defect) — worth a sanity-bound note in a future
implementation, not a blocker.

**Implementation path**: zero new FastF1 call — `results` is already loaded by the existing
`load_session()`/`normalize_drivers()` path, the same DataFrame M34 reads. `_timedelta_to_seconds()`
already handles `Timedelta`/`NaT` generically — direct reuse. `Driver.q1_seconds`/`q2_seconds`/
`q3_seconds` (three additive nullable floats) is sufficient, mirroring M34's exact four-field
addition pattern. Natural UI home confirmed: `DriverSelectPage.tsx:109-124`'s existing M34
classification-rendering block is structurally identical to what three more conditional fields would
need — not `SessionAnalyticsPage` (lap-level) or `ComparisonPage` (cross-session), since Q1/Q2/Q3 is
a per-driver, session-level result value exactly like M34's fields.

**Historical data**: 142 Qualifying + 22 Sprint Qualifying = 164 sessions (fresh count, matches prior
audits). Zero sessions currently have any Q1/Q2/Q3-shaped column — genuinely new. The two M38
exception *events* (São Paulo 2023, British GP 2026) load cleanly at their Sprint Qualifying sessions
(20 and 22 drivers respectively, no Ergast error) — M38's exceptions were specific to those two
*Sprint* sessions' classification data and are unrelated to Sprint Qualifying's Q1/Q2/Q3.

**Backfill**: follow the established no-backfill-at-ship-time precedent (M34/M35/M36/M40 all shipped
this way). Nothing about Q1/Q2/Q3 changes that calculus.

**Verdict**: Q1/Q2/Q3 remains a strong, cheap, well-evidenced candidate — every prior audit's
finding holds up under fresh, deeper investigation. But it is purely additive value, not a
correction of something currently wrong.

## 4. Alternative-Candidate Audit — A New, Real Correctness Defect Found

Weather, race-control, all known tech debt (`_to_stint_pace` duplication, trend-hook duplication,
Docker/Python mismatch, CI permissions gap, `get_telemetry` cost), accessibility, and dependencies:
all reconfirmed exactly unchanged from M40's own audit — 0 npm vulnerabilities, no new evidence
anywhere. Historical backfill: no new urgency found for backfilling M40's `deleted`/`deleted_reason`
fields.

**Standout finding, verified directly (not just via fork report)**:
`backend/app/services/tyre_performance/stint_eligibility.py`'s `valid_positions()` filters
stint-pace-eligible laps using **only** `classify_lap(position.lap).is_valid` (the `is_accurate`-only
signal) — confirmed by reading the file in full. This population feeds `trend_eligible_positions()`/
`trend_eligible_by_stint()`, consumed by `compound_aggregation.py` and `stint_consistency.py`, wired
into `orchestration.py`'s actual API response — **the real, live data behind `TyrePerformancePage`'s
per-compound pace comparison and `StintPacePage`'s per-stint consistency figures.**

The module's own docstring (written at M11, before M36 or M40 existed) states this "mirrors M8's
`filter_valid_laps` vs. `filter_for_aggregate_stats` two-population pattern" — but **only ever
implements the looser half**. Compare `session_analytics/aggregation.py`, which explicitly computes
best/median/theoretical-best/consistency over the **stricter** `filter_for_aggregate_stats(laps)`
specifically because "a single distorted lap shouldn't silently corrupt an aggregate ranking
statistic" (that exact reasoning, verbatim, in that file's own docstring). Tyre-performance's
per-compound pace and per-stint consistency figures are the identical *category* of aggregate
statistic, computed by the same team's own stated principle, but were never updated when M36 (yellow
flag) or M40 (track limits) shipped.

**Concretely**: today, a yellow-flag-affected or track-limits-deleted lap inside a stint silently
corrupts `TyrePerformancePage`'s pace comparison and `StintPacePage`'s consistency numbers — while
the near-identical `SessionAnalyticsPage` is already protected. Given M40's own real-data finding
(6% of laps in a sample race deleted for track limits alone, before counting yellow-flag laps), this
is not a rare edge case on two already-shipped, already-trusted "descriptive analytics" pages.

**Fix shape** (candidate-level only): `valid_positions()` should additionally require
`classify_lap(position.lap).exclusion_reason is None`, i.e. use the same test
`filter_for_aggregate_stats` already encodes — a small, targeted, one-function change reusing
`filtering.py`'s existing logic, not a new filtering architecture.

## 5. Candidate Matrix

| Candidate | Category | Evidence strength | User value | Arch. reuse | Complexity | Risk | Milestone size | Data/schema impact | Duplicates/deepens existing feature? | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **Stint/tyre-performance aggregate exclusion consistency** | Correctness | **High — confirmed by direct code read, real data (6% deletion rate), same defect category as M40's own trigger** | **High — corrects already-shipped, already-trusted pages' numbers** | **Very high — reuses `filtering.py`'s existing `classify_lap`/exclusion logic unchanged** | Low | Low | S | None (no schema change — pure filtering-logic fix) | Deepens/corrects M11+M36+M40's own established pattern | **Primary** |
| Qualifying Q1/Q2/Q3 | Product capability | Strong, re-confirmed a third time, deeper than before | Real, direct, first payoff for 164 sessions | High — mirrors M34's exact pattern | Low | Low | S | Additive `Driver` fields only | New capability, no precedent conflict | Strong runner-up for M42 |
| Weather | Product capability | Unchanged, no consuming UI | Speculative | Medium | S–M | Low | M | New Parquet file | — | Defer |
| Race-control | Product capability | Unchanged, incremental over M36/M40 | Speculative | Medium | M | Low | M | New endpoint | — | Defer |
| Tech debt (any item) | Hardening | Unchanged, sub-threshold | Low | — | S | Low | S | None | — | Defer |
| Documentation reconciliation | Documentation | Only 1 milestone past M39 — below historical threshold | None (maintainer-facing) | — | Trivial | None | Trivial | None | — | Defer, premature |
| Do nothing / finalization | — | — | — | — | — | — | — | — | — | Rejected — a real correctness gap remains open |

## 6. Special Decision Questions

**A. Highest-value next milestone genuinely justified by evidence after M40?** Stint/tyre-performance
aggregate exclusion consistency — a real, confirmed, quantified correctness defect on two shipped
pages, using the exact evidence-first standard this project has now applied consistently across
M38→M40.

**B. Is Qualifying Q1/Q2/Q3 ready to become M41, or is another candidate stronger?** Another
candidate is stronger. Q1/Q2/Q3 remains real and well-evidenced, but it is additive value; the
tyre-performance gap is a correction of something currently wrong on pages already shipped and
trusted — evidence and correctness outrank additive novelty, per this project's own established
decision principle (the same one that made M40 beat Q1/Q2/Q3 last cycle).

**C. Hardening or finalization, or is meaningful product development still justified?** Still
hardening/completion — a second real correctness gap surfacing this soon after M40's own correctness
milestone suggests the exclusion-architecture rollout (M36→M40) is not yet fully propagated across
every consumer, not that the product is feature-complete. Product development (Q1/Q2/Q3, weather,
race-control) remains genuinely available for future milestones, just not the most urgent thing now.

**D. What remains between current state and a defensible portfolio-final state?** At minimum: this
tyre-performance consistency fix; Q1/Q2/Q3 as the next real product capability; a documentation
reconciliation once the gap crosses the historical threshold (not yet); the long-unescalated tech
debt items remain acceptable to leave as documented, deliberate backlog rather than blockers.

**E. Candidate-level scope for the primary recommendation** (not the deferred Q1/Q2/Q3 — see §7):

## 7. Recommendation

**M41 = Stint/Tyre-Performance Aggregate Exclusion Consistency.**

Extend `backend/app/services/tyre_performance/stint_eligibility.py`'s `valid_positions()` (or
introduce an aggregate-specific sibling, mirroring `session_analytics`'s own
`filter_valid_laps`/`filter_for_aggregate_stats` two-population naming) so that stint-pace/
consistency computations exclude yellow-flag and track-limits laps, matching the standard
`session_analytics/aggregation.py` already holds itself to.

**Candidate-level scope only** (Stage B not begun):
- **Likely files**: `backend/app/services/tyre_performance/stint_eligibility.py` (the core fix),
  `backend/tests/test_tyre_performance_stint_eligibility.py` or equivalent existing test file for
  this module (new test cases for yellow-flag/track-limits exclusion in the eligible population).
  Possibly `compound_aggregation.py`/`stint_consistency.py` if either needs a second, non-eligible
  population passed through for a different purpose (Stage B to determine) — likely not, since they
  already consume `valid_positions`/`trend_eligible_*` indirectly.
- **Likely tests**: unit tests proving a yellow-flag lap and a track-limits lap are both excluded
  from `valid_positions()`'s (or its renamed/split successor's) output, mirroring
  `test_session_analytics_filtering.py`'s own `filter_for_aggregate_stats` test pattern; a
  regression test confirming `is_valid`-only consumers (if any remain) are unaffected.
- **API/data implications**: none — no schema change, no new endpoint, pure filtering-logic
  correction reusing already-shipped `classify_lap()` unchanged.
- **Dependency implications**: none.
- **Explicit non-goals**: no historical backfill (not applicable — this is a computation-time fix,
  not a data field); no change to `is_valid`'s own semantics; no change to `session_analytics`'s
  already-correct behavior; no Q1/Q2/Q3 work; no weather/race-control work; no unrelated tech-debt
  cleanup.
- **Validation strategy**: unit tests against real-shaped fixtures with a yellow-flag lap and a
  track-limits lap inside a stint; confirm `TyrePerformancePage`/`StintPacePage`'s computed figures
  change (correctly decrease/tighten) for a session containing such laps, and are unchanged for a
  session without any.
- **Major risks**: low — same category and scale of change as M36/M40 themselves; the only judgment
  call is whether to modify `valid_positions()` in place (simplest) or introduce a parallel
  stricter-population function (more consistent with `session_analytics`'s own two-name convention) —
  a Stage B decision, not a Stage A one.

**Qualifying Q1/Q2/Q3 remains the clear, strong recommendation for M42** — no new evidence weakens
it, it is simply outranked this cycle by a live correctness defect.

## 8. Stage A Stop Condition — Confirmed

`docs/m41-design-review.md` is the only new file. No source file modified. No data file modified. No
database writes. No Parquet writes. No ingestion. No backfill. No dependency changes. Nothing staged,
committed, or pushed. `docs/m9-design-review.md` untouched.

---

# Stage B — Implementation Design

## 9. Exact Call Graph (Independently Traced, Not Assumed from Stage A)

```
Lap.track_status / Lap.deleted            (unchanged, M36/M40)
        |
classify_lap(lap) -> LapValidity           (unchanged, filtering.py)
   .is_valid = lap.is_accurate
   .exclusion_reason = "track_limits" | "yellow_flag" | None
        |
stint_eligibility.valid_positions(positions)      <- filters on .is_valid ONLY (unchanged by this milestone)
   |                                                  used directly for AnnotatedLap.is_valid (orchestration.py:97)
   |
stint_eligibility.trend_eligible_positions(positions, boundary)   <- THE FIX SITE
   = valid_positions(positions)
     .filter(in_known_stint)
     .filter(not boundary-lap)
     [+ NEW: .filter(exclusion_reason is None)]
        |
        +-- trend_eligible_by_stint()  -> stint_consistency.stint_consistency_by_stint()
        |                                  -> StintConsistency (consistency_ms/consistency_cv)
        |                                  -> DriverStintPace.consistency_by_stint
        |                                  -> StintPacePage's per-stint consistency figures
        |
        +-- orchestration.build_driver_stint_pace(): eligible_lap_numbers
        |                                  -> AnnotatedLap.is_trend_eligible
        |                                  -> StintPaceLap.is_trend_eligible (API, already exists)
        |                                  -> StintPacePage's lap table / chart (already consumes this field)
        |
        +-- orchestration.build_session_tyre_performance(): eligible_positions_by_driver
                                           -> compound_aggregation.aggregate_by_compound()
                                           -> compound_aggregation.aggregate_by_compound_and_lap_index()
                                           -> driver_compound_comparison.raw_lap_times_by_compound()
                                           -> TyrePerformancePage's pace boxplot, tyre-age scatter,
                                              and raw driver/compound comparison chart
```

Confirmed by direct reading of `compound_aggregation.py` and `stint_consistency.py`'s own docstrings:
neither applies any validity/eligibility filtering itself — both explicitly state the caller must
already pass trend-eligible positions, "to keep that rule defined in exactly one place." **No
duplicate filtering site exists anywhere downstream.**

## 10. Root-Cause Verification — One Critical Refinement to Stage A

Stage A's finding ("`valid_positions()` only checks `is_accurate`") is **confirmed accurate as a
fact**, but its implied fix location was imprecise. Direct tracing found `valid_positions()` is
**dual-purpose**:

1. It is the base `trend_eligible_positions()` builds on (correctly the fix's target).
2. It is used **directly and separately** in `orchestration.py:88`/`97` to set
   `AnnotatedLap.is_valid` — the per-lap "is this lap's telemetry accurate" flag surfaced on
   `StintPaceLap.is_valid` in the API response, the tyre-performance-layer equivalent of
   `DriverLapTable`'s own `is_valid`.

**If `valid_positions()` itself were widened to also check `exclusion_reason`, it would silently
redefine `AnnotatedLap.is_valid`'s meaning** — conflating telemetry accuracy with analytical
exclusion, exactly the anti-pattern `session_analytics/filtering.py` was carefully designed to avoid
(`is_valid` and `exclusion_reason` kept independent since M36, reaffirmed by M40). **This is the
deviation from Stage A**: the fix belongs in `trend_eligible_positions()` alone, not
`valid_positions()`. `valid_positions()` must remain untouched.

**Both `TyrePerformancePage` and `StintPacePage` are affected** (confirmed via the call graph above
— both ultimately depend on `trend_eligible_positions()`/`trend_eligible_by_stint()`). **No other
consumer of `valid_positions()` exists** beyond the two identified above (grep-confirmed, §9). **No
consumer intentionally needs the old (unfiltered-for-exclusion) semantics** — every consumer of
`trend_eligible_positions()`'s output is exactly the class of aggregate statistic
`session_analytics/aggregation.py`'s own docstring says must exclude non-representative laps.

## 11. Exclusion Semantics — Confirmed Safe to Reuse Directly

`LapStintPosition.lap` is documented and confirmed to be "the original, unmodified `Lap` object" —
the same `app.models.telemetry.Lap` used everywhere else, carrying `track_status`/`deleted`/
`deleted_reason`/`is_accurate` unmodified. `classify_lap(position.lap)` is therefore directly
callable inside `stint_eligibility.py` (already imported, already used by `valid_positions()`) with
zero new data-shape concerns. `yellow_flag` and `track_limits` should be treated identically here —
both already collapse to "`exclusion_reason is not None`" in `session_analytics`'s own
`filter_for_aggregate_stats`, and there is no evidence any tyre-performance consumer needs to
distinguish between the two exclusion causes (neither `compound_aggregation.py` nor
`stint_consistency.py` nor `driver_compound_comparison.py` reads `exclusion_reason` itself — they
only ever receive an already-filtered position list). `is_valid`/`is_accurate` independence is fully
preserved (§10) — this milestone does not touch `classify_lap()` or `filtering.py` at all.

## 12. Aggregation Correctness

Every statistic identified in §9 is affected: tyre compound pace comparisons
(`CompoundAggregate`/`CompoundLapIndexAggregate`), stint consistency figures (`StintConsistency`),
and the raw driver/compound comparison chart (`RawLapTimeByCompound`). **No "personal-best/
representative lap selection" concept exists in this module** (grep-confirmed — `tyre_performance`
has no PB/fastest-lap selection logic; that concept lives only in `session_analytics`, unaffected by
this milestone). The fix propagates automatically through the existing call graph with zero
additional plumbing, confirmed by §9's trace — `compound_aggregation.py`/`stint_consistency.py`/
`driver_compound_comparison.py` all explicitly delegate eligibility filtering to their caller.

## 13. API/Frontend Impact — Confirmed Zero Change Required

`StintPaceLap.is_trend_eligible: bool` **already exists** on the API response model
(`backend/app/models/tyre_performance.py:50`) — its value simply becomes more correct once the
backend computation is fixed; no schema change. The frontend already fully consumes this field:
`driverStintPaceChartOptions.ts` (chart trace exclusion), `StintPaceLapTable.tsx`, and
`DriverStintPaceChart.tsx` all read `is_trend_eligible` today (confirmed via grep across
`frontend/src/features/tyre-performance/`). Existing frontend tests pass `is_trend_eligible` as an
explicit fixture boolean (testing "given this value, does the UI behave correctly") — independent of
how the backend computes it, so **no frontend test needs modification**. **Zero API or frontend
changes required anywhere.**

## 14. Test Design

Extend the existing `backend/tests/test_tyre_performance_stint_eligibility.py` — do **not** create a
new test file; this module already has focused, well-structured tests for exactly this function
following the established `lap()`/`stint()`/`pit_stop()`/`join_laps_to_stints`/
`identify_boundary_laps` fixture pattern.

| # | Case | Expected |
|---|---|---|
| 1 | `is_accurate=True`, `track_status=None`, `deleted=None` | Trend-eligible (unchanged baseline) |
| 2 | `is_accurate=False`, `track_status=None`, `deleted=None` | Not eligible (unchanged — existing `valid_positions()` behavior) |
| 3 | `is_accurate=True`, `track_status="4"` (yellow/SC) | **Not eligible (new)** |
| 4 | `is_accurate=True`, `deleted=True` | **Not eligible (new)** |
| 5 | `is_accurate=False`, `deleted=True` | Not eligible (both reasons independently exclude — no precedence ambiguity to test, unlike `filtering.py`'s own display-precedence concern, which is irrelevant here since this filter only cares about "excluded or not," never which reason) |
| 6 | `is_accurate=True`, `track_status="1"` (clear), `deleted=False` | Trend-eligible (regression: a real, unexcluded lap must not become newly ineligible) |
| 7 | Existing in-lap/out-lap/stint-membership tests (`test_trend_eligible_excludes_laps_outside_any_known_stint`, `test_trend_eligible_excludes_in_laps_and_out_laps`, `test_trend_eligible_by_stint_groups_the_remaining_laps_by_stint_number`, `test_hul_style_one_lap_stint_has_zero_trend_eligible_laps`) | Must still pass unmodified — proves the new check composes correctly with the existing ones, not just in isolation |
| 8 | `test_valid_positions_reuses_is_accurate_and_excludes_inaccurate_laps` (existing) | Must still pass **unmodified** — direct proof `valid_positions()` itself was not touched |

8 cases total: 4 new (`3`, `4`, `5`, `6`), 4 existing re-run as regression proof (no modification
needed to `7`'s four tests or `8`, since the underlying function signature and behavior for what they
already assert is unchanged). No new test file; no `StintPace`/`TyrePerformance` route-level test
needed, since §13 confirms the API contract itself is unchanged and its existing tests already cover
response shape — the *values* changing is exactly what `test_tyre_performance_route.py`'s existing
fixtures would already exercise if they include an excluded lap (Stage C to verify whether an
existing route test happens to cover this, or whether one small addition there is warranted for
end-to-end proof, mirroring M40's own `test_get_driver_lap_metrics_flags_track_limits_excluded_laps`
full-stack pattern — a Stage C judgment call, not required by this design).

## 15. Real-Data Sanity (Read-Only, Confirmed)

Spot-checked `data/processed/2023/austrian_grand_prix/race/laps.parquet` (a real M38-backfilled
session): `track_status` present, `deleted` absent (expected — M40 shipped after M38, no backfill
performed). This confirms the fix's real-world effect precisely:

- **All 332 M38-backfilled sessions** gain corrected yellow-flag exclusion in tyre-performance
  aggregates **immediately upon this milestone shipping** — no backfill needed, since `track_status`
  data already exists for them.
- **Track-limits exclusion** only benefits sessions ingested after M40 (i.e., none of the current 704
  yet) until a future dedicated backfill — consistent with M40's own explicit no-backfill decision,
  not a new gap this milestone introduces.
- The two M38 exception sessions remain untouched and irrelevant here — they concern
  classification-field population, not lap-level `track_status`/`deleted`, and are not read by
  `tyre_performance` at all.

## 16. Performance

The added check is one more `classify_lap(position.lap)` call per position already in
`trend_eligible_positions()`'s filter comprehension — `classify_lap()` is already called at least
once per lap by `valid_positions()` (which `trend_eligible_positions()` already calls as its base),
so this adds at most one more call per lap, matching the exact double-call pattern
`session_analytics/filtering.py`'s own `filter_valid_laps`/`filter_for_aggregate_stats` already
accept as normal (confirmed: they independently call `classify_lap` too, uncached). `classify_lap()`
itself is a handful of string/membership checks over already-in-memory `Lap` objects — no I/O, no
new data fetch. Negligible overhead; no memoization or restructuring warranted.

## 17. Backward Compatibility

For any lap where `track_status is None` and `deleted is None` (every one of the 704 existing
sessions' `deleted` column, and any session ingested before M36 for `track_status`), the new check
(`classify_lap(position.lap).exclusion_reason is None`) evaluates `True` — `_yellow_flag_reason`
returns `None` on `track_status is None`, `_track_limits_reason` returns `None` on falsy `deleted` —
so `exclusion_reason` is `None` and the lap is **not newly excluded**. Old data behaves exactly as
before; no backfill is part of M41, matching §15's finding precisely.

## 18. Documentation Impact

`docs/data-model.md`/`docs/api-model.md`: **no change required** — neither documents
`tyre_performance`'s internal eligibility rule (only the `Lap`/`Driver` schema, which is unchanged by
this milestone). One optional, small docstring clarification: `backend/app/models/tyre_performance.py`'s
`StintPaceLap` docstring and `stint_eligibility.py`'s own module docstring could note that
`is_trend_eligible`/trend-eligibility now also accounts for yellow-flag/track-limits exclusion, not
just `is_accurate`+stint-membership+boundary — a Stage C nicety, not a correctness requirement (no
existing docstring makes a claim this milestone would render false). README/CHANGELOG/PRD/
success-metrics remain untouched, per the task's explicit instruction — not a reconciliation
milestone.

## 19. Scope Control — Non-Goals Confirmed

Qualifying Q1/Q2/Q3 (deferred to M42), weather, race-control messages, historical backfill,
dependency upgrades, unrelated technical debt (`_to_stint_pace`/trend-hook duplication, CI
permissions, Docker/Python mismatch — all untouched), `DriverLapTable`/UI changes (§13 confirms none
needed), any change to `is_valid` semantics (§10/§11 confirm none), any change to M38 backfill
tooling (`backfill_m38.py` not read or touched during this investigation).

## 20. Candidate Stage C File List

**Definitely modified:**
- `backend/app/services/tyre_performance/stint_eligibility.py` (the fix: widen
  `trend_eligible_positions()`'s filter comprehension by one condition)
- `backend/tests/test_tyre_performance_stint_eligibility.py` (4 new test cases, §14)

**Conditionally modified (Stage C judgment call, not required by this design):**
- `backend/app/models/tyre_performance.py` (optional docstring clarification, §18)
- `backend/tests/test_tyre_performance_route.py` (optional full-stack proof test, mirroring M40's
  own route-level pattern, §14)

**Definitely untouched:**
- `backend/app/services/session_analytics/filtering.py` (`classify_lap` reused unchanged)
- `backend/app/services/tyre_performance/compound_aggregation.py`,
  `stint_consistency.py`, `driver_compound_comparison.py`, `orchestration.py`, `boundary_laps.py`,
  `stint_join.py`, `strategy_summary.py` (all confirmed to delegate eligibility filtering to their
  caller — zero duplicate filtering site to fix)
- `backend/app/api/tyre_performance.py`, `backend/app/models/telemetry.py`,
  `backend/app/models/session_analytics.py`
- `frontend/` — every file (§13)
- `docs/data-model.md`, `docs/api-model.md`, `README.md`, `CHANGELOG.md`, `docs/prd.md`,
  `docs/success-metrics.md`, `docs/backlog.md`, `docs/architecture.md`, `docs/m9-design-review.md`
- `pipeline/` — every file, `backfill_m38.py`, all dependency files, `data/`, PostgreSQL

**Newly created:** none — no new file is needed for this fix.

## 21. Design Risks — Addressed

- **Is `exclusion_reason` present at the point `valid_positions()`/`trend_eligible_positions()`
  receives its input?** Yes — confirmed §11, `LapStintPosition.lap` is the full, unmodified `Lap`.
- **Does tyre-performance code use a different `Lap` representation?** No — confirmed same
  `app.models.telemetry.Lap` throughout.
- **Does any aggregate intentionally include excluded laps?** No consumer found that does or should
  (§12) — every consumer is exactly the "aggregate ranking statistic" category `aggregation.py`'s own
  reasoning says needs the stricter filter.
- **Denominator/threshold changes needing explicit tests?** `lap_count`/`driver_count` fields on
  `CompoundAggregate` etc. will legitimately decrease for a session with excluded laps — this is the
  intended correctness improvement, not a bug; test case 3/4 in §14 implicitly proves the count
  changes by construction (fewer positions returned).
- **Can the same lap be both `is_accurate=False` and have an `exclusion_reason`?** Yes, and it's
  already handled correctly and inertly — such a lap is excluded by `valid_positions()` regardless
  (test case 5, §14), so the new check never even executes on it in `trend_eligible_positions()`'s
  short-circuiting filter chain.
- **Does any downstream code assume `valid_positions()` only reflects telemetry accuracy?** Yes —
  `orchestration.py`'s `AnnotatedLap.is_valid` (§10) — which is exactly why `valid_positions()` itself
  is left untouched.

## 22. Decision Questions

**A. Exact behavioral change?** One added condition in `trend_eligible_positions()`'s existing filter
comprehension: `and classify_lap(position.lap).exclusion_reason is None`.

**B. Which shipped user-facing metrics become more correct?** `TyrePerformancePage`'s per-compound
pace median/quartiles/boxplot, per-lap-index shape data, and raw driver/compound comparison chart;
`StintPacePage`'s per-stint consistency (`consistency_ms`/`consistency_cv`) and the chart/table's
`is_trend_eligible` flagging.

**C. Does the fix affect both `TyrePerformancePage` and `StintPacePage`?** Yes, confirmed via the
call graph (§9) — both trace back to `trend_eligible_positions()`.

**D. Is any API/frontend change actually required?** No — confirmed §13.

**E. Minimum test coverage needed?** 4 new unit tests in the existing test file (§14); existing tests
re-run as regression proof.

**F. Does M40's `track_limits` classification integrate automatically, or is additional plumbing
required?** Automatically — `classify_lap()` already implements the track_limits/yellow_flag
precedence logic unchanged; this milestone only adds one more call site to an existing, unmodified
function.

**G. Is any historical backfill required?** No, confirmed §15/§17 — old data behaves correctly by
construction (absent fields → no exclusion), and yellow-flag correction is immediately live for all
332 M38-backfilled sessions with zero backfill action.

**H. Is M41 still appropriately milestone-sized after tracing the real call graph?** Yes — if
anything, smaller than Stage A estimated: one function, one filter condition, one existing test file
extended, zero new files, zero API/frontend changes.

## 23. Validation Plan

- `cd backend && .venv/bin/pytest tests/test_tyre_performance_stint_eligibility.py -q` (targeted).
- Full backend suite regression run (`cd backend && .venv/bin/pytest -q`) — expect exactly the
  existing pre-M41 pass count +4 (or +5 if the optional route test in §20 is added), same pre-existing
  Postgres-only failures, zero new failures elsewhere.
- `ruff format --check`, `ruff check`, `mypy` on the touched file(s).
- No frontend validation needed beyond confirming the existing suite still passes unmodified (no
  frontend file touched).
- `git diff --check`.
- No live ingestion, no real Parquet writes, no PostgreSQL writes, no backfill.

## 24. Deviation from Stage A

The fix site is `trend_eligible_positions()`, not `valid_positions()` (§10) — Stage A's finding that
"`valid_positions()` only checks `is_accurate`" was factually correct but under-specified the
function's dual role (feeding both the stricter aggregate population *and* the per-lap `is_valid`
flag directly). This is a refinement discovered by tracing the real call graph, not a reversal of
Stage A's recommendation — the milestone, its evidence, and its user-facing value are unchanged; only
the precise line of code changes.

## 25. Stage B Stop Condition — Confirmed

No source implementation performed. No data, database, or Parquet writes. No ingestion. No backfill.
Nothing staged, committed, or pushed. `docs/m9-design-review.md` untouched.
`docs/m41-design-review.md` is the only M41 artifact.

---

# Stage C — Implementation

Implemented exactly as designed in §9–§22, with zero deviation from Stage B.

## 26. Exact Implementation

`backend/app/services/tyre_performance/stint_eligibility.py`: `valid_positions()` is byte-identical
to before (confirmed: the function's body never appears inside any diff hunk). `trend_eligible_positions()`'s
filter comprehension gained exactly one condition:

```python
return [
    position
    for position in valid_positions(positions)
    if position.in_known_stint
    and not boundary.is_boundary_lap(position.lap.lap_number)
    and classify_lap(position.lap).exclusion_reason is None
]
```

Module docstring and `trend_eligible_positions()`'s own docstring updated to document the new
condition and its precedent (`session_analytics.filtering.filter_for_aggregate_stats`). No other
function touched. No new import beyond `classify_lap`, already imported and already used by
`valid_positions()`.

## 27. Test Results

5 new test cases added to the existing `backend/tests/test_tyre_performance_stint_eligibility.py`
(no new file): `test_valid_positions_is_independent_of_exclusion_reason` (requirement 7's explicit
proof), `test_trend_eligible_positions_includes_a_clear_lap_with_no_exclusion_reason`,
`test_trend_eligible_positions_excludes_yellow_flag_lap`,
`test_trend_eligible_positions_excludes_track_limits_lap`,
`test_trend_eligible_positions_excludes_inaccurate_lap_with_exclusion_reason`. All 7 pre-existing
tests in the file re-run unmodified and still pass.

- **Targeted file**: 12/12 passed (7 pre-existing + 5 new).
- **Full tyre-performance module** (`pytest -k tyre_performance`): 76/76 passed.
- **Full backend suite**: 393 passed (exactly +5 over the pre-M41 baseline of 388, matching the 5 new
  tests), 1 failed + 15 errors — all pre-existing `psycopg`/no-live-Postgres connection issues,
  identical category to every prior milestone's baseline, zero new failures.

## 28. Static-Check Results

`ruff format --check`, `ruff check` (both the touched file and the full backend `.` scope), `mypy`
(both the touched file and the full `app/` scope) — all clean, zero issues. `git diff --check` clean.
Frontend `tsc`/`eslint`/`prettier` not run — no frontend file was touched, confirmed by `git status`.

## 29. Backward-Compatibility Proof

Verified directly against real code (not the test suite alone, per the task's request for explicit
proof): two laps with `track_status=None`/`deleted=None` (the exact state of all 704 existing
sessions' `deleted` column, and any pre-M36 session's `track_status`) — both `valid_positions()` and
`trend_eligible_positions()` return `[1, 2]`, i.e. **no lap is newly excluded**. Old data behaves
exactly as before this milestone.

## 30. Full Call-Path Verification

Verified directly against the real `aggregate_by_compound()` function (not a mock) — the actual
computation behind `TyrePerformancePage`: three laps in one stint, one clear (90s), one
yellow-flag-affected (150s), one track-limits-deleted (80s). Before this milestone's logic, all three
would have entered the median; after, `aggregate_by_compound()` returns `lap_count=1`,
`median_lap_time_ms=90000.0` — exactly the clear lap, both distorting laps correctly excluded through
the real, unmocked call path.

## 31. Confirmations

- **`valid_positions()` intentionally untouched**: confirmed by direct diff inspection (§26) and by
  `test_valid_positions_is_independent_of_exclusion_reason` passing.
- **`trend_eligible_positions()` is the sole behavioral change**: confirmed — no other function in
  the file, or any other file, has an executable diff.
- **No API/frontend changes were necessary**: confirmed — `git status` shows zero files touched
  outside the two approved backend files plus this design doc.
- **No historical backfill, ingestion, database, or real-Parquet write occurred**: confirmed —
  `backfill_m38.py` and `data/` both show zero diff throughout Stage C; every verification in §29/§30
  used in-memory fixture objects only.

## 32. Deviation from Stage B

**None.** The implementation matches the approved design exactly — same fix site, same condition,
same file scope, same test count as planned (5, matching §14's estimate exactly rather than needing
adjustment). The two "conditionally modified" candidates from §20 (an optional docstring
clarification, an optional full-stack route test) were resolved as: the docstring clarification was
folded into the *required* module/function docstring updates already needed to accurately describe
the new behavior (§26) rather than being a separate optional change; the optional route-level test
was judged unnecessary — `aggregate_by_compound()`'s real, unmocked call-path verification in §30
already proves the fix reaches the actual computation `TyrePerformancePage`/`StintPacePage` consume,
without needing a full HTTP round-trip test to demonstrate what the unit-level call graph already
guarantees (no duplicate filtering site exists between `stint_eligibility.py` and the API layer,
confirmed in Stage B §9/§12).

## 33. Stage C Stop Condition — Confirmed

No historical backfill, ingestion, database write, or real Parquet write occurred. `backfill_m38.py`
and `data/` confirmed untouched. `docs/m9-design-review.md` untouched. Exactly two source/test files
modified (`stint_eligibility.py`, `test_tyre_performance_stint_eligibility.py`) plus this design
document. Nothing staged, committed, or pushed.
