# PitWall — M38 Design Review: Targeted Historical Backfill (M34–M36 Fields)

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `819dcce62faeff106a7e83bbbe44c169b2cc8f4b` at both Stage A and Stage B start.
- Working tree clean throughout; nothing staged, committed, or pushed during Stage A or Stage B.
- `docs/m9-design-review.md`: zero diff, confirmed at both stage starts.
- Stage B performed zero ingestion, zero Parquet writes, zero PostgreSQL writes, zero dependency changes. Only source/doc reads, git history reads, filesystem enumeration (`find`/`ls`), and read-only Parquet-directory listing.

## 2. Stage A Findings (Carried Forward)

Stage A (read-only audit) concluded that targeted historical backfill is the highest-value justified M38 candidate: three already-shipped, already-tested UI features (M34 classification, M35 position chart, M36 exclusion tags) are silently inert across the entire historical archive because their backing Parquet columns were never populated for any of the 704 already-processed sessions (0/704 for all three fields, confirmed via direct Parquet inspection; clean uniform zero-state, no partial/mixed backfill exists). No stronger candidate (docs reconciliation, tech-debt items) outranked it — those remain small, low-urgency, and unaffected by new evidence. Stage A's own instruction was explicit: **its recommendation is a candidate to design, not permission to run.**

## 3. Stage B Architecture Findings

### 3.1 M12's Existing Backfill Infrastructure — Inspected, Not Assumed

`pipeline/pitwall_pipeline/ingest_plan.py` is M12 Phase 3's planning/execution layer, and its own module docstring is explicit about its own limits: *"Infrastructure for eventual historical backfill — NOT the backfill itself"* (`ingest_plan.py:4-5`). Concretely:

- **`build_ingestion_plan()`** (`ingest_plan.py:124-200`): pure discovery, zero writes — calls only `FastF1Provider.discover_season()` (schedule-only FastF1 calls). Deterministic, inspectable `IngestionPlan` output; `--dry-run` (`ingest_plan.py:354-357,385-387`) prints it and performs zero ingestion. **This is directly reusable, unchanged, for Stage C's dry-run/target-discovery step.**
- **`execute_ingestion_plan()`** (`ingest_plan.py:249-301`): sequential only, no concurrency (`ingest_plan.py:257-258`); one `EventLevelFailure` never stops the rest (`ingest_plan.py:282-296`); calls `ingest_event()` per planned event, which calls `ingest_session()` per session with its own per-session `try/except` isolation (`ingest_event.py:185-219`) — one session's `LOAD_FAILED` never aborts the batch.
- **Selection**: sessions are always requested by explicit `--season`/`--event`/`--all-events`/`--session` flags (`ingest_plan.py:319-347`), safe-by-default (`--all-events` and `--confirm-multi-season` both required explicitly, `ingest_plan.py:362-363`).
- **Overwrite behavior**: unconditional. Neither `build_ingestion_plan()` nor `execute_ingestion_plan()` checks whether a target session already has output — every planned session is re-ingested and its Parquet files unconditionally overwritten by `write_session_cache()` (§3.2). There is no skip-if-exists, no skip-if-already-has-target-fields.
- **Atomicity**: **none.** `write_session_cache()` (`cache_writer.py:48-63`) calls `.to_parquet()` directly, five times, sequentially, on the real output path — no temp file, no rename, no directory staging. A crash between the first and fifth call leaves that session's five Parquet files in a mixed old/new state. Confirmed by reading every line of `cache_writer.py`; confirmed absent from its test coverage (`pipeline/tests/test_cache_writer.py` has no overwrite/crash-recovery test — only fresh-write round-trip tests, `test_cache_writer.py:88-124`).
- **Backups**: none. Nothing in the ingestion path copies or snapshots existing output before overwriting it.
- **Success/failure recording**: in-memory + logs only (`MultiEventIngestResult`, `EventIngestResult`, `SessionIngestOutcome` dataclasses, plus `logger.warning`/`logger.info` calls). **No on-disk state file** — a run's outcome is not queryable after the process exits, and there is no mechanism to resume a partial run without re-planning and re-running from scratch (which is safe only because overwrite is unconditional, not because anything tracks "already done").
- **Verification**: M12's own historical backfill (`docs/m12-implementation-plan.md`) *did* perform real, manual, narrative verification per batch — e.g. line 1342-1349: a real single-session re-ingestion of a Hungarian GP Race, entirely against already-cached FastF1 data, confirmed laps (1,431), telemetry samples (938,587), `stints` (67) and `pit_stops` (47) rows byte-identical before/after, and `session.parquet`'s mtime changed (proving a genuine overwrite, not a skip). Line 784-793 records an equivalent full-event re-ingestion (Bahrain, 5 sessions) with the same result. **This is real idempotency evidence, not a theoretical claim** — but it was manual, one-off, narrative verification baked into a design-review document, not a reusable automated check. No verification *tooling* exists in the codebase today.

**Conclusion: M12's plan/execute layer is safe to reuse for target *discovery*, but is not safe to reuse unmodified for *execution* — it lacks atomicity, backups, resumability tracking, and automated verification, and (§3.3 below) it also always touches PostgreSQL, which M38 is explicitly forbidden from doing.**

### 3.2 Current Ingestion Path, Traced

```
session selection (build_ingestion_plan / discover_season)
  -> FastF1Provider.load_session()      (fastf1_provider.py:93-174)
       -> fastf1.get_event() / get_session().load()   (real or cached FastF1 API calls)
       -> normalize_drivers() / normalize_laps() / normalize_stints()
          / normalize_pit_stops() / normalize_telemetry()   (normalize.py)
  -> write_session_cache()              (cache_writer.py:48-63)
       -> 5x direct .to_parquet() calls: session, drivers, laps, telemetry, track
  -> (ingest_session() only, NOT load_session()+write_session_cache() alone)
       -> write_stints() / write_pit_stops() to PostgreSQL  (ingest.py:70-81)
  -> ParquetRepository (backend) reads the 5 files per session, `.get()`-based
     deserialization already tolerant of missing columns (parquet_repository.py)
  -> FastAPI -> typed frontend client -> UI
```

**Critical finding**: `write_session_cache()` always writes **all five** Parquet files for a session — there is no selective "update only drivers.parquet and laps.parquet" path. Re-ingesting a session means re-deriving and rewriting `session.parquet`, `drivers.parquet`, `laps.parquet`, `telemetry.parquet`, and `track.parquet` together, every time. This is consistent with M34's own design review's risk framing (§3.3 below) and rules out any notion of a narrower "patch just the two files with new columns" mechanism at the writer level.

**Second critical finding**: `ingest_session()` (`ingest.py:47-88`) is not a Parquet-only function — after writing Parquet (line 62), it unconditionally attempts a PostgreSQL write (`write_stints`/`write_pit_stops`, lines 70-81), swallowing only `psycopg.Error` (logged, not fatal, but a **connection is attempted and a write is issued** on every call). `ingest_event()` and `execute_ingestion_plan()` both call `ingest_session()` internally and inherit this. **None of M12's existing entry points (`ingest_session`, `ingest_event`, `execute_ingestion_plan`) can be reused unmodified without touching PostgreSQL** — a direct conflict with this milestone's explicit safety boundary ("M38 must not touch PostgreSQL"). By contrast, `FastF1Provider.load_session()` (`fastf1_provider.py:93-174`) and `write_session_cache()` (`cache_writer.py:48-63`) are confirmed, by reading every import in both files, to have **zero PostgreSQL dependency** — neither imports `db.py` nor `postgres_writer.py`. **This pair is the correct, minimal building block for Stage C**, not `ingest_session()`.

### 3.3 Data Preservation Risk — Inspected Field-by-Field

`normalize.py` was read function-by-function (§not just design docs). Findings:

- **Determinism**: every `normalize_*` function is a pure transform over an already-fetched pandas DataFrame — row-by-row `.iterrows()`, no randomness, no wall-clock reads, no I/O. Given byte-identical input DataFrames, output is deterministic. This matches M12's own real, measured idempotency evidence (§3.1).
- **FastF1 version pinning**: `pipeline/pyproject.toml:7` pins `fastf1>=3.4`; `pipeline/uv.lock:537` locks the resolved version at `3.8.3`. **Checked git history of `uv.lock` across all 4 commits that ever touched it (`dabd1d7`, `12611b4`, `832d77a`, `e934897`) — the resolved fastf1 version has been `3.8.3` in every one of them, including the very first commit that introduced the dependency.** This means the version used for every session in the existing 704-session corpus and the version Stage C would run under are **the same version, with no drift** — a materially stronger finding than Stage A's more cautious "provider-version risk is real" framing, which lacked this direct git-history check.
- **FastF1 cache**: `FastF1Provider.__init__` (`fastf1_provider.py:89-91`) calls `fastf1.Cache.enable_cache(cache_dir)` unconditionally — every load in Stage C would go through the same on-disk HTTP cache (`data/fastf1_cache/`) that produced the existing 704 sessions, for the same fastf1 version. Re-fetching the same cached raw HTTP responses through the same normalization code, with the same library version, is the strongest achievable determinism guarantee available in this architecture without vendoring FastF1's own internals.
- **Non-target fields that re-derive on re-ingestion**: every existing column in `drivers.parquet` (`driver_id`, `driver_number`, `full_name`, `team_name`) and `laps.parquet` (`lap_time_seconds`, `sector_1/2/3_seconds`, `is_personal_best`, `is_accurate`, `compound`) is re-computed from scratch alongside the four new M34 fields / two new M35-M36 fields — `normalize_drivers()`/`normalize_laps()` don't distinguish "new" from "existing" fields, they rebuild the whole record. `session.parquet`, `telemetry.parquet`, and `track.parquet` are also fully rewritten even though M34-M36 touch none of their fields. **This is exactly the risk M34's own design review named as "the single strongest argument against bundling Option A into" a schema-design milestone** (`docs/m34-design-review.md:106`): *"re-running `normalize_drivers()` ... for all 704 sessions re-derives every field, not just the four new ones... with no straightforward way to detect an unintended diff... without a dedicated verification pass."* Stage B does not dismiss this risk — it designs the verification pass M34 called for (§6 below).
- **Theoretical (not proven-impossible) drift sources**: post-race steward decisions can occasionally revise official FastF1 results after initial publication (a real, if rare, FastF1-documented phenomenon, noted in `docs/m34-design-review.md:107`); a cleared/partial local cache entry could force a fresh upstream fetch that returns revised data. Both are edge cases, not the common case, but neither can be ruled out from source code alone — this is why Stage C's design includes row-count and column-value verification rather than trusting determinism by construction alone.
- **Session/event metadata** (`event_name`, `location`, `country`, `round_number`, `session_date`): sourced from FastF1's schedule/event objects, same determinism argument applies; no known mechanism for these to change for a completed historical event.

**Conclusion, stated plainly (do not claim "safe" merely because the code is deterministic, per this stage's own instruction)**: re-ingestion is *very likely* to reproduce every non-target field identically, backed by real prior evidence (M12's byte-identical row-count checks) and a version-pinning history check this stage performed for the first time — but it is not *provably* safe from source code alone, because FastF1's upstream data itself is not immutable. Stage C's design therefore treats verification as mandatory, not optional (§6), and treats atomic-swap-with-backup (§5) as the mechanism that makes an unexpected diff cheaply reversible rather than something that must never happen.

## 4. Target Session Set — Exact Counts, Recomputed from Filesystem

Directory counts were freshly re-verified per year (`find data/processed/<year> -maxdepth 2 -type d -name <type>`), not assumed from Stage A's report:

| session_type | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 | **Total** |
|---|---|---|---|---|---|---|---|---|
| race | 17 | 22 | 22 | 22 | 24 | 24 | 11 | **142** |
| qualifying | 17 | 22 | 22 | 22 | 24 | 24 | 11 | **142** |
| sprint | 0 | 3 | 3 | 6 | 6 | 6 | 4 | **28** |
| sprint_qualifying | 0 | 0 | 0 | 6 | 6 | 6 | 4 | **22** |
| practice_1/2/3 | — | — | — | — | — | — | — | **370** (704 − 334) |
| **Total** | | | | | | | | **704** |

**Field applicability, per `normalize.py`'s actual code (not design-doc paraphrase):**

- **M34** (`classified_position`, `grid_position`, `status`, `points`) — populated for **Race/Sprint/Qualifying-family**, per `normalize.py:371-378`: race + qualifying + sprint + sprint_qualifying = 142+142+28+22 = **334 sessions**.
- **M35** (`Lap.position`) — populated only for **Race/Sprint/pre-2024 Sprint Qualifying**, per `normalize.py:409-414` (`"populated only for Race/Sprint/pre-2024 Sprint Qualifying sessions"`). Sprint Qualifying/Shootout did not exist before 2023, so "pre-2024" here means exactly the 2023 sprint_qualifying sessions: race(142) + sprint(28) + 2023 sprint_qualifying(6) = **176 sessions**. This is a materially more precise figure than Stage A's rough "~170 (Race+Sprint only)" — it corrects for the 6 2023 Sprint-Shootout sessions that Stage A's fork omitted.
- **M36** (`Lap.track_status`) — technically unconditional for **all 704** sessions (`normalize.py:416-419`, `_add_track_status_to_laps` "runs unconditionally for every session"). Practically valuable only where a consuming UI surface exists; `session-analytics` has no session-type gating (confirmed: no `SessionType`/`PRACTICE` restriction found in `frontend/src/features/session-analytics/*.tsx`), so it is technically reachable for Practice sessions too — but Practice sessions carry materially less product value (fewer yellow-flag/SC incidents scrutinized, no classification/position context to pair it with) and would roughly double the target population and runtime for that low marginal value.

**Chosen target population — Option: single 334-session scope, all three fields in one pass.** 334 is already the union of M34's population and M35's 176-session subset (176 ⊂ 334, since race/sprint/2023-SQ are all within race/qualifying/sprint/sprint_qualifying). Scoping M36's backfill to the same 334 sessions (rather than all 704) is a **deliberate, evidence-based scope decision, not an oversight**: it matches every one of M34/M35/M36's own design reviews' forward-looking language (`docs/m36-design-review.md:117`: *"likely targeting the ~170 Race/Sprint sessions specifically, where M34/M35's fields matter, and incidentally picking up `track_status` for those same sessions along the way"*), it means exactly one re-ingestion pass per session populates whichever of the three milestones' fields that session type actually supports (no field-specific extra passes needed), and it leaves all 370 Practice sessions completely untouched — zero incremental risk, zero incremental runtime, for a population where none of M34/M35/M36 provide meaningful value anyway.

This directly answers Q4/Q5 of the critical design questions: **Option 5 (evidence-based scope) = the existing 334-session Race/Qualifying/Sprint-family population, executed as a single unified pass** (Q5 answer: **Option A, one unified pass** — not three separate passes — because all three fields are derived from the same already-loaded `results`/`laps` DataFrames inside the same `normalize_drivers()`/`normalize_laps()` calls; there is no code-level reason to split them, and splitting would triple the re-ingestion count for the same 334 sessions with no benefit).

## 5. Idempotency, Atomicity, Rollback — Minimal Mechanism Design

None of these three properties exist in the current ingestion path (§3.1). Rather than adopt M12's tooling as-is or build a large transactional framework, Stage C proposes the smallest mechanism that gives all three at once, entirely at the **session-directory** level (never editing an existing file in place):

1. **Write to staging, not to the real path.** For each target session, call `FastF1Provider.load_session()` + `write_session_cache(data, base_dir=<staging_root>)` — writing a complete, independent copy of that session's 5 Parquet files under a staging directory mirroring the real layout (e.g. `data/.m38-staging/<season>/<event_slug>/<session_type>/`), never touching `data/processed/` directly. This reuses `write_session_cache()` completely unchanged (its `base_dir` parameter already supports this).
2. **Verify before touching anything real** (§6) — row counts, non-target-column equality, target-field population sanity — against the existing real files for that session, entirely read-only.
3. **Atomic swap, only on verification pass**: rename the existing real session directory aside to a timestamped backup path (e.g. `data/.m38-backup/<season>/<event_slug>/<session_type>-<run_id>/`), then rename the staging directory into the real path. Both are single `Path.rename()` calls on the same filesystem (same `data/` volume) — each individually atomic; the session directory is therefore always either fully-old, briefly-absent (sub-millisecond), or fully-new — **never partially old/new**, which directly closes the atomicity gap identified in §3.1. This needs no change to `cache_writer.py`/`write_session_cache()` itself — it's pure orchestration around the existing, unmodified function.
4. **Backup = rollback.** The renamed-aside original directory *is* the rollback mechanism — restoring a session is another `Path.rename()` back. No separate backup format, retention policy beyond "keep until Stage C's own results are confirmed acceptable, then an explicit, separate cleanup step," and no copying (renames are near-free on the same filesystem, unlike a `shutil.copy`-based backup of a multi-GB corpus).
5. **Idempotency / resume-by-skip**: an append-only per-run state log (one line per session: `session_id, status, timestamp`) written after each session's swap (success or verified-failure) lets a resumed run skip any `session_id` already marked complete in that run's log, without needing to re-read Parquet to infer state. Because step 3's swap is atomic, a session is either fully done (in the log, real dir has new data) or not attempted yet (absent from the log, real dir still has old data) — there is no "half done" state to detect.
6. **Per-session failure isolation**, same philosophy as `ingest_event()`'s existing `try/except Exception` (§3.1): one session's load/verify/swap failure is logged, recorded as failed in the state log, and the loop continues to the next session — never aborting the whole run. The real directory for a failed session is left completely untouched (staging write or verification failed *before* any swap was attempted).

This satisfies Q6 (idempotency: yes, safe to rerun — completed sessions skip via the state log, incomplete ones simply retry from a clean, untouched real directory), Q7 (atomicity: yes, via staging + rename swap, no code change to the writer), Q8 (rollback: yes, via the backup-aside directory, a single rename, no separate framework).

## 6. Dry Run and Verification Design

**Dry run** — two layers, no new tooling needed for the first, a small new one for the second:

- Target-session discovery is already free: `build_ingestion_plan(seasons=[2020..2026], event_queries=None, session_types=[RACE, QUALIFYING, SPRINT, SPRINT_QUALIFYING])` with `--dry-run` (`ingest_plan.py:354-357`) prints the exact 334-session list, zero writes, reusing existing code unchanged.
- What that plan does *not* know is which of the 334 sessions already have the target fields populated (today: none, §Stage A) — Stage C's new script layers one additional, still read-only check on top: for each planned session, read the existing `drivers.parquet`/`laps.parquet` schema and report `already-complete` / `missing-columns` / `columns-present-but-null`, so a *future* re-run of the same tool (e.g. after a partial M38 execution, or after a later milestone adds a 4th field) reports accurate skip/target/already-complete counts rather than assuming a clean slate.

**Post-backfill verification**, run automatically after each session's staging write (before the swap) and again as a final aggregate pass after the whole run:

- **M34**: `classified_position`/`grid_position`/`status`/`points` columns present in the new `drivers.parquet`; non-null for every row where FastF1 actually provides them (all rows, for this 334-session scope); `classified_position` values match the plausible set FastF1 documents (position strings or retirement codes); `points` non-negative; `grid_position` a positive integer or null.
- **M35**: `position` column present in `laps.parquet`; non-null only for the 176-session subset (race/sprint/2023 sprint_qualifying) and null for the 158 plain-Qualifying/2024+-SQ sessions within the 334 — a verification failure here (e.g. non-null `position` appearing for a plain Qualifying session) would indicate a normalize.py assumption was wrong and must halt that session's swap, not be silently accepted.
- **M36**: `track_status` column present in `laps.parquet` for all 334; values restricted to the known FastF1 status-code character set (the same codes `filtering.py`'s `_EXCLUDED_TRACK_STATUS_CODES = {"2","4","5","6","7"}` already interprets, plus `"1"` for green and multi-code concatenations) — an unrecognized code would flag for manual review, not silently pass.
- **Preservation checks** (the M34-design-review-identified highest risk, §3.3): row counts for `laps.parquet`/`telemetry.parquet`/`drivers.parquet`/`track.parquet` unchanged before/after; every pre-existing non-target column's values (`lap_time_seconds`, `sector_*_seconds`, `is_personal_best`, `is_accurate`, `compound`, `driver_number`, `full_name`, `team_name`, all of `telemetry.parquet`, all of `track.parquet`, all of `session.parquet`) compared row-for-row against the pre-swap real file, flagged on any difference rather than assumed identical.
- **File integrity**: all 5 expected files present and non-empty (or empty-with-correct-columns, matching `write_session_cache`'s own empty-telemetry convention, `cache_writer.py`/`test_cache_writer.py:111-124`) for every one of the 334 sessions after the run; no session left half-written (guaranteed structurally by §5's atomic swap, re-confirmed here as a belt-and-suspenders count check).
- **Aggregate**: 334 sessions touched, 370 untouched (spot-checked by mtime — Practice-session directories' mtimes must be identical before/after the whole run); total `data/processed/` session-directory count unchanged at 704.

## 7. Cache and Runtime

- **Cache state**: `data/fastf1_cache/` already holds raw FastF1 data for the same 2018–2026 span as `data/processed/` (confirmed present in Stage A's filesystem enumeration); all 334 target sessions were originally ingested from this same cache directory, so a Stage C run is expected to hit warm cache for effectively all of them — no meaningful new network volume, and `fastf1.Cache.enable_cache()` (`fastf1_provider.py:91`) is the same call path used originally.
- **Cache-miss policy**: Stage C should fail loudly (log + mark session failed in the state log), not silently fetch fresh/unexpected upstream data, for any session whose cache entry is missing or incomplete — this is a design requirement to carry into Stage C's implementation, not something the current code enforces automatically today (FastF1 will transparently fall back to a live fetch on a cache miss unless told not to).
- **Runtime estimate, grounded in real recorded evidence, not the blind 704-session extrapolation**: `docs/m34-design-review.md:105` records M12's own measured **40–90 seconds per session**, "even benefiting from FastF1's local HTTP cache" — i.e., this figure already includes cache benefit, it is not a cold-fetch number. Applied to the actual 334-session Stage C target (not 704): **334 × 40–90s ≈ 13,360–30,060s ≈ roughly 3.7–8.4 hours**, plus a small, currently-unmeasured verification overhead per session (Parquet reads + diffs, expected to be low single-digit seconds, not separately benchmarked). This is a real range, not a point estimate — actual runtime should be measured on a small batch (e.g. one season, ~22-24 sessions) before committing to the full run, exactly as M12 did in per-season batches.
- **Batching recommendation**: M12's own historical backfill was explicitly run as "every season its own separate, explicitly-approved batch" (`docs/m34-design-review.md:108`, citing `CHANGELOG.md`'s M12 entry), never a single continuous sweep. Stage C should follow the same operational precedent — seven season-sized batches (2020–2026, roughly 47-58 sessions each within the 334 scope) rather than one 3.7-8.4-hour unattended run, giving natural checkpoints, bounded blast radius per batch, and a review point between batches.

## 8. Safety Boundary — Data + a Small Reusable Backfill Command

Per §3.2's finding that no existing entry point is both Parquet-only and reusable, M38 is **data + a small, narrowly-scoped new tool**, not a data-only operation using an existing command, and not a large new subsystem.

**Minimum new source files (Stage C, not created in Stage B):**
- One new pipeline module (e.g. `pipeline/pitwall_pipeline/backfill_m38.py`) containing: target-session resolution (wraps `build_ingestion_plan()`, filtered to `session_types=[RACE, QUALIFYING, SPRINT, SPRINT_QUALIFYING]`, unchanged), the staging-write step (calls `FastF1Provider.load_session()` + `write_session_cache()`, both unchanged), the verification step (§6), the atomic-swap step (§5), the state-log read/write, and a CLI (`--dry-run`, `--season`, `--resume`, mirroring `ingest_plan.py`'s existing argument conventions for consistency).
- One new test file (e.g. `pipeline/tests/test_backfill_m38.py`) exercising staging-write, verification pass/fail, atomic swap, and resume/skip logic — all against `tmp_path` fixtures and hand-built `NormalizedSessionData`, no real network or FastF1 calls, consistent with `test_cache_writer.py`'s and `test_ingest_plan.py`'s existing patterns.

**Explicitly zero changes to**: `normalize.py`, `cache_writer.py`, `fastf1_provider.py`, `ingest.py`, `ingest_event.py`, `ingest_plan.py`, `postgres_writer.py`, `db.py`, any backend or frontend source file, any dependency/lockfile, any other doc.

## 9. Product Value — Quantified, Not Uniform

- **334 of 704 sessions (47%)** gain M34 classification badges and M36 exclusion-tag capability.
- **176 of 704 sessions (25%)** additionally gain the M35 position chart (a strict subset of the 334).
- **370 of 704 sessions (53%, all Practice)** gain nothing from this milestone — deliberately, per §4's scope reasoning.
- Within the 334, the improvement is concrete and immediate: `DriverSelectPage` cards show finishing position/grid/status/points, `SessionAnalyticsPage` shows the lap-by-lap position chart (176 sessions), and `DriverLapTable` renders real yellow-flag/SC/VSC/red-flag exclusion tags instead of always-empty ones — for every historical Race, Qualifying, and Sprint-family session back to 2020, not just sessions ingested after M34/M35/M36 shipped.

## 10. Risks

1. **Unrelated-field drift risk** (§3.3) — mitigated, not eliminated, by row-count + value-equality verification per session before any swap; a detected diff blocks that session's swap and is surfaced for manual review rather than silently applied.
2. **No existing atomicity/verification tooling** — this is exactly what §5/§6/§8 design; until Stage C actually implements and tests it, the risk is real (this is a design document, not implemented code).
3. **Runtime uncertainty** — the 3.7–8.4 hour estimate is a real range from real prior evidence, not a guess, but has not been re-measured against the *current* codebase/cache state; Stage C should re-measure on a small batch first.
4. **Rare FastF1 upstream data revision** (§3.3) — a real, if unlikely, source of legitimate (not buggy) value changes on re-ingestion; verification would flag it as a diff, and a human would need to judge whether a flagged diff is a genuine upstream correction or a real problem.
5. **Staging/backup disk usage** — writing a full staging copy before swap roughly doubles peak disk usage for the session currently being processed (not the whole 334 at once, since staging is per-session and cleaned up after each swap) — small in absolute terms (individual sessions are MB-scale, not the 45GB cache).

## 11. Explicit Non-Goals

No new product capability or schema field (per this milestone's own instruction); no changes to `write_session_cache()`'s file format; no full 704-session run; no separate M34/M35/M36 passes (§4, one unified pass is correct); no PostgreSQL writes of any kind; no dependency changes; no npm install/update; no docs-reconciliation milestone (the two false `prd.md`/`success-metrics.md` sentences identified in Stage A remain a separate, trivial, unscheduled fix); no change to `docs/m9-design-review.md`; no actual ingestion, backfill execution, or Parquet/Postgres writes in Stage B itself.

## 12. Deviations from Stage A

- **M35's target population is 176, not ~170** — Stage A's fork approximated "Race+Sprint" (170) and missed the 6 2023 Sprint-Shootout sessions that `normalize.py:409-414` explicitly documents as also receiving `Position` data ("pre-2024 Sprint Qualifying"). Corrected via direct source citation and a fresh per-year filesystem count (§4).
- **FastF1 version-drift risk is weaker than Stage A characterized it.** Stage A's mechanism fork flagged "provider-version risk is real, not hypothetical" without checking version history. Stage B's git-log check of `pipeline/uv.lock` across all 4 commits that ever touched it shows fastf1 has been locked at `3.8.3` since the dependency was first introduced — no drift has occurred. The risk is now downgraded from "real" to "structurally absent for this specific corpus," though still worth a mention since a future dependency bump before Stage C runs would reopen it.
- **`ingest_session()`/`ingest_event()`/`execute_ingestion_plan()` are not directly reusable for execution**, contrary to what a naive reading of Stage A's "reuses M12 infra unmodified" framing might suggest — they all reach PostgreSQL, which this milestone's safety boundary forbids. Stage B narrows the reusable surface to `FastF1Provider.load_session()` + `write_session_cache()` (Parquet-only, confirmed via import inspection) plus `build_ingestion_plan()` (discovery-only), and designs a new, small orchestration layer around them (§8). This is a real, source-verified correction, not a stylistic rewording — it directly affects what Stage C is allowed to build on.
- **Target population framing simplified**: Stage A described M34/M35/M36 as needing potentially different scopes requiring resolution in Stage B. Stage B resolves this cleanly — 334 is the union of all three fields' real applicability at the scope this milestone recommends (M36 deliberately capped at 334, not extended to its technical 704 ceiling) — so the "single unified pass, single population" design in §4/§5 is both correct and simpler than Stage A's more open-ended framing implied.

## 13. Safety Constraints Confirmed for This Stage

- Stage B performed no ingestion, no re-ingestion, no Parquet writes, no PostgreSQL writes, no schema migrations, no dependency changes.
- `docs/m9-design-review.md` untouched.
- This document (`docs/m38-design-review.md`) is the only file created in Stage B.
- Nothing staged, committed, or pushed.

## 14. Stage C Implementation

Built `pipeline/pitwall_pipeline/backfill_m38.py` and `pipeline/tests/test_backfill_m38.py` exactly per §8's scope — no other source file modified. `ruff format`/`ruff check`/`mypy --strict` all pass; the full pipeline test suite passes (162 passed, 15 pre-existing PostgreSQL-connection errors unrelated to this change, matching Stage A's own finding of a no-live-DB sandbox).

One narrow, documented exception to §3.2's design: `fastf1.Cache.offline_mode(True)` is called directly from `backfill_m38.py`, not from `fastf1_provider.py`, because `FastF1Provider.__init__` calls `enable_cache()` on every construction and `enable_cache()` rebuilds the cached requests session from scratch (verified in `fastf1/req.py`), silently wiping any offline-mode flag set before it. This is a cache-mode toggle, not a data-fetch/shape call, and is the only way to satisfy this milestone's cache-safety requirement without modifying `fastf1_provider.py`, which Stage C's approved source scope forbids.

`build_ingestion_plan()` was evaluated for target discovery (per §8's "reuse where appropriate") and deliberately **not** used, for the same reason: it internally reconstructs its own `FastF1Provider`, which would reset offline-mode before discovery ran. Discovery is instead purely filesystem-derived — reading each already-processed session's own `session.parquet` metadata — which requires zero FastF1/network calls and is strictly safer for this purpose.

### 14.1 Critical correction found during the real-data trial run

Before running the full 334-session backfill, a single real session (`2020_austrian_grand_prix_qualifying`) was processed against real cached FastF1 data as a validation trial (per §7's "measure on a small batch first" recommendation). The tool's own pre-swap verification **correctly rejected it**: `classified_position contains empty value(s)`.

Direct empirical inspection of real cached FastF1 output (not the `normalize.py` docstring, which was never checked against real data by either Stage A or Stage B) showed:

| Session type | `ClassifiedPosition`/`Status` | `GridPosition`/`Points` | `Lap.Position` | `Lap.TrackStatus` |
|---|---|---|---|---|
| Race | real value (e.g. `'1'`, `'Finished'`) | real value | real value | real value |
| Sprint | real value | real value | real value | real value |
| Qualifying (any year) | **empty string `''`** | **NaN** | **NaN** | real value |
| Sprint Qualifying (2023 "Shootout" *and* 2024+ knockout format) | **empty string `''`** | **NaN** | **NaN** | real value |
| Practice | NaN (as already known) | NaN | NaN | real value |

This directly contradicts:
- `normalize.py:371-378`'s own docstring claim that M34's four classification columns are "populated by FastF1 for Race/Sprint/Qualifying-family sessions" — false; only Race/Sprint.
- §4's "pre-2024 Sprint Qualifying" exception for M35 — false; `Lap.Position` is never populated for *any* Sprint Qualifying session, in any era.
- M36's `track_status` claim holds up: verified genuinely unconditional (Qualifying, Sprint Qualifying, and Practice all showed real, non-null values).

**Fix applied** (`backfill_m38.py`): `_is_classification_applicable()` (renamed from `_is_m35_applicable()`) now returns `True` only for Race/Sprint, and is shared by both `TargetSession.m34_applicable` and `.m35_applicable` (previously M34 had no applicability gate at all — it was verified with the same blanket "not all null" check regardless of session type, which passed even for the empty-string Qualifying case, missing the bug the trial caught). `_verify_m34_fields()` now takes `target` and enforces, symmetrically with the existing M35 check: real values required when applicable, and `classified_position`/`grid_position`/`status`/`points` must be empty/null (never fabricated) when not.

**Scope impact**: the *target population* is unchanged (still 334 — `EXPECTED_TOTAL`/`EXPECTED_COUNTS_BY_TYPE` are correct filesystem counts, not affected by this bug) because M36's `track_status` genuinely and correctly benefits the full 334, including Qualifying/Sprint Qualifying. What changes is *which fields* each session in that population actually receives: 170 sessions (Race+Sprint) get all of M34+M35+M36; the other 164 (Qualifying+Sprint Qualifying) get M36 only, correctly left empty for M34/M35 rather than either failing verification forever (the pre-fix state) or being silently fabricated (never happened, caught by verification both before and after the fix).

This is exactly the failure mode §3.3/§6 were designed to catch — "do not claim safe merely because the code is deterministic" — and the mandatory pre-swap verification worked as designed: it blocked the single trial session before any live data was touched, rather than silently writing wrong data or crashing mid-run.

### 14.2 Real single-session trial (post-fix)

Re-ran `2020_austrian_grand_prix_qualifying` after the fix: completed successfully in 34s (cache-hit, no network activity logged). Verified directly: `classified_position` correctly blank for all drivers, `position` correctly null for all 298 laps, `track_status` correctly populated (`'1'`, `'12'`, real multi-code values), all pre-existing non-target columns unchanged, backup copy retained at `data/.m38-backup/2020_austrian_grand_prix_qualifying/`.

### 14.3 Two more real-data corrections found during the first real season batch

Running the corrected tool against the full 2020 season (34 sessions) surfaced two more false positives in verification — both legitimate FastF1 conventions, not data problems:

- **`grid_position` of `0`** (2020 Styrian GP, driver GRO, and 2 other Race sessions): real FastF1 convention for "started from the pit lane, no assigned grid slot" — confirmed by directly inspecting the loaded `Driver` records. The original check rejected any `grid_position <= 0`; fixed to only reject genuinely negative values.
- **`track_status` of `''`** (empty string; 2020 Eifel GP, 23 of 1019 laps, concentrated on `lap_number == 1`): real FastF1 gap — the formation/start lap often has no recorded track status yet. The original check rejected any empty string as an "invalid code"; fixed to treat it the same as "no data" (matching how `None`/`NaN` are already handled), and only reject genuinely unrecognized non-empty codes.

Both fixes applied to `_verify_m34_fields()`/`_verify_m36_field()` in `backfill_m38.py`, with regression tests added (`test_verify_session_accepts_zero_grid_position`, `test_verify_session_accepts_empty_track_status`). Consistent with §14.1: verification did its job — it blocked these 4 sessions before touching live data, allowing investigation before any incorrect data (or incorrectly-too-strict rejection) became permanent. The batch was resumed with `--resume` after each fix; the previously-failed sessions' live directories were untouched throughout and retried cleanly.

### 14.4 Full real-data execution — final results

All 7 season batches (2020–2026) were run against the real `data/processed/` corpus, each via `--season <year> --resume`, using the offline-mode-enforced `FastF1Provider.load_session()` → stage → verify → atomic-swap pipeline. Two batches (2023, 2024) were killed mid-run by what appears to be an environment-level background-process duration limit (~45 min), not a tool defect; both times the state log's last entry for the in-flight session was `started` only (never `staged`), and the live directory for that session was confirmed byte-for-byte unchanged before resuming with `--resume`, which picked up cleanly with zero duplication or corruption.

**Two sessions could not be backfilled**, both a genuine, external data gap rather than a tool defect: `2023_s_o_paulo_grand_prix_sprint` and `2026_british_grand_prix_sprint` both raise `fastf1.exceptions.ErgastInvalidRequestError` / log "No result data for this session available on Ergast! (This is expected for recent sessions)" — FastF1 sources its classification data from the third-party Ergast API for these Sprint sessions, and the cached snapshot (frozen at original ingestion time, shortly after each race weekend) predates Ergast having that data available. A live fetch today might succeed, but that is explicitly forbidden by this milestone's offline-only safety rule (§6/§10) — re-attempting these two sessions is out of scope for M38 and would need a deliberate, separately-approved online re-fetch in a future milestone. Verification correctly rejected both, left their live directories on the untouched pre-backfill schema, and did not block the rest of either batch.

| Season | Sessions | Completed | Failed (Ergast gap) | Notes |
|---|---|---|---|---|
| 2020 | 34 | 34 | 0 | 1 real trial + false-positive verification fixes found here |
| 2021 | 47 | 47 | 0 | clean |
| 2022 | 47 | 47 | 0 | clean |
| 2023 | 56 | 55 | 1 | killed once mid-run, resumed cleanly |
| 2024 | 60 | 60 | 0 | killed once mid-run, resumed cleanly |
| 2025 | 60 | 60 | 0 | clean, ran to completion unattended (~94 min) |
| 2026 | 30 | 29 | 1 | clean |
| **Total** | **334** | **332** | **2** | |

**`--verify-final` aggregate check** (read-only, run after all batches): `population_ok=True`, `total_session_dirs=704` (unchanged), `target_session_dirs=334`, `non_target_session_dirs=370` (all Practice sessions confirmed untouched), `failing=2` — exactly, and only, the two known Ergast-gap sessions above, correctly still missing all M34/M35/M36 columns (never swapped). No other session shows any preservation, schema, or integrity failure.

**PostgreSQL**: confirmed untouched. No live PostgreSQL server is reachable in this environment (Docker daemon not running — consistent with Stage A/B's own finding of a no-live-DB sandbox), and `backfill_m38.py` has zero `psycopg`/`postgres`/`db` imports (confirmed by direct grep of the file). A live SELECT-count check was not possible in this environment for lack of a running database; this is a pre-existing environment limitation, not a gap introduced by this milestone.

**Total real runtime**: approximately 7.7 hours of cumulative background processing across all batches and retries (2020: 2402s+452s; 2021: 3373s; 2022: 3084s; 2023: ~2655s killed + 2604s retry; 2024: ~2655s killed + 1182s retry; 2025: 5652s; 2026: 3526s), within the §7 estimate's 3.7–8.4 hour range, near the upper end — consistent with per-session verification overhead (Parquet reads/diffs) adding to the base FastF1 load time beyond the original cache-only estimate.

**Rollback state**: every one of the 332 successfully-swapped sessions has its pre-backfill original retained at `data/.m38-backup/<session_id>/`, per the retention policy in §5 (kept until explicitly cleaned up in a separate, deliberate step — none was performed in Stage C).
