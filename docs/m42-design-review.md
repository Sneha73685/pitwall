# PitWall — M42 Design Review: Product / Architecture Audit (Stage A)

## 1. Baseline / Safety — CONFIRMED CLEAN

- `HEAD` = `origin/main` = `692b36ae49cab23664e2350181b0813bd1c0895a` ✓
- Working tree clean, `git diff --cached` empty ✓
- `docs/m9-design-review.md`: zero diff ✓
- `docs/m42-design-review.md`: did not exist before this document ✓
- All investigation performed read-only — no source, data, Parquet, or PostgreSQL writes.

## 2. Post-M41 Regression Audit — CLEAN, ZERO REGRESSIONS

`stint_eligibility.py` confirmed exactly as shipped: `valid_positions()` unchanged (pure
`is_accurate`), `trend_eligible_positions()` has the added `exclusion_reason is None` condition.
**Both `TyrePerformancePage` and `StintPacePage` confirmed as real, wired consumers** via direct
source inspection (not just tests) — `StintPaceLapTable.tsx`/`driverStintPaceChartOptions.ts` and
`CompoundDistributionChart.tsx`/`compoundDistributionChartOptions.ts` both consume the corrected
values in production code, tracing back through `orchestration.py` to `trend_eligible_positions()`.
`AnnotatedLap.is_valid` (built from the untouched `valid_positions()`) confirmed independent of
`exclusion_reason`, exactly as designed. Full M34–M40 chain re-traced fresh, intact at every hop. M38
backfill state intact (332/332). Tests: backend 393 passed / 1 failed + 15 errors (all pre-existing
Postgres-connection, unrelated), frontend 569 passed across 86 files — both exactly match the
expected post-M41 baseline.

**Documentation**: no drift introduced by M40/M41 (both deliberately left README/CHANGELOG/PRD
untouched, correctly — no false statement resulted). Reconciliation gap now 3 milestones past M39
(M40, M41, M42) — below the project's historical trigger range, **no reconciliation milestone
justified yet**.

## 3. Qualifying Q1/Q2/Q3 — Third Independent Verification, Decisive

**FastF1 semantics reconfirmed** on fresh samples (2022 Spanish GP, 2025 Japanese GP Qualifying, not
used by any prior audit): `Q1/Q2/Q3` declared `timedelta64[ns]`; sparse per-elimination pattern holds
(`Q1=20/20, Q2=15/20, Q3=10/20` in both fresh samples). Race/Practice sessions confirmed all-`NaT` —
zero fabrication risk.

**The Sprint Qualifying anomaly — fully resolved, not a defect.** Reproduced the exact case two prior
audits flagged (2024 Chinese GP Sprint Qualifying, Q3 times ~20-25s slower than Q1/Q2). Root cause
confirmed directly from real `race_control_messages` ("WET TRACK," "CHANGE IN CLIMATIC CONDITIONS,"
"TRACK SURFACE SLIPPERY") and real `weather_data` (`Rainfall` flipping `True`, track temp dropping
28.9°C→22.5°C across the session): **genuine rain arrived mid-session** — a real, legitimate wet
qualifying segment, not a FastF1 parsing artifact. Also confirmed FastF1's deletion/reinstatement
logic worked correctly in this exact session. **No sanity-bounding or special-case logic is
warranted** — PitWall already displays real lap times as-is with no bounding logic for dry/wet
variance elsewhere, and this is no different.

**Root cause of the Sprint-Qualifying/Ergast distinction, confirmed at the FastF1 source level**:
Ergast **permanently, structurally** never supports quali-like Sprint sessions (`core.py:2527-2536`,
`return None` with FastF1's own `TODO` comment — not a "recent session" temporary gap as earlier
phrasing suggested). All 22 Sprint Qualifying/Shootout sessions always use FastF1's own
`_calculate_quali_like_session_results()` fallback, which **already excludes officially-deleted
(track-limits) laps** via `~session['Deleted']` before taking the per-segment minimum — Q1/Q2/Q3
values are track-limits-clean by construction, regardless of source.

Zero new FastF1 call needed (confirmed). `_timedelta_to_seconds()` already handles `Timedelta`/`NaT`
generically — directly reusable.

## 4. Data-Model Design

`Driver` model (pipeline + backend mirror) both end their M34 classification block identically — a
proven insertion point for three additive `float | None = None` fields: `q1_seconds`, `q2_seconds`,
`q3_seconds`. `normalize_drivers()` and `_driver_from_row()` both use the exact `.get()`-based
tolerant pattern already established four times (M34/M35/M36/M40) — directly extensible with zero new
deserialization logic. No new Parquet file — same `drivers.parquet`. `docs/data-model.md`/
`docs/api-model.md`'s `Driver` bullets would need the same additive-field wording pattern already
used repeatedly.

## 5. Product/UI — `DriverSelectPage` Confirmed as the Only Sensible Home

The exact current M34 rendering block (`DriverSelectPage.tsx:107-124`) is a wrapping condition with
each field independently, conditionally rendered inside — a direct, proven template for three more
independently-gated spans. **Per-segment null handling**: a missing Q2/Q3 hides just that segment,
never the whole row — consistent with how `status`/`points`/`grid_position` already behave
independently on this same page today. `ComparisonPage`/`SessionAnalyticsPage` confirmed **not**
better homes — Q1/Q2/Q3 is a per-driver, session-level result value, the same category as M34's
fields, not a lap-level or cross-session comparison concept. No new page or route needed.

## 6. Historical-Data Audit

142 Qualifying + 22 Sprint Qualifying = **164 sessions**, reconfirmed via fresh sweep. Zero sessions
currently have any Q1/Q2/Q3-shaped column. Both M38-exception events' Sprint Qualifying sessions load
cleanly, unrelated to M38's Sprint-session-specific exceptions. **Backfill assessment**: no new
evidence changes the established calculus — Option A (no backfill at ship time) remains correct,
matching M34/M35/M36/M40's unbroken precedent. A future dedicated backfill is a plausible, separate,
later milestone — never bundled into the shipping milestone.

## 7. API/Architecture Audit

Route count unchanged — Driver serialization automatically carries additive fields through the
existing repository/API path (same mechanism M34 already proved). No new mapper/service needed, no
duplicate `Driver` model exists to reconcile. No import cycles, N+1/N², or architecture violations
found in this area.

## 8. Alternative-Candidate Audit — Nothing Outranks Q1/Q2/Q3 This Cycle

Actively hunted for a defect comparable to M40/M41's findings. **Checked and ruled clean**:
`session_analytics/aggregation.py` (re-read in full — correctly uses `filter_for_aggregate_stats`
everywhere), `tyre_performance/boundary_laps.py`/`strategy_summary.py` (no independent validity
check), `driver_trends.py`/`driver_trends_compare.py` (reuse `summarize_driver` unchanged, already
correct).

**One real but weaker-tier finding**: `backend/app/services/lap_comparison/validation.py`'s
`collect_warnings()` checks only `is_accurate`, never `exclusion_reason` — its own M6-era docstring's
claim that no yellow-flag/track-status data exists is now stale (true since M36/M40), and
`WarningCode` has no yellow-flag/track-limits code. **This does not clear M40/M41's bar**: those were
silent corruption of a trusted aggregate statistic with zero user awareness; this is an explicit,
opt-in, single-pair comparison (`/laps/compare`) where the user sees a real, accurate delta, just
without a contextual heads-up — a legitimate future enhancement (mirroring the existing
`DIFFERENT_CIRCUIT` warn-don't-block pattern), not a correctness defect. Noted in the candidate
matrix, not elevated.

Weather/race-control: zero consumption, unchanged, fourth consecutive audit reaching this conclusion.
Tech debt: all items unchanged, no new threshold crossed. `npm audit`: 0 vulnerabilities. Tests:
393/569 passed (backend/frontend), matching M41's final state exactly.

## 9. Candidate Matrix

| Candidate | Evidence strength | User value | Arch. reuse | Complexity | Risk | Milestone size | Historical-data implications | UI impact | Duplicates existing work? | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| **Qualifying Q1/Q2/Q3** | **Very high — independently verified 3 times, last open caveat now fully resolved with concrete evidence** | **High — first real payoff for 164 sessions M38 already backfilled other fields for** | **Very high — 5th application of the exact M34 pattern** | Low | Low | S | No backfill in M42; future backfill is a separate, later candidate | `DriverSelectPage` extension only, no new page/route | No | **Primary** |
| `lap_comparison` yellow-flag/track-limits warning | Real, concrete | Low-moderate (context on an already-accurate comparison, not a correctness fix) | High (mirrors `DIFFERENT_CIRCUIT`) | Low | Low | S | None | Small addition to existing warning UI | No | Noted, does not outrank Q1/Q2/Q3 |
| Weather | Unchanged, no consuming UI | Speculative | Medium | S–M | Low | M | New Parquet file | New/extended surface | — | Defer |
| Race-control | Unchanged, incremental over M36/M40 | Speculative | Medium | M | Low | M | New endpoint | New surface | — | Defer |
| Tech debt (any item) | Unchanged, sub-threshold | Low | — | S | Low | S | None | None | — | Defer |
| Documentation reconciliation | 3 milestones past M39 — below threshold | None (maintainer-facing) | — | Trivial | None | Trivial | None | None | — | Defer, premature |

## 10. Special Decision Questions

**A. Highest-value next milestone genuinely justified after M41?** Qualifying Q1/Q2/Q3 — the only
candidate with strong, now-maximally-de-risked evidence and real product value; nothing found this
cycle clears the correctness-defect bar M40/M41 each set.

**B. Is Q1/Q2/Q3 actually ready to become M42?** Yes — every open question from the prior two audit
cycles has now been independently re-verified and, for the one remaining caveat, definitively
resolved.

**C. Is the Sprint Qualifying anomaly a blocker, a validation concern, or irrelevant?** **Irrelevant.**
Confirmed via real race-control messages and weather data to be a genuine wet-weather qualifying
segment, not a data-quality defect. No special-case or sanity-bound logic is warranted.

**D. Does Q1/Q2/Q3 need its own historical backfill milestone?** Not as part of M42. A future,
separate backfill (mirroring M38's mechanism) is plausible but is explicitly not required to ship
real, correct value for every newly-ingested session going forward — matching M34/M35/M36/M40's own
precedent exactly.

**E. Hardening/finalization mode or still active product development?** Both, concurrently, matching
the project's actual recent shape — M40/M41 were hardening (real correctness fixes), M42 would be the
first genuine new product capability since M38's data-completion work. The project is not yet at a
point where no capability work remains justified.

**F. What concrete capabilities remain before a defensible portfolio-final state?** At minimum: Q1/Q2/Q3
(this milestone); a documentation reconciliation once the gap crosses the historical threshold (not
yet); the long-unescalated tech debt items remain acceptable as documented, deliberate backlog; a
possible future Q1/Q2/Q3 historical backfill; weather/race-control remain optional, not required for
a defensible final state given no consuming-UI evidence has ever emerged for either across five audit
cycles.

## 11. Recommendation

**M42 = Qualifying Q1/Q2/Q3 Results.**

**Candidate-level scope only** (Stage B not begun):

- **Likely files**: `pipeline/pitwall_pipeline/models.py` (`Driver.q1_seconds`/`q2_seconds`/`q3_seconds`),
  `pipeline/pitwall_pipeline/normalize.py` (`normalize_drivers()` reads `Q1`/`Q2`/`Q3` via
  `_timedelta_to_seconds`), `pipeline/tests/fixtures.py`/`test_normalize.py`,
  `backend/app/models/telemetry.py` (`Driver` response model), `backend/app/repositories/parquet_repository.py`
  (`_driver_from_row`), `backend/tests/test_parquet_repository.py`, `frontend/src/api/client.ts`
  (`Driver` type), `frontend/src/features/session-select/DriverSelectPage.tsx` (render block
  extension) + its test file, `docs/data-model.md`, `docs/api-model.md`.
- **Explicit non-goals**: no historical backfill (a possible separate, later milestone); no new
  page/route/endpoint; no weather/race-control work; no `lap_comparison` warning-code enhancement
  (§8's finding, out of scope for this milestone); no sanity-bounding logic for the Sprint Qualifying
  wet-weather case (§3 confirms it's unwarranted); no unrelated technical-debt cleanup; no
  README/CHANGELOG/PRD reconciliation (not yet due, §2).
- **Validation strategy** (candidate-level): unit tests proving Q1/Q2/Q3 normalize correctly for
  Qualifying/Sprint-Qualifying sessions and correctly null for Race/Practice; API/repository
  backward-compatibility tests for old Parquet lacking the new columns; frontend tests proving
  per-segment null-safe rendering (a missing Q2/Q3 hides only that segment).
- **Major risks**: low — this is the fifth application of an already-proven additive-field pattern,
  with the one previously open investigative question (the Sprint Qualifying anomaly) now closed with
  concrete evidence rather than assumption.

## 12. Stage A Stop Condition — Confirmed

`docs/m42-design-review.md` is the only new file. No source file modified. No data file modified. No
database writes. No Parquet writes. No ingestion. No backfill. No dependency changes. Nothing staged,
committed, or pushed. `docs/m9-design-review.md` untouched.

---

# Stage B — Implementation Design

## 13. Exact M34 Pattern, Independently Re-Traced

`normalize_drivers()` (`pipeline/pitwall_pipeline/normalize.py`) reads `ClassifiedPosition`/
`GridPosition`/`Status`/`Points` from `results` via `_optional_str`/`_optional_int`/`_optional_float`
helpers using `row.get(...)`, never bracket access — so a `results` frame lacking the columns
entirely still normalizes to `None`. `pipeline/pitwall_pipeline/models.py`'s `Driver` and
`backend/app/models/telemetry.py`'s `Driver` both append the four fields identically, each `| None =
None`, with a comment block citing the design doc and the no-backfill decision. `_driver_from_row()`
(`backend/app/repositories/parquet_repository.py:103-116`) reads them back via `.get()`, same
tolerance. `DriverSelectPage.tsx:107-124` renders a conditional `classificationRow` wrapper, each
field independently gated inside it. **Every layer of this path is directly extensible for Q1/Q2/Q3
with zero new architecture** — confirmed by reading the actual current source, not assumed from the
Stage A summary.

## 14. Exact Q1/Q2/Q3 Semantics — Reconfirmed

`Q1`/`Q2`/`Q3` declared `timedelta64[ns]` in FastF1's `SessionResults._COLUMNS`. Already loaded by
the existing `results` fetch — **zero new provider call**, confirmed. Populated (sparse, elimination-
shaped) for Qualifying and Sprint Qualifying/Shootout; `NaT` for Race/Sprint/Practice. No era-specific
handling needed in PitWall's own code: FastF1 already resolves the Ergast-vs-recalculation source
difference and the "Sprint Shootout" vs. "Sprint Qualifying" naming difference internally — the
column is always literally `Q1`/`Q2`/`Q3` regardless of session sub-type or year, so PitWall's
normalization code needs no session-type branching, exactly mirroring how M34's own classification
fields need none (FastF1 supplies `NaN`/`NaT` for non-applicable rows uniformly).

## 15. Sprint Qualifying — Confirmed Safe to Ship As-Is

The Stage A conclusion is confirmed and adopted without modification: the previously anomalous 2024
Chinese GP Sprint Qualifying values are genuine wet-weather times, evidenced directly by that
session's own `race_control_messages` (rain/wet-track entries) and `weather_data` (`Rainfall` true,
track temp drop). **No sanity clamp, bound, or wet-weather special case is added.** FastF1 supplies a
real, valid `Timedelta`; PitWall's own established principle (`normalize.py`'s own docstrings
elsewhere: "never fabricated," "read verbatim") is to persist supplied values as-is and let
downstream consumers interpret them — the same principle M35/M36/M40 already followed for
`position`/`track_status`/`deleted`. Building bespoke validation for one specific historical weather
event would be exactly the kind of scope invention this milestone's own instructions forbid.

## 16. Pipeline Model Design

**Exact fields**: `Driver.q1_seconds: float | None = None`, `q2_seconds: float | None = None`,
`q3_seconds: float | None = None` — added on both `pipeline/pitwall_pipeline/models.py`'s `Driver`
and `backend/app/models/telemetry.py`'s `Driver`, immediately after the existing M34 block, following
its exact comment-block convention.

**Naming rationale** (the Stage A prompt's placeholder names deliberately not copied blindly):
`_seconds` was chosen over a bare `q1`/`q2`/`q3` or `_ms` suffix by direct precedent-matching, not
convention invention. `Driver` and `Lap` are both **raw, persisted, 1:1-with-Parquet models** — `Lap`
already uses `lap_time_seconds`/`sector_*_seconds` for exactly this category of value. The `_ms`
suffix (`DriverLapMetrics.lap_time_ms`) belongs to a **different, computed-only** response model built
by `session_analytics`'s aggregation layer, not to any raw persisted model — using `_ms` on `Driver`
would import a naming convention from the wrong model category. `_seconds` is correct.

**Values remain numeric floats at every layer** (seconds, not milliseconds, not a formatted string) —
matching `lap_time_seconds`'s own representation exactly; any display-unit conversion belongs at the
frontend, same as how `DriverLapTable.tsx`/`DriverSummaryTable.tsx` convert seconds-shaped backend
data to their own local ms-based display today.

**`_timedelta_to_seconds()` is directly reused, unmodified** — no new helper needed; it already
handles `pd.Timedelta`/`NaT` → `float | None` generically (`normalize.py:39-43`), the exact type
`Q1`/`Q2`/`Q3` present as. NaN/`NaT` → `None` is its existing, correct behavior, requiring no new
logic.

**Only three new fields.** No unrelated `Driver`/`Lap` model change.

## 17. Normalization Design

`normalize_drivers()` gains exactly three lines in its `Driver(...)` construction:

```python
q1_seconds=_timedelta_to_seconds(row.get("Q1")),
q2_seconds=_timedelta_to_seconds(row.get("Q2")),
q3_seconds=_timedelta_to_seconds(row.get("Q3")),
```

**No explicit session-type gating** — confirmed unnecessary (§14): FastF1 itself supplies `NaT` for
every driver in Race/Sprint/Practice sessions, which `_timedelta_to_seconds()` already converts to
`None` via its existing `pd.isna()` check, exactly the same data-driven-null pattern M34's own four
fields already rely on. `.get()`, not bracket access, so a `results` frame lacking the columns
entirely (e.g. a hand-built test fixture) also normalizes to `None` rather than raising, matching
this function's own established `Compound`/M34 precedent. No new iteration or helper needed — the
existing `for _, row in results.iterrows()` loop is unchanged in shape.

## 18. Backend / Parquet Design

`_driver_from_row()` gains exactly three lines, same `.get()`-based pattern as the existing four M34
fields:

```python
q1_seconds=_optional_float(row.get("q1_seconds")),
q2_seconds=_optional_float(row.get("q2_seconds")),
q3_seconds=_optional_float(row.get("q3_seconds")),
```

**Old `drivers.parquet` files** (all 704 existing sessions, including the 332 M38-backfilled ones)
lack these three columns entirely — `.get()` returns `None` for all three, no raise, no fabricated
value — the exact same backward-compatibility guarantee M34/M35/M36/M40 each already proved.
**New-format files** deserialize populated values correctly, same mechanism. No migration, no new
Parquet store — same `drivers.parquet`, three additive columns. **Route count unchanged** — `Driver`
serialization is automatic through the existing `GET /sessions/{id}/drivers` response, no new
endpoint, no new repository method.

## 19. Frontend Design

**Exact UI surface**: extend `DriverSelectPage.tsx`'s existing `classificationRow` — the outer gating
condition gains `|| driver.q1_seconds != null` (Q2/Q3 alone are never present without Q1 per FastF1's
own elimination structure, §14, so gating on Q1's presence covers the whole segment triplet without
needing all three in the condition), and three new independently-gated spans inside, one per segment,
each rendered only `if (driver.qN_seconds != null)`.

**Per-segment nullability**: a missing Q2/Q3 (a driver eliminated in Q1) hides just that segment,
never the whole classification row or the other present segments — directly matching how
`grid_position`/`status`/`points` already behave independently on this exact page today. A `null`
segment is never rendered as `0`, `"—"`, or any placeholder implying an unfinished/zero time; it is
simply absent from the DOM, the same convention M34 already established.

**No display on Race/Sprint/Practice**: guaranteed by construction — `q1_seconds` is `None` for those
session types (§14), so the new condition never activates there. No client-side session-type check is
introduced; the existing data-driven gating pattern already handles this correctly, avoiding
unnecessary session-type-aware branching (matching this milestone's own instruction to prefer
data-driven null behavior).

**Formatting — reuse the existing convention, do not invent one**: grepped every existing lap-time
formatter in the frontend (`DriverLapTable.tsx:66`, `DriverSummaryTable.tsx:221`, both independently
defined, both `${valueMs.toFixed(0)}ms`) — **no mm:ss.sss clock-style formatter exists anywhere in
this codebase today**; every lap/segment time in the entire app is displayed as raw milliseconds with
an "ms" suffix. Per this milestone's own explicit instruction ("do not invent a new formatting system
if an existing helper already fits"), Q1/Q2/Q3 will follow this exact same established convention — a
small local formatter in `DriverSelectPage.tsx` (mirroring the other two components' own local-copy
pattern, not introducing a third import-cycle risk or a new shared module) converting
`q1_seconds * 1000` and rendering `${ms.toFixed(0)}ms`, labeled `Q1`/`Q2`/`Q3`. A nicer mm:ss.sss
display is a legitimate future enhancement but is explicitly out of this milestone's scope — building
it now would be inventing new formatting infrastructure the evidence doesn't show this milestone
needs.

**CSS**: `DriverSelectPage.module.css`'s `.gridPosition, .status, .points` grouped rule already
defines the exact shared style needed — add one more class to that group (or reuse one of the
existing three names directly) rather than writing new rules. No new stylesheet, no new component.

## 20. API Contract

`client.ts`'s `Driver` interface gains three additive `q1_seconds?: number | null` (etc.) fields,
matching the existing `classified_position?`/`grid_position?`/etc. optional-field convention exactly
(optional even though the backend always sends the key, for the same reason M34/M35/M36/M40 already
documented: not forcing every existing `Driver`-literal test fixture across the app to add the field
just to compile). **No route change, no new endpoint, no new fetch call, no mapper duplication** — the
existing `listDrivers()` call already returns the full `Driver` shape; JSON serialization of
`float | None` → `number | null` is automatic through the existing Pydantic/`ApiModel` boundary, the
same mechanism already proven four times.

## 21. Historical/Backfill — No Backfill in M42, Future Implication Quantified

**No backfill performed or scheduled in M42.** Exact future implication, quantified: 164 sessions
(142 Qualifying + 22 Sprint Qualifying) would gain real Q1/Q2/Q3 values from a future targeted
backfill; the other 540 sessions (Race/Sprint/Practice) would remain correctly `None` regardless
(these fields never apply to them — not a "gap," a correct absence). The 2 M38 exception events'
*Sprint* sessions are irrelevant here (confirmed, Stage A §6) — their corresponding *Sprint
Qualifying* sessions load cleanly and are unaffected. **Adding Q1/Q2/Q3 does not create a new
historical gap distinct in kind from M34/M35/M36/M40's own already-accepted no-backfill state** — it
is the same, already-established pattern, applied a fifth time. A future dedicated backfill (mirroring
M38's mechanism, scoped to the 164-session population) would itself be milestone-sized — small,
single-purpose, following M38's proven design — but is explicitly not part of M42.

## 22. Testing Design

| Layer | Case |
|---|---|
| Pipeline | `normalize_drivers()`: Qualifying-shaped fixture with all three populated → correct seconds values |
| Pipeline | `normalize_drivers()`: partial nullability (Q1 present, Q2/Q3 `NaT` — a Q1-eliminated driver) → `q1_seconds` set, `q2_seconds`/`q3_seconds` `None` |
| Pipeline | `normalize_drivers()`: Race-shaped fixture (all three `NaT`) → all `None`, no fabrication (mirrors existing `test_normalize_drivers_handles_non_applicable_classification_fields`) |
| Pipeline | `normalize_drivers()`: columns absent entirely from fixture DataFrame → all `None`, no raise |
| Backend | Repository: old-style Parquet (no `q1_seconds`/etc. columns) → `None` for all three (mirrors existing M34/M35/M36/M40 backward-compat tests) |
| Backend | Repository: new-style Parquet with values → correct round-trip |
| Backend | API route: `GET /sessions/{id}/drivers` response includes populated and `null` cases correctly (only if an existing route test file already covers `Driver` serialization in a way naturally extensible — Stage C to confirm; not a hard requirement, since §18 already proves the mechanism via the repository test) |
| Frontend | `DriverSelectPage`: all three segments render when present |
| Frontend | `DriverSelectPage`: partial values (Q2/Q3 absent) render Q1 only, no placeholder for the missing segments |
| Frontend | `DriverSelectPage`: a driver with no `q1_seconds` shows no qualifying-time row at all, existing M34 classification row (if any) unaffected |
| Frontend | `DriverSelectPage`: existing M34 classification/status/points tests continue passing unmodified (regression proof) |

**Sprint Qualifying**: no separate test category needed beyond the "populated" case above — Sprint
Qualifying's `Q1`/`Q2`/`Q3` are the exact same column names/semantics as plain Qualifying from
`normalize_drivers()`'s point of view (§14); a session-type-specific test would test FastF1's own
internal resolution logic, not PitWall's code, and PitWall's fixtures don't need to simulate FastF1's
internal Ergast-vs-recalculation branching since that's already resolved before `results` reaches
this codebase.

## 23. Documentation Impact

`docs/data-model.md`/`docs/api-model.md`: mechanical schema updates only — extend the existing
`Driver` bullet with the same additive-field wording pattern already used four times (M34/M35/M36/M40),
citing this design doc and the no-backfill decision. **No README/CHANGELOG/PRD reconciliation** — not
yet due (Stage A §2), and M34/M35/M36/M40 each shipped without touching those files, reconciled later
in bulk by M39; M42 follows the same precedent.

## 24. Architecture / Scope Control — Non-Goals Confirmed

Weather, race-control messages, the `lap_comparison` warning-code enhancement (Stage A §8's finding),
historical backfill, dependency upgrades, unrelated technical debt, new routes, new pages, new Parquet
files, changes to M34 classification semantics, changes to M40/M41 exclusion logic, wet-weather
special handling (§15) — all explicitly out of scope, none touched by this design.

## 25. Candidate Stage C File List

**Definitely modified:**
- `pipeline/pitwall_pipeline/models.py` (`Driver`: 3 new fields)
- `pipeline/pitwall_pipeline/normalize.py` (`normalize_drivers()`: 3 new lines)
- `pipeline/tests/fixtures.py` (extend `build_results_df()`/`build_practice_results_df()` or add a
  Qualifying-shaped variant, per existing fixture conventions)
- `pipeline/tests/test_normalize.py` (§22's pipeline cases)
- `backend/app/models/telemetry.py` (`Driver`: 3 new fields)
- `backend/app/repositories/parquet_repository.py` (`_driver_from_row`: 3 new lines)
- `backend/tests/test_parquet_repository.py` (§22's backend cases)
- `frontend/src/api/client.ts` (`Driver` interface: 3 new optional fields)
- `frontend/src/features/session-select/DriverSelectPage.tsx` (render block extension, local
  formatter)
- `frontend/src/features/session-select/DriverSelectPage.module.css` (one class added to the existing
  grouped rule, or reuse an existing class name)
- `frontend/src/features/session-select/DriverSelectPage.test.tsx` (§22's frontend cases)
- `docs/data-model.md`, `docs/api-model.md` (mechanical `Driver` bullet extension)

**Conditionally modified (Stage C to confirm, not required by this design):**
- `backend/tests/test_*_route.py` (only if an existing route-level test naturally covers `Driver`
  serialization and a small addition proves the full stack cheaply, mirroring M40's own optional
  full-stack pattern — not required, since §18's repository-level proof already demonstrates the
  mechanism)

**Definitely untouched:**
- `pipeline/pitwall_pipeline/providers/fastf1_provider.py`, `cache_writer.py`, `ingest.py`,
  `ingest_event.py`, `ingest_plan.py`, `backfill_m38.py`
- `backend/app/services/session_analytics/`, `backend/app/services/tyre_performance/`,
  `backend/app/services/lap_comparison/` (M40/M41's exclusion logic, `lap_comparison`'s warnings —
  none touched)
- Every backend route file except none — no route changes at all
- `frontend/src/features/session-analytics/`, `tyre-performance/`, `stint-comparison/`,
  `lap-comparison/`, `track-map/`, `driver-trends/` — no other frontend feature touched
- `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`, `docs/backlog.md`,
  `docs/architecture.md`, `docs/m9-design-review.md`
- All ADRs, `data/`, PostgreSQL, dependencies

**Newly created:** none — no new file is needed.

## 26. Risks

- **Timedelta/NaN conversion**: none — `_timedelta_to_seconds()` already handles this exact type
  correctly and is unmodified.
- **Partial Q1/Q2/Q3 values**: handled by construction — each field is independently nullable and
  independently rendered; no combination requires special-casing.
- **Sprint Qualifying semantics**: resolved (§15) — no risk remains, confirmed with direct evidence.
- **Old Parquet compatibility**: proven by the identical `.get()` pattern already used four times.
- **Frontend formatting**: the raw-ms convention is not the most polished possible display, but is
  the only evidenced-safe choice without inventing new formatting infrastructure this milestone
  doesn't need — flagged as a legitimate future enhancement, not a defect.
- **Accidentally displaying qualifying data on non-qualifying sessions**: prevented by construction —
  FastF1 itself supplies `None`/`NaT` for those session types; no PitWall-side gating logic exists to
  get wrong.
- **API serialization precision**: `float` round-trips through Pydantic/JSON without special handling
  needed, same as every other float field on `Driver`/`Lap` today.
- **Unnecessary session-type gating**: explicitly avoided (§14/§17) — data-driven nulls only, per this
  milestone's own instruction.
- **Duplication of existing time-formatting helpers**: acknowledged, not created — the new local
  formatter mirrors the two existing local copies' exact shape rather than consolidating them (which
  would be unrelated technical-debt cleanup, explicitly out of scope) or diverging from them (which
  would be a new, inconsistent formatting system).

## 27. Decision Questions

**A. Exact `Driver` fields and types?** `q1_seconds: float | None = None`, `q2_seconds: float | None
= None`, `q3_seconds: float | None = None` — pipeline and backend models both.

**B. Exact normalization/conversion logic?** `_timedelta_to_seconds(row.get("Q1"))` etc., reused
unmodified — no new helper.

**C. Exact UI surface?** `DriverSelectPage.tsx`'s existing classification row, extended — no new
page/route/component.

**D. How should partial Q1/Q2/Q3 values render?** Each segment independently gated; absent segments
simply omitted, never a placeholder or zero.

**E. Any new API route/store/provider call required?** No — confirmed at every layer (§16–§20).

**F. Does historical backfill belong in M42?** No, confirmed (§21) — matching M34/M35/M36/M40's own
precedent exactly.

**G. Minimum test matrix?** 11 cases across pipeline/backend/frontend (§22), no Sprint-Qualifying-
specific case needed beyond the standard "populated" case (reasoning in §22).

**H. Is the Sprint Qualifying wet-weather anomaly genuinely safe to ship without special handling?**
Yes — confirmed via direct evidence (real `race_control_messages` and `weather_data` for the exact
flagged session, Stage A §3) that the values are a legitimate wet-weather qualifying segment, not a
data defect; PitWall's own established principle across M35/M36/M40 is to persist FastF1-supplied
values verbatim, never fabricate or bound them.

**I. Is M42 still appropriately milestone-sized?** Yes — three additive fields, one existing page
extended, zero new architecture at any layer, the fifth clean application of an already-proven
pattern. If anything, smaller in surface area than M40/M41 (no new exclusion-logic branch, no new
`ExclusionReason` value, no precedence decision).

## 28. Validation Plan

- `cd pipeline && .venv/bin/pytest tests/test_normalize.py -q` (targeted), then full pipeline suite.
- `cd backend && .venv/bin/pytest tests/test_parquet_repository.py -q` (targeted), then full backend
  suite.
- `cd frontend && npx vitest run src/features/session-select/DriverSelectPage.test.tsx` (targeted),
  then full frontend suite.
- `ruff format --check`, `ruff check`, `mypy` (pipeline + backend); `tsc -b --noEmit`, `eslint`,
  `prettier --check` (frontend, scoped to changed files at minimum).
- `git diff --check`.
- No live ingestion, no real Parquet writes, no PostgreSQL writes, no backfill — Stage C validates
  entirely against fixtures and existing real-cache-only read patterns, matching every prior
  non-M38/M39 milestone's precedent.

## 29. Deviation from Stage A

None material. Stage A's candidate-level scope is confirmed accurate in every particular. The one
refinement: Stage A left field naming as "to be verified against existing conventions" — Stage B
resolves this precisely (`_seconds`, not `_ms` or bare names), with explicit precedent-based
reasoning (§16), and confirms the frontend formatting question (no existing clock-format helper
exists anywhere, so the raw-ms convention is reused rather than a new one invented) — both
refinements, not reversals, of Stage A's recommendation.

## 30. Stage B Stop Condition — Confirmed

No source implementation performed. No data, database, or Parquet writes. No ingestion. No backfill.
Nothing staged, committed, or pushed. `docs/m9-design-review.md` untouched.
`docs/m42-design-review.md` is the only M42 artifact.

---

# Stage C — Implementation

Implemented exactly per §13–§28, with one scope clarification (§32).

## 31. Exact Implementation

Three additive `float | None = None` fields — `q1_seconds`, `q2_seconds`, `q3_seconds` — added to
`Driver` in both `pipeline/pitwall_pipeline/models.py` and `backend/app/models/telemetry.py`.
`normalize_drivers()` gained exactly three lines reusing `_timedelta_to_seconds()` unmodified.
`_driver_from_row()` gained exactly three lines reusing `_optional_float()` unmodified. No new
helper was created anywhere. `frontend/src/api/client.ts`'s `Driver` interface gained three matching
optional fields. `DriverSelectPage.tsx`'s existing `classificationRow` gained three independently-
gated spans plus one new local formatter (`formatSegmentTime`), mirroring the exact shape of the two
existing, independently-defined `formatMs` functions elsewhere in the app (raw milliseconds + "ms"
suffix) — no new formatting system invented, no existing formatter modified.
`DriverSelectPage.module.css` gained one class name (`.qualifyingTime`) added to the existing grouped
`.gridPosition, .status, .points` rule — no new styles written.

## 32. Scope Clarification (Not a Deviation)

Stage B's design (§23) called for mechanical `docs/data-model.md`/`docs/api-model.md` `Driver`
bullet updates, distinct from the explicitly-out-of-scope README/CHANGELOG/PRD reconciliation. The
Stage C task's own body did not enumerate these two files in its requirements list. Per Stage C's
instruction to "implement M42 exactly according to docs/m42-design-review.md and the approved Stage B
design," and since these two updates are the same small, mechanical, same-pattern-four-times-already
extension Stage B approved (not a new reconciliation effort), both were completed. README, CHANGELOG,
and docs/prd.md remain untouched, exactly as designed.

## 33. Exact Files Changed

**Source** (7): `pipeline/pitwall_pipeline/models.py`, `pipeline/pitwall_pipeline/normalize.py`,
`backend/app/models/telemetry.py`, `backend/app/repositories/parquet_repository.py`,
`frontend/src/api/client.ts`, `frontend/src/features/session-select/DriverSelectPage.tsx`,
`frontend/src/features/session-select/DriverSelectPage.module.css`.

**Tests** (4): `pipeline/tests/fixtures.py`, `pipeline/tests/test_normalize.py`,
`backend/tests/test_parquet_repository.py`, `frontend/src/features/session-select/DriverSelectPage.test.tsx`.

**Docs** (3): `docs/data-model.md`, `docs/api-model.md`, `docs/m42-design-review.md` (this file).

**Confirmed untouched**: `backfill_m38.py`, `data/`, `backend/app/services/session_analytics/filtering.py`
(M40/M41), `backend/app/services/tyre_performance/stint_eligibility.py` (M41),
`backend/app/services/lap_comparison/`, all dependency files, README.md, CHANGELOG.md, docs/prd.md,
docs/success-metrics.md, docs/backlog.md, docs/architecture.md, docs/m9-design-review.md, all ADRs.

## 34. Test Cases Added

**Pipeline** (4, in `test_normalize.py`, using a new `build_qualifying_results_df()` fixture plus
`Q1`/`Q2`/`Q3` columns added to the existing `build_practice_results_df()`):
`test_normalize_drivers_maps_qualifying_segment_times`,
`test_normalize_drivers_handles_partial_qualifying_segment_times`,
`test_normalize_drivers_handles_non_applicable_qualifying_segment_times`,
`test_normalize_drivers_handles_missing_qualifying_columns`.

**Backend** (2, in `test_parquet_repository.py`):
`test_list_drivers_maps_qualifying_segment_times_when_present`,
`test_list_drivers_missing_qualifying_segment_columns_deserializes_to_none`.

**Frontend** (3, in `DriverSelectPage.test.tsx`): "shows all three qualifying segment times when
present," "shows only the qualifying segments a driver reached, with no placeholder for the rest,"
"omits qualifying segment times when absent (Race/Practice sessions, pre-M42 data)."

**9 new tests total.** All pre-existing tests in every touched file re-run unmodified and pass.

## 35. Targeted Test Results

- Pipeline: `pytest tests/test_normalize.py` → 19/19 passed (4 new + 15 pre-existing).
- Backend: `pytest tests/test_parquet_repository.py -k "driver or qualifying"` → 10/10 passed (2 new
  + 8 pre-existing selected by the filter).
- Frontend: `vitest run DriverSelectPage.test.tsx` → 12/12 passed (3 new + 9 pre-existing).

## 36. Full Suite Results

- **Pipeline**: 172 passed (exactly +4 over the pre-M42 baseline of 168), 15 errors — all
  pre-existing `psycopg`/no-live-Postgres connection issues, zero new failures.
- **Backend**: 395 passed (exactly +2 over the pre-M42 baseline of 393), 1 failed + 15 errors — same
  pre-existing Postgres-connection category (`test_pool_connects_to_postgres` PoolTimeout plus 15
  `OperationalError`s), zero new failures.
- **Frontend**: 572 passed (exactly +3 over the pre-M42 baseline of 569) across 86 files.

## 37. Type/Lint/Format Results

`ruff format --check`, `ruff check`, `mypy` (pipeline: full `pitwall_pipeline/`; backend: full
`app/`) — all clean, zero issues, not just on touched files. `tsc -b --noEmit` — clean. `eslint .`
(full frontend) — clean. `prettier --check` (all changed frontend files) — clean. `git diff --check`
— clean.

## 38. Backward-Compatibility Proof

Verified directly against real `ParquetRepository` code (temp-directory fixtures, no real data
touched): an old-style `drivers.parquet` with no `q1_seconds`/`q2_seconds`/`q3_seconds` columns
deserializes all three to `None` — `Old-style Parquet: None None None`. A new-style file with
populated values round-trips exactly — `New-style Parquet: 78.241 77.593 76.982`. The API-shaped
`model_dump()` output for both cases confirmed correct JSON-serializable shape:
`{'q1_seconds': 78.241, 'q2_seconds': 77.593, 'q3_seconds': 76.982, ...}` (populated) and
`{'q1_seconds': None, 'q2_seconds': None, 'q3_seconds': None, ...}` (old data).

## 39. API/Frontend Behavior

No route change (route count unchanged), no new endpoint, no new fetch call — `Driver` serialization
is automatic through the existing `GET /sessions/{id}/drivers` response. `DriverSelectPage` renders
each segment independently: present segments show `QN {ms}ms`; absent segments are omitted entirely
(no placeholder, no zero); a driver with no `q1_seconds` shows no qualifying-time content at all; the
existing M34 classification/status/points rendering and its own tests are unaffected (verified by
the full, unmodified pre-existing test set passing).

## 40. Data/Write Safety Confirmation

`data/` zero diff (`git status --short data/` empty). No real Parquet file modified — every
verification in §38 used `tempfile.TemporaryDirectory()`. No ingestion, no backfill, no PostgreSQL
write. `backfill_m38.py` zero diff. `backend/app/services/session_analytics/filtering.py` and
`backend/app/services/tyre_performance/stint_eligibility.py` (M40/M41) zero diff.
`backend/app/services/lap_comparison/` zero diff. `docs/m9-design-review.md` zero diff.

## 41. Deviations from Stage B

None material. §32 documents a scope clarification (the two documentation files were completed per
Stage B's own approved design, even though the Stage C task's body didn't separately re-list them) —
not a deviation from what was designed, a fulfillment of it.

## 42. Stage C Stop Condition — Confirmed

No historical backfill, ingestion, database write, or real Parquet write occurred. `backfill_m38.py`
and `data/` confirmed untouched. M40/M41 exclusion logic and `lap_comparison/` confirmed untouched.
`docs/m9-design-review.md` untouched. Nothing staged, committed, or pushed.
