# PitWall — M18 Design Review: Per-Session File-Level Caching in ParquetRepository

## Status

Design only. Nothing in this document has been implemented. `docs/m9-design-review.md`'s
pre-existing, unrelated single-blank-line modification is untouched by this work.

## 0. Baseline

Verified directly, this session:

- `HEAD` = `origin/main` = `ee7a82cf6d769ff8453f29f4dae96469876a477d` (M17, committed and pushed).
- `git status --porcelain`: only `M docs/m9-design-review.md` (the pre-existing, out-of-scope
  single-blank-line diff, confirmed via `git diff --stat` to be unchanged — `+1` line only).
  Nothing else is staged, modified, or untracked other than this document being added.
- No ingestion, database write, or Parquet write has occurred in producing this document.

## 1. Problem

M17 (`docs/m17-design-review.md` §3) added `ParquetRepository._index()`, which memoizes
*session discovery* — the scan that maps a `session_id` to its on-disk directory and parsed
`Session` metadata — once per repository instance. That fixed the specific cost M17 measured
(re-scanning `*/*/*/session.parquet` on every lookup).

It did **not** memoize *reading a session's own data files*. Once `_find_session` resolves a
`session_id` to a directory, `list_drivers`, `list_laps`, `get_telemetry`, and
`list_track_points` each still call `pd.read_parquet` fresh on every single invocation — even
when called repeatedly against the *same* session, for the *same* file, within the *same*
request.

This is a real, currently-shipped defect, not a hypothetical: `GET
/sessions/{id}/analytics/drivers` (`app/api/session_analytics.py`, M8) calls
`get_telemetry(session_id, driver_id, lap_number)` once per lap, per driver, inside a loop
covering the full grid. For a real 2023 Bahrain GP race session (20 drivers, ~45–70 laps each,
`telemetry.parquet` at 32MB / 800,120 rows), this is **~914 calls that each re-read and
re-parse the same file**, measured at **37.7s** wall-clock (reproduced identically across two
runs, ruling out cold-disk-cache effects). An isolated benchmark of 914 repeated
`pd.read_parquet` calls against the same real file took 16.9s in isolation — consistent with
the observed cost being CPU-bound Parquet parsing multiplied by call count, not I/O latency.

This directly violates the PRD's own V1 success criterion that session data "loads in seconds,
not minutes," on an already-shipped route. It is the natural, evidence-forced next layer of the
pattern M17 established: M17 cached *where* a session's files live; M18 caches *the contents of
those files*, once a session has actually been looked up.

## 2. Goals

- Read each of a session's own data files (`drivers.parquet`, `laps.parquet`,
  `telemetry.parquet`, `track.parquet`) **at most once per `ParquetRepository` instance**,
  regardless of how many times a method that needs that file is called against that session,
  and regardless of what filter arguments (`driver_id`, `lap_number`) those calls pass.
- Preserve every existing method's return value, ordering, and error/empty-input behavior
  exactly.
- Preserve the `TelemetryRepository` interface, all Pydantic API models, all routes, and all
  frontend code, completely unchanged.

## 3. Re-reading the current implementation

`backend/app/repositories/parquet_repository.py` (212 lines, unchanged since M17, re-read in
full for this document) and `backend/app/repositories/base.py` (the actual interface file —
note: the interface lives in `base.py`, not `telemetry_repository.py`; there is no file by that
name in the repository) confirm the following.

### 3.1 The six session_id-keyed methods and what they currently read

| Method | File read | Filter applied | Currently cached? |
|---|---|---|---|
| `get_session` | none (resolved via `_index()`) | — | yes, by M17 |
| `has_telemetry` | none (reuses `found[1].has_telemetry`, itself computed once during `_index()` build via `_telemetry_row_count`, a pyarrow footer-metadata read, not `pd.read_parquet`) | — | yes, by M17 |
| `list_drivers` | `drivers.parquet` | none | **no** |
| `list_laps` | `laps.parquet` | `driver_id` (optional), applied via `df[df["driver_id"] == driver_id]` after the read | **no** |
| `get_telemetry` | `telemetry.parquet` | `driver_id` + `lap_number`, applied via boolean mask, then `.sort_values("distance_m")`, both after the read | **no** |
| `list_track_points` | `track.parquet` | none (only `.sort_values("distance_m")`) | **no** |
| `list_sessions` | none (resolved via `_index()`) | — | yes, by M17 |

`get_session`, `has_telemetry`, and `list_sessions` touch no file beyond what `_index()`
already memoizes — M18 does not change them at all. `_iter_session_dirs()`'s own
`pd.read_parquet(session_file)` reads of each `session.parquet` are already read exactly once,
ever, per instance, via `_index()`'s existing memoization; introducing a second, separate cache
for `session.parquet` would duplicate what M17 already solved. M18's scope is exactly the four
methods reading `drivers.parquet`, `laps.parquet`, `telemetry.parquet`, and `track.parquet`.

### 3.2 Every current caller, re-enumerated fresh (`grep` across `app/api/` and `app/services/`)

| Method | Callers |
|---|---|
| `list_drivers` | `driver_trends.py`, `sessions.py`, `session_analytics.py`, `tyre_performance.py` |
| `list_laps` | `sessions.py`, `driver_trends.py`, `stints_compare.py`, `laps_compare.py` (×2, two distinct sessions), `session_analytics.py` (×2 — once filtered by `driver_id`, once unfiltered), `tyre_performance.py` (×2 — same pattern) |
| `get_telemetry` | `session_analytics.py` (in the per-lap-per-driver loop — the measured 37.7s call site), `telemetry.py` (single direct route), `laps_compare.py` (×2, two distinct sessions) |
| `list_track_points` | `track.py` (single call) |

Two things this confirms directly, from real call sites rather than hypothetical scenarios:

- **`session_analytics.py` and `tyre_performance.py` both already call `list_laps` twice
  against the same session with different filter arguments** (once with `driver_id=...`, once
  with no filter at all) — this is the exact "two different filtered results must both be
  correct from one shared unfiltered cache" scenario, not a hypothetical.
- **`laps_compare.py` calls `get_telemetry` (and `get_session`, `list_laps`) against two
  distinct `session_id`s from a single repository instance in one request** — this is the exact
  cross-session-isolation scenario a per-session cache must get right.

No caller of any of these four methods was found to mutate a returned `list[Driver]`,
`list[Lap]`, `list[TelemetrySample]`, or `list[TrackPoint]` in place, nor any element of those
lists in place (`grep` for `.append(`, `.sort(`, attribute assignment against these variables
across all six caller files: none). This is also structurally guaranteed, independent of caller
discipline: `Driver`, `Lap`, `Session`, `TelemetrySample`, and `TrackPoint` (imported from
`app.models`) are all `ApiModel` subclasses with `ConfigDict(frozen=True, ...)` — Pydantic
raises on any attempted attribute assignment against them. A caller cannot mutate what it
receives even if it tried.

### 3.3 `app/dependencies.py` (re-read fresh)

```python
def get_telemetry_repository() -> TelemetryRepository:
    settings = get_settings()
    return ParquetRepository(settings.processed_dir)
```

No `@lru_cache`, no singleton — confirmed unchanged from M17. A fresh `ParquetRepository` is
constructed per request. Combined with every route being a plain `def` (its own threadpool
worker, per FastAPI's sync-route handling — unchanged since M14), no repository instance, and
therefore no cache introduced by this design, is ever shared across requests or threads. This is
the same lifecycle guarantee M17's index already relies on and already has tests for; M18 adds
no new claim here, only reuses it for a second set of instance attributes.

### 3.4 `backend/tests/test_parquet_repository.py` (re-read fresh, 474 lines)

Confirms the existing test conventions this design's tests must match: `session_cache_dir`
fixture (one fixed synthetic session, `write_session_cache`), `tmp_path`-based tests for
multi-session/edge cases via `write_minimal_session` (+ the M17-added `_write_roster_and_laps`
helper for tests needing `drivers.parquet`/`laps.parquet`), and `patch.object(ParquetRepository,
"<method>", wraps=repo.<method>)` as the established call-count-spy pattern (used in
`test_repeated_lookups_on_the_same_instance_do_not_rebuild_the_index` and
`test_a_naive_22_session_lookup_pattern_scans_exactly_once`) for proving "reads exactly once"
deterministically, without wall-clock timing.

One existing-behavior fact this re-read surfaced, relevant to §6.4 below: `write_minimal_session`
always writes `telemetry.parquet` (empty if `include_telemetry=False`), but does **not** write
`drivers.parquet`, `laps.parquet`, or `track.parquet` at all unless a test separately calls
`_write_roster_and_laps` (or the equivalent). Calling `list_drivers`/`list_laps`/
`list_track_points` against such a session today raises `FileNotFoundError` from
`pd.read_parquet` — there is no existing empty-list fallback for a *missing file* on a *known*
session (only for an *unknown session_id*, via `found is None`). This is current, deliberate
behavior: in production every genuinely-ingested session directory has all five files (the
pipeline writes them together), so this path is not expected to occur against real data: it is
exercised in tests only as a fixture-completeness constraint, not as a defensive case the
repository handles.

## 4. Design

### 4.1 Cache boundary

The cache stores exactly the **unfiltered DataFrame returned by `pd.read_parquet`** for each of
`drivers.parquet`, `laps.parquet`, `telemetry.parquet`, `track.parquet`, keyed by `session_id`.
Filtering (`driver_id`, `lap_number`) and sorting (`distance_m`) continue to happen exactly
where they happen today — as a local operation on the DataFrame *after* it is obtained from the
cache — and are never written back into the cache. The cache never holds a filtered or sorted
result.

This directly resolves the correctness risks the task calls out by construction, not by added
guard logic:

- **(A) Independent filtered results from one shared cache.** `df[df["driver_id"] ==
  driver_id]` (pandas boolean-mask indexing) always returns a new DataFrame — it is documented
  pandas behavior that boolean-array indexing copies, unlike some `.loc`/`.iloc` slice forms
  that can return a view. The cached entry is never touched by this operation; two calls with
  different `driver_id` values each filter fresh from the same untouched cached frame and get
  independently correct results. This is exercised today, for real, by `session_analytics.py`
  and `tyre_performance.py` calling `list_laps` both filtered and unfiltered against the same
  session (§3.2).
- **(B) `get_telemetry` must not cache a filtered result as canonical.** Same mechanism:
  `get_telemetry` filters by `driver_id` *and* `lap_number` and then calls `.sort_values(...)`
  (also non-mutating; `inplace=False` is the default and is not overridden anywhere in this
  file) on a local variable derived from the cached frame. The cache key is `session_id` alone,
  never `(session_id, driver_id, lap_number)` — there is no code path by which a per-lap result
  could be stored as if it were the whole file.
- **(C) Mutation leakage.** No caller mutates a returned list or model in place (§3.2), and the
  returned model types are frozen Pydantic models that reject mutation outright. Additionally,
  no operation performed on the cached DataFrame itself, anywhere in this file, mutates in
  place — confirmed method-by-method in §4.3.
- **(D) Missing/empty-file behavior.** Preserved exactly: the caching read helper performs
  `pd.read_parquet(path)` exactly where the method does today; if the file is missing, the same
  `FileNotFoundError` propagates, and nothing is written into the cache (the dict assignment
  simply never executes). An empty-but-present file (e.g. `include_telemetry=False`) reads to an
  empty DataFrame and caches *that* — correct, since re-reading it again would also produce an
  empty DataFrame.
- **(E) `has_telemetry`.** Unaffected — it already reuses the index-computed value and reads no
  file directly (§3.1). This design adds nothing to it and changes nothing about it.
- **(F) Session directory lookup.** The cache never rediscovers a session's directory; every
  method still resolves `session_dir` via the existing `_find_session(session_id)` call first,
  exactly as today, and only then reads/looks up the cache using that already-resolved
  directory.
- **(G) Cross-session isolation.** Each cache is keyed by `session_id`, and every lookup uses
  the exact `session_id` the caller passed in — there is no path by which session A's cached
  frame could be returned for a request naming session B. This is exercised for real by
  `laps_compare.py` servicing two distinct sessions from one instance (§3.2).

### 4.2 Cache structure: four dicts, one shared helper

Four separate instance attributes, one per file, each `dict[str, pd.DataFrame]`, initialized to
`{}` in `__init__` (not `None` — unlike `_session_index`, this is not a single eager-triggered
full build; it grows one entry at a time, only for sessions this instance is actually asked
about):

```python
self._drivers_cache: dict[str, pd.DataFrame] = {}
self._laps_cache: dict[str, pd.DataFrame] = {}
self._telemetry_cache: dict[str, pd.DataFrame] = {}
self._track_points_cache: dict[str, pd.DataFrame] = {}
```

Four separate dicts were chosen over one generic `dict[tuple[str, str], pd.DataFrame]` keyed by
`(session_id, file_kind)`:

- Each dict's value type is unambiguous at the call site — no invented "file kind" string/enum
  constant is needed, and none exists elsewhere in this codebase for this purpose.
- Cache-key collisions are structurally impossible: a collision could only occur *within* one
  dict, and each dict is keyed purely by `session_id` — a value `_find_session` already treats
  as globally unique. A combined tuple-keyed design would additionally depend on the file-kind
  tag never being mistyped or reused; four dicts remove that class of mistake entirely rather
  than guarding against it.
- It matches the existing style of `_session_index` — one dedicated field for one dedicated
  purpose — rather than introducing a new generic-cache abstraction for four call sites.

The read-or-populate logic is identical across all four, so it is factored into one small
private helper rather than repeated four times:

```python
def _cached_read(
    self, cache: dict[str, pd.DataFrame], session_id: str, session_dir: Path, filename: str
) -> pd.DataFrame:
    if session_id not in cache:
        cache[session_id] = pd.read_parquet(session_dir / filename)
    return cache[session_id]
```

Each of the four methods changes only its read line, e.g.:

```python
def list_laps(self, session_id: str, driver_id: str | None = None) -> list[Lap]:
    found = self._find_session(session_id)
    if found is None:
        return []
    session_dir, _ = found
    df = self._cached_read(self._laps_cache, session_id, session_dir, "laps.parquet")
    if driver_id is not None:
        df = df[df["driver_id"] == driver_id]
    return [_lap_from_row(row) for row in df.to_dict("records")]
```

`get_session`, `has_telemetry`, and `list_sessions` are not touched at all.

### 4.3 Whether a copy is needed on cache retrieval

No. `_cached_read` returns the cached DataFrame object directly, uncopied. Every subsequent
operation any of the four methods performs on it is non-mutating by pandas' own default
semantics, verified against the current code (not assumed):

- Boolean-mask filtering (`df[df["driver_id"] == driver_id]`, and the compound mask in
  `get_telemetry`) always returns a new DataFrame.
- `.sort_values("distance_m")` is called with no `inplace=True` anywhere in this file — its
  default (`inplace=False`) returns a new, sorted DataFrame and leaves the source unmodified.
- `.to_dict("records")` is a read-only conversion.

Since no method ever assigns back into the cached frame, and no caller ever receives the
DataFrame itself (every method's return type is a `list` of frozen Pydantic models converted via
`_driver_from_row`/`_lap_from_row`/`_telemetry_sample_from_row`/`_track_point_from_row`), an
extra defensive copy on read would protect against nothing that can actually happen in this
code path. Per the task's own instruction, none is added.

### 4.4 Lifecycle

Identical to M17's index, and for the identical reason (§3.3): per-instance, lazily populated
(nothing is read until the first method that needs a given file is actually called), no process-
wide cache, no singleton, no mtime-based invalidation, no filesystem watcher, no eager preload of
any file for any session the instance hasn't been asked about. A fresh `ParquetRepository` per
request means a fresh, empty set of all four caches per request — no cache entry ever survives
past the request that populated it, so no invalidation logic is needed, matching M17's own
already-tested argument.

## 5. Performance contract

Deterministic acceptance criterion, matching the task's requirement that wall-clock be
supplementary evidence only:

> For a single `ParquetRepository` instance, each of `drivers.parquet`, `laps.parquet`,
> `telemetry.parquet`, and `track.parquet` for a given session is read via `pd.read_parquet` **at
> most once**, regardless of how many times a method needing that file is called against that
> session, and regardless of the filter arguments passed.

This is proved via the same `patch.object(ParquetRepository, "_cached_read", wraps=...)` (or
equivalently, patching `pandas.read_parquet` itself and asserting call count) spy pattern M17
already established — no wall-clock timing required for the pass/fail gate.

Real-data wall-clock (§7) is measured as supplementary evidence that the fix addresses the
originally-measured 37.7s regression, not as the acceptance gate itself, and no specific target
runtime is promised in advance.

## 6. Test design

All deterministic, added to `backend/tests/test_parquet_repository.py`, following its existing
`session_cache_dir` / `tmp_path` + `write_minimal_session`/`_write_roster_and_laps` conventions:

1. Each cache dict is empty (`== {}`) immediately after construction (lazy init, mirroring
   `test_index_is_not_built_until_first_relevant_access`).
2. For each of `list_drivers`, `list_laps`, `get_telemetry`, `list_track_points`: calling the
   method twice against the same session (with the same or different filter arguments) results
   in exactly one underlying `pd.read_parquet` call for that session's file — via
   `patch.object`/`wraps` on `_cached_read` or on `pandas.read_parquet`, asserting
   `call_count == 1` (or, for `pandas.read_parquet` directly, that it was called exactly once
   with that session's path for that filename).
3. Two calls to `list_laps` with different `driver_id` values (and two calls to `get_telemetry`
   with different `driver_id`/`lap_number` combinations) against the same session each return
   the *correct, independent* filtered result — not each other's, not the union, not empty.
4. A dedicated regression test reproducing the M8 pattern directly: one session, multiple
   drivers, multiple laps per driver, `get_telemetry` called once per (driver, lap) pair (e.g.
   2 drivers × 3 laps = 6 calls) — assert the underlying `telemetry.parquet` read occurs exactly
   once, not once per call, and that all 6 results are individually correct.
5. Cross-session isolation: two sessions serviced by one instance (mirroring `laps_compare.py`'s
   real access pattern), each with distinct driver/lap data — calling `list_laps`/`get_telemetry`
   against both from the same instance returns correct, non-cross-contaminated results, and each
   session's file is read once (two total reads of that filename across the two sessions, not
   one, not four).
6. A fresh `ParquetRepository` instance against the same directory has empty caches and performs
   its own fresh reads — mirroring `test_a_fresh_repository_instance_gets_a_fresh_index`.
7. Missing-file behavior is unchanged: a session missing `drivers.parquet` (built via
   `write_minimal_session` without `_write_roster_and_laps`) still raises `FileNotFoundError`
   from `list_drivers`, exactly as before this change, and nothing is cached from the failed
   attempt (a subsequent successful write-then-call still reads fresh, not a stale
   `FileNotFoundError`-adjacent state).
8. Full existing regression suite (all pre-M18 tests in this file) continues to pass unchanged —
   no existing test's expected return value, ordering, or exception behavior changes.

## 7. Real-data verification plan (to run during implementation, not in this document)

Against the same real, already-ingested 2023 Bahrain GP race session used for M18 Stage A's
original measurement (20 drivers, ~800,120 telemetry rows), read-only:

- Before/after wall-clock for `GET /sessions/2023_bahrain_grand_prix_race/analytics/drivers`
  (the route containing the measured 37.7s call pattern).
- Before/after read-count instrumentation confirming `telemetry.parquet` is read once per
  driver-summary request cycle for that session, not once per lap.
- Response-body equality between the before and after implementation (same drivers, same lap
  aggregates, same `full_throttle_pct`/`brake_event_count` values) — this is an internal
  performance change, so the response must be byte-for-byte identical.
- Postgres row counts (`stints`, `pit_stops`) and a `session.parquet` file count under
  `data/processed/`, checked before and after, confirming zero mutation of any ingested data.

No specific final runtime is promised in advance; the wall-clock numbers are reported as
evidence, not as a pass/fail gate (§5).

## 8. API / architecture boundary

No route, Pydantic model, service function, repository interface method, migration, ingestion
code, dependency, or frontend file is touched. `base.py`'s `TelemetryRepository` ABC is
unchanged — this is a private implementation change entirely inside `ParquetRepository`, exactly
mirroring M17's own boundary statement for its index.

## 9. Non-goals

Process-wide or cross-request caching; any `@lru_cache`/singleton on the repository or its
methods; mtime-based or any other invalidation; a filesystem watcher; eager preloading of any
file for any session not actually requested; an eviction policy (the cache's lifetime is already
bounded by the per-request instance lifetime — nothing more is needed); caching filtered or
sorted DataFrames; any API/schema/route change; any new `TelemetryRepository` interface method;
any frontend work; unrelated Parquet read/write optimizations (compression, column pruning,
schema changes); a bulk/batch query engine; any cross-season feature; any M18 product feature
beyond this fix. `_telemetry_row_count`'s pyarrow-footer-metadata reads (used only inside
`_iter_session_dirs`, already effectively free and already called at most once per session via
`_index()`) are out of scope — merging them into this cache would provide no measurable benefit
and would blur the boundary between M17's index and this design.

## 10. Scope / affected files

Expected to be exactly two files:

- `backend/app/repositories/parquet_repository.py` — the four cache fields, the `_cached_read`
  helper, and one changed line each in `list_drivers`, `list_laps`, `get_telemetry`,
  `list_track_points`.
- `backend/tests/test_parquet_repository.py` — the tests in §6.

No other file is expected to require a change. If implementation surfaces a need to touch
anything else, that will be raised explicitly rather than done silently.

## 11. ADR assessment

No ADR trigger is met: no new dependency, no new architectural layer, no reversal of a prior
decision, and no change to the `TelemetryRepository` interface or its documented contract
(ADR-0005, ADR-0006, ADR-0009 all continue to hold exactly as before). This is the same
conclusion M11 through M17 each reached for implementation-level changes behind an unchanged
interface.

## 12. Deviations / open questions

None. Every question the task raised (cache boundary, generic-vs-per-file structure, copy
necessity, lifecycle, missing-file behavior, `has_telemetry` interaction, session-directory
reuse, cross-session isolation, performance-contract determinism) was resolved directly from
re-reading the current code and its real callers (§3–§6), not by assumption. The one factual
discrepancy noted (§3: the interface file is `base.py`, not `telemetry_repository.py`) is a
naming correction, not a design decision requiring a choice.

## 13. Safety confirmation

- Exactly one file was created by this task: `docs/m18-design-review.md`.
- No other file was created, modified, staged, committed, or pushed.
- `docs/m9-design-review.md` remains at its pre-existing baseline diff (`+1` blank line),
  unmodified, unstaged.
- No ingestion, no database write, no Parquet write occurred.
- Nothing has been committed or pushed.

**Stop.** Awaiting explicit approval before any M18 implementation.
