# PitWall — M19 Design Review: Secondary Telemetry Lookup Index in `ParquetRepository`

## Status

Design only. Nothing in this document has been implemented. `docs/m9-design-review.md`'s
pre-existing, unrelated single-blank-line modification is untouched by this work.

## 0. Baseline

Verified directly, this session:

- `HEAD` = `origin/main` = `e9ec3c732d61c3bc2fc6ff0c89462e6d603911ec` (M18, committed and pushed).
- `git status --porcelain`: only `M docs/m9-design-review.md` (the pre-existing, out-of-scope
  single-blank-line diff). Nothing else is staged, modified, or untracked other than this
  document being added.
- No ingestion, database write, or Parquet write has occurred in producing this document. All
  benchmarking below was read-only against the already-ingested `data/processed/` cache, run from
  standalone scripts outside the repository (session scratchpad), never touching `parquet_repository.py`
  or any test file.

## 1. Problem Statement

M18 (`docs/m18-design-review.md`) made each of a session's four data files readable **at most
once per `ParquetRepository` instance**, closing the repeated-`pd.read_parquet` cost it measured
(37.7s → ~18s on a real full-grid session-analytics request). Its own §9 non-goals explicitly
scoped out "the repeated per-lap filtering/aggregation cost downstream of the cache" — it cached
the *file*, not the *lookup*. That deferred cost is now the dominant one, and this design is the
narrow, evidence-forced next layer of the same pattern: M17 cached *where* a session's files
live, M18 cached *the contents of those files*, M19 caches *how to find one driver's one lap
inside an already-cached file*.

## 2. Evidence (re-measured this session, real data, read-only)

Re-verified directly against the real 2023 Bahrain GP race session
(`data/processed/2023/bahrain_grand_prix/race`, 20 drivers, `telemetry.parquet` = 800,120 rows,
181.63MB in memory as a `DataFrame`) already used for M18's own verification.

Root-cause trace, `SessionAnalyticsPage` → backend:

```
GET /sessions/{id}/analytics/drivers                          (app/api/session_analytics.py)
  get_session_analytics()
    drivers = repository.list_drivers(session_id)              -- 1 file read (M18), fast
    for driver in drivers:                                      -- 20 drivers
      _fetch_driver_summary(repository, session_id, driver.driver_id)
        laps = repository.list_laps(session_id, driver_id=...)  -- filters the M18-cached
                                                                     laps.parquet frame; cheap,
                                                                     not this milestone's target
        telemetry_by_lap = {
          lap.lap_number: repository.get_telemetry(session_id, driver.driver_id, lap.lap_number)
          for lap in laps                                        -- ~53 laps/driver average
        }
          ParquetRepository.get_telemetry()                      (parquet_repository.py:216)
            df = self._cached_read(self._telemetry_cache, ...)   -- M18: cache hit after the
                                                                     first call; 0 further file
                                                                     reads
            df = df[(df["driver_id"] == driver_id)
                     & (df["lap_number"] == lap_number)]         -- <-- THE BOTTLENECK: a fresh
                                                                     boolean mask over all
                                                                     800,120 rows, every call
            df = df.sort_values("distance_m")
            return [_telemetry_sample_from_row(row) for row in df.to_dict("records")]
```

Benchmark (fresh `ParquetRepository`, real Bahrain data, simulating `_fetch_driver_summary`'s
exact access pattern — 1,056 `get_telemetry` calls, one per driver/lap pair):

| Step | Measured |
|---|---|
| Session index build (`get_session`) | 0.68s (one-time per instance, M17) |
| `list_drivers` | 0.002s |
| First `get_telemetry` call (pays the real `telemetry.parquet` read) | 75ms |
| Each subsequent `get_telemetry` call (1,055 of them) | ~14–16ms avg |
| **Total full-grid `get_telemetry` loop** | **17.46s** |
| **Grand total** (matches M18's own reported 18.2s) | **18.14s** |

Profiling one representative call's internals (`driver_id="VER"`, `lap_number=20`, 738 matching
rows out of 800,120):

| Sub-step | Avg cost | Share |
|---|---|---|
| Boolean mask (`driver_id ==` AND `lap_number ==`) + filter | **13.6ms** | **85%** |
| `.sort_values("distance_m")` | 0.09ms | 0.6% |
| `.to_dict("records")` | 1.17ms | 7% |
| Pydantic (`_telemetry_sample_from_row`) construction | 1.22ms | 7.5% |

The boolean-mask filter — re-scanning the entire cached 800,120-row frame on every one of 1,056
calls — is the bottleneck M18 left in place. `sort_values`/`to_dict`/Pydantic construction operate
only on the ~738 matched rows and are not worth optimizing (§9).

## 3. Current Architecture (re-read directly, this session)

- `backend/app/repositories/base.py` — the actual `TelemetryRepository` ABC (there is no
  `telemetry_repository.py` in this repository; M18's design note already made this same
  correction). `get_telemetry(session_id, driver_id, lap_number) -> list[TelemetrySample]` is
  documented as returning samples "ordered by distance." This is the interface contract this
  design must not change.
- `backend/app/models/telemetry.py` — the response model is `TelemetrySample` (`distance_m`,
  `time_seconds`, `speed_kph`, `throttle_pct`, `brake_active`, `rpm`, `gear`, `drs_active`, `x`,
  `y`, `z`), not `TelemetryPoint` — no model by that name exists anywhere in `app/models/`. This
  design targets `TelemetrySample` construction (`_telemetry_sample_from_row`, unchanged).
- `backend/app/dependencies.py` (re-read fresh): `get_telemetry_repository()` constructs a fresh
  `ParquetRepository(settings.processed_dir)` per call — no `@lru_cache`, no singleton, unchanged
  since M17/M18. Combined with every route being a plain `def` (own threadpool worker), no
  repository instance is ever shared across requests or threads. This is the exact lifecycle
  guarantee M17's index and M18's file caches already rely on; re-verified true, unchanged, and
  load-bearing for this design too.
- **Every current caller of `get_telemetry`** (`grep` across `app/api/` and `app/services/`,
  re-enumerated fresh):

  | Caller | Call pattern |
  |---|---|
  | `app/api/session_analytics.py` (`_fetch_driver_summary`) | once per `(driver_id, lap_number)`, inside a per-driver loop over that driver's laps — the measured hot path (§2) |
  | `app/api/telemetry.py` (`GET /sessions/{id}/telemetry`) | once, single direct lookup |
  | `app/api/laps_compare.py` | twice per request, against two independently-selected `(session_id, driver_id, lap_number)` triples — may be the same session or two different ones |

  No caller passes overlapping or redundant `(driver_id, lap_number)` pairs within one request
  except `session_analytics.py`'s loop (by construction, each `lap.lap_number` in a driver's own
  lap list is distinct). No caller found that would benefit from a **cross**-driver or
  **cross**-lap batched fetch — every call site wants exactly one driver's one lap.
- **Downstream consumers of the *ordering* contract** (re-read fresh, both reference
  `get_telemetry`'s sorted-by-`distance_m` guarantee by name):
  - `app/services/lap_comparison/validation.py` (`validate_monotonic`): "`ParquetRepository.get_telemetry()`
    returns samples sorted by `distance_m` ... not by time — distance-sorted data is trivially
    'monotonic' ... this re-sorts by `time_seconds` first."
  - `app/services/session_analytics/driving_style.py` (`brake_event_count`): identical caveat,
    identical re-sort-by-`time_seconds` workaround.

  Both callers *already* defend themselves against `get_telemetry`'s distance-ordering by
  re-sorting into chronological order themselves — but both depend on the ordering being
  distance-sorted and *consistent*, not incidentally time-ordered or arbitrary. **The
  `distance_m`-sorted return contract is a hard, load-bearing invariant this design must
  preserve exactly**, not an incidental detail.
- `backend/tests/test_parquet_repository.py` (746 lines, re-read fresh): confirms the established
  fixture (`session_cache_dir`, `write_minimal_session`, `_write_roster_and_laps`) and spy
  (`patch.object(pd, "read_parquet", wraps=pd.read_parquet)`, filtered by filename via
  `_read_calls`) conventions this design's tests must match. M18's own regression test,
  `test_m18_regression_repeated_get_telemetry_across_a_grid_reads_the_file_once`, already proves
  the *file-read* count is 1 for a 3-driver × 3-lap grid — it does not, and was never meant to,
  say anything about the per-call *filter* cost this design targets.

## 4. Secondary Telemetry Index — Design

### 4.1 Candidates compared (real-data benchmark, same Bahrain frame, 1,000 lookups each)

The task explicitly warned not to assume the Stage A suggestion ("a groupby-derived dictionary")
is automatically correct as stated. Three concrete structures were built and measured against the
real 800,120-row frame:

| Candidate | Build cost | Memory (vs. 181.63MB base frame) | Per-lookup cost | Notes |
|---|---|---|---|---|
| **(A) `groupby(...)` materialized into a `dict[(driver, lap), DataFrame]`** — the literal reading of "groupby-derived dictionary" | 77ms | **+188MB** (≈ **+104%**, effectively a second full copy) | 0.036ms | Fastest lookup, but doubles memory — exactly what the task warned against |
| **(B) `set_index(["driver_id","lap_number"]).sort_index()`, one `MultiIndex`-sorted frame** | 61ms | 128.82MB (**−29%** vs. base — replaces, doesn't add to, the flat frame) | 0.625ms | Cheapest in memory, but requires restructuring/replacing `_telemetry_cache`'s existing flat frame, and `.loc[[key]]` needs explicit `KeyError`/empty-result handling |
| **(C) `groupby(["driver_id","lap_number"], sort=False).indices` — a `dict[(driver, lap), ndarray[int]]` of row *positions*, not row copies** | **17ms** | **+6.4MB** (**+3.5%**) | 0.072ms | Coexists with the unchanged flat cache; positions are looked up via `.iloc`, which is a cheap, correctness-safe copy (§6) |

All three turn the measured 13.6ms full-frame boolean-mask scan into sub-millisecond lookups — a
>100x reduction on the per-call bottleneck regardless of which is chosen. The differentiator is
memory: (A) is the "obvious" reading of the Stage A suggestion and is rejected specifically
because it materializes ~1,056 separate per-group `DataFrame`s, whose combined overhead
(index objects, block-manager metadata, per-frame fixed cost) makes it cost roughly as much
memory again as the frame it's derived from — precisely the "accidentally doubles memory" outcome
the task warned against. (B) is memory-cheapest but requires discarding/replacing the flat
`_telemetry_cache` frame `get_telemetry` already relies on, for no lookup-speed benefit over (C),
and its `.loc` API has a real correctness pitfall (`.loc[key]` on a `MultiIndex` returns a `Series`
instead of a `DataFrame` when exactly one row matches, unlike `.loc[[key]]`, which must be used
consistently or a downstream `.sort_values`/`.to_dict("records")` call breaks on the single-row
case).

**Selected: (C).** It has the lowest build cost, near-negligible memory overhead (3.5% on the
worst-case real session in this codebase's dataset), a lookup cost two orders of magnitude below
the current bottleneck, and — critically — its very structure (row *positions* into the existing
frame, not copies of the data) makes it a strict *addition* alongside `_telemetry_cache` rather
than a competing or replacement structure, which directly resolves §5's memory-model question.

### 4.2 Structure

One new instance attribute, following the exact naming/shape convention M18 established for its
four file caches — keyed first by `session_id` (never risking cross-session collision, mirroring
M18 §4.1(G)), then by `(driver_id, lap_number)`:

```python
self._telemetry_index_cache: dict[str, dict[tuple[str, int], npt.NDArray[np.intp]]] = {}
```

`numpy`/`numpy.typing` are not new dependencies — both are already directly imported in this
backend (`app/services/lap_comparison/alignment.py`, `app/services/lap_comparison/sectors.py`),
and `pandas` (an existing dependency) requires `numpy` transitively regardless.

One small private helper, scoped to `get_telemetry` alone — **not** merged into the shared
`_cached_read` helper, because `_cached_read` is a generic "read this file once" primitive used by
four methods, while this index is specific to `get_telemetry`'s own repeated-filter access pattern
(§4.3 confirms no other method has a comparable pattern):

```python
def _telemetry_positions(
    self, session_id: str, df: pd.DataFrame
) -> dict[tuple[str, int], npt.NDArray[np.intp]]:
    """(driver_id, lap_number) -> row positions into `df`, built at most once
    per session per instance (docs/m19-design-review.md §4)."""
    if session_id not in self._telemetry_index_cache:
        self._telemetry_index_cache[session_id] = df.groupby(
            ["driver_id", "lap_number"], sort=False
        ).indices
    return self._telemetry_index_cache[session_id]
```

`get_telemetry` itself changes from a boolean-mask filter to a positional lookup:

```python
def get_telemetry(
    self, session_id: str, driver_id: str, lap_number: int
) -> list[TelemetrySample]:
    found = self._find_session(session_id)
    if found is None:
        return []
    session_dir, _ = found
    df = self._cached_read(self._telemetry_cache, session_id, session_dir, "telemetry.parquet")
    positions = self._telemetry_positions(session_id, df).get((driver_id, lap_number))
    if positions is None:
        return []
    matched = df.iloc[positions].sort_values("distance_m")
    return [_telemetry_sample_from_row(row) for row in matched.to_dict("records")]
```

`sort=False` on the `groupby` call is a minor efficiency choice (skips sorting group *keys*, which
this design never iterates in key order — only looks up by exact key) with no correctness effect:
whether or not group keys are sorted, `.indices` maps every distinct `(driver_id, lap_number)`
pair to its own correct row-position array either way.

### 4.3 Why no other method needs this

Re-checked against §3's fresh caller enumeration: `list_laps`'s only filter is a single optional
`driver_id`, applied once per call — not in a per-item loop the way `session_analytics.py` calls
`get_telemetry` once per lap. `list_drivers` and `list_track_points` apply no filter at all. No
caller of any of these three methods loops calling it once per item the way
`_fetch_driver_summary` loops `get_telemetry` once per lap. This directly confirms — from real
call sites, not assumption — that the task's own instinct (don't touch `list_laps`/`list_drivers`/
`list_track_points` without a concrete reason) holds: no concrete correctness or performance
reason was found for any of them.

## 5. Cache Lifecycle

Identical to M17's index and M18's four file caches, for the identical reason, re-verified against
the current `app/dependencies.py` (§3) rather than assumed:

- **Lazy**: nothing is computed until the first `get_telemetry` call for a given session on a
  given instance.
- **Per-instance**: `self._telemetry_index_cache` is a plain instance attribute, initialized to
  `{}` in `__init__`.
- **Request-scoped through the existing dependency factory**: `get_telemetry_repository()`
  constructs a fresh `ParquetRepository` per request (confirmed unchanged, §3) — so a fresh, empty
  index cache exists per request, exactly as M17/M18's caches do.
- **No process-wide cache, no singleton.**
- **No filesystem invalidation**: no cache entry outlives the request that built it, so there is
  nothing to invalidate — matching M17/M18's own already-tested argument verbatim.
- **No concurrency mechanism**: every route is a plain `def` (its own threadpool worker); no
  instance is ever shared across requests or threads, so no lock/mutex is needed, matching M17/M18.

No deviation from the established lifecycle is required or proposed.

## 6. Memory Model

**Decision: the new index coexists with `_telemetry_cache`; it does not replace or restructure
it.** This isn't a preference — it's structurally required: candidate (C) stores row *positions*,
not row *data*, so the flat frame it indexes into must still exist. `_telemetry_cache` is left
completely untouched by this design (same dict, same population logic, same contents).

Quantified against the real worst-case session already used throughout this document (Bahrain
2023 race, 800,120 telemetry rows):

| Structure | Memory |
|---|---|
| `_telemetry_cache` (existing, M18, unchanged) | 181.63MB |
| `_telemetry_index_cache` entry for this session (new) | **6.40MB** |
| **Total overhead added by this design** | **+3.5%** |

This was measured directly (`df.groupby(["driver_id","lap_number"], sort=False).indices`, then
summing `arr.nbytes` across all 1,056 resulting position arrays), not estimated. It does not
double memory, per the task's explicit constraint — candidate (A), which would have, was rejected
specifically for this reason (§4.1).

## 7. Correctness

Preserves every property the task lists, each verified against the concrete design in §4.2 rather
than asserted generically:

- **`get_telemetry(session_id, driver_id, lap_number)` signature and return type**: unchanged —
  still `list[TelemetrySample]`.
- **Missing driver / missing lap behavior**: `dict.get((driver_id, lap_number))` returns `None`
  for any combination that never appeared in `telemetry.parquet` — handled by the existing
  `if positions is None: return []` branch, matching today's "unknown → empty list" convention
  (no exception, same as a boolean mask that matches zero rows today).
- **Empty telemetry file**: `df.groupby(...).indices` on a zero-row `DataFrame` returns `{}` —
  every lookup returns `None` → `[]`, matching
  `test_get_telemetry_caches_an_empty_telemetry_file_without_raising`'s existing expectation
  exactly.
- **`distance_m` ordering**: `df.iloc[positions]` does not guarantee any particular row order
  (row positions from `.indices` follow the source frame's original row order per group, not
  `distance_m` order) — so `.sort_values("distance_m")` is kept, unchanged, as an explicit step
  after the positional lookup. This is deliberately *not* removed or assumed-redundant: §3
  established that two other modules (`validation.py`, `driving_style.py`) depend on this exact
  ordering contract by name. The sort now runs over only the matched rows (tens to low hundreds),
  not the full 800,120-row frame, so it remains cheap (§2: measured at 0.09ms even at the current,
  unindexed call site).
- **Returned `TelemetrySample` values**: `_telemetry_sample_from_row` is unchanged — it still
  receives the same per-row dicts via `.to_dict("records")`, just sourced from a smaller,
  positionally-selected frame instead of a boolean-masked one. Row *contents* are identical either
  way; only the *selection mechanism* changes.
- **All existing callers** (`session_analytics.py`, `telemetry.py`, `laps_compare.py`): none call
  any new method or pass any new argument — `get_telemetry`'s call signature is untouched, so all
  three continue to work with zero changes.
- **Cross-session isolation**: `_telemetry_index_cache` is keyed by `session_id` first, exactly
  like M18's four caches — no code path can look up session A's positions using session B's
  `session_id` key, mirroring M18 §4.1(G) exactly. `laps_compare.py`'s real two-session-per-request
  pattern (§3) exercises this directly.
- **Per-instance isolation**: a fresh `ParquetRepository` gets a fresh, empty
  `_telemetry_index_cache = {}`, exactly like M18's four caches (§5).
- **Pandas copy/view semantics** (the task's own explicit callout): `df.iloc[positions]`, where
  `positions` is an integer array selecting arbitrary (non-contiguous) rows, is fancy indexing —
  documented pandas behavior is that this always returns a new `DataFrame`, never a view into the
  source. `.sort_values(...)` is called with no `inplace=True` anywhere (default `inplace=False`),
  returning a new, sorted frame. `.to_dict("records")` is a read-only conversion. **The cached
  `_telemetry_cache` frame and the cached `_telemetry_index_cache` position arrays are never
  written to by any operation in `get_telemetry`** — matching M18 §4.3's own verified conclusion,
  extended to this design's new operations.
- **Filtering never bleeds between drivers/laps**: each `(driver_id, lap_number)` key maps to its
  own distinct position array, computed once by a single full-frame `groupby` pass with no
  possibility of one key's positions leaking into another's — this was empirically checked during
  design (§4.1's benchmark: `('VER', 20)` returned exactly 738 positions, `('VER', 9999)` — a
  nonexistent lap — returned no key at all, not an empty array by mistake).

## 8. API / Interface Contract

Confirmed, re-checked directly against the current files:

- `TelemetryRepository` (`app/repositories/base.py`) — **unchanged**. `get_telemetry`'s abstract
  signature and docstring are untouched.
- No route (`app/api/*.py`) is touched — `session_analytics.py`, `telemetry.py`,
  `laps_compare.py` call `repository.get_telemetry(...)` exactly as they do today.
- No response model (`app/models/*.py`) changes — `TelemetrySample`'s fields are unchanged.
- No frontend file is touched.
- No schema or migration changes — this is purely an in-memory `ParquetRepository`
  implementation detail; no Parquet file layout, no Postgres table, is affected.
- No dependency change — `numpy`/`numpy.typing` are already present (§4.2).

This entire design is invisible outside `ParquetRepository`, exactly mirroring M17's and M18's own
boundary statements.

## 9. Performance Contract

Deterministic acceptance criterion (matching the task's explicit instruction that wall-clock must
not be the only gate), mirroring M17/M18's own spy-based approach:

> For a single `ParquetRepository` instance, the `(driver_id, lap_number) → positions` index for a
> given session is built via `DataFrame.groupby(...)` **at most once**, regardless of how many
> `get_telemetry` calls are made against that session with different `driver_id`/`lap_number`
> arguments. No `get_telemetry` call after the first, for a given session, re-scans the full
> cached telemetry frame with a boolean mask.

Proved via `patch.object(pd.DataFrame, "groupby", wraps=pd.DataFrame.groupby)` (or equivalently
wrapping `_telemetry_positions`'s internal `.indices` call), asserting `call_count == 1` per
distinct session touched — the same technique M18 used for `pd.read_parquet` call counts (§13's
`_read_calls` helper pattern), applied to the new expensive step instead of the file read.

Supplementary, non-gating real-data wall-clock evidence (§10) is reported for context, exactly as
M18's own §5/§7 did — no specific final runtime is promised in advance. Based on §2's and §4.1's
measurements, the full-grid loop's lookup cost is projected to drop from ~17.46s to roughly the
sum of (17ms one-time index build) + (1,056 × ~0.07ms lookup ≈ 74ms) ≈ **under 100ms**, on top of
the ~0.68s session-index build and ~75ms first-file-read already present — but this is a
projection from component measurements, not yet an end-to-end measurement, and is reported as such.

## 10. Real-Data Verification Plan (to run during implementation, not in this document)

Against the same real, already-ingested 2023 Bahrain GP race session used throughout this
document and M18's own verification, read-only:

- Before/after wall-clock for `GET /sessions/2023_bahrain_grand_prix_race/analytics/drivers`.
- Before/after count of `DataFrame.groupby` calls (or equivalent spy) confirming the index is
  built exactly once per session, not once per `get_telemetry` call.
- Confirmation that `telemetry.parquet` is still read exactly once (M18's contract, unaffected by
  this design — re-verified, not just assumed unchanged).
- Response-body equality between before and after (same drivers, same lap aggregates, same
  `full_throttle_pct`/`brake_event_count` values, same telemetry sample ordering) — this is an
  internal performance change; the response must be byte-for-byte identical.
- Memory delta observation (process RSS or `DataFrame`/dict `.memory_usage()`/`sys.getsizeof`
  sampling) for the full-grid request, sanity-checking the §6 projection (+3.5% for the telemetry
  index) against real end-to-end behavior, not just the isolated benchmark in §4.1.
- `session.parquet` file count and Postgres row counts checked before/after, confirming zero
  mutation of any ingested data (mirroring M18 §7's own check).

## 11. Scope / Non-Goals

Expected to be exactly two files, matching M18's own scope precedent:

- `backend/app/repositories/parquet_repository.py` — one new instance attribute
  (`_telemetry_index_cache`), one new private helper (`_telemetry_positions`), and the changed
  filter line inside `get_telemetry` (boolean mask → `_telemetry_positions(...).get(...)` +
  `.iloc`).
- `backend/tests/test_parquet_repository.py` — the tests in §12.

Explicit non-goals, several directly re-verified against fresh evidence rather than assumed from
the task's own list:

- No changes to `session_analytics.py` or any other route/service file (§8).
- No changes to `list_laps`, `list_drivers`, or `list_track_points` — re-checked against every
  real caller (§4.3) and found to have no comparable per-item-loop access pattern; the task's
  default assumption holds.
- No bulk/batch query engine, no generic DataFrame query abstraction — this is one targeted index
  for one method's one measured bottleneck, not a reusable querying layer.
- No new `TelemetryRepository` interface method, no API/route/schema change (§8).
- No frontend work.
- No Postgres work, no ingestion, no Parquet write.
- No process-wide or cross-request cache, no `@lru_cache`/singleton, no invalidation, no
  concurrency mechanism (§5).
- No optimization of `sort_values`, `to_dict("records")`, or Pydantic construction — §2's profiling
  shows these are 15% of the current per-call cost combined and operate only on already-small
  matched-row subsets; not worth the added complexity for a narrow milestone.
- No change to `_cached_read` or the four M18 file caches — they are reused exactly as-is (§4.2).

## 12. Testing Strategy

All deterministic, added to `backend/tests/test_parquet_repository.py`, following its existing
`session_cache_dir` / `tmp_path` + `write_minimal_session` conventions and M18's `_read_calls`-style
spy pattern:

1. **Lazy build**: `_telemetry_index_cache` is `{}` immediately after construction; still `{}`
   after unrelated calls (`list_drivers`, `list_laps`); populated only after the first
   `get_telemetry` call for a given session.
2. **Built at most once per session per instance**: spy on `pd.DataFrame.groupby` (or
   `_telemetry_positions`'s internal computation), call `get_telemetry` multiple times against the
   same session with different `driver_id`/`lap_number` combinations, assert the expensive
   group-computation step runs exactly once.
3. **Multiple drivers, multiple laps — correctness, not just call count**: a fixture with ≥2
   drivers × ≥2 laps each; assert each `(driver, lap)` combination's `get_telemetry` result
   contains exactly its own rows, never another combination's (mirrors M18's
   `test_get_telemetry_filter_independence_from_one_shared_cache_entry`, extended to more than one
   lap per driver).
4. **Missing lap**: known driver, nonexistent `lap_number` → `[]`, no exception (mirrors existing
   `test_get_telemetry_unknown_lap_returns_empty_list`, re-asserted against the new code path).
5. **Missing driver**: nonexistent `driver_id`, real `lap_number` → `[]`, no exception.
6. **Empty telemetry file**: `include_telemetry=False` fixture → `[]`, no exception, no `KeyError`
   from `.indices` on an empty frame (mirrors existing
   `test_get_telemetry_caches_an_empty_telemetry_file_without_raising`).
7. **Single-row telemetry**: a `(driver, lap)` combination with exactly one matching row —
   confirms `.iloc[positions]` (a single-element array) still returns a one-row `DataFrame`, not a
   `Series` (the exact pitfall identified against candidate (B) in §4.1, which this design's
   `.iloc`-based approach does not share, but is worth asserting directly rather than trusting by
   inference).
8. **Ordering preserved**: samples returned in strictly increasing `distance_m` order, from a
   fixture where the underlying Parquet rows are *not* already in that order — proves the
   `.sort_values` step is still doing real work after the positional lookup, not passing through
   already-sorted data by coincidence.
9. **Multiple sessions, no cross-contamination**: two sessions serviced by one instance (mirroring
   `laps_compare.py`'s real access pattern), each with overlapping driver IDs/lap numbers but
   distinct telemetry data — `get_telemetry` against each returns only that session's rows, and
   each session gets its own `_telemetry_index_cache` entry.
10. **Repeated calls on the same session**: calling `get_telemetry` for the same `(driver, lap)`
    twice returns equal results both times, and the second call does not re-trigger the expensive
    group-computation step (extends test #2).
11. **Fresh repository instance**: a second `ParquetRepository` against the same directory starts
    with an empty `_telemetry_index_cache` and performs its own fresh build — mirrors
    `test_fresh_repository_instance_has_its_own_empty_file_caches`.
12. **Pandas view/copy safety**: after two different `(driver, lap)` calls, mutate neither the
    original `_telemetry_cache` frame nor one call's result and assert the other call's result is
    unaffected — a concrete regression guard for §7's "fancy indexing copies, never views" claim,
    not just a prose assertion.
13. **Full existing regression suite** (every pre-M19 test in this file, all 746 pre-existing
    lines) continues to pass unchanged — no existing test's expected return value, ordering, or
    exception behavior changes.

## 13. ADR Assessment

No ADR trigger is met, re-verified against CLAUDE.md's own criterion ("new dependency, new layer
boundary, reversal of a prior decision") rather than assumed from M17/M18's precedent alone:

- **New dependency?** No — `numpy`/`numpy.typing` are already present, already directly imported
  elsewhere in this backend (§4.2).
- **New layer boundary?** No — this is entirely internal to `ParquetRepository`, one private
  helper and one instance attribute; `TelemetryRepository`'s interface is untouched.
- **Reversal of a prior decision?** No — this extends, not reverses, M17's/M18's own
  per-instance-lazy-cache decision; it does not revisit ADR-0004 (Parquet), ADR-0005/0006
  (provider/repository abstractions), or ADR-0009 (anti-corruption boundary), all of which
  continue to hold exactly as before.

This is the same conclusion M11 through M18 each reached for implementation-level changes behind
an unchanged interface.

## 14. Risks

- **`groupby(...).indices`'s exact return type/typing under mypy --strict** is not independently
  confirmed against `pandas-stubs`'s current published stub in this document — the design's typing
  (`dict[tuple[str, int], npt.NDArray[np.intp]]`) is a reasonable expectation given `.indices`'
  documented pandas behavior, but the precise stub-satisfying annotation should be confirmed
  against the installed `pandas-stubs>=2.3.3.260113` version during implementation, and adjusted
  if `mypy --strict` disagrees — this is a typing-precision risk, not a behavioral one.
- **Benchmark representativeness**: §2/§4.1's numbers are from one real session (2023 Bahrain GP
  race, 20 drivers). A session with a much larger driver/lap count (not expected in real F1 data,
  where a race has at most ~20-24 drivers and ~50-80 laps) could shift the constants, but not the
  underlying complexity argument (`.indices` build is a single `O(n)` pass regardless of session
  size, replacing per-call `O(n)` scans).
- **`.iloc[positions]` cost scaling**: for `(driver, lap)` combinations with unusually many
  matching rows, `.iloc`'s copy cost scales with the match count — this is already true of the
  *current* boolean-mask approach too (it also copies the matched rows), so this design does not
  introduce a new scaling risk, only removes the redundant full-frame scan that happens *before*
  that copy today.

## 15. Implementation Sequence (for the eventual M19 implementation stage — not this document)

1. Add `_telemetry_index_cache` to `__init__`.
2. Add `_telemetry_positions`.
3. Change `get_telemetry`'s filter line as shown in §4.2.
4. Add the tests in §12.
5. Run the full backend suite, ruff, mypy --strict (matching M18's own gate).
6. Run the real-data verification in §10.

## 16. Acceptance Criteria

- §9's deterministic performance contract holds (index built at most once per session per
  instance), proved by test, not by wall-clock alone.
- Every test in §12 passes, plus the full pre-existing suite (746 lines) unchanged.
- `ruff check`, `ruff format --check`, `mypy --strict` all clean.
- Real-data verification (§10): response body byte-identical to the pre-M19 baseline; zero
  ingestion/Postgres/Parquet mutation; `telemetry.parquet` still read exactly once per session per
  instance (M18's contract, unaffected).
- No file outside the two named in §11 is modified.

## 17. Deviations / Open Questions

One genuine open item, not resolved by re-reading current code and explicitly flagged rather than
guessed: the precise `mypy --strict`-satisfying type annotation for
`DataFrameGroupBy.indices`'s return value (§14) depends on the exact `pandas-stubs` version
installed and was not independently verified against that stub file in this document — to be
confirmed at implementation time, with the annotation adjusted if needed. This does not affect any
design decision above; it is a typing-precision detail, not a behavioral or architectural one.

Every other question the task raised (candidate structure choice, cache-boundary/coexistence
decision, lifecycle, missing-driver/missing-lap behavior, ordering preservation, interaction with
`_telemetry_cache`, cross-session isolation, `TelemetrySample`-vs-`TelemetryPoint` naming, ADR
trigger) was resolved directly from re-reading the current code and real callers (§2–§13), or from
a real-data benchmark run this session (§4.1), not by assumption.

## 18. Safety Confirmation

- Exactly one file was created by this task: `docs/m19-design-review.md`.
- No other file was created, modified, staged, committed, or pushed.
- `docs/m9-design-review.md` remains at its pre-existing baseline diff (`+1` blank line),
  unmodified, unstaged.
- No ingestion, no database write, no Parquet write occurred — all benchmarking was read-only,
  run from standalone scratchpad scripts outside the repository.
- Nothing has been committed or pushed.

**Stop.** Awaiting explicit approval before any M19 implementation.
