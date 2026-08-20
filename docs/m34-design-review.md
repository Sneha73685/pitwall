# PitWall — M34 Design Review: Session Results / Race Classification

**Status:** Complete — Stage C implemented and validated; awaiting explicit approval for commit/push.
**Baseline:** M33 complete (`2a8a50b68451be388f72026b88096918f3687a43`), documentation reconciled through M32.

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `2a8a50b68451be388f72026b88096918f3687a43`, re-verified at the start of this stage.
- `git status --short --branch`: clean, tracking `origin/main`, nothing else.
- `git diff --cached --stat`: empty.
- `docs/m34-design-review.md` did not exist before this file was written.
- No source, test, dependency, data, or documentation file has been modified. Every command run this stage was read-only: `grep`/`find`/`sed`, `git show` (none needed this stage beyond baseline), and local, no-write Python introspection of the already-installed `fastf1` package (`inspect.getsource`, docstring reads) plus one local `du`/`find` pass over the existing, already-downloaded `data/fastf1_cache/` directory. No FastF1 session was loaded live; no network call was made; no Parquet or Postgres write occurred.

## 2. Exact FastF1 Result Fields (verified against the installed library, not documentation memory)

`fastf1.core.SessionResults._COLUMNS` (read directly via `inspect.getsource`):

| Column | Type | Semantics (from the library's own docstring) |
|---|---|---|
| `DriverNumber`, `Abbreviation`, `FullName`, `FirstName`, `LastName`, `TeamName`, ... | `str` | Already consumed by `normalize_drivers()` today — unaffected by this milestone |
| `Position` | `float64` | Finishing position; accounts for post-race penalties/DSQs; populated only for Race/Qualifying/Sprint-family sessions |
| `ClassifiedPosition` | `str` | The official classification: an integer-valued string, or one of `R`/`D`/`E`/`W`/`F`/`N` for retired/disqualified/excluded/withdrawn/failed-to-qualify/not-classified |
| `GridPosition` | `float64` | Starting grid position; populated only for Race/Sprint-family sessions |
| `Q1`/`Q2`/`Q3` | `timedelta64[ns]` | Best qualifying-segment times; populated only for Qualifying/Sprint-Shootout |
| `Time` | `timedelta64[ns]` | "Total race time"; populated only for Race/Sprint-family and only for drivers not more than one lap behind — semantics for non-winners (absolute vs. gap) are not unambiguous from the docstring alone |
| `Status` | `str` | Finish status: `"Finished"`, `"+ 1 Lap"`, `"Crash"`, `"Gearbox"`, etc. |
| `Points` | `float64` | Points scored (fractional historically possible — half-points races) |
| `Laps` | `float64` | Laps completed |

**Recommended field set — smaller than the full column list, per the explicit "do not expose every column" instruction:**

**Include:** `classified_position` (← `ClassifiedPosition`), `grid_position` (← `GridPosition`), `status` (← `Status`), `points` (← `Points`).

**Exclude, with reasons:**
- `Position` (the numeric variant) — redundant with `classified_position` for this milestone's purpose (see §7's ordering argument: the numeric column isn't needed for display *or* for sort order, since row order is already classification order — see below). Including both `Position` and `ClassifiedPosition` would add a second near-duplicate field for no product benefit.
- `Time` — genuinely ambiguous semantics not fully resolved by the docstring alone (total elapsed time vs. gap-to-leader for non-winners is not stated unambiguously); including it without being certain of its meaning risks shipping a mislabeled or misleading number. Worth its own follow-up once verified against real data, not bundled into this milestone's evidence-conservative field set.
- `Q1`/`Q2`/`Q3` — a genuinely different concept (three per-driver lap times, only meaningful for Qualifying/Sprint-Shootout) that deserves its own "qualifying results" treatment, not folded into "race classification."
- `Laps` (completed-lap count) — materially redundant with `status` for this milestone's purpose (`"+ 1 Lap"`/`"+ 2 Laps"` already appears inside `Status` per the library's own example values); a standalone lap-count field adds a fifth piece of surface area for marginal incremental value.

This mirrors this project's own established discipline (M11 §4/§8: "raw values... never a fitted degradation curve... or performance verdict") of shipping the smallest defensible slice and deferring the rest, rather than exposing everything just because it is now known to be reachable.

## 3. Domain / Model Placement

**Pipeline** (`pipeline/pitwall_pipeline/models.py:114`), current `Driver`:
```python
class Driver(DomainModel):
    session_id: str
    driver_id: str
    driver_number: int
    full_name: str
    team_name: str
```
**Planned addition** (all four new fields optional, default `None` — additive, matching the exact shape of M10's `Lap.compound: str | None = None` precedent):
```python
    classified_position: str | None = None
    grid_position: int | None = None
    status: str | None = None
    points: float | None = None
```

**Backend** (`backend/app/models/telemetry.py:58`), current API `Driver` — identical shape today; same four fields added identically, matching ADR-0009's anti-corruption mapping (the API model is defined independently of the pipeline model even though the shapes coincide, per this project's existing convention — confirmed by reading both files: they are two separate class definitions today, not a shared import).

**Only one construction site exists for each model** (verified by `grep -rn "Driver("` across both `pipeline/pitwall_pipeline/` and `backend/app/`, excluding unrelated `Driver*` classes): `normalize_drivers()` (pipeline) and `_driver_from_row()` (backend, `app/repositories/parquet_repository.py:96`). This means the entire behavioral change is contained to exactly these two functions — no other code constructs a `Driver`.

**Nullability/defaults**: all four fields `None` by default, for two independent reasons that both apply: (a) not every session type populates them (Practice sessions), and (b) pre-M34 Parquet rows won't have these columns at all. Both cases must degrade to `None`, not raise or default to a misleading value like `0`.

**No ADR required** — this is an additive field extension within the already-established Parquet-per-session-descriptive-data architecture (ADR-0004) and the already-established API anti-corruption boundary (ADR-0009); it introduces no new dependency, no new storage engine, no new layer, and reverses no prior decision, matching M10's own precedent (`Lap.compound` also shipped without a new ADR).

## 4. Normalization Design

**`normalize_drivers()`** (`pipeline/pitwall_pipeline/normalize.py:355`) currently reads only `Abbreviation`/`DriverNumber`/`FullName`/`FirstName`/`LastName`/`TeamName` from the same `results` DataFrame it already iterates row-by-row. Planned addition, inside the existing per-row loop, using pandas' own NaN-safe `.get()` (consistent with this file's existing `row.get("Compound")`-style pattern elsewhere in the module, even though — unlike `Compound` — `SessionResults` documents that "all dataframe columns will always exist even if not relevant for the current session," so `.get()` here is defense-in-depth/style-consistency, not a response to a known real gap):

```python
classified_position=_optional_str_field(row.get("ClassifiedPosition")),
grid_position=_optional_int_field(row.get("GridPosition")),
status=_optional_str_field(row.get("Status")),
points=_optional_float_field(row.get("Points")),
```

(Exact helper names to be finalized in Stage C, following whatever null-coercion helpers already exist in `normalize.py`, or adding minimal new ones if none currently exist there — `parquet_repository.py`'s existing `_optional_str`/`_optional_float` are backend-side and not reusable directly in the pipeline package, which is a fully separate workspace per `docs/architecture.md`.)

**Practice-session behavior**: FastF1's own docstrings state `Position`, `GridPosition`, `Status`, and `Points` are "only given if session is Race/Qualifying/Sprint/Sprint Qualifying" (exact wording varies slightly per column) — for a Practice session, the columns exist (per `SessionResults`' own "always exist" guarantee) but are populated with `NaN`/empty, which `pd.isna()`-based null coercion converts to `None` uniformly, exactly like the pre-existing `Lap.lap_time_seconds` NaN-handling for an invalid lap. **`ClassifiedPosition`'s docstring does not state the same explicit session-type restriction** as the other three columns — its real per-session-type population was not empirically re-verified this stage (doing so would require loading a real session, which this stage deliberately avoided to stay strictly read-only/no-network); Stage C's own fixture-based tests must cover a Practice-session-shaped input explicitly, and the exact behavior must be confirmed against a recorded fixture (not assumed) before the milestone is considered complete.

**No other normalization behavior is touched** — `normalize_laps`, `normalize_stints`, `normalize_pit_stops`, `normalize_session`, `normalize_telemetry` are all unaffected; this is scoped entirely to `normalize_drivers()`.

## 5. Parquet Compatibility

**Write side** (`pipeline/pitwall_pipeline/cache_writer.py:32`): `_to_dataframe()` calls `record.model_dump(mode="json")` per `Driver` instance, then `pd.DataFrame(...).to_parquet(...)`. Since the four new fields are ordinary optional Pydantic fields, `model_dump(mode="json")` will include them (as `null` when unset) in every newly-written row automatically — **no change to `cache_writer.py` itself is required**; the existing generic dict-of-model-fields mechanism already handles arbitrary additive fields.

**Read side** (`backend/app/repositories/parquet_repository.py:95`, `_driver_from_row`): currently uses required-key bracket access (`row["driver_number"]`, etc.) for the four existing fields. The four new fields must use `.get()` (matching the exact, already-established `compound=_optional_str(row.get("compound"))` pattern at `parquet_repository.py:116`, whose own comment states precisely why: *"a pre-M10 laps.parquet has no compound column at all, and must deserialize to None, not raise."* The same reasoning applies identically here for every one of the 704 pre-M34 `drivers.parquet` files, which will have **no** `classified_position`/`grid_position`/`status`/`points` column at all (not merely a null value — the column itself is absent from the file's schema).

**Confirmed backward-compatible by construction**: `pd.DataFrame.to_dict("records")` on a Parquet file lacking these columns produces row-dicts without those keys; `dict.get(key)` returns `None` for an absent key exactly as it does for a present-but-null value; `pd.isna(None)` is `True`. This is the identical mechanism already proven safe by the `compound` field since M10 — no new mechanism is being introduced, only a second application of an already-shipped, already-tested one.

**One small backend addition needed**: an `_optional_int` helper alongside the existing `_optional_str`/`_optional_float` (`parquet_repository.py:60-65`) — `grid_position` is the first `int`-typed optional field this file has needed; `_optional_float`/`_optional_str` don't cover it. Trivial, three-line addition, same file, same pattern.

**Every reader/writer identified**: exactly two — `cache_writer.py` (write, no change needed) and `parquet_repository.py`'s `_driver_from_row` (read, the one function that changes). No other file reads or writes `drivers.parquet`.

## 6. Backfill Strategy — Explicit Design Decision

**Recommendation for M34's own scope: Option B — leave the 704 existing sessions with `null` result fields; populate only newly-ingested sessions going forward.** Option A (full re-ingest) and Option C (targeted re-ingest) are explicitly deferred to a separate, future, deliberately-scoped milestone — not decided or run here.

**Comparison, grounded in this project's actual history rather than a generic decision matrix:**

- **No exact precedent exists in this codebase for retroactively patching already-ingested Parquet rows with a new field.** This surprised the initial assumption going into this stage. Every prior additive field either (a) shipped *before* M12's one-time historical backfill (2026-08-15) and was therefore captured "for free" by that backfill run without any separate retroactive step — `Lap.compound` shipped in M10 (2026-08-07), before the backfill — or (b) was designed specifically to avoid needing a backfill at all by computing the value at *read time* in the backend rather than storing it in Parquet — `Session.event_id` and `Session.has_telemetry` (both M12) are both backend-repository-computed, never pipeline-normalized or Parquet-stored. **M34 is the first schema addition to occur after the one-time full backfill, requiring an actual choice this project has not had to make before.**
- **Runtime/network cost of a full re-ingest (Option A) is real and non-trivial**, grounded in this project's own recorded evidence rather than a guess: M12's implementation plan recorded ~40–90 seconds per session for a comparable full-session load, even benefiting from FastF1's local HTTP cache (confirmed present and substantial: `data/fastf1_cache/` is currently 45GB, spanning 2018–2026). Extrapolated across 704 sessions, a full re-ingest is order-of-magnitude **8–17+ hours** of wall-clock time — not a Stage-C-sized operation, and explicitly forbidden from being run in this stage regardless.
- **Risk of changing unrelated normalized data (Option A's sharpest risk)**: re-running `normalize_drivers()` (and, transitively, everything else `ingest_session()` touches) for all 704 sessions re-derives *every* field, not just the four new ones. Any accumulated behavior difference since original ingestion — a pipeline bug fix, a FastF1 library version difference, a different local cache state — could silently alter fields that are *already correct* today, with no straightforward way to detect an unintended diff across 704 sessions without a dedicated verification pass. This is the single strongest argument against bundling Option A into this milestone.
- **Reproducibility**: FastF1 session loading is generally deterministic for completed historical sessions, but not unconditionally guaranteed byte-identical (rare post-race steward decisions can revise official results after initial publication; a cleared/changed local cache could re-fetch different upstream data). A small, real risk, not a blocking one — but one more reason a full re-ingest deserves its own dedicated, carefully-verified milestone rather than being folded into a schema-design milestone.
- **M12-style batch precedent**: M12's own historical backfill is the closest analogue in shape (real, large-scale, per-session FastF1 loads) but was explicitly **additive-only** (never-before-ingested sessions) — it was never used to *revise* already-correct existing rows, and was itself run as "every season its own separate, explicitly-approved batch" (`CHANGELOG.md`'s own M12 entry), not a single sweep. If a future backfill milestone is approved, it should adopt that same batching discipline, not a single 704-session run.

**Conclusion**: Option B keeps M34 itself small, safe, and fully reversible (nothing existing is touched), exactly matching the `has_telemetry`-style "graceful partial availability, nullable by design" pattern this project already uses for exactly this situation (a capability real for some sessions, absent for others, distinguished by a nullable field rather than an error). A future backfill (Option A or a targeted Option C limited to, say, only Race/Sprint/Qualifying session types, which is where these fields are actually populated) is named here as a legitimate, real follow-up — but is out of this milestone's scope by design, not by oversight.

## 7. API Contract

Current `GET /sessions/{session_id}/drivers` returns `list[Driver]`; `Driver`'s only construction site is `_driver_from_row` (§3). Adding four nullable fields to the response model is purely additive: existing consumers (`DriverSelectPage.tsx` and five other files constructing `Driver` literals in tests, §9) are unaffected, since none of them destructure the response exhaustively or reject unknown/extra fields — Pydantic includes `null` for unset optional fields by default (no `response_model_exclude_none` is used anywhere in this route, confirmed by inspecting `app/api/sessions.py`), so old and new rows alike will always include the four keys in the JSON body, just `null` for old ones. **No existing API contract is broken.**

**`docs/api-model.md` impact (read for analysis only, not modified in Stage B)**: line 244 currently reads `- **Driver** — driver_id, driver_number, full_name, team_name.` — this one line becomes stale the moment the fields ship and needs a Stage C addition (four more names, one sentence noting Practice-session/pre-M34-data nullability). This is the same kind of "the change itself created a documentation obligation" edit M10 made when it shipped `Lap.compound` (not the M28-style historical-reconciliation kind of documentation work this milestone's non-goals correctly exclude).

**`docs/data-model.md` has the identical situation** (line 39: `- **Driver** — driver_id..., driver_number, full_name, team_name.`) — same reasoning, same small addition, same category of "describes the actual new schema" edit, not "reconciliation."

**Ordering is already correct for free**: `fastf1.core.SessionResults`' own docstring states results are *"indexed by driver number and sorted by finishing position"* by default — and `normalize_drivers()` already iterates `results.iterrows()` preserving that row order into the `drivers` list, which `cache_writer.py` preserves into Parquet row order, which `ParquetRepository.list_drivers()` preserves via `df.to_dict("records")`. **No new sorting logic is needed anywhere** — once the four new fields are populated, the existing driver list will already render in classification order, exactly matching what a "results" view should show, as a direct consequence of not touching anything in the existing read path.

## 8. Frontend / Product Surface

**Decision: Option A — extend the existing `DriverSelectPage`, not a new dedicated results page.**

`DriverSelectPage.tsx` (`frontend/src/features/session-select/DriverSelectPage.tsx`) already renders exactly one card per driver, in list order (§7: already classification order once populated), for the exact session being viewed. This is the smallest possible surface for "who won / grid position / status / points" — no new route, no new page, no new navigation entry, no new Sidebar link.

**Planned UI, per card**: alongside the existing `#{driver_number}` / `{driver_id}` / `{full_name} ({team_name})` row, add:
- A position badge (e.g. `P1`, or the raw `classified_position` string for retirees — `"R"`/`"D"`/etc.) — shown only when `classified_position` is non-null.
- `status` text — shown only when non-null, and only when it's *not* simply `"Finished"` for the leader (to avoid restating the obvious for the common case) — exact display rule to be finalized in Stage C against real data shape, not invented here.
- `points` — shown only when non-null and non-zero (a `0`-point finish is common and not worth a badge).
- `grid_position` — shown as a small "started Pn" annotation, only when non-null.

**Behavior for non-Race sessions (Practice)**: all four fields are `null` (§4) — the card simply omits the new UI elements entirely, falling back to exactly today's existing rendering. No conditional messaging like "no results available" is planned — for a Practice session, the absence of a classification badge is the expected, self-explanatory behavior, not an error state.

**Behavior for pre-M34 sessions**: identical code path to Practice sessions — `null` fields, badge omitted, existing rendering preserved exactly. No distinction is drawn in the UI between "this session type doesn't have results" and "this session predates M34" — both simply render without the new elements, which is the correct, honest behavior (the alternative, showing a message explaining *why* data is missing, would be over-engineering for what is a purely cosmetic addition to an already-functional card).

**Sorting/display semantics**: no client-side sort is added — the list already arrives in classification order (§7). If a future session has multiple `null`-classified drivers (e.g., a Practice session), they simply render in whatever order the backend already returns them (driver-number order, today's existing behavior), unchanged.

**Existing navigation**: unchanged — no Sidebar entry, no new route, no new link. `App.tsx` is untouched.

**Exact frontend files required**: `frontend/src/api/client.ts` (`Driver` interface, four new optional+nullable fields — `classified_position?: string | null`, `grid_position?: number | null`, `status?: string | null`, `points?: number | null`, following the exact `compound?: string | null` precedent and its documented rationale, §9), `frontend/src/features/session-select/DriverSelectPage.tsx` (render logic), `frontend/src/features/session-select/DriverSelectPage.module.css` (badge styling).

## 9. Existing Tests — What Needs Updating, What Doesn't

**Pipeline** (`pipeline/tests/`):
- `tests/fixtures.py`'s `build_results_df()` currently has no `Position`/`ClassifiedPosition`/`GridPosition`/`Status`/`Points` columns. Since real FastF1 `SessionResults` output always includes these columns (§2's "always exist" guarantee), the fixture should gain them with realistic values (e.g., VER: P1/classified "1"/grid 1/"Finished"/25pts; HAM: P2/"2"/grid 3/"Finished"/18pts) — this is a shared fixture used by `test_normalize_drivers_maps_expected_fields` and `test_normalize_drivers_falls_back_to_first_last_name`; neither test currently asserts on these fields, so neither breaks from the fixture gaining columns it doesn't check.
- **Genuinely new tests needed**: (a) a positive-case test asserting the four new fields extract correctly from a classification-populated fixture row, and (b) a null-handling test asserting a Practice-session-shaped row (columns present, values `NaN`) normalizes to `None` for all four fields — mirroring the existing `test_normalize_laps_handles_missing_lap_time`'s precedent for exactly this kind of test.

**Backend** (`backend/tests/`):
- The shared `backend/tests/fixtures.py` `drivers.parquet` fixture (used broadly across `test_parquet_repository.py` and implicitly by several route tests) should be **left unchanged** — it is the most direct, realistic stand-in for a genuine pre-M34 Parquet file, and its continuing to pass unmodified through `_driver_from_row`'s new `.get()`-based logic *is* the backward-compatibility proof (§5), not an incidental side effect.
- **One genuinely new test needed**: a dedicated positive-case test (in `test_parquet_repository.py`, alongside the existing `test_list_drivers_returns_all_drivers`) using a locally-constructed Parquet fixture that *does* include the four new columns, asserting they deserialize correctly.
- **Eight other test files** that each write their own local `drivers.parquet` fixture (`test_driver_trends_route.py`, `test_driver_tyre_trend_route.py`, `test_pace_trend_compare_route.py`, `test_laps_compare_route.py` ×2, `test_session_analytics_route.py`, `test_stints_compare_route.py`, `test_tyre_trend_compare_route.py`) — **none require modification**; each continues to produce a Driver with the four new fields `None`, which none of them assert against.

**Frontend** (`frontend/src/`):
- 6 files construct `Driver` test literals (`ComparisonPage.test.tsx`, `DriverLapPicker.test.tsx`, `LapPairSelector.test.tsx`, `DriverSelectPage.test.tsx`, `DriverPicker.test.tsx`, `StintComparisonPage.test.tsx`) — confirmed via grep. Making the new TS fields optional (`?:`, matching `compound`'s own documented precedent and rationale, §8) means **none of the 5 files outside `DriverSelectPage.test.tsx` need any change** — they continue to compile and pass exactly as today.
- **`DriverSelectPage.test.tsx` needs genuinely new test(s)**: one asserting the classification badge/status/points render when present, one asserting the existing (unmodified) rendering is preserved exactly when the fields are absent/null (the pre-M34/Practice-session case) — the existing `"lists a session's drivers..."` test, which constructs a `Driver` literal without the new fields, should continue to pass completely unmodified and itself doubles as the "graceful omission" proof, the same way the backend's untouched fixture doubles as its own backward-compatibility proof.

## 10. Data Migration / Re-ingestion Safety

- No Postgres write, no Parquet write, no ingestion run, no migration performed in Stage B (confirmed, §1).
- **No migration is required at all** for M34's own scope (Option B, §6) — Parquet's schema-on-read model (via `.get()`-safe deserialization, §5) means the 704 existing sessions remain fully valid, fully readable, and require zero modification to keep working exactly as they do today. This is a direct, load-bearing consequence of choosing Option B: it is not merely "safer," it is **actually simpler** than any backfill option, since it requires touching zero existing data.

## 11. Candidate Alternatives (re-compared before finalizing scope)

| Bundle | Additional evidence needed | Additional risk | Verdict |
|---|---|---|---|
| **Results/classification only** | None beyond what this stage already verified | Low — additive, single new read-time property (`results`, already loaded) | **Recommended** |
| Results + weather | `weather_data`'s exact schema is already known (§ M34 Stage A §C) but was not re-verified against a real per-minute-sample shape this stage, and it's a session-wide (not per-driver) concept requiring a new model, not an extension of `Driver` | Doubles the milestone's model/schema surface for a materially lower user-value payoff than results | Reject for M34 — legitimate separate future milestone |
| Results + race-control | `race_control_messages`' event-log shape (flags/scope/sector) is more structurally novel to this codebase than anything `Driver`-shaped | Meaningfully larger implementation surface, new domain concept entirely | Reject for M34 — legitimate separate future milestone |
| Results + lap-by-lap position | Needs a new `Lap.position` field *and* a new chart type; more coherent as a follow-up once results/grid context already exists to make a position chart meaningful | Doubles scope; logically depends on results shipping first anyway | Reject for M34 — natural next milestone after this one, not concurrent with it |

**No evidence surfaced during this stage changes Stage A's recommendation** — results/classification alone remains the correctly-scoped choice.

## 12. Exact Stage C File List

**Definitely modified:**
- `pipeline/pitwall_pipeline/models.py` — `Driver` domain model, four new optional fields
- `pipeline/pitwall_pipeline/normalize.py` — `normalize_drivers()`, extract four new fields
- `pipeline/tests/fixtures.py` — `build_results_df()`, add realistic classification columns
- `pipeline/tests/test_normalize.py` — two new tests (§9)
- `backend/app/models/telemetry.py` — API `Driver` model, four new optional fields
- `backend/app/repositories/parquet_repository.py` — `_driver_from_row()` + new `_optional_int` helper
- `backend/tests/test_parquet_repository.py` — one new test (§9)
- `frontend/src/api/client.ts` — `Driver` interface, four new optional+nullable fields
- `frontend/src/features/session-select/DriverSelectPage.tsx` — render classification info
- `frontend/src/features/session-select/DriverSelectPage.module.css` — badge styling
- `frontend/src/features/session-select/DriverSelectPage.test.tsx` — new tests (§9)
- `docs/data-model.md` — Driver field-list line, extended (§7)
- `docs/api-model.md` — Driver response-model line, extended (§7)
- `docs/m34-design-review.md` — this file, finalized in Stage C with actual results

**Definitely created:** none beyond `docs/m34-design-review.md` (already created this stage).

**Conditionally modified:** none identified — every file above is definitely in scope; no file's need is contingent on a Stage C finding not yet knowable.

**Explicitly untouched:**
- `pipeline/pitwall_pipeline/cache_writer.py` (§5 — the existing generic serialization already handles new fields)
- Every other pipeline/backend/frontend file not named above, including all eight backend route-test files and five frontend test files identified in §9 as unaffected
- Any weather/race-control/lap-position code (§ non-goals)
- Any dependency manifest, CI, Docker, or pipeline-config file
- Any unrelated technical-debt item (`_to_stint_pace`, trend hooks, etc.)
- No actual ingestion, backfill, Postgres write, or Parquet write of any kind (§6, §10)
- No ADR (§3)

## 13. Validation Plan (Stage C)

**Pipeline:**
1. `uv run pytest` (pipeline workspace) — full suite, expect the current baseline count plus exactly the new tests added (§9), no existing test's assertions changed.
2. `uv run mypy .` (pipeline) — must stay clean.
3. `ruff check .` / `ruff format --check .` (pipeline) — must stay clean.

**Backend:**
4. `uv run pytest` (backend workspace) — full suite, expect current baseline plus exactly the new test(s) added (§9); explicit confirmation that every one of the eight untouched route-test files' `drivers.parquet` fixtures still passes unmodified (proving the additive change is truly non-breaking, not merely assumed to be).
5. `uv run mypy .` (backend) — must stay clean.
6. `ruff check .` / `ruff format --check .` (backend) — must stay clean.

**Frontend:**
7. `npx vitest run` — full suite, expect current baseline plus exactly the new tests added to `DriverSelectPage.test.tsx`; explicit confirmation the five other `Driver`-literal-constructing test files compile and pass completely unmodified.
8. `npx tsc -b --noEmit` — must stay clean.
9. `npx eslint .` — must stay clean.
10. `npx prettier --check .` (or equivalent) — must stay clean.

**Contract/compatibility-specific checks:**
11. A targeted fixture-based check that a `drivers.parquet` file written **without** the new columns (the exact shared `backend/tests/fixtures.py` fixture, left deliberately unmodified per §9) still round-trips through `list_drivers()` without error and yields `None` for all four new fields — this is the direct, concrete proof of Parquet backward compatibility, not an assumption.
12. A targeted fixture-based check that a `results`-shaped DataFrame **without** the classification columns at all (simulating an even-older or hypothetically column-missing FastF1 response) does not crash `normalize_drivers()`, given the `.get()`-based access (§4).
13. Manual read of the final `GET /sessions/{session_id}/drivers` response shape (via an existing route test's response body, not a live server) confirming the four new keys appear with `null` for the untouched fixture and real values for the new one.

**Not planned, and not appropriate for this milestone:**
- No backfill or re-ingestion of any kind runs in Stage C (§6 — explicitly deferred).
- No browser/manual UI smoke test is claimed unless actually performed with real tooling in Stage C — this design review will not assert visual verification it has not done.

## Non-Goals (explicit, unchanged from Stage A's audit and this stage's own re-confirmation)

Weather; race-control messages; lap-by-lap position charts; exports; AI/NL; live timing; predictive/fitted tyre analysis (would violate M11's own explicit descriptive-only boundary); any unrelated technical-debt cleanup (`_to_stint_pace`, trend-hook consolidation — both re-confirmed still below this project's evidence threshold, unrelated to this milestone regardless); any dependency upgrade; any M28-style historical documentation reconciliation (the two documentation edits in scope here, §7/§12, are schema-accuracy edits the change itself creates an obligation for, not reconciliation of stale milestone history); the full results backfill itself (Option A/C, §6 — named as a legitimate future milestone, not decided or scheduled here).

## 14. Stage C — Actual Implementation

Exactly the 13 code/test files approved in §12 were modified, plus this file finalized. No file was added to or removed from the approved list.

- **Pipeline**: `models.py` (`Driver` gains four `None`-default fields), `normalize.py` (`normalize_drivers()` reads `ClassifiedPosition`/`GridPosition`/`Status`/`Points` via `.get()`; added `_optional_float` alongside the pre-existing `_optional_str`/`_optional_int`), `tests/fixtures.py` (`build_results_df()` gains realistic classification columns; new `build_practice_results_df()` for the NaN case), `tests/test_normalize.py` (2 new tests).
- **Backend**: `app/models/telemetry.py` (API `Driver` gains the identical four fields), `app/repositories/parquet_repository.py` (`_driver_from_row()` reads the four fields via `.get()`; added `_optional_int` alongside the pre-existing `_optional_str`/`_optional_float`), `tests/test_parquet_repository.py` (1 new test).
- **Frontend**: `api/client.ts` (`Driver` interface gains four optional+nullable fields, mirroring `compound`'s documented rationale), `DriverSelectPage.tsx` (renders a classification row per card: position badge, grid position, status, points — all conditionally omitted when absent), `DriverSelectPage.module.css` (four new classes), `DriverSelectPage.test.tsx` (3 new tests).
- **Docs**: `docs/data-model.md` and `docs/api-model.md` — one paragraph each, extending the existing `Driver` field-list line with the four new fields and an explicit note that no historical backfill occurred.

## 15. Validation Results (Stage C)

**A. Targeted tests**: `pytest tests/test_normalize.py -v` (pipeline) — 9/9 passed (7 existing + 2 new). `pytest tests/test_parquet_repository.py -k driver -v` (backend) — 8/8 passed. `vitest run src/features/session-select/DriverSelectPage.test.tsx` (frontend) — 9/9 passed (6 existing + 3 new).

**B. Full suites**: pipeline `pytest` — **149 passed**. Backend `pytest` — **387 passed** (386 baseline + 1 new; all 8 untouched route-test files with local `drivers.parquet` fixtures pass unmodified, confirming the additive change is genuinely non-breaking, not merely assumed). Frontend `vitest run` — **552 passed** (549 baseline + 3 new; all 5 other `Driver`-literal-constructing test files compile and pass unmodified).

**C. Static checks**: pipeline `mypy .` — clean (38 files). Pipeline `ruff check .` / `ruff format --check .` — clean. Backend `mypy .` — clean (101 files). Backend `ruff check .` / `ruff format --check .` — clean. Frontend `tsc -b --noEmit` — clean. Frontend `eslint .` — clean. Frontend `prettier --check` on the 4 touched frontend files — clean.

**D. Parquet compatibility**: direct fixture-based proof (temporary directory, no real data touched) — a `drivers.parquet` written **without** any of the four new columns loads via `list_drivers()` without error, with `classified_position`/`grid_position`/`status`/`points` all resolving to `None`. Combined with `test_list_drivers_maps_classification_fields_when_present` (§14), both the old-row and new-row cases are proven, not assumed.

**E. API contract**: route count re-confirmed at **22** (unchanged). `Driver.model_fields` confirmed via direct introspection to be exactly `['driver_id', 'driver_number', 'full_name', 'team_name', 'classified_position', 'grid_position', 'status', 'points']` — all four original fields retained, four new fields present; `model_dump()` on a driver built without the new fields shows all four as `null`, and on one built with them shows the real values. No route file was touched.

**F. Documentation**: both `docs/data-model.md` and `docs/api-model.md` now list the four new fields, explicitly note their `None` cases (non-applicable session type, or pre-M34 data), and explicitly state no historical backfill occurred — matching Option B exactly, not implying otherwise.

**G. Scope/hygiene**: `git diff --check` — clean. `git diff --name-only` — exactly the 13 approved files. `git diff --stat` / `git status --short --branch` — 13 modified + `docs/m34-design-review.md` untracked, nothing else. `git diff --cached --stat` — empty (nothing staged).

## 16. Deviations from Plan

None. Every file in §14 matches §12's approved list exactly. No field beyond the four approved ones was added. No weather/race-control/lap-position/export/backfill code was written.

---

**STOP — Stage C complete. Awaiting explicit approval before `git add`/`commit`/`push`.**
