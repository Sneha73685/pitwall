# M43 Design Review

## Stage C — Implementation

Implemented exactly per the approved Stage B design, with no deviations requiring a product/architecture decision.

### A. Exact Files Changed

```
 backend/app/models/lap_comparison.py              | 12 ++++
 backend/app/services/lap_comparison/validation.py | 45 ++++++++++++--
 backend/tests/test_lap_comparison_validation.py   | 75 +++++++++++++++++++++++
 backend/tests/test_laps_compare_route.py          | 46 ++++++++++++++
 frontend/src/api/client.ts                        | 14 ++++-
 5 files changed, 185 insertions(+), 7 deletions(-)
?? docs/m43-design-review.md
```

Matches Stage B's "definitely modified" list exactly. `docs/api-model.md` (the conditional item) was **not** modified — see §I. No other file changed, staged, committed, or pushed.

### B. Exact Implementation Changes

- **`backend/app/models/lap_comparison.py`**: added `YELLOW_FLAG_LAP_A`, `YELLOW_FLAG_LAP_B`, `TRACK_LIMITS_LAP_A`, `TRACK_LIMITS_LAP_B` to `WarningCode`, values `"yellow_flag_lap_a"`/`"yellow_flag_lap_b"`/`"track_limits_lap_a"`/`"track_limits_lap_b"`. All three existing members (`INVALID_LAP_A`, `INVALID_LAP_B`, `DIFFERENT_CIRCUIT`) unchanged.
- **`backend/app/services/lap_comparison/validation.py`**: added `from app.services.session_analytics.filtering import classify_lap` (the M41 cross-service precedent). Added a module-level `_EXCLUSION_WARNING_CODES` dict mapping `"yellow_flag"`/`"track_limits"` to their `(lap_a_code, lap_b_code)` tuples. Extended `collect_warnings()`: the two existing `is_accurate` checks are byte-for-byte unchanged; two new blocks appended after them call `classify_lap(lap_a).exclusion_reason` / `classify_lap(lap_b).exclusion_reason` and append the corresponding warning if not `None`. Updated the function's docstring to correct its now-stale "no such data exists" claim.
- **`frontend/src/api/client.ts`**: widened the `WarningCode` string-literal union with the 4 new values plus a comment noting no frontend consumer reads them yet.
- **`backend/tests/test_lap_comparison_validation.py`**: added 8 new test functions (clear lap; yellow-flag A; yellow-flag B; track-limits A; track-limits B; both-sides-independent; both-conditions-one-lap precedence; accuracy+exclusion independence; old-style-no-new-warning). All use the existing `lap(**overrides)` fixture helper unmodified.
- **`backend/tests/test_laps_compare_route.py`**: extended `_write_second_session()` with optional `track_status`/`deleted` parameters (default `None`, so all 3 existing call sites are unaffected), and added one new end-to-end test proving `yellow_flag_lap_b` serializes correctly through the real `/laps/compare` route.

### C. WarningCode Semantics

`exclusion_reason == "yellow_flag"` → `YELLOW_FLAG_LAP_A`/`_B`. `exclusion_reason == "track_limits"` → `TRACK_LIMITS_LAP_A`/`_B`. `exclusion_reason is None` → no new warning. Each side evaluated independently; a single lap can never produce both (`classify_lap()`'s existing M40 precedence — track_limits wins — is inherited unmodified, not reimplemented). Exclusion warnings never suppress, and are never suppressed by, `INVALID_LAP_A`/`INVALID_LAP_B` — both can coexist for the same lap.

### D. Test Cases Added/Modified

9 new backend tests total (8 in `test_lap_comparison_validation.py` + 1 in `test_laps_compare_route.py`), covering exactly the 8-item matrix the Stage C brief specified plus the approved route-level proof. Zero tests modified (only the existing `_write_second_session()` helper gained optional parameters with backward-compatible defaults) — all pre-existing test bodies are untouched.

### E. Targeted Test Results

`test_lap_comparison_validation.py` + `test_laps_compare_route.py`: **32 passed**, 0 failed (14 pre-existing + 9 new validation + 9 pre-existing + 1 new route = 32).

### F. Full Backend/Frontend Results

- Backend full suite: **405 passed** (was 395 pre-M43, exactly +10 = the 9 validation + 1 route test added), 1 failed + 15 errors — identical in name, count, and root cause (no live PostgreSQL) to the pre-M43 baseline. Zero new failures.
- Frontend full suite: **572 passed** across 86 files — identical count to the pre-M43 baseline (no new frontend test needed; the `client.ts` change is type-only with no new runtime behavior to test).

### G. Static-Check Results

- Backend: `ruff format --check` — 101 files already formatted. `ruff check` — all checks passed. `mypy --strict` — no issues found in 101 source files.
- Frontend: `tsc -b --noEmit` — clean. `eslint .` — clean. `prettier --check .` — clean on all source; the only 3 warnings are on gitignored `dist/` build artifacts (pre-existing, unrelated to this change).
- `git diff --check` (repo root) — clean.

### H. Backward-Compatibility Proof

Ran directly against the production `collect_warnings()`/`classify_lap()` code path (not a re-derivation):

```
old-style (pre-M36/M40) lap pair -> warnings: []
yellow-flag lap A -> warnings: [WarningCode.YELLOW_FLAG_LAP_A]
track-limits lap B -> warnings: [WarningCode.TRACK_LIMITS_LAP_B]
lap with BOTH track_status and deleted -> warnings (track_limits only): [WarningCode.TRACK_LIMITS_LAP_A]
```

A lap with `track_status=None`, `deleted=None`, `deleted_reason=None` — the exact shape of every currently-stored real lap (0/704 with `deleted` populated, per M43 Stage A §5) — produces `warnings == []`, identical to this function's pre-M43 output. Existing `INVALID_LAP_A`/`INVALID_LAP_B` behavior is provably unchanged: those two lines of code were not edited.

### I. API/Frontend Behavior

No new route, no new response field, no change to `ComparisonWarning`'s or `LapComparisonResponse`'s shape — `warnings: list[ComparisonWarning]` carries the same `{code, detail}` shape as before, now capable of 4 additional `code` values. No frontend rendering change: confirmed (again, post-implementation) that no `.tsx` file reads any code besides `different_circuit`, so nothing needed updating beyond the type declaration. `docs/api-model.md` was deliberately **not** modified: its `/laps/compare` section has never enumerated every `WarningCode` value (it never mentioned `INVALID_LAP_A`/`INVALID_LAP_B` either) — it only calls out `DIFFERENT_CIRCUIT` because that code has a genuine frontend behavioral side effect (hiding the track map) worth explaining. The 4 new codes have no frontend consumer and no behavioral side effect to document, so adding a sentence would be reconciliation for its own sake rather than filling a real documentation gap — consistent with the doc's existing, already-selective convention.

### J. Full Call-Path Verification

Re-confirmed post-implementation: `Lap` objects (with `track_status`/`deleted` already populated by the repository) flow into `laps_compare.py:118-129`'s existing `_find_lap()` calls, then into `collect_warnings(lap_a_model, lap_b_model)` at `laps_compare.py:159` — **this call site required zero edits**, exactly as Stage B predicted (§9), because `collect_warnings()`'s signature and return type are unchanged. The returned `list[ComparisonWarning]` flows unmodified into `LapComparisonResponse.warnings` and serializes through FastAPI's existing Pydantic response handling — proven end-to-end by the new route-level test (§E), which asserts the real HTTP response body contains `"yellow_flag_lap_b"`.

### K. Data/Database/Parquet Safety

- `data/` — zero diff (confirmed via `git diff -- data/` and `git status --short -- data/`).
- `backfill_m38.py` — zero diff (confirmed, file untouched).
- No ingestion, no backfill, no PostgreSQL writes, no Parquet writes performed at any point.
- `docs/m9-design-review.md` — zero diff.
- M34–M42 files confirmed untouched: `pipeline/`, `backend/app/services/session_analytics/`, `backend/app/services/tyre_performance/`, `backend/app/models/telemetry.py`, `backend/app/models/session_analytics.py`, `backend/app/api/laps_compare.py`, `frontend/src/features/session-select/` — all show zero diff via `git diff --stat`.

### L. Deviations from Stage B

None. Implementation matches the approved design exactly: same import, same 4 warning-code names/values, same precedence-inheritance reasoning, same "no frontend rendering change" decision, same test matrix (expanded from Stage B's 8 illustrative cases to 9 concrete test functions, a 1:1 mapping with one extra symmetric case), same conditional `docs/api-model.md` outcome (decided: leave untouched, reasoning documented in §I above, matching the "explicitly explain why" instruction).

### M. Final Git Status

```
 M backend/app/models/lap_comparison.py
 M backend/app/services/lap_comparison/validation.py
 M backend/tests/test_lap_comparison_validation.py
 M backend/tests/test_laps_compare_route.py
 M frontend/src/api/client.ts
?? docs/m43-design-review.md
```

Nothing staged, nothing committed, nothing pushed. `HEAD == origin/main == d845c865a49dcf8a64701ce39f9c734bcecb305f` (unchanged throughout Stage C).

**Stage C complete. Stopping here per instruction. Not staging, committing, or pushing.**

---

## Stage B — Implementation Design

**Baseline at start:** `HEAD == origin/main == d845c865a49dcf8a64701ce39f9c734bcecb305f`, working tree clean, nothing staged, `docs/m9-design-review.md` zero diff, `data/` zero diff. Verified by direct `git` commands.

Stage A's finding was independently re-verified against current production source before any design work — not trusted from the audit's own summary. `backend/app/services/lap_comparison/validation.py:76-99`'s `collect_warnings()` confirmed to check only `lap.is_accurate`; its own docstring's claim ("no yellow-flag or pit-lane/track-status data exists... this function never emits them") is confirmed stale — `Lap.track_status` (M36) and `Lap.deleted`/`deleted_reason` (M40) both exist on the exact `Lap` object this function already receives (`backend/app/models/telemetry.py:114,123-124`).

### 1. Root-Cause Verification

Full call graph, read directly from source:

1. `GET /laps/compare` (`backend/app/api/laps_compare.py:100` `compare_laps`) resolves `lap_a_model`/`lap_b_model` via `repository.list_laps(...)` (`laps_compare.py:118-129`) — these are full `Lap` Pydantic objects, already carrying `track_status`/`deleted`/`deleted_reason` (no additional repository call needed to get them; they're already fetched).
2. `laps_compare.py:159` calls `warnings = collect_warnings(lap_a_model, lap_b_model)`.
3. `collect_warnings()` (`validation.py:76-99`) checks only `lap.is_accurate` for each side, appending `WarningCode.INVALID_LAP_A`/`INVALID_LAP_B`.
4. `laps_compare.py:160-162` separately computes `_circuit_mismatch_warning(session_a, session_b)` at the **route layer** (not inside `collect_warnings()`) and appends it to the same list — deliberately, per M13's design (`docs/m13-design-review.md §5/§9`, referenced in `laps_compare.py:24-26`): circuit identity is session-level data `app.services.lap_comparison` must "stay ignorant of," so that one check lives at the API layer where session objects are already in scope.
5. `warnings` is returned unmodified as `LapComparisonResponse.warnings` (`lap_comparison.py:106`).
6. Frontend: `frontend/src/api/client.ts:185-208` types `WarningCode`/`ComparisonWarning`/the `warnings` field. Confirmed by direct search that **only `different_circuit` is ever read** anywhere in the frontend (`ComparisonPage.tsx:80`, `w.code === "different_circuit"`), and only as a boolean gate to skip the track-map fetch — never rendered as visible warning text. `INVALID_LAP_A`/`INVALID_LAP_B` are computed by the backend today and returned in every response, but **no frontend component renders them or `ComparisonWarning.detail` at all** — confirmed by grepping every `.tsx` file under `frontend/src/features/lap-comparison/` for `warning`/`INVALID_LAP` outside test files; the only hits are `ComparisonHeader.test.tsx` passing `warnings: []` to satisfy the mock's type shape, not testing rendering.

**Confirmed why yellow_flag/track_limits are invisible today:** `collect_warnings()` was written at M6 (pre-M36/M40) when `track_status`/`deleted` genuinely didn't exist anywhere in the schema. M36 and M40 added the data to the shared `Lap` model `collect_warnings()` already receives, but neither milestone's design doc mentions `lap_comparison` (confirmed via grep of both docs) — an unconsidered gap, not a deliberate deferral.

### 2. Existing Warning Semantics

`collect_warnings()`'s current meaning: "a specific, lap-scoped, non-blocking reason this particular lap's comparison data may be misleading," always attributed to a specific side (`_LAP_A`/`_LAP_B` baked into the enum value itself, not a separate field — see §4 below on why this matters for naming the new codes).

**Decision: reuse `exclusion_reason` directly via import, do not reproduce classification logic.** This is not a novel choice for this codebase — it is an already-shipped precedent: `backend/app/services/tyre_performance/stint_eligibility.py:33` already does `from app.services.session_analytics.filtering import classify_lap`, a cross-service import of exactly this function for exactly this reason (M41). `lap_comparison` follows the same pattern:

```python
from app.services.session_analytics.filtering import classify_lap
```

This extends an existing warning-code mechanism (`WarningCode` enum + `ComparisonWarning`), not a new abstraction. No `TrackStatus`-code-membership logic or `Deleted`-boolean logic is reimplemented in `lap_comparison` — `classify_lap(lap).exclusion_reason` is consumed as-is.

**Import-cycle check:** `filtering.py` imports only `app.models.telemetry.Lap` — nothing from `app.services.lap_comparison`. No cycle. `app.services.session_analytics` has zero references to `lap_comparison` anywhere (confirmed via grep) besides a documentation cross-reference comment in `filtering.py`'s own module docstring (`filtering.py:5-7`, noting `is_accurate` is "the same field M6's `collect_warnings`... already keys off of" — the project's authors already flagged the conceptual overlap between these two files, in prose, without ever wiring it — this confirms the gap was noticed once, informally, and never acted on).

### 3. Exclusion Semantics

**Decision: consume `classify_lap(lap).exclusion_reason` directly. Do not reproduce or reinterpret the underlying `TrackStatus`/`Deleted` conditions in `lap_comparison`.** The call graph makes this safely available with zero extra cost (§10) and zero architectural violation (§9) — `classify_lap()` takes the exact `Lap` object `collect_warnings()` already has in hand.

`classify_lap()` (`filtering.py:96-107`, unmodified, not touched by this milestone) already resolves precedence: `exclusion_reason = _track_limits_reason(lap) or _yellow_flag_reason(lap)` — a single value, `track_limits` winning over `yellow_flag` when a lap is both (M40's established display-precedence decision, `docs/m40-design-review.md §21`). Because `lap_comparison` consumes this single already-resolved field rather than the two raw underlying booleans/strings, **it inherits M40's precedence for free** — there is no scenario where `lap_comparison` needs its own precedence logic, and no scenario where a single lap could ever produce two competing exclusion warnings. `classify_lap()`, `session_analytics` filtering, and `tyre_performance` eligibility are not modified by this milestone — imported, never edited.

### 4. Warning-Code Design

**Naming convention found:** two conventions coexist in this codebase for "which side does this warning apply to":
- `lap_comparison`'s own (`WarningCode.INVALID_LAP_A`/`INVALID_LAP_B`, `lap_comparison.py:62-63`): baked into the enum value name, per-side codes.
- `session_analytics`'s (`SessionAnalyticsWarningCode` + a separate `driver: str` field, `session_analytics.py:29-46`): one generic code, disambiguated by an adjacent field.

**Decision: follow `lap_comparison`'s own convention** (the file actually being extended), not the sibling module's differing choice — consistent with "if existing warning codes have an established naming convention, follow it," read as the convention of the model being extended.

**New codes** (derived directly from `exclusion_reason`'s existing vocabulary — `"yellow_flag"`, `"track_limits"`, `filtering.py:35` — formatted to match `INVALID_LAP_A`/`INVALID_LAP_B`'s `{CONDITION}_LAP_{SIDE}` shape):

```python
YELLOW_FLAG_LAP_A = "yellow_flag_lap_a"
YELLOW_FLAG_LAP_B = "yellow_flag_lap_b"
TRACK_LIMITS_LAP_A = "track_limits_lap_a"
TRACK_LIMITS_LAP_B = "track_limits_lap_b"
```

This is Option B as posed in §13 below — new, lap-comparison-specific codes — but the values are directly derived from, not independently invented from, the existing `ExclusionReason` vocabulary, so the string content itself is not new information, only its lap-comparison-specific packaging is.

Answers to §4's specific questions:
- **Separate codes for `yellow_flag`/`track_limits`?** Yes — the frontend "renders its own copy/iconography per code" (`lap_comparison.py:57-59`'s own stated design principle), and a yellow-flag caveat reads very differently to a user than an official time-deletion ruling; collapsing them into one generic `EXCLUDED_LAP_A` would lose information the codebase has always kept resolved.
- **Can both appear simultaneously (on the same lap)?** No — impossible by construction, since `exclusion_reason` is already a single resolved value (§3).
- **Can both appear simultaneously (across lap A and lap B)?** Yes, independently — e.g. lap A yellow-flagged and lap B track-limits-deleted produces both `YELLOW_FLAG_LAP_A` and `TRACK_LIMITS_LAP_B` in one response, exactly mirroring the existing "both inaccurate" test case shape for `INVALID_LAP_A`+`INVALID_LAP_B`.
- **Precedence needed?** No new precedence logic — inherited from `classify_lap()` (§3).
- **Ordering?** Preserve the two existing `is_accurate` checks completely unchanged (lowest-risk diff on already-tested code), then append two new checks after them, lap A before lap B: `IS_ACCURATE(A)`, `IS_ACCURATE(B)`, `EXCLUSION(A)`, `EXCLUSION(B)`.
- **Duplicate warnings possible?** No — each side produces at most one exclusion warning (§3) and at most one accuracy warning (pre-existing), so at most 2 warnings per side, 4 total.
- **Coexist with existing telemetry/data-quality warnings?** Yes, deliberately — `is_accurate` (telemetry-integrity heuristic) and `exclusion_reason` (procedural/official ruling) are explicitly documented as independent signals in `filtering.py`'s own `classify_lap()` docstring ("a track-limits deletion is an official-validity ruling, not a telemetry-quality signal, so it must not affect `is_valid`"). Neither new check suppresses `INVALID_LAP_A`/`INVALID_LAP_B` — both can and should appear for the same lap when both conditions hold (§8 test E).

### 5. User-Visible Behavior

**Decision: no frontend rendering change.** Per §1's finding, there is currently no generic warning-rendering UI in this feature at all — not even for the two warning codes that have existed since M6. The only frontend consumer of `warnings` treats `different_circuit` as a boolean gate for an unrelated fetch, not as visible text. Adding a new generic warning-banner UI would be a UI feature addition — explicitly out of scope ("Do not redesign the lap-comparison UI") and beyond "fix `lap_comparison`'s exclusion-reason blindness," which is a backend/API-contract fix. Extending the same non-rendering status quo to the two new codes is consistent with current behavior, not a regression: today's `INVALID_LAP_A`/`INVALID_LAP_B` are already computed-but-unrendered, and this milestone does not change that for any code, old or new.

### 6. API / Model Impact

`WarningCode` is a `str, Enum` (`lap_comparison.py:56`) — adding new members is additive, not a breaking schema change. Three places must be updated to keep the type accurate (an inaccurate/incomplete type is "a schema that lies," per this codebase's own stated principle in `session_analytics.py:23`, applied here to the omission direction as much as the fabrication direction):

- `backend/app/models/lap_comparison.py` — add the 4 new `WarningCode` members.
- `frontend/src/api/client.ts:185` — widen `export type WarningCode = "invalid_lap_a" | "invalid_lap_b" | "different_circuit";` to include the 4 new string literals. Confirmed via search: nothing in the frontend does an exhaustive `switch` over `WarningCode` that would need a new case for compile-time exhaustiveness — the only usage is a single `===` equality check (`ComparisonPage.tsx:80`), which continues to type-check unchanged regardless of how many literals the union has.
- No change to `ComparisonWarning`/`LapComparisonResponse` shape (`code`/`detail` fields unchanged) — the new codes flow through the exact same fields the existing three already use.

`docs/api-model.md`'s `/laps/compare` section (`api-model.md:111-123`) documents only `DIFFERENT_CIRCUIT` explicitly today — it was never a complete enumeration of `WarningCode` (`INVALID_LAP_A`/`INVALID_LAP_B` aren't mentioned there either). Whether to add a short mention of the two new conditions is a Stage C judgment call under this project's established "docs updated if behavior/contracts changed" rule (the same call M40/M42 made for their own field additions) — not a firm Stage B requirement, and not documentation reconciliation (which stays out of scope per this milestone's non-goals).

### 7. Backward Compatibility

`_yellow_flag_reason()`/`_track_limits_reason()` (`filtering.py:63-89`) already explicitly handle `None` (`lap.track_status is None` → `None`; `lap.deleted` falsy/`None` → `None`) — this is existing, already-tested, unmodified logic. Every currently-stored real lap has `deleted`/`deleted_reason` = `None` (0/704, per M43 Stage A §5) and the large majority have `track_status` = `None` (pre-M36 data) or a populated-but-clear string. For all such laps, `classify_lap(lap).exclusion_reason` is `None`, so `collect_warnings()` appends nothing new — **byte-identical behavior to today for every currently-stored session.** Existing `INVALID_LAP_A`/`INVALID_LAP_B` logic is untouched (two pre-existing lines left as-is, not edited) — their behavior is provably unchanged since no character of that code changes.

### 8. Test Design

Using the existing `backend/tests/lap_comparison_fixtures.py` `lap(**overrides)` helper unchanged (its `defaults.update(overrides)` shape already accepts `track_status=`/`deleted=` as overrides with no fixture-file edit needed — `Lap`'s `track_status`/`deleted`/`deleted_reason` already default to `None` on the model itself) and extending `backend/tests/test_lap_comparison_validation.py`'s existing `test_collect_warnings_flags_each_inaccurate_lap_independently`-style pattern:

| Case | Setup | Expected `warnings` codes |
|---|---|---|
| A. Clear lap | both laps default (`is_accurate=True`, `track_status=None`, `deleted=None`) | `[]` — already covered by the existing `both_accurate` assertion, extended to confirm no exclusion code either |
| B. Yellow-flag lap A | `lap(track_status="2")`, other lap clear | `[YELLOW_FLAG_LAP_A]` |
| B'. Yellow-flag lap B | clear, `lap(track_status="2")` | `[YELLOW_FLAG_LAP_B]` (symmetric coverage, matching the existing A/B-symmetric pattern for `INVALID_LAP_A`/`B`) |
| C. Track-limits lap A | `lap(deleted=True)`, other clear | `[TRACK_LIMITS_LAP_A]` |
| C'. Track-limits lap B | clear, `lap(deleted=True)` | `[TRACK_LIMITS_LAP_B]` |
| D. Both conditions, same lap | `lap(track_status="2", deleted=True)` | `[TRACK_LIMITS_LAP_A]` only — proves M40 precedence is inherited, not `YELLOW_FLAG_LAP_A` too |
| E. Inaccurate + excluded, same lap | `lap(is_accurate=False, track_status="2")` | `[INVALID_LAP_A, YELLOW_FLAG_LAP_A]` — proves independence, neither suppresses the other |
| F. Old-style lap (all new fields absent) | identical to case A | `[]` — explicit backward-compatibility case, same assertion as A but framed as the compatibility proof |
| G. Existing warning conditions intact | the current 4 assertions in `test_collect_warnings_flags_each_inaccurate_lap_independently`, left unmodified/still passing | unchanged |
| H. End-to-end API | one new case in `backend/tests/test_laps_compare_route.py`, mirroring the existing `test_compare_laps_different_circuit_emits_warning_and_allows_comparison` pattern (`test_laps_compare_route.py:563`) — a fixture-backed session/lap with `track_status` or `deleted` set, asserting the code appears in `body["warnings"]` through the real route | new code present end-to-end |

No new test file, no new fixture-builder function, no new testing convention — every case above is expressible with the existing `lap(**overrides)` helper and the existing test files' existing patterns.

### 9. Full Call-Graph Safety

`filtering.py` is imported, never modified — `classify_lap`, `ExclusionReason`, `_yellow_flag_reason`, `_track_limits_reason`, `filter_valid_laps`, `filter_for_aggregate_stats` are all byte-identical after this change. None of the following files appear anywhere in this milestone's Stage C file list (§11), so none can be affected: `session_analytics/aggregation.py` (aggregate filtering), `tyre_performance/stint_eligibility.py` (trend eligibility), `DriverLapTable.tsx` (M36/M37 exclusion rendering), `pipeline/pitwall_pipeline/models.py`/`normalize.py` (M34/M35/M42), `backend/app/models/telemetry.py` (M36/M40 fields — read, not written, by this change). `laps_compare.py` itself needs no edit: it already calls `collect_warnings(lap_a_model, lap_b_model)` generically and appends whatever list comes back — the new warnings flow through that exact unmodified call site.

### 10. Performance

`classify_lap(lap)` is a pure function over fields already present on `Lap` objects `laps_compare.py` has already fetched via the existing `repository.list_laps()` call — no new Parquet read, no new FastF1 call, no new database query, no new repository method. Its cost is a single dict/`frozenset` membership check per lap (`_yellow_flag_reason`'s `any(code in _EXCLUDED_TRACK_STATUS_CODES for code in lap.track_status)` over a short string, typically 1-3 characters) plus one boolean check (`_track_limits_reason`) — negligible, and identical work `session_analytics` already performs once per lap for every lap in a session today. No meaningful per-comparison cost added.

### 11. Exact Stage C Scope

**Definitely modified:**
- `backend/app/services/lap_comparison/validation.py` — import `classify_lap`, extend `collect_warnings()`, update its docstring (the "no such data exists" claim must be corrected, not left stale).
- `backend/app/models/lap_comparison.py` — add 4 `WarningCode` members.
- `frontend/src/api/client.ts` — widen the `WarningCode` type union.
- `backend/tests/test_lap_comparison_validation.py` — extend with cases B/B'/C/C'/D/E/F above.
- `backend/tests/test_laps_compare_route.py` — one new end-to-end case (H).
- `docs/m43-design-review.md` — finalize with Stage C results.

**Conditionally modified** (Stage C judgment call, small mechanical addition only, not reconciliation):
- `docs/api-model.md` — possibly a one-sentence addition to the existing `/laps/compare` warnings paragraph, mirroring how `DIFFERENT_CIRCUIT` is already described there.

**Explicitly untouched:**
- `backend/app/services/session_analytics/filtering.py` and everything else under `session_analytics/` — imported only.
- `backend/app/services/tyre_performance/` (all files) — M41's fix stays exactly as shipped.
- `backend/app/models/telemetry.py` — `Lap.track_status`/`deleted`/`deleted_reason` already exist; no new field needed.
- `backend/app/models/session_analytics.py`.
- `backend/app/api/laps_compare.py` — no change needed (§9).
- `backend/tests/lap_comparison_fixtures.py` — `lap(**overrides)` already supports the needed overrides without modification.
- `frontend/src/features/lap-comparison/**` (all `.tsx`/`.module.css`) — no rendering change (§5).
- `pipeline/**` — no ingestion, normalization, or pipeline-model change; this is a pure backend-service/API-contract fix over already-persisted fields.
- `data/` — no real data touched.
- `docs/m9-design-review.md`, `docs/data-model.md` (no `Lap`/`Driver` field is added — nothing new to document there), `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md` (no reconciliation, per non-goals).
- `backfill_m38.py` and anything backfill-related.

### 12. Non-Goals (preserved)

No historical backfill; no ingestion; no Parquet rewrite; no PostgreSQL writes; no weather; no race-control timeline; no qualifying (M42) changes; no changes to `classify_lap()`/exclusion semantics themselves; no changes to aggregate eligibility outside `lap_comparison` (`session_analytics`, `tyre_performance` untouched); no UI redesign (no new warning-rendering component); no dependency changes; no documentation reconciliation (README/CHANGELOG/prd.md/success-metrics.md untouched — those remain M43's out-of-scope items per Stage A's own recommendation to defer that separately); no unrelated refactoring.

### 13. Open Decision — Resolved

**Option A vs Option B:** **Option B** — new lap-comparison-specific warning codes (`YELLOW_FLAG_LAP_A`/`_B`, `TRACK_LIMITS_LAP_A`/`_B`), derived from `exclusion_reason`'s existing vocabulary rather than invented independently, but packaged to match `lap_comparison`'s own established per-side-in-the-enum-name convention. Pure Option A (bare reuse of `"yellow_flag"`/`"track_limits"` as the entire warning code, no side discriminator) doesn't fit the shape `WarningCode` already committed to at M6 — `INVALID_LAP_A`/`INVALID_LAP_B` prove this model disambiguates side via the enum value itself, not a side-effect of the exclusion reason.

**Simultaneous yellow_flag + track_limits:** handled by construction, no new logic — `classify_lap()` already resolves to one value with track_limits winning (M40 precedence), so `lap_comparison` never sees or needs to arbitrate "both" for a single lap; both sides of the comparison (A and B) remain fully independent of each other.

### 14. Validation Plan

- Targeted: `backend/tests/test_lap_comparison_validation.py` (all cases, new and existing) and `backend/tests/test_laps_compare_route.py` (new case H plus full existing file).
- Full backend suite (`pytest`) — expect the same pre-existing-only failures Stage A already established as baseline (1 failed + 15 errors, all live-PostgreSQL-connection issues, unrelated to this change) and zero new failures.
- Frontend: no rendering change, so no new frontend test is required for behavior; run the full frontend suite anyway to confirm zero regression from the `client.ts` type widening (a type-only change; `tsc -b --noEmit` is the primary check here, not new `.test.tsx` cases).
- `mypy` (backend, full scope) — must stay clean; `WarningCode` additions are typed enum members, no `Any`.
- `ruff format --check` / `ruff check` (backend, full scope).
- `tsc -b --noEmit`, `eslint .`, `prettier --check .` (frontend, full scope) — confirms the widened `client.ts` union doesn't break any existing narrowing.
- `git diff --check`.
- Explicit backward-compatible-old-data fixture proof: case A/F above, run directly, confirming `warnings == []` for a lap with every M36/M40 field absent — the exact shape of every currently-stored real lap (0/704 per Stage A §5).
- Direct call-path verification: re-run `collect_warnings(lap_a, lap_b)` in isolation (already exercised by the pytest cases) plus one route-level `TestClient` call (case H) to confirm the field survives serialization end-to-end, not just at the service-function level.
- Any pre-existing environment failures (PostgreSQL-connection-only, per Stage A's established baseline) must be explicitly distinguished from M43 failures in the Stage C report, not hidden or reinterpreted.

### Risks

Low overall. The only real judgment calls were resolved above in §4/§13 (naming, ordering, no-precedence-needed) rather than left open for Stage C. The smallest residual risk is the conditional `docs/api-model.md` addition (§11) — Stage C should make a clean, minimal call there and document it as a scope note (mirroring M42's own §32 precedent) rather than treat it as a deviation.

### Deviations from Stage A

None material. Stage A recommended fixing `lap_comparison`'s exclusion-reason blindness; Stage B confirms the defect exactly as described, locates the precise fix point (`collect_warnings()`), and finds the fix smaller in scope than Stage A's candidate-level estimate anticipated (no `laps_compare.py` change needed, no `Lap`-model change needed, no frontend rendering change needed) — a narrower Stage C than Stage A projected, not a different one.

### Stage B Stop-Condition Verification

Re-verified by direct command at the end of Stage B:

- Only untracked/modified file: `docs/m43-design-review.md` — confirmed (`git status --porcelain --untracked-files=all`).
- No implementation source changed — confirmed (zero other files touched).
- Nothing staged — confirmed (`git diff --cached --stat` empty).
- Nothing committed, nothing pushed — no `git commit`/`git push` invoked.
- `data/` untouched — confirmed (`git diff -- data/` empty, `git status --short -- data/` empty).
- No ingestion, no backfill, no PostgreSQL writes, no Parquet writes — none performed.
- `docs/m9-design-review.md` untouched — confirmed (`git diff` empty).
- `HEAD == origin/main == d845c865a49dcf8a64701ce39f9c734bcecb305f` — confirmed.

**Stage B complete. Stopping here per instruction. Not proceeding to Stage C.**

---

## Stage A — Product / Architecture Audit

**Baseline at start:** `HEAD == origin/main == d845c865a49dcf8a64701ce39f9c734bcecb305f`, working tree clean, nothing staged, `docs/m9-design-review.md` zero diff, `docs/m43-design-review.md` did not exist, `data/` zero diff. Verified by direct `git` commands before any research began.

This audit was conducted read-only via four parallel investigations covering: (1) roadmap/documentation and capability enumeration, (2) M42 post-ship regression and correctness/hardening hunting, (3) data/ingestion, historical coverage, and deferred-candidate data-readiness, (4) architecture/tech-debt, dependency/security, and test/quality. Findings below are synthesized and cross-checked against source, not taken from milestone reports on trust.

---

### 1. Roadmap / Documentation State

- `docs/data-model.md` and `docs/api-model.md` **are accurate through M42** — both were correctly updated by M40's and M42's own Stage C work per this project's "docs updated if behavior/contracts changed" rule. `q1_seconds`/`q2_seconds`/`q3_seconds` and `deleted`/`deleted_reason` are both documented with correct semantics, sourcing, and no-backfill caveats.
- **Roadmap-level docs are stale since M39.** M39 reconciled documentation through M38; M40, M41, and M42 all shipped afterward with no reconciliation pass:
  - `README.md:32` — "Current milestone: M38 — ... — complete." Should read M42.
  - `README.md:34-74` — milestone table ends at M38; M39–M42 rows missing.
  - `README.md:194-196` — still reads "*(updated through M15 — weather and position/gap history are still unbuilt)*". **This is the exact stale claim M40's own Stage A flagged and explicitly deferred** ("flagged for a fast standalone fix or the next reconciliation pass," `docs/m40-design-review.md:26-27`). Three milestones later, still unfixed.
  - `CHANGELOG.md:9-12` — `[Unreleased]` still says "M38 is the most recently completed milestone." No entries exist for M39, M40, M41, or M42 at all.
  - `docs/prd.md` §3a milestone history table — last row is M38.
  - `docs/success-metrics.md` — same pattern, last touched by M39.
  - `docs/prd.md` §5 deferred-features table — no row for Q1/Q2/Q3 ever existed (it was never formally tracked as deferred), so M42 left no stale "deferred" entry to correct. "Gaps" and "Weather" rows remain accurate (still genuinely unbuilt).
- **Reconciliation-threshold assessment:** by milestone-count, this project's own history shows reconciliation triggered after gaps of 2–5 milestones (M20 after 3 with *no edits needed*, M23 after 2, M28 after 4, M33 after 4, M39 after 5). The current gap (M40/M41/M42 = 3 milestones, soon 4 counting M43) sits at the low-to-middle end of that historical range — real and growing, but not unambiguously over threshold on milestone-count alone. What *does* push it further is the README:194-196 item: that's not generic drift, it's a specific claim previously flagged and left unfixed for three milestones running.

### 2. Capability Audit

- **Backend:** 22 routes enumerated directly from `@router.get`/etc. decorators across all 11 routers registered in `main.py`. All 20 data routes (excluding `/health`) are documented in `docs/api-model.md`. No duplicate routes, no undocumented routes.
- **Frontend:** 16 `<Route>` entries in `App.tsx`, 16 page components under `features/*/`, exact 1:1 match. No orphaned page, no dead route.
- **M34–M42 chain**, verified against current source directly (not commit messages or prior design docs):
  - M34 classification, M35 `Lap.position`, M36 `track_status`/yellow_flag, M37 rendering — present, unchanged.
  - M38 `backfill_m38.py` — exists at expected path.
  - M40 track-limits — `filtering.py`'s `classify_lap()` still resolves `exclusion_reason = _track_limits_reason(lap) or _yellow_flag_reason(lap)`; precedence intact; `is_valid` still derived solely from `is_accurate`.
  - M41 — `stint_eligibility.py`'s `trend_eligible_positions()` still excludes on `classify_lap(...).exclusion_reason is None`; `valid_positions()` remains the pure `is_accurate` signal, unconflated.
  - M42 — `q1_seconds`/`q2_seconds`/`q3_seconds` confirmed present end-to-end across all 6 layers.
  - `ExclusionReason` triple-definition (`filtering.py`, `session_analytics.py`, `client.ts`) — all three consistent, no drift; this is the deliberate ADR-0009 anti-corruption pattern.
- **No regression found in any M34–M42 capability.**

### 3. M42 Post-Ship Regression Audit

Independently re-verified (not trusting M42's own design doc's self-report):

- `q1_seconds`/`q2_seconds`/`q3_seconds` present and consistent across pipeline model → `normalize_drivers()` → backend model → `parquet_repository.py` → `client.ts` → `DriverSelectPage.tsx`.
- Old-Parquet readability: `_driver_from_row` uses `.get(...)` for all three fields, no bracket access — nullable-safe.
- Round-trip/nullability: `_timedelta_to_seconds`/`_optional_float` reused unmodified; no fabrication, no defaulting to 0.
- Independent rendering: three separately `!= null`-gated JSX spans, not one shared gate.
- No Sprint-Qualifying special-casing added to `normalize.py`.
- No new endpoint/route/store: commit `d845c865a` touched exactly the 14 expected files.
- M34 fields (`classified_position`/`grid_position`/`status`/`points`) untouched by the diff.
- M35 (`Lap.position`) untouched — M42 never touched `Lap`.
- M36/M40 (`filtering.py`) untouched — not in the M42 file list; current logic independently re-read and confirmed correct.
- M41 (`trend_eligible_positions`) untouched and confirmed still correctly wired to both consumers (`orchestration.py`, `compound_aggregation.py`).
- No unrelated lap/driver analytics affected — M42's diff is `Driver`-model-only.

**No regressions found from M42.**

### 4. Data / Ingestion Findings

- FastF1 surface actually touched by the provider: only `session.results`, `session.laps`, and per-lap `.get_telemetry()`. No other session attribute is read anywhere.
- **`weather_data`**: zero references anywhere in `pipeline/` or `backend/` source. No dormant stub — the only hit is an unrelated docstring word in `tyre_performance/__init__.py:9` describing a deferred *concept*, not code.
- **`race_control_messages`**: zero references anywhere in current source, despite M40's and M42's Stage A audits having read real RCM data ad hoc for investigation purposes. Neither investigation left a reusable code path. No dormant stub exists.
- No TODO/FIXME/XXX markers anywhere in `pipeline/pitwall_pipeline`, `backend/app`, or `frontend/src`.
- Unused `SessionResults` columns confirmed directly from the installed FastF1 library source (`fastf1/core.py:3839` `_COLUMNS`): `Position` (session-results running order, distinct from `Lap.Position`), `Time` (race gap/total time), `Laps` (laps completed) — **none normalized or persisted anywhere**. These are candidate future fields but carry no current evidence of user demand.
- No case found of a field normalized but silently dropped before Parquet, among fields actually read.

### 5. Historical Coverage

Real `data/processed/` inventory (704 session directories):

| type | on-disk count |
|---|---|
| race | 142 |
| qualifying | 142 |
| sprint | 28 |
| sprint_qualifying | 22 |
| practice_1 | 141 |
| practice_2 | 118 |
| practice_3 | 111 |

M38's approved population (`EXPECTED_COUNTS_BY_TYPE`) = race+qualifying+sprint+sprint_qualifying = 334, matching on-disk exactly. Practice was explicitly out of M38's scope.

Real-data field coverage (actual Parquet columns read):

- `track_status`/`position` (M36/M35): race 142/142, qualifying 142/142, sprint_qualifying 22/22, **sprint 26/28** (2 short — unexplained, not chased further in this audit; flagged as an open loose end for whoever picks it up next), practice_1 correctly 0/141.
- `deleted`/`deleted_reason` (M40, track-limits): **0/704** — the column doesn't exist in any stored `laps.parquet`, across every session type including all 334 already-backfilled M38 sessions. M40 shipped with no backfill and the gap is total.
- `q1_seconds`/`q2_seconds`/`q3_seconds` (M42): **0/164** — zero of the 164 in-scope (qualifying + sprint_qualifying) sessions carry any value, since M38 predates M42 and M42 shipped with explicit no-backfill.

**Backfill justification:** both gaps are real, quantified, and total — not speculative. M40's is larger in absolute scope (704 vs. 164 sessions) and more consequential: it means every currently-stored lap has an unknown track-limits-exclusion status, defaulting silently to "not excluded" wherever `exclusion_reason` is read by `session_analytics`, `tyre_performance`, or (per §7 below) `lap_comparison`. Both gaps sit on an already-built, directly reusable backfill architecture (`backfill_m38.py`'s stage → verify → atomic-swap pattern) — this would be "extend the existing tool's target-field list," not new infrastructure. Genuinely justified for a future milestone; not attempted here (Stage A is read-only).

### 6. Deferred-Candidate Reassessment

| Candidate | Data/architecture readiness | New evidence since M42 |
|---|---|---|
| Q1/Q2/Q3 | Shipped by M42. | — |
| Weather | Zero dormant scaffolding; full-stack net-new (provider call, normalize fn, pipeline model, backend model/repo, API route, frontend consumer). | None. |
| Race-control timeline | Zero dormant scaffolding despite two prior ad hoc reads of real RCM data; full-stack net-new. | None. |
| Historical backfill (another pass) | High — `backfill_m38.py` pattern directly extensible; M42's target population (164) is a strict subset of the already-solved 334-session discovery logic; M40's would need the full 334 (or more). | Yes — both gaps newly quantified this audit (0/704, 0/164). |
| Lap-comparison warning/context | Existing infra already live (`laps_compare.py` + `lap_comparison` service + models) — extension, not new build. Whether it's *needed* is a correctness question (see §7). | Yes — confirmed defect, see §7. |
| Known technical debt | None found (zero TODO/FIXME/XXX repo-wide). | — |
| Dependency/security | See §9 — nothing actionable. | None. |
| Performance | See §11 — no fresh evidence. | None. |

No candidate is promoted here merely because it recurred in prior audits — each is assessed fresh against current evidence above.

### 7. Correctness Findings

No defect found in: `filtering.py` exclusion precedence/independence, `stint_eligibility.py` (M41's fix intact and correctly wired to both consumers), `session_analytics/aggregation.py` (correctly distinguishes `filter_for_aggregate_stats` vs `filter_valid_laps` per its own documented purpose), the `ExclusionReason` triple-definition (no drift).

**Defect found — `lap_comparison` never surfaces yellow-flag/track-limits exclusion, despite the data being available on the same `Lap` object it already returns.**

Evidence:

- `backend/app/models/telemetry.py:114,123-124` — `Lap.track_status` (M36) and `Lap.deleted`/`deleted_reason` (M40) are fields on the shared `Lap` model, which `LapComparisonResponse.lap_a`/`lap_b` (`backend/app/models/lap_comparison.py:92-93`) directly embeds and returns to the frontend.
- `backend/app/services/lap_comparison/validation.py:76-99` — `collect_warnings()` checks only `lap.is_accurate`. It never reads `track_status` or `deleted`.
- The function's own docstring (`validation.py:79-84`) claims `WarningCode` exists "for forward-compatibility" and that the function "never emits them — they are not fabricated from data that doesn't exist." **This premise is now false.** `WarningCode` (`lap_comparison.py:56-74`) has only `INVALID_LAP_A`, `INVALID_LAP_B`, `DIFFERENT_CIRCUIT`. The docstring was accurate when written (pre-M36); M36 and M40 made the underlying data exist, but neither milestone's design doc mentions `lap_comparison` at all — this is an unconsidered gap, not a deliberate deferral.
- No test covers this: no reference to `track_status`/`deleted`/`yellow_flag`/`track_limits` in `lap_comparison_fixtures.py` or `test_lap_comparison_validation.py`.

**Practical effect:** a user comparing two laps where one ran under yellow flag, safety car, VSC, red flag, or had its time deleted for a track-limits infringement gets **zero warning** that the comparison may be misleading — even though `session_analytics` (M36/M37) and `tyre_performance`/`stint_eligibility` (M40/M41) both correctly account for exactly this condition for their own consumers. This is the identical defect shape M41 fixed: data is fully computable via the existing `classify_lap()`, one sibling consumer was already fixed, another sibling consumer still silently ignores it. No other instance of this pattern was found among the remaining consumers checked (session_analytics aggregation, tyre_performance orchestration/compound_aggregation are all correctly wired).

### 8. Architecture / Tech-Debt

Using this project's own established rule-of-three threshold (2 independent instances accepted, 3+ a real trigger — precedent: `docs/m26-design-review.md:315-326`, `docs/m21-design-review.md:259`):

- `_optional_*` helper duplication: exactly 2 instances (pipeline, backend), stable, unchanged by M42. Within threshold.
- `ExclusionReason` triple-definition: 2 backend + 1 frontend, byte-identical values, deliberate ADR-0009 boundary. No drift.
- `_to_stint_pace` duplication: exactly 2 instances, the second explicitly documents mirroring the first. Within threshold.
- No TODO/FIXME/XXX markers anywhere.
- No oversized components (largest `.tsx` 275 lines, largest backend `.py` 332 lines — unremarkable).
- No N+1/N² gap: `parquet_repository.py`'s read pattern has an existing M18 test guarding read counts.
- No API-boundary violations found (no route returns a raw dict/row).
- No obvious accessibility regression in a spot check of `DriverSelectPage.tsx` (semantic headings, real anchor links).
- **New, minor finding:** CI pins Python 3.10 (via `.python-version`, respected by `astral-sh/setup-uv`) and both `pyproject.toml`s target 3.10, but both `pipeline/Dockerfile` and `backend/Dockerfile` use `FROM python:3.12-slim` — tests/lint/type-check run against 3.10, the production container ships 3.12. Real inconsistency, not previously flagged, but low-severity on its own (no evidence of an actual incompatibility) — not milestone-forcing by itself.
- Bundle size (`frontend/dist`, stale local build): ~896KB total, single chunk. No prior baseline exists to compare against — informational only, not a regression claim.

### 9. Dependency / Security

- `npm audit` (frontend): **0 vulnerabilities** at every severity level.
- Python deps (`uv pip list --outdated`, pipeline + backend): only minor/patch drift (e.g. `fastapi 0.140.0→0.141.1`, `starlette 1.3.1→1.6.0`). No indication of a known CVE from this listing.
- `pip-audit` is not installed in this sandbox — could not run a true CVE scan for Python deps, only staleness. Genuine tooling gap, not resolvable read-only without adding a dependency; not chased further per Stage A's read-only/no-dependency-change constraints.
- **No vulnerability or dependency finding is milestone-forcing.**

### 10. Test / Quality State

Freshly run, exact counts:

- Pipeline: 172 passed, 15 errors (all `psycopg.OperationalError` — no live PostgreSQL in sandbox; environment-only).
- Backend: 1 failed, 395 passed, 15 errors (failure is `test_pool_connects_to_postgres`; errors are `test_postgres_race_context_repository.py`; all same root cause). **Exactly matches the M42 Stage C-reported baseline — stable, no new failures.**
- Frontend: 572 passed across 86 files. Matches M42 baseline exactly.
- Static checks all clean: pipeline and backend `ruff format --check`/`ruff check`/`mypy` (full scope, not just recently-touched files); frontend `tsc -b --noEmit`/`eslint .`/`prettier --check .` (3 warnings are on gitignored `dist/` build artifacts only, not source).

**No real code failures anywhere.** All pre-existing failures/errors are environment-only and stable in count and nature versus the M42 baseline.

### 11. Performance

No fresh evidence surfaced anywhere in this audit that performance is decision-relevant: no test timeouts beyond the expected Postgres connection timeout, no N² pattern found, no bundle-size regression (no prior baseline exists to regress against). **Explicitly stating: no new performance evidence exists. Not manufacturing a performance investigation.**

---

### 12. Candidate Matrix

| Candidate | Category | Evidence strength | User value | Correctness impact | Complexity | Risk | Arch. readiness | Milestone size | Prior deferrals | New evidence since M42 | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Lap-comparison exclusion-reason surfacing** | Correctness defect | Strong — verified directly against source, concrete file:line, docstring's own claim now false | Medium-high — prevents a misleading comparison being presented as clean | High — same shape as M41's fixed defect | Low — extend `collect_warnings()`, add 1-2 `WarningCode` values, wire existing `Lap.track_status`/`deleted` fields already returned | Low — pure backend logic + response field, no data/schema change | High — infra fully exists | Small | None — newly found this audit | **Yes — see §14** |
| Historical backfill (M40 `deleted`/`deleted_reason`, and/or M42 `q1/q2/q3_seconds`) | Data completeness | Strong — quantified (0/704, 0/164) | Medium — makes M40/M42 features actually functional on real data | Medium — a *display*/exclusion gap on historical data, not a live-data bug | Medium-high — real Parquet writes, full M38-style safety machinery | Medium — touches real stored data, needs the same rigor as M38 | High — `backfill_m38.py` directly extensible | Medium-large | Flagged this audit as newly justified | Strong candidate for **M44**, not M43 — larger and riskier than the correctness fix, and Stage A is explicitly read-only/no-backfill |
| Documentation reconciliation (README/CHANGELOG/prd.md/success-metrics.md) | Documentation | Real but borderline — 3 milestones of drift, within but not clearly over this project's historical 2-5 milestone trigger range; one item (README:194-196) previously flagged and still unfixed | Low-medium — no functional impact, but a specifically-flagged stale claim persisting 3 milestones is a process signal | None | Low | Low | High | Small | Flagged by M40, unfixed since | Defer — gap not unambiguously over threshold; revisit at M44/M45 or when it grows further |
| Weather | Product feature | None new | Unknown/speculative — no demand evidence | None | High — full-stack net-new | Medium | None — zero dormant scaffolding despite prior ad hoc reads | Large | Repeatedly deferred across M39-M42 audits | No — no threshold crossed |
| Race-control timeline | Product feature | None new | Unknown/speculative | None | High — full-stack net-new | Medium | None | Large | Repeatedly deferred | No — no threshold crossed |
| CI/Docker Python version mismatch (3.10 vs 3.12) | Tech debt | Real, newly found | Low | Low — no demonstrated incompatibility | Low | Low | High | Tiny | New | Not milestone-sized alone; worth a fast fix bundled with something else, not a standalone M43 |
| Sprint `track_status`/`position` gap (26/28) | Data anomaly | Real but unexplained, not investigated further | Low | Unknown — needs investigation before it's even a confirmed defect | Unknown | Unknown | Unknown | Unknown | New, unresolved | Flag for future investigation, not actionable as-is |
| Do nothing / finalize | — | — | — | — | — | — | — | — | — | Not recommended — a genuine, well-scoped correctness defect exists |

### 13. Special Decision Questions

**A. What is the highest-value next milestone genuinely justified by evidence after M42?**
Fixing `lap_comparison`'s blindness to `exclusion_reason` (yellow-flag/track-limits). It is the only candidate that is simultaneously: a verified defect (not speculative), cheap and well-scoped, architecturally ready with zero new infrastructure, and directly analogous to two milestones (M40, M41) this project has already validated as correct calls.

**B. Has the project crossed from active product development into hardening/finalization?**
Largely yes for *new user-facing capability* — weather and race-control both remain evidence-free after four consecutive audits (M39-M42) that considered them. But the project hasn't reached pure finalization: real correctness gaps (§7) and real data-completeness gaps (§5) remain. The pattern is now "harden and complete what's shipped" rather than "add new capability."

**C. Has the Q1/Q2/Q3 feature revealed any new correctness or data-quality issue?**
Not a code defect in Q1/Q2/Q3 itself — M42's regression audit (§3) found none. It did surface, via the historical audit, that the feature is currently 0% populated on any stored data (§5) — a data-completeness gap, not a code-correctness one.

**D. Has weather or race-control accumulated enough evidence to become justified?**
No. Zero dormant scaffolding for either despite two prior milestones (M40, M42) reading real `race_control_messages`/weather-adjacent data ad hoc during audits — neither investigation produced a reusable code path, and no new evidence appeared this audit either.

**E. Has historical backfill reached a point where another dedicated pass is warranted?**
Yes, genuinely — both M40's (0/704) and M42's (0/164) gaps are total and quantified, sitting on directly reusable infrastructure. Recommended as the next milestone after this one (M44), not M43: it's a larger, higher-risk (real-data-write) milestone than the correctness fix, and this Stage A is explicitly scoped read-only/no-backfill.

**F. Are there any newly discovered correctness defects comparable in strength to M40/M41?**
Yes — `lap_comparison`'s exclusion-reason blindness (§7), the recommended M43 candidate.

**G. Is documentation reconciliation due again?**
Borderline, not clearly over this project's own historical threshold yet (3 milestones vs. a 2-5 milestone historical trigger range, and M20 crossed 3 with zero edits needed). The specific README:194-196 stale claim is a stronger individual signal than the aggregate gap. Recommend deferring formal reconciliation to M44/M45, but flagging README:194-196 as worth a fast standalone fix whenever convenient — not manufacturing a full reconciliation milestone for it alone now.

**H. What is the smallest coherent milestone with meaningful value that does not manufacture scope?**
The `lap_comparison` exclusion-reason fix — small, real, evidence-backed, and doesn't touch data, schema, or unrelated systems.

### 14. Recommendation

**Recommend M43 = fix `lap_comparison`'s exclusion-reason blindness.**

This is a correctness defect, and it outranks both product-feature candidates (weather, race-control — no evidence, full-stack net-new, repeatedly deferred with no change in status) and the larger data-completeness candidate (historical backfill — genuinely justified, but bigger, real-data-touching, and better sized as its own milestone rather than folded in here). It follows the same evidence pattern that correctly identified M40 and M41 as the right calls at the time: a field the project already computes and already trusts (`exclusion_reason`, via `classify_lap()`) is silently unavailable to one specific consumer that has every reason to want it, while sibling consumers already handle it correctly. The gap was verified directly against source, not inferred from a stale report, and the fix requires no new data, no new endpoint, and no schema change.

**Candidate-level scope** (for Stage B to resolve into exact detail — not designed here):

- **Likely files:** `backend/app/services/lap_comparison/validation.py` (extend `collect_warnings()`), `backend/app/models/lap_comparison.py` (add `WarningCode` value(s) for yellow-flag/track-limits exclusion — exact code name(s), and whether `lap_a`/`lap_b` exclusion is reported as one merged code or two, is a Stage B decision), possibly `frontend/src/features/*/` wherever `LapComparisonResponse.warnings` is rendered (needs Stage B verification of whether the frontend already generically renders all warning codes, or needs an explicit new case).
- **Likely tests:** `backend/tests/lap_comparison_fixtures.py` extension (a `lap(**overrides)` case with `track_status` or `deleted` set), new/extended cases in `test_lap_comparison_validation.py`, and a frontend test if a new rendering case is needed.
- **API/data implications:** additive `WarningCode` enum value(s) only — no new field, no schema change, no Parquet impact, no backfill involved (uses the same `exclusion_reason`/`classify_lap()` logic M36/M40/M41 already rely on).
- **Explicit non-goals:** no change to `filtering.py`'s exclusion computation itself (M36/M40 logic is correct and untouched); no change to `session_analytics` or `tyre_performance`/`stint_eligibility` (already correct); no backfill of any kind; no new endpoint or route; no weather/race-control functionality; no documentation reconciliation beyond what this fix's own contract change requires (per this project's established pattern of updating only the docs whose contract actually changed).
- **Validation strategy:** targeted pytest for the new warning-code path plus full backend suite for regression; frontend test if a rendering change is needed; static checks (ruff/mypy/tsc/eslint/prettier) per the established per-milestone pattern; explicit backward-compatibility check that laps without `track_status`/`deleted` set (the overwhelming majority of currently-stored data, per §5) produce no spurious warning.
- **Major risks:** low overall. The main judgment call for Stage B is precedence/wording when both `track_status` and `deleted` apply to the same lap (mirror M40's yellow-flag-vs-track-limits precedence decision, or treat as independent warnings — a real decision to resolve in Stage B, not guessed here) and whether comparing to a lap with no exclusion data at all (pre-M40/M42 sessions, 0/704 currently) should be silently clean (matches current behavior) or is itself worth flagging as "exclusion status unknown" (a scope question, likely out of bounds per "don't fabricate from data that doesn't exist" — but worth Stage B explicitly deciding rather than defaulting).

---

### Stop-Condition Verification

Re-verified after completing the audit and before stopping:

- Only new/untracked file: `docs/m43-design-review.md` — confirmed (`git status --porcelain --untracked-files=all`).
- No source files modified — confirmed.
- Nothing staged — confirmed (`git diff --cached --stat` empty).
- Nothing committed, nothing pushed — no `git commit`/`git push` invoked at any point in this stage.
- `data/` untouched — confirmed (`git diff -- data/` empty, `git status --short -- data/` empty).
- No ingestion, no backfill, no PostgreSQL writes, no real Parquet writes — none performed; all data reads in §5 were read-only `pd.read_parquet`/file-listing operations.
- `docs/m9-design-review.md` untouched — confirmed (`git diff` empty).
- `HEAD == origin/main == d845c865a49dcf8a64701ce39f9c734bcecb305f` — confirmed at both start and end of this stage.

**Stage A complete. Stopping here per instruction. Not proceeding to Stage B.**
