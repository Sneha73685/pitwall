# PitWall — M36 Design Review: Yellow-Flag / Track-Status Lap Exclusion

**Status:** Complete — Stage C implemented and validated; awaiting explicit approval for commit/push.
**Baseline:** M35 complete (`f6be5df23297f855d2a1e0068b44119f867d275b`), lap-by-lap position chart shipped.

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `f6be5df23297f855d2a1e0068b44119f867d275b`, re-verified at the start of this stage.
- `git status --short --branch`: clean, tracking `origin/main`, nothing else.
- `git diff --cached --stat`: empty.
- `docs/m36-design-review.md` did not exist before this file was written.
- No source, test, dependency, data, or other documentation file has been modified. Every command run this stage was read-only: `grep`/`find`/`sed`, local no-network `fastf1` library introspection (`inspect.getsource`, docstring reads via `help()`), and one local, no-write `pd.read_parquet()` read of an already-existing real Parquet file.

## 2. FastF1 `TrackStatus` Semantics — Verified Directly From Source

**Status codes** (`fastf1.api.track_status_data`'s own docstring, fetched via `help()` against the installed package, not assumed):

| Code | Meaning |
|---|---|
| `'1'` | Track clear (session start, or end of another status) |
| `'2'` | Yellow flag |
| `'3'` | **Undocumented by FastF1 itself** — its own docstring says *"??? Never seen so far, does not exist?"* |
| `'4'` | Safety Car |
| `'5'` | Red Flag |
| `'6'` | Virtual Safety Car deployed |
| `'7'` | Virtual Safety Car ending (transitional; the actual all-clear is still marked by `'1'`) |

**Combined/multi-code values genuinely exist and are the norm, not an edge case.** Read `Session._add_track_status_to_laps()` directly (`fastf1/core.py:1999`): each lap's `TrackStatus` string is *built by concatenation* — every distinct status code active at any point during that lap's time window is appended once (`_applicator`: `new_status not in current_status → current_status + new_status`). A lap that starts under yellow and finishes after the all-clear gets `TrackStatus = "21"`; a lap spanning yellow→Safety Car→clear gets `"241"`. **The correct check is therefore membership within the string, not equality against it.**

**Exact mapping decision — conservative, reasoned per code:**

| Code | Excluded (`"yellow_flag"`)? | Reasoning |
|---|---|---|
| `'1'` | No | Baseline normal-racing status |
| `'2'` | **Yes** | Directly named by the exclusion reason itself |
| `'3'` | **No** | FastF1's own maintainers document this as never-observed/unknown. Excluding on an undefined code would be guessing, not being conservative — this feature should only exclude laps we're confident were non-representative, and an unknown code gives no such confidence |
| `'4'` | **Yes** | Safety Car pace is dramatically non-representative of racing pace |
| `'5'` | **Yes** | A red-flag-affected lap (session stopped) is not a genuine timed racing lap |
| `'6'` | **Yes** | Virtual Safety Car materially reduces pace, same category as `'2'`/`'4'` |
| `'7'` | **Yes** | Per FastF1's own docstring, cars are still under VSC-equivalent restriction until `'1'` marks the actual end — `'7'` alone does not mean clear |

`EXCLUDED_TRACK_STATUS_CODES = frozenset({"2", "4", "5", "6", "7"})`. Check: `any(code in EXCLUDED_TRACK_STATUS_CODES for code in lap.track_status)` — correctly handles every combined-string case by construction (e.g. `"21"` → contains `"2"` → excluded; `"31"` → neither `"3"` nor `"1"` is in the excluded set → not excluded).

**Empty-string case, found and handled by construction, not by special-casing**: if a session has zero track-status events at all, `_add_track_status_to_laps` leaves every lap's `TrackStatus` as `""` (the loop's initial value, never touched). `any(code in EXCLUDED for code in "")` is `False` for an empty string — correctly resolves to "not excluded" with no extra code needed.

**No session-type restriction exists for `TrackStatus`, unlike `Position`.** `_add_track_status_to_laps` is called unconditionally for every session (`core.py:1655`, immediately after the `Position`-computation block that *was* gated by `_RACE_LIKE_SESSIONS` — `TrackStatus` is not inside that gate). Flags/Safety Cars/red flags can occur in Practice and Qualifying too. **No session-type branching is needed anywhere in this design.**

## 3. Existing Filtering Flow — Read in Full, Not Assumed

`backend/app/services/session_analytics/filtering.py` (current, unchanged since M8):
```python
ExclusionReason = Literal["yellow_flag"]

def _yellow_flag_reason(lap: Lap) -> ExclusionReason | None:
    """No-op today: no track-status field exists on `Lap` to check (Phase 0
    finding, Q3). Kept as its own function, not inlined, so the eventual
    real check has one obvious place to land without a caller-side change.
    """
    del lap  # unused until track-status data exists
    return None

def classify_lap(lap: Lap) -> LapValidity:
    return LapValidity(is_valid=lap.is_accurate, exclusion_reason=_yellow_flag_reason(lap))

def filter_valid_laps(laps: list[Lap]) -> list[Lap]:
    return [lap for lap in laps if classify_lap(lap).is_valid]

def filter_for_aggregate_stats(laps: list[Lap]) -> list[Lap]:
    return [
        lap for lap in laps
        if (validity := classify_lap(lap)).is_valid and validity.exclusion_reason is None
    ]
```

**Precedence, confirmed structurally, not designed anew**: `is_valid` (from `is_accurate`) and `exclusion_reason` (from track status) are computed **independently** inside `classify_lap` and combined with `and` only inside `filter_for_aggregate_stats`. There is no "pick one reason" precedence system to preserve or break — a lap can be both `is_valid=False` and `exclusion_reason="yellow_flag"` simultaneously, exactly as the existing structure already allows, and this milestone changes nothing about that structure. **Only one function needs a real implementation: `_yellow_flag_reason`.** `classify_lap`, `filter_valid_laps`, `filter_for_aggregate_stats` all stay byte-for-byte unchanged.

**Real, intentional behavior change once `_yellow_flag_reason` stops being a no-op**: `filter_valid_laps` (and `valid_lap_count`) stays unchanged by design (`filtering.py`'s own docstring: *"a yellow-flag-affected lap is still 'valid' in this sense"*) — only `filter_for_aggregate_stats`'s population shrinks, for any **newly-ingested** session containing a yellow/SC/VSC/red-flag period. `best_lap_ms`/`median_lap_ms`/`theoretical_best_lap_ms`/`consistency_ms`/`consistency_cv`/`outlier_lap_count` will change for such sessions, for the first time — this is the feature working as designed, not a regression, and does not affect any of the 704 existing sessions (§7).

## 4. Data / Model Path

**Pipeline** (`pipeline/pitwall_pipeline/models.py`), `Lap` gains:
```python
track_status: str | None = None
```
Same additive/nullable shape as `compound`/`position`.

**`normalize_laps()`** gains one line:
```python
track_status=_optional_str(row.get("TrackStatus")),
```
using the pipeline's existing `_optional_str` (no new helper needed — unlike `position`, which needed `_optional_int`, `track_status` is a plain string). `.get()`, not bracket access, matching the established `compound`/`position` precedent for a column a hand-built fixture might omit.

**Backend** (`backend/app/models/telemetry.py`), identical addition on the single shared `Lap` model. **`_lap_from_row()`** gains: `track_status=_optional_str(row.get("track_status"))`, reusing the already-existing `_optional_str` helper — no new backend helper needed either.

**API/frontend exposure — decided, not deferred**: `track_status` **will** appear in `Lap` API responses (`GET /sessions/{id}/laps`, `/laps/compare`, etc.), because there is only one `Lap` model in this backend — the same Pydantic class is both the direct route-response model and the type `filtering.py`'s `classify_lap`/`_yellow_flag_reason` operate on (confirmed by reading `filtering.py`'s own import: `from app.models.telemetry import Lap`). Hiding it would require inventing a second, internal-only `Lap` shape — a materially larger architectural change this milestone should not make, and inconsistent with how `compound`/`position` (also raw FastF1-sourced facts) are already exposed on the same model without hesitation. `frontend/src/api/client.ts`'s `Lap` interface is mirrored the same way (`track_status?: string | null`, matching `compound`/`position`'s established optional+nullable rationale) **purely for type-contract accuracy — no frontend page reads this field directly**, since the derived `exclusion_reason` signal is what any consumer actually needs (§5).

**Backward compatibility**: identical mechanism to `compound`/`position` — `.get()` on an absent column returns `None`, `pd.isna(None)` is `True`, `_optional_str`/`_optional_int` return `None`. Proven, not assumed, by the same class of direct fixture test M34/M35 used (§8).

## 5. Existing Frontend Contract — No UI Change Needed

Traced every use of `exclusion_reason` in `frontend/src`:
- `frontend/src/api/client.ts:241` — `export type ExclusionReason = "yellow_flag";`, already correctly typed.
- `frontend/src/features/session-analytics/components/DriverLapTable.tsx:48` — **already renders it**: `({lap.exclusion_reason ?? "excluded"})`, conditionally shown whenever a lap is excluded.

**No frontend file needs any change beyond the type-accuracy mirror in `api/client.ts` (§4).** `DriverLapTable.tsx` has been correctly rendering this field since M8; it has simply never had real data to show. This is the direct confirmation of the Stage A finding — the UI half of this feature already exists and is already correct.

## 6. Existing Real-Data Inspection

Read (not wrote) `data/processed/2023/bahrain_grand_prix/race/laps.parquet`: columns are exactly `['session_id', 'driver_id', 'lap_number', 'lap_time_seconds', 'sector_1_seconds', 'sector_2_seconds', 'sector_3_seconds', 'is_personal_best', 'is_accurate', 'compound']` — no `position` (confirming this specific session predates M35's ingest state, consistent with Option B) and, as expected, no `track_status`. Confirms the premise for §7.

## 7. Backfill — Option B Retained, Quantified

**No historical backfill in M36.** The 704 existing sessions keep exactly their current Parquet schema; `.get()`-based deserialization makes them fully valid and readable with `track_status: None` for every lap, which `_yellow_flag_reason` correctly resolves to "not excluded" — identical behavior to today, for every existing session.

**Quantified consequence, more precisely than "704 sessions are missing something"**: unlike M34/M35's fields (which only ever mattered for the 170 Race/Sprint sessions), **`track_status` is not session-type-restricted (§2)** — a yellow flag or Safety Car can occur in any of the 704 sessions' worth of data. So the *scope* of sessions that could theoretically benefit is the full 704, not a subset — but the *practical* per-session impact is naturally small and variable (most laps in most sessions are green-flag; only sessions with an actual flag/SC/VSC/red-flag incident are affected at all, and only for the specific laps during that incident). This is a quieter, more diffuse gap than M34/M35's all-or-nothing chart/badge visibility — pace/consistency statistics for existing sessions are silently *slightly* less accurate than they will be for newly-ingested ones, rather than a whole feature being invisible.

**This is the third consecutive milestone (M34, M35, now M36) adding a field the 704 existing sessions won't have.** Named again, not decided: the case for a deliberately-scoped future backfill milestone (likely targeting the ~170 Race/Sprint sessions specifically, where M34/M35's fields matter, and incidentally picking up `track_status` for those same sessions along the way) continues to strengthen with each cycle. Not scheduled here.

## 8. Test Design — Minimum Necessary, Each Justified

**Pipeline** (`pipeline/tests/`):
1. `test_normalize_laps_maps_track_status` — asserts a real value (including a combined-code case, e.g. `"21"`) extracts correctly. Uses `build_laps_df()` extended with a safe, non-excluding `"TrackStatus": "1"` default (mirroring exactly how M35 added real `Position` values to this same shared fixture without disturbing any other test), with the combined-code assertion via an inline mutated copy (matching `test_normalize_laps_handles_missing_lap_time`'s own existing inline-mutation pattern) rather than a new fixture function.
2. `test_normalize_laps_handles_missing_track_status_column` — a DataFrame lacking the `TrackStatus` column entirely → `None`, not an error. (Unlike `Position`, `TrackStatus` has no real-world "populated DataFrame but NaN for this session type" case to test — §2 confirmed it is never session-type-gated — so no `build_practice_laps_df()`-equivalent fixture is needed here; the only genuine "missing" case is column-absent, exactly `.get()`'s own defensive purpose.)

**Backend** (`backend/tests/`):
3. Extend the existing M35 positive-case test (`test_list_laps_maps_position_when_present` → renamed to reflect both fields it now proves, e.g. `test_list_laps_maps_position_and_track_status_when_present`) with one more column/assertion — matching M34's own precedent of bundling multiple new fields into one positive-case test rather than multiplying near-duplicate tests.
4. **No new backward-compatibility Parquet test** — the existing, deliberately untouched shared fixture (`session_cache_dir`, no `track_status` column) already proves this for free, the same reasoning M34/M35 both used.
5. `backend/tests/test_session_analytics_filtering.py` — the core of this milestone's test surface:
   - **Renamed, bodies unchanged**: `test_classify_lap_exclusion_reason_is_always_none_today` → `test_classify_lap_exclusion_reason_is_none_without_track_status_data`; `test_filter_for_aggregate_stats_matches_filter_valid_laps_today` → `...without_track_status_data`. Their assertions remain literally true after this change (neither test's fixture ever sets `track_status`), but their docstrings currently assert *"no track-status data exists anywhere in the schema"* — no longer accurate — and must be corrected, not left to quietly mislead a future reader. This is a required correctness edit, not a rename for its own sake.
   - **New**: `test_classify_lap_flags_excluded_track_status_codes` — one test, asserts `"2"`, `"4"`, `"5"`, `"6"`, `"7"`, and a combined case (`"241"`) all resolve to `"yellow_flag"`.
   - **New**: `test_classify_lap_does_not_flag_clear_or_unknown_track_status` — one test, asserts `"1"`, `"3"`, a combined non-excluded case (`"31"`), and `""` (the empty-string edge case, §2) all resolve to `None`.
   - **New**: `test_filter_for_aggregate_stats_excludes_yellow_flagged_laps_while_filter_valid_laps_keeps_them` — the single most important new test: a lap with `is_accurate=True, track_status="4"` must appear in `filter_valid_laps`'s output but **not** in `filter_for_aggregate_stats`'s — directly proving §3's precedence/independence claim with real assertions, not just by code inspection.
   - **New**: `test_classify_lap_exclusion_reason_is_independent_of_is_accurate` — a lap that is both `is_accurate=False` and `track_status="4"` must show `is_valid=False` **and** `exclusion_reason="yellow_flag"` simultaneously — proving no hidden precedence override was introduced.
6. `backend/tests/test_session_analytics_route.py` — **one new test**, with its own small, dedicated fixture session (matching this file's own established precedent of not extending the shared `_write_session_analytics_fixture` for a case its existing assertions don't expect — the module's own docstring already states this project's reasoning for that choice), proving `GET /sessions/{id}/analytics/drivers/{driver}/laps` returns `exclusion_reason: "yellow_flag"` for a track-status-affected lap through a real HTTP round-trip, not just at the unit level — closing the exact gap the same file's own pre-existing docstring named as untestable before M36.

**Frontend**: no new test. `DriverLapTable.test.tsx` (if it exists) already exercises the existing, unchanged rendering logic; the type mirror in `api/client.ts` needs no test of its own (a type-only addition, no runtime behavior).

## 9. Documentation

`docs/data-model.md` and `docs/api-model.md`: each `Lap` field-list line gains `track_status`, mirroring exactly the `position` addition's phrasing and placement — a factual schema-accuracy edit the change itself creates an obligation for, not the M33-style historical reconciliation this milestone's non-goals correctly exclude. **Not modified in Stage B** (per instruction); planned for Stage C only.

`docs/m36-design-review.md` (this file) is the only file created in Stage B, consistent with the established M34/M35 workflow.

## 10. Validation Plan (Stage C)

1. `uv run pytest` (pipeline) — expect current baseline (151) + 2 new.
2. `uv run mypy .` / `ruff check .` / `ruff format --check .` (pipeline) — must stay clean.
3. `uv run pytest` (backend) — expect current baseline (390) + net new from §8 (1 extended existing test, 2 renamed-unchanged, 4 new `filtering.py` tests, 1 new route test = 5 net-new test functions).
4. `uv run mypy .` / `ruff check .` / `ruff format --check .` (backend) — must stay clean.
5. `npx vitest run` (frontend) — expect current baseline (564), unchanged count (no new frontend test, §8).
6. `npx tsc -b --noEmit` — must stay clean.
7. `npx eslint .` / `npx prettier --check .` — must stay clean.
8. `git diff --check`.
9. Targeted: a direct fixture-based Parquet-compatibility proof (temp directory, no real data) that an old-style `laps.parquet` (no `track_status` column) loads via `list_laps()` with `track_status: None`.
10. Targeted: direct introspection confirming `_yellow_flag_reason`'s only behavior change is in the code paths described here — `classify_lap`/`filter_valid_laps`/`filter_for_aggregate_stats` themselves remain byte-identical (verifiable via `git diff` showing zero hunks in those three functions).

**No browser testing is claimed** — no browser-automation tool is available in this environment (unchanged since M31/M35's own confirmation of this).

## 11. Risk Assessment

- **Combined-code handling** is the single highest-risk detail in this design — mitigated by deriving the check directly from `_add_track_status_to_laps`'s actual concatenation algorithm (§2), not assumed, and by a dedicated test for a combined-code case.
- **Whether SC/VSC/red-flag should really map to the existing single `"yellow_flag"` enum value**: yes, deliberately — the Stage B brief explicitly scoped this to the *existing* `ExclusionReason` contract, not a redesign; introducing separate enum values (`"safety_car"`, `"red_flag"`, etc.) would be new API surface this milestone does not need and was not asked to add. All five excluded codes share the same practical consequence (non-representative pace), which is exactly what the single existing value already means.
- **Practice/Qualifying behavior**: no special-casing needed or added (§2) — a real risk avoided by verifying `_add_track_status_to_laps` is unconditional, rather than assuming it mirrors `Position`'s session-type gate.
- **Old Parquet compatibility**: identical, already-proven mechanism to `compound`/`position` (§4/§10).
- **Accidentally exposing unnecessary raw API data**: considered directly (§4) and accepted deliberately, not accidentally — the alternative (hiding the field) would require a larger, inconsistent architectural change for no concrete benefit, since `exclusion_reason` is already the intended consumer-facing signal and no frontend page needs `track_status` itself.
- **Rollback**: trivial — every file is a small additive field change or a corrected test; no data, dependency, or schema-migration risk.

## 12. Scope Boundary

M36 is exactly: `TrackStatus` → `Lap.track_status` → the existing `_yellow_flag_reason`/`ExclusionReason` path, end to end.

**Explicit non-goals**: weather; race-control message timeline; `Q1`/`Q2`/`Q3`; any change to the M35 position chart; any historical backfill; any dependency upgrade; any M33-style documentation reconciliation beyond the two schema-accuracy lines (§9); any unrelated refactor or debt cleanup; any new frontend UI capability (§5 — none needed).

## 13. Stage C — Actual Implementation

**Exact scope, matching §8's plan with one honest addition:**
- `pipeline/pitwall_pipeline/models.py` — `Lap.track_status`
- `pipeline/pitwall_pipeline/normalize.py` — `normalize_laps()`
- `pipeline/tests/fixtures.py` — `build_laps_df()` gains a safe `TrackStatus: "1"` default
- `pipeline/tests/test_normalize.py` — 2 new tests
- `backend/app/models/telemetry.py` — API `Lap.track_status`
- `backend/app/repositories/parquet_repository.py` — `_lap_from_row()`
- `backend/app/services/session_analytics/filtering.py` — `_yellow_flag_reason()` implemented; `classify_lap`/`filter_for_aggregate_stats` docstrings corrected for accuracy (their executable code is untouched — confirmed by direct `git diff`, §15)
- `backend/tests/test_parquet_repository.py` — extended the existing M35 positive-case test to also cover `track_status`
- `backend/tests/test_session_analytics_filtering.py` — 2 tests renamed for accuracy (bodies unchanged) + 4 new
- `backend/tests/test_session_analytics_route.py` — 1 new test with its own dedicated fixture, proving the real HTTP response now returns `exclusion_reason: "yellow_flag"`; the module's own docstring (which explicitly documented this exact gap as untested) corrected to say so
- `frontend/src/api/client.ts` — `Lap.track_status`, type-only, no UI file touched
- `docs/data-model.md`, `docs/api-model.md` — `Lap` field-list lines extended

**One honest addition beyond §8's literal list**: the module docstring at the top of `test_session_analytics_route.py` explicitly named the yellow-flag case as "not covered" — since M36 closes exactly that gap, leaving that sentence in place would have been a known-false claim in the file I was already editing. Corrected it in the same edit, matching the same accuracy standard already applied to the two renamed `filtering.py` tests.

## 14. Test Results

- Pipeline: `pytest` — **153 passed** (151 baseline + 2 new).
- Backend: `pytest` — **395 passed** (390 baseline + 5 net new: 4 in `test_session_analytics_filtering.py`, 1 in `test_session_analytics_route.py`; the extended Parquet-repository test replaced its M35 predecessor 1-for-1, no net change there).
- Frontend: `vitest run` — **564 passed**, unchanged from baseline exactly as designed (no new frontend test).

## 15. Static Checks and Targeted Verification

- Pipeline: `mypy .` / `ruff check .` / `ruff format --check .` — clean.
- Backend: `mypy .` / `ruff check .` / `ruff format --check .` — clean (one `ruff format` pass was needed on the new route test, applied and re-verified clean).
- Frontend: `tsc -b --noEmit` / `eslint .` / `prettier --check` — clean.
- `git diff --check` — clean.
- **Direct end-to-end proof, not assumed**: a temp-directory `laps.parquet` without a `track_status` column loads via `list_laps()` with `track_status: None`, and `classify_lap()` on that loaded `Lap` correctly returns `exclusion_reason: None`.
- **Direct `git diff` confirmation**: only `_yellow_flag_reason`'s body changed; `classify_lap`'s and `filter_for_aggregate_stats`'s executable `return` statements are byte-identical to before — only their docstrings changed. `filter_valid_laps` has zero diff at all.
- **Real data confirmed untouched**: read (not wrote) `data/processed/2023/bahrain_grand_prix/race/laps.parquet` — still no `position` or `track_status` column.
- **No backfill/ingestion ran**: PostgreSQL counts re-checked, unchanged (704 sessions).
- `git status`/`git diff --name-only`: exactly the 13 files listed in §13, plus this design document — nothing else.

## 16. Deviations from Plan

One, already covered in §13: the `test_session_analytics_route.py` module docstring correction, made for the same accuracy reasoning already planned for the two renamed `filtering.py` tests, not previously named as its own line item in §8 but squarely within the same category of edit.

---

**STOP — Stage C complete. Awaiting explicit approval before `git add`/`commit`/`push`.**
