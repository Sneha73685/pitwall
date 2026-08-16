# PitWall — M17 Design Review: Cross-Season Driver Pace Trends + Parquet Session Index

**Status:** Design only — no implementation, no schema change, no migration, no ingestion change.
**Baseline:** M16 complete (`870ae45`) — documentation/roadmap reconciliation. M15 (`7dbf915`) is the
last milestone to touch application code.
**Author's framing:** senior engineering design review, matching the M12–M16 precedent — every claim
below is checked directly against the current, real source, not assumed from the M17 Stage A audit's
prose. Where the Stage A audit's performance estimate turns out to be imprecise once the real code is
read line-by-line, this document uses the measured shape instead (§4).

---

## 0. Problem

Every analytical/comparison surface PitWall has ever shipped is single-session or, since M13/M15,
pairwise cross-session. Nothing uses the 704-session historical backfill M12 invested in beyond
looking up individual sessions by ID. A user cannot see how one driver's race pace evolved across a
season — a genuinely new, longitudinal product capability the M17 Stage A audit found to be the
highest-value next step once M16's documentation debt was closed.

Building that feature naively would be architecturally irresponsible: `ParquetRepository._find_session`
(read directly for this design, `app/repositories/parquet_repository.py:125-129`) does a full linear
scan over **every** ingested session's `session.parquet` file, and every other session_id-keyed method
(`get_session`, `has_telemetry`, `list_drivers`, `list_laps`, `get_telemetry`, `list_track_points`)
calls it independently. A season trend needs roughly 20–24 sessions' worth of data, each requiring two
independent lookups (`list_drivers` + `list_laps`) — see §4 for the exact multiplication this produces
against the current 704-session dataset. The index is not a separate infrastructure milestone; it is
this feature's own prerequisite, and this design treats it that way throughout.

## 1. Current architecture (verified directly against code at HEAD `870ae45`)

### 1.1 What is actually expensive about `_find_session`

```python
# app/repositories/parquet_repository.py:116-129
def _iter_session_dirs(self) -> Iterator[tuple[Path, Session]]:
    for session_file in sorted(self._base_dir.glob("*/*/*/session.parquet")):
        df = pd.read_parquet(session_file)
        if df.empty:
            continue
        session_dir = session_file.parent
        has_telemetry = _telemetry_row_count(session_dir) > 0
        yield session_dir, _session_from_row(df.iloc[0].to_dict(), has_telemetry=has_telemetry)

def _find_session(self, session_id: str) -> tuple[Path, Session] | None:
    for session_dir, session in self._iter_session_dirs():
        if session.session_id == session_id:
            return session_dir, session
    return None
```

This is not a cheap directory glob — `_iter_session_dirs()` **reads and parses every matching
`session.parquet` file** via `pd.read_parquet` (704 reads today) and, for each one, calls
`_telemetry_row_count()` (`parquet_repository.py:51-58`), which opens `telemetry.parquet`'s footer
metadata separately. `_find_session` then does this entire scan **every time it's called**, stopping
early only if the match happens to be near the front of the sorted glob. Every one of the six
session_id-keyed repository methods calls `_find_session` independently — there is exactly one choke
point, not six separate problems.

### 1.2 The dependency-injection model (decisive for the index's lifecycle, §3)

```python
# app/dependencies.py:24-26
def get_telemetry_repository() -> TelemetryRepository:
    settings = get_settings()
    return ParquetRepository(settings.processed_dir)
```

No `@lru_cache`, no app-state singleton, no other caching decorator — **a brand-new `ParquetRepository`
instance is constructed on every single HTTP request** via FastAPI's plain `Depends()`. Confirmed no
route in this API uses `async def` (`grep -n "^def \|^async def " backend/app/api/*.py` — every route
across `seasons.py`, `session_analytics.py`, `laps_compare.py`, `stints_compare.py`, etc. is a plain
`def`), so FastAPI runs each request's handler in its own threadpool worker thread. Combined with the
per-request-fresh-instance model, **no `ParquetRepository` instance is ever shared across two
concurrent requests or threads.** This is the load-bearing fact behind every lifecycle/invalidation
decision in §3 — it is read from the real dependency-injection code, not assumed.

### 1.3 `session_analytics` — what's reusable unchanged (M8, `app/services/session_analytics/`)

`aggregation.py:127-200`'s `summarize_driver(driver_id, laps, telemetry_by_lap)` is the function this
milestone needs. Read line-by-line: `best_lap_ms`, `median_lap_ms`, `theoretical_best_lap_ms`,
`theoretical_best_delta_ms`, `consistency_ms`, `consistency_cv`, `outlier_lap_count`, and
`valid_lap_count` are **all computed purely from `laps: list[Lap]`** (via `lap.lap_time_seconds`) —
`telemetry_by_lap` is used **only** to compute `full_throttle_pct` (both the pooled driver-level value
and each lap's own) and `brake_event_count` (`aggregation.py:168-174`, `:122-123`). This is a
load-bearing finding for §6: calling `summarize_driver(driver_id, laps, {})` with an **empty**
telemetry dict returns fully correct pace/consistency numbers, with `full_throttle_pct=None` — no new
implementation, no duplication, and it skips the expensive per-lap `get_telemetry()` fetch entirely
(`app/api/session_analytics.py:53-61`'s `_fetch_driver_summary` calls `get_telemetry` once per lap to
build `telemetry_by_lap`; this milestone's route does not need to, and should not, replicate that call).

### 1.4 Session discovery — the existing filtering precedent (M12, `app/services/session_discovery/grouping.py`)

`list_events_for_season(sessions, season)` (`grouping.py:56-87`) and `list_sessions_for_event(sessions,
season, event_id)` (`grouping.py:90-117`) both operate on an already-fetched `list[Session]` — pure,
no I/O, unit-testable — filtering/grouping in Python after one `repository.list_sessions()` call
(`app/api/seasons.py:47-75` calls this pattern three times). `list_sessions_for_event`'s ordering
(`session_date` ascending, falling back to `SessionType`'s own declaration order for an undated
session, `grouping.py:110-117`) is the direct precedent for §7's ordering decision below — not invented
fresh for this milestone.

### 1.5 Existing test/fixture conventions

`backend/tests/test_parquet_repository.py` (39 lines shown, the relevant excerpt) constructs a
**fresh** `ParquetRepository(session_cache_dir)` in every single test — no shared instance across
tests, no fixture teardown/reset logic exists anywhere in this file. This is direct evidence for §3's
"how will tests reset/isolate the index" question: they already do, for free, because the existing
test convention already never reuses an instance across tests.

## 2. What "pace trend" means — decided from §1.3, not invented

The response exposes the same subset of `DriverSummary`'s fields that don't require `telemetry_by_lap`:
`valid_lap_count`, `best_lap_ms`, `median_lap_ms`, `theoretical_best_lap_ms`, `consistency_ms`,
`consistency_cv`. **Not included**: `full_throttle_pct` (would be `None` for every point anyway, since
telemetry is deliberately not fetched — including a field that's always null would be misleading, not
just unused), `outlier_lap_count`/`lap_times_ms`/`laps` (per-session detail, not meaningful at
trend-point granularity, and keeping the response "intentionally small and focused" per this
milestone's own instruction). One point per session; no raw per-lap data anywhere in the response.

## 3. `ParquetRepository` session-index architecture

**The index:** `dict[str, tuple[Path, Session]]`, keyed by `session_id` — the exact key
`_find_session` already searches for, mapping to exactly what it already returns. Built by
materializing the existing `_iter_session_dirs()` generator **once** into that dict; the scan logic
itself does not change, only how many times it runs.

```python
def __init__(self, base_dir: Path) -> None:
    self._base_dir = base_dir
    self._session_index: dict[str, tuple[Path, Session]] | None = None

def _index(self) -> dict[str, tuple[Path, Session]]:
    if self._session_index is None:
        self._session_index = {
            session.session_id: (session_dir, session)
            for session_dir, session in self._iter_session_dirs()
        }
    return self._session_index

def _find_session(self, session_id: str) -> tuple[Path, Session] | None:
    return self._index().get(session_id)

def list_sessions(self) -> list[Session]:
    return [session for _, session in self._index().values()]
```

- **Lazy, not eager.** Built on first access, not in `__init__`. `__init__` today does zero I/O (just
  stores `base_dir`) — building the index eagerly would make *every* request pay the full 704-read
  scan even for the overwhelmingly common case of a single-session lookup (`GET /sessions/{id}`,
  `GET /sessions/{id}/laps`, etc.), which today costs exactly one scan and would gain nothing from
  paying for it up front. Lazy-on-first-use preserves the existing single-session cost exactly and
  only pays the scan once per instance regardless of how many *different* sessions that instance ends
  up looking up — which is precisely the multi-session trend request's shape.
- **What happens on instantiation:** nothing changes — `__init__` remains exactly as cheap as today.
- **New session directories/files appearing while the process is running:** invisible to an
  **already-in-flight** request (its instance's index, once built, is memoized for that instance's
  lifetime) — but per §1.2, no instance survives past one request, so the very next request gets a
  brand-new instance with `_session_index = None` and sees current disk state on its own first access.
  **No explicit invalidation logic is needed or proposed.** This is not an assumption — it follows
  directly from the DI model already in production (§1.2), and §8's lifecycle test proves it.
- **An existing session file changing mid-request:** same answer — not observable within an
  already-completed request; the next request's fresh instance sees it.
- **Explicit invalidation vs. filesystem mtime detection vs. another strategy:** **neither is
  needed.** Both would be solving a staleness problem that cannot occur under the current per-request
  instantiation model. Adding either would be inventing a requirement §"Do not invent cache
  invalidation requirements without evidence" explicitly warns against. **Documented dependency,
  stated plainly:** this design's correctness depends on `get_telemetry_repository()` continuing to
  construct a fresh instance per request. If a future milestone changes that (e.g., introduces a
  process-lifetime singleton for some unrelated reason), this index's staleness-freeness would need
  re-evaluating then — not a risk this milestone carries, but not silently assumed to hold forever
  either.
- **Locking/thread-safety:** not needed. Per §1.2, no instance is ever shared across concurrent
  requests/threads (fresh instance per request, sync `def` routes each running in their own
  threadpool worker). A single request's own execution is single-threaded through its own instance.
- **Which methods use the index:** all six existing `_find_session`-calling methods (`get_session`,
  `has_telemetry`, `list_drivers`, `list_laps`, `get_telemetry`, `list_track_points`) plus
  `list_sessions` — for free, since they all already funnel through the one choke point. No
  method-by-method reasoning is required.
- **A small, evidence-based bonus simplification (not a new requirement):** `has_telemetry()`
  currently re-derives its answer via a second `_telemetry_row_count()` call
  (`parquet_repository.py:138-143`) even though the exact same value was already computed once during
  the scan and is sitting in the indexed `Session.has_telemetry` field. Once the index exists,
  `has_telemetry()` can simply return `found[1].has_telemetry` — implementation-time detail, flagged
  here because it falls directly out of the index's own stored data, not a new design decision.
- **Preserving existing behavior, including ordering:** `list_sessions()`'s current output order is
  `sorted(self._base_dir.glob(...))`'s lexicographic path order (season/event_slug/session_type).
  Python dicts preserve insertion order (3.7+); building the index by iterating the same
  `_iter_session_dirs()` generator preserves that exact order in `.values()`. §8 specifies a test that
  asserts this explicitly, not just membership.
- **Proving indexed lookup == existing scan:** by construction, not by maintaining two parallel
  implementations — the index memoizes the *same* `_iter_session_dirs()` call, it does not
  reimplement it. Correctness is therefore already covered by the 21 pre-existing
  `test_parquet_repository.py` tests continuing to pass unmodified (§8); the *new* tests this design
  adds are about call-count reduction and ordering/lifecycle, not re-proving output correctness that
  already has full coverage.

## 4. Performance contract

**Measured, not the Stage A audit's rougher estimate** — re-derived here from the exact repository
call pattern §5's route actually needs (two calls per session: `list_drivers` for roster membership,
`list_laps` for the pace data — see §5.3), which is more precise than the Stage A audit's general
"~14,000" figure.

- **Operation measured:** number of `_iter_session_dirs()` invocations (equivalently, the number of
  times the full `session.parquet` glob-and-read sweep runs) triggered by one call to the trend logic
  for a real season with N≈22 race sessions.
- **Naive baseline (current code, unindexed):** `list_sessions()` for season-filtering (1 scan) +
  `list_drivers`/`list_laps` per matching session (2 scans each) = `1 + 2N` full scans ≈ **45 full
  scans** for N=22, each scan reading up to 704 `session.parquet` files ⇒ **≈31,680 total
  `session.parquet` reads** for one trend request.
- **Indexed target:** **exactly 1** full scan per repository instance (704 reads, done once, on
  whichever call touches the index first) — every subsequent lookup, however many, is an O(1) dict
  hit. The `2N` per-session `drivers.parquet`/`laps.parquet` reads still happen (they're genuinely
  necessary, small, per-session data reads, not redundant scanning) but no longer each pay a
  704-file tax.
- **Acceptance criterion — both, but the countable one is the real gate:** the number of
  `_iter_session_dirs()` invocations per repository instance must be **≤ 1**, regardless of how many
  distinct session_ids that instance is asked to look up. This is asserted deterministically (§8:
  instrumentation/call-count, not wall-clock — wall-clock is offered only as a supplementary real-data
  data point in §9, per this milestone's own instruction to prefer a deterministic fixture-based
  performance test). A secondary, non-blocking observation: real wall-clock improvement for a genuine
  22-session season against the actual 704-session dataset, measured once during real-data
  verification, reported but not gating.
- **Explicit architectural requirement this satisfies:** the trend request must not perform an
  `O(N_sessions × N_session_files)` scan for every requested session — restated precisely as "at most
  one `O(N_session_files)` scan per request, regardless of N_sessions requested within it."

## 5. Trend API contract

**`GET /drivers/{driver_id}/seasons/{season}/pace-trend`** — a new top-level route prefix (`/drivers`),
alongside the existing top-level `/seasons`, `/laps`, `/stints` prefixes. Not nested under
`/sessions/{session_id}` — this is deliberately season-scoped, not session-scoped, matching the exact
reasoning M13/M15 already used to justify their own top-level `/laps/compare`/`/stints/compare` routes
when the natural grouping stopped fitting the `/sessions/{id}/...` nesting.

```
GET /drivers/{driver_id}/seasons/{season}/pace-trend?session_type=race
```

- `driver_id` (path): not validated against any standalone "drivers" catalog — none exists anywhere
  in this schema (drivers only exist as per-session roster rows). Matches `/laps/compare`'s and
  `/stints/compare`'s own established "driver_id is just a filter string, never independently
  validated" convention exactly.
- `season` (path, `int`): not validated against a persisted season catalog either — matches
  `app/api/seasons.py`'s own documented reasoning (`seasons.py:15-26`) for why `season`/`event_id`
  never 404: neither is a stored resource, both are aggregation keys over `list_sessions()`.
- `session_type` (query, optional): one of the existing `SessionType` enum values
  (`app/models/telemetry.py:15-24`). **Default: `race`.** Reasoning: "pace trend" as a concept is most
  naturally a race-pace comparison across a season; qualifying/practice pace is a different context
  with different meaning, and mixing session types in one trend line would produce a chart comparing
  incompatible things point-to-point. A user who wants a qualifying-pace trend can pass
  `?session_type=qualifying` explicitly — same endpoint, same shape, just a different filter value.
- **Sprint weekends:** not merged or special-cased. An event with both `sprint` and `race` sessions
  simply has both available as distinct `session_type` filter values; the default (`race`) includes
  neither `sprint` nor `sprint_qualifying` in the trend, since those are shorter, structurally
  different sessions not meaningfully comparable point-to-point against a full race distance in one
  pace line. Deliberately not addressed by merging — addressed by the filter simply not including them
  by default.
- **Duplicate sessions at one event:** structurally impossible in the current data model — the
  on-disk path is `{season}/{event_slug}/{session_type}/session.parquet`
  (`ParquetRepository`'s own docstring, `parquet_repository.py:111`), so there is at most one
  directory per `(event, session_type)` pair. The only way "two race-shaped sessions at one event"
  can occur is genuinely `race` + `sprint` as two *different* `session_type` values, already
  disambiguated by the filter above.

**Response model** (`app/models/driver_trends.py`, new):

```python
class SeasonPaceTrendPoint(ApiModel):
    session_id: str
    event_id: str
    event_name: str
    round_number: int
    session_date: str | None
    valid_lap_count: int
    best_lap_ms: float | None
    median_lap_ms: float | None
    theoretical_best_lap_ms: float | None
    consistency_ms: float | None
    consistency_cv: float | None

class SeasonPaceTrendResponse(ApiModel):
    driver_id: str
    season: int
    session_type: SessionType
    points: list[SeasonPaceTrendPoint]
```

`event_id`/`event_name`/`round_number`/`session_date` are carried on each point (not just implied by
ordering) specifically because §6's frontend needs them to label each point correctly — the response
carries its own labeling metadata rather than making the frontend re-derive it.

### 5.1 Missing/incomplete session behavior — two distinct cases, both grounded in existing precedent

- **Driver not on that session's roster at all** (didn't compete — e.g., a real mid-season
  substitution, which has occurred in the real 2020–2026 dataset): that round is **omitted entirely**
  from `points`. There is no meaningful "zero" to show for a round the driver was never entered in.
- **Driver on the roster but zero usable laps** (retired lap 1, DNS-but-listed, etc.): the round
  **still appears** as an explicit point, with `valid_lap_count=0` and every pace field `null` —
  matching `SessionAnalyticsResponse`'s own established convention that "a 0-valid-lap driver still
  gets a row" (`app/models/session_analytics.py:76-79`), so a gap in the trend line is visibly a real
  "driver started but didn't record a lap," not silently indistinguishable from "endpoint broke."

### 5.2 Unknown driver / unknown season / error semantics

Both **200 with an empty `points` list**, never 404 — for the same reason `/seasons/{season}/events`
never 404s (`seasons.py:15-26`): neither `driver_id` nor `season` is a persisted resource this route
could check existence against. This route **never returns 404** — there is no `session_id` path
segment here to check against a real, individually-stored directory the way every other route's 404
does. The only error case is `422` for a malformed `session_type` query value, standard FastAPI enum
validation, no custom handling needed.

### 5.3 Assembly (thin route, mirrors `laps_compare.py`/`stints_compare.py`/`session_analytics.py`'s own thinness)

1. `repository.list_sessions()` (builds the index once, per §3/§4) → filter to
   `season == season and session_type == session_type` — one new small pure function,
   `list_sessions_for_driver_season` (or similarly named), added to
   `app/services/session_discovery/grouping.py`, mirroring `list_events_for_season`'s exact existing
   shape (`Sequence[Session] -> list[Session]`, no I/O) rather than inventing a new module for a
   two-line filter.
2. For each matching session, in order (§7): `repository.list_drivers(session_id)` — if `driver_id`
   isn't in the roster, skip (§5.1 case 1). Otherwise `repository.list_laps(session_id,
   driver_id=driver_id)`, then `summarize_driver(driver_id, laps, {})` (§1.3/§2 — empty telemetry
   dict, no `get_telemetry` calls at all).
3. Map each `DriverSummary`'s relevant subset onto `SeasonPaceTrendPoint`, carrying the session's own
   `event_id`/`event_name`/`round_number`/`session_date`.

No new repository interface method — everything above composes from methods `TelemetryRepository`
already declares (`list_sessions`, `list_drivers`, `list_laps`), matching ADR-0006's "grows when a
real consumer forces it" principle: nothing here forces a new abstract method.

## 6. Ordering / season semantics

Per instruction, round number alone is not assumed sufficient. `list_sessions_for_event`
(`grouping.py:90-117`) already establishes the precedent this design reuses directly: order by
`session_date` ascending (the genuine timestamp already on every `Session`), falling back to
`SessionType`'s own declaration order for the rare undated session — not round number as the primary
key. Applied here across a whole season rather than within one event: **sort trend points by
`(session_date is None, session_date, round_number)`** — dated sessions first in chronological order,
any undated session appended after, using `round_number` only as the final tiebreaker/fallback, never
the primary ordering signal. This sidesteps M12 §18 Q2 (round-number stability across a season)
entirely: **that question remains formally open, not resolved here** — this design simply doesn't
depend on round-number ordering being stable, by choosing `session_date` as the primary key the same
way M12's own existing code already does for the analogous within-event problem.

- **Sprint weekends:** no special handling needed — a sprint weekend's `race` session still has its
  own `session_date`; the default filter (§5, `session_type=race`) already excludes `sprint` from the
  trend, so there's no same-event multi-race-shaped-session ordering question to resolve within one
  trend line.
- **Missing rounds:** handled identically to any other gap — an event with no matching-`session_type`
  session for that driver simply contributes no point (§5.1), no special-casing.
- **Testing/non-race events:** already excluded upstream by M12's own ingestion-time testing-event
  exclusion (M12 §5/§18 Q7 — a pipeline-side decision, unaffected by and out of scope for this
  milestone); this route only ever sees what's actually been ingested.
- **Historical season quirks (e.g., a real cancellation):** not specifically handled or asserted
  against — genuinely out of scope, and M12 §18 Q3 (round-number stability against a real historical
  cancellation case) remains exactly as open as before. Noted, not resolved.

## 7. Frontend design

**Route:** `/drivers/:driverId/seasons/:season/pace-trend` — a new top-level route (mirrors the
backend's own top-level `/drivers` prefix; consistent with `/laps/compare`/`/stints/compare` both
being top-level for the same "doesn't fit the `/sessions/:sessionId` nesting" reason).

**Entry point (one, minimal — matching M14/M15's own "one small link" precedent, not a new nav
system):** `DriverSelectPage` (`/sessions/:sessionId`) already renders a per-driver `<Card>`
(`DriverSelectPage.tsx:61-79`) and already fetches nothing beyond `listDrivers` today. This design
proposes one small addition: fetch the session's own `season` (via the already-existing `getSession`
client function) once per page load, and add a small secondary "Pace Trend" link on each driver's
card, alongside the existing driver info, to `/drivers/{driverId}/seasons/{season}/pace-trend`. This
is the single entry point — no Sidebar change, no `SessionListForEventPage` change, matching the
minimal-discoverability precedent M14/M15 both established rather than reopening broader navigation.

**Page composition (new `features/driver-trends/` folder):**
- Season/driver are fixed by the route params (no picker needed for this milestone — the entry point
  already carries both); an optional `session_type` filter control (a small select, defaulting to
  "Race," mirroring the existing `<select>` pattern `DriverLapPicker`/`DriverPicker` already use).
- Loading/error/empty states follow the established `LoadingState`/`ErrorState`/`EmptyState`
  convention every other page uses — empty state text distinguishes "no sessions found" (season/driver
  combination with zero points) from a genuine fetch error.
- **Chart:** one new ECharts line chart, `buildSeasonPaceTrendChartOption` (new file, mirrors
  `lapTimeTrendChartOptions.ts`'s exact structure/styling — grid/axis/tooltip color conventions
  copied, not reinvented). **Category x-axis** (not `value`, unlike `LapTimeTrendChart`'s numeric lap
  axis) — one category per point, labeled from `event_name`/`round_number`, in the order the API
  already returns them (§6). **Y-axis:** `best_lap_ms` as the primary series (the single clearest
  "pace" number, matching `DriverSummary`'s own headline field), converted to seconds for display,
  matching every other lap-time display convention in this codebase. A point with `null` pace fields
  (§5.1 case 2) renders as a gap in the line (ECharts' native null-handling), not a zero.
- **Hover behavior:** ECharts' own native `tooltip: {trigger: "axis"}` (the same mechanism
  `lapTimeTrendChartOptions.ts` already uses, `lapTimeTrendChartOptions.ts:38-43`) — showing the
  session's `event_name`, `round_number`, and pace figures on hover. **No new interactivity beyond
  what ECharts already provides natively.**
- **M14 cursor infrastructure: deliberately not reused**, for two independent reasons verified against
  the actual M14/M15 code: (1) this page has exactly one chart — cursor sync solves a
  multiple-simultaneously-mounted-chart problem (`docs/m14-design-review.md` §5) this page doesn't
  have; there is no second chart on this page to synchronize against. (2) the axis semantics here are
  categorical (event/round), not `distance_m` — `CursorSlice`/`extractAxisPointerValue`
  (`components/useCursorSync.ts`) are built specifically around a shared distance axis, which doesn't
  exist in this feature's data at all. This mirrors M15's own identical reasoning for not touching
  cursor architecture (`docs/m15-design-review.md` §15) — restated here because it's independently
  true for this milestone's own data shape, not merely copied.
- **Navigation back:** one simple `<Link>` back to the entry-point session's `DriverSelectPage`
  (`/sessions/:sessionId`) — no per-point click-through to each individual session's own pages (an
  explicit non-goal, §8, kept out to avoid quietly growing this into a bigger navigation feature).

## 8. Reuse boundaries

**Reused unchanged, verified against the real files, not assumed:**
- `app.services.session_analytics.aggregation.summarize_driver` — called with `telemetry_by_lap={}`,
  zero modification (§1.3).
- `app.services.session_discovery.grouping`'s existing filtering *pattern* (one new function added in
  the same file, same shape as its three existing siblings — not a new module).
- `TelemetryRepository.list_sessions`/`list_drivers`/`list_laps` — the interface itself gains no new
  method.
- `SessionPicker`, `DriverLapPicker`, `DriverPicker` — **not used at all** by this feature; the entry
  point already carries both `driverId` and `season` via route params, so no new picker UI is needed.
- `LoadingState`/`ErrorState`/`EmptyState`/`Card` — the existing shared components, unchanged.
- `lapTimeTrendChartOptions.ts`'s visual/styling conventions — copied into the new option-builder, not
  imported (the x-axis type differs, so it's a new function, not a parameterized reuse of the old one).

**Must not be modified, to avoid unnecessarily broadening scope:**
- `app/services/session_analytics/aggregation.py`, `consistency.py`, `theoretical_best.py`,
  `filtering.py`, `driving_style.py` — zero diff expected anywhere in this package.
- `app/api/session_analytics.py`, `/sessions/{id}/analytics/drivers` and its `/laps` sibling — zero
  diff; this milestone adds a new route, it does not touch the existing single-session ones.
- `app/services/lap_comparison/`, `app/api/laps_compare.py`, `app/api/stints_compare.py`,
  `app/models/lap_comparison.py`, `app/models/stint_comparison.py` — zero diff, unrelated features.
- `components/useCursorSync.ts`, either `CursorSlice` store — zero diff (§7).
- `TelemetryRepository`'s abstract interface (`app/repositories/base.py`) — zero diff; every new
  capability composes from existing abstract methods.
- Postgres/`RaceContextRepository` — untouched entirely; this feature is Parquet-only.

## 9. Testing strategy

**Backend — session index (new tests in `test_parquet_repository.py`):**
- Every one of the 21 existing tests continues to pass unmodified (correctness-by-construction, §3).
- **Call-count**: instrument `_iter_session_dirs` (e.g., a `wraps`-based spy, or a simple invocation
  counter) and assert it's called at most once across multiple `list_laps`/`get_session`/etc. calls on
  the *same* repository instance, for a multi-session fixture.
- **Ordering equivalence**: assert `list_sessions()`'s output order is unchanged from the pre-index
  baseline for a multi-session fixture (§3's "preserve ordering" claim, explicitly tested, not just
  asserted in prose).
- **Lifecycle**: build a repo instance, call `list_sessions()` (populates the index), write a *new*
  session directory to the same `tmp_path`, call `list_sessions()` again on the *same* instance —
  assert it still returns the original set (proving memoization is real and instance-scoped); then
  construct a **new** `ParquetRepository` against the same directory and assert it sees both sessions
  (proving the "next request is fresh" claim is real, not asserted).
- **`has_telemetry` bonus simplification** (if implemented): assert it still returns correct values
  post-refactor, reusing the existing `test_has_telemetry_*` fixtures unmodified.

**Backend — trend endpoint (new `test_driver_trends_route.py`, mirroring
`test_stints_compare_route.py`'s fixture style):**
- Multi-session synthetic season fixture (own dedicated fixture, not stretching `tests/fixtures.py`'s
  shared single-session one, matching `tyre_performance_fixtures.py`'s own precedent for "needs a
  richer shape than the shared fixture provides").
- Session-type filtering (default `race`; explicit `qualifying`/`sprint` override).
- Ordering by `session_date`, with an undated-session fallback case.
- Driver missing from one round's roster → point omitted (§5.1 case 1).
- Driver on roster, zero valid laps → point present with null pace fields (§5.1 case 2).
- Unknown driver_id → 200, empty `points`.
- Unknown/out-of-range season → 200, empty `points`.
- Malformed `session_type` → 422.
- Response schema: `full_throttle_pct` and any per-lap field are **absent** from the response shape
  entirely (an explicit schema test, mirroring `test_stints_compare_route.py`'s own
  "response never includes per-lap data" test pattern) — proves §2's "intentionally small" decision
  structurally, not just by omission.

**Frontend (Vitest/RTL, mirroring `StintComparisonPage.test.tsx`'s conventions):**
- `DriverSelectPage`: the new "Pace Trend" link renders with the correct `season`-derived href.
- New page: loading/error/empty states; `session_type` filter changes the fetched data; chart receives
  correctly-shaped/labeled data (mirroring `lapTimeTrendChartOptions.test.ts`'s pure-function testing
  style for the new option-builder); a null-pace-field point renders as a gap, not a zero; the "back to
  driver" link is present and correct.

**Performance (deterministic, not wall-clock — per instruction):** the backend call-count test above
*is* the performance test — it directly proves the architectural requirement (§4) rather than
inferring it from timing, which would be flaky and environment-dependent.

## 10. Real-data verification

**Case A (required):** one genuinely ingested driver across one complete real season already present
in the 704-session dataset (e.g., a driver who raced a full season with no substitutions, to exercise
the straightforward path first). Verify directly against the running app/API, no data mutation:
- Correct session count (matches the real number of race sessions ingested for that season).
- Correct chronological/event ordering (spot-check against known real race order for that season).
- Plausible pace values (best/median lap times in a sane range for that circuit/season, sanity-checked
  against `session_analytics`'s existing verified output for at least one of the same sessions).
- At least one real missing/incomplete-session case if the dataset has one for the chosen
  driver/season (a genuine mid-season substitution or a DNS/retirement), exercising §5.1's two cases
  against real data, not just the fixture.
- No Postgres write, no Parquet write, no ingestion run — read-only verification only, matching every
  prior milestone's real-data verification posture.

**Performance comparison (offered, non-blocking):** a before/after wall-clock or read-count comparison
against the real 704-session dataset for the same real season, reported as a data point corroborating
§4's fixture-based proof — not a substitute for it, and not required to gate acceptance.

## 11. Explicit non-goals

- Multi-driver trend comparison (one driver only, per this milestone's own stated goal).
- Cross-season trend comparison in one request (one season only).
- Stint/tyre trends (a natural, Postgres-touching follow-up — see §12 for why it's deliberately not
  this milestone).
- Any Postgres schema change.
- Weather, position/gap, standings, race control, live timing.
- N-way comparison.
- A general bulk/multi-session query engine — this endpoint is bounded (one driver, one season, one
  session type), not a generalized filter/query surface.
- Corner highlighting.
- Comparison URL persistence/shareability (the `/laps/compare`/`/stints/compare` gap identified by
  prior audits) — unrelated to this milestone, not bundled in.
- Exports.
- AI/NL querying.
- Per-point click-through navigation to each session's own pages (§7).
- Any documentation cleanup beyond this design note itself — `README.md`/`CHANGELOG.md`/etc. are
  correctly out of scope per this task's own instruction; a future milestone's own reconciliation
  pass (mirroring M16) would record this milestone once it ships.

## 12. Architectural decision discipline — no ADR

No new dependency, no new architectural layer, and no reversal of a prior decision. The session index
is an internal implementation change *behind* `ParquetRepository`'s existing, unchanged
`TelemetryRepository` interface (ADR-0006) — callers observe identical behavior, just faster. This is
the same "no ADR trigger met" conclusion every one of M11 through M16 reached when the same test was
applied to comparably-scoped implementation work; nothing here rises to ADR-0006's own level (choosing
`TelemetryRepository` as an abstraction in the first place *was* ADR-worthy — adding a cache behind one
of its two implementations is not). The one genuinely load-bearing architectural *assumption* this
design makes explicit — that `get_telemetry_repository()` stays a per-request factory, not a singleton
— is documented in §3 as a stated dependency, not silently assumed, but does not itself rise to
ADR-0006's threshold: it is describing current reality, not making a new decision.

## 13. Acceptance criteria

- `ParquetRepository`'s six session_id-keyed methods plus `list_sessions` all route through one
  memoized index; `_iter_session_dirs` is invoked at most once per repository instance regardless of
  how many distinct sessions that instance is asked about.
- All 21 pre-existing `test_parquet_repository.py` tests pass unmodified.
- `GET /drivers/{driver_id}/seasons/{season}/pace-trend` returns the contract in §5, including both
  §5.1 missing-data cases, correct §6 ordering, and never 404s.
- The response contains no per-lap data and no `full_throttle_pct` field (§2, tested structurally).
- `app/services/session_analytics/`, `app/api/session_analytics.py`, `app/services/lap_comparison/`,
  `app/services/tyre_performance/`, both existing comparison routes/models, `useCursorSync.ts`, and
  both `CursorSlice` stores all have zero diff.
- No Postgres migration, no `pipeline/` diff, no new dependency.
- Real-data Case A (§10) verified against the actual 704-session dataset with no data mutation.

## 14. Risks

- **The DI-model dependency (§3) is the one thing that could quietly invalidate this design's
  invalidation-free property later.** Mitigated by stating it explicitly rather than leaving it
  implicit — a future change to `get_telemetry_repository()`'s lifecycle is the concrete trigger for
  revisiting this, not something this milestone needs to guard against today.
- **`session_date` as the primary ordering key (§6) assumes every real ingested session in the target
  season has one.** M12's own audit found this true for every real session observed so far
  (`grouping.py:22` — "every real ingested session observed so far has one"); a season with a genuine
  gap would fall back to `SessionType`'s stable declaration order, not crash or produce nonsense —
  low risk, already covered by existing precedent's own fallback.
- **The `season_type=race`-only default could surprise a user expecting sprint weekends included** —
  mitigated by the filter being one query param away, not a structural limitation.
- **`DriverSelectPage`'s new `getSession` fetch** (§7) is one additional network call this page didn't
  make before — small, but worth naming as a real (if minor) cost of the chosen entry-point placement.

## Document history

- v1 (this document): initial design, produced against M16's real, shipped state (`870ae45`), with
  every architectural claim — the index's lifecycle model, the performance multiplication factor, and
  `summarize_driver`'s actual telemetry dependency — checked directly against current source rather
  than assumed from the M17 Stage A audit's own (correctly flagged as rougher) estimate.
