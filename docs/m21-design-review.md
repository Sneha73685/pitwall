# PitWall — M21 Design Review: Cross-Season Driver Tyre/Stint-Strategy Trend

## Status

Design only. Nothing in this document has been implemented. `docs/m9-design-review.md`'s
pre-existing, unrelated single-blank-line modification is untouched by this work.

## 0. Baseline

Verified directly, this session:

- `HEAD` = `origin/main` = `e37a3442014af1fb3d14be23bf4edaa32b703a5e` (M20, committed and pushed).
- `git status --porcelain`: only `M docs/m9-design-review.md` (the pre-existing, out-of-scope
  single-blank-line diff). No `docs/m21-design-review.md` existed before this document.
- No application code, test, schema, migration, dependency, pipeline, or data file is touched by
  this design. All benchmarking below was read-only against the real, already-ingested
  `data/processed/` cache and the real, already-populated Postgres instance (54,148 real `stints`
  rows, 50,844 real `pit_stops` rows) — no write of any kind occurred.

## 1. Problem / Product Goal

The capability matrix (M20 Stage A §7, re-confirmed M21 Stage A §8) has one clear, low-risk gap:
M17 shipped a cross-season view for **pace** (best/median/theoretical-best lap time per round);
M15 shipped cross-session comparison for **stint/tyre strategy**, but only pairwise, between two
independently-selected sessions — there is no view of how *one driver's* stint/tyre usage evolved
across an entire season, the natural combination M17's architecture and M11's data already make
possible without new ingestion. This is the M21 Stage A recommendation, approved for Stage B.

## 2. Re-Read Source (this session, not carried forward from memory)

- `backend/app/services/session_discovery/grouping.py` — `list_sessions_for_driver_season(sessions,
  season, session_type)` already exists, built for exactly this purpose by M17, and is reused
  **unchanged**.
- `backend/app/services/tyre_performance/strategy_summary.py` — `driver_strategy_summary(driver_id,
  stints) -> DriverStrategySummary` (`stint_count`, `compound_sequence`, `stint_lengths`) needs
  **only stints**, not laps — cheaper than M17's own per-session cost, which needed `list_laps` too.
- `backend/app/api/driver_trends.py` (M17) — the exact route/thin-adapter shape to mirror:
  roster-check via `list_drivers`, per-session point construction, "never 404s" reasoning.
- `backend/app/api/stints_compare.py` / `backend/app/api/tyre_performance.py` — both already
  contain a `_to_driver_strategy_summary(result) -> DriverStrategySummary` mapper (service
  dataclass → Pydantic model), independently duplicated in each file (§6.5 below).
- `frontend/src/features/driver-trends/DriverSeasonPaceTrendPage.tsx` +
  `hooks/useDriverSeasonPaceTrend.ts` + `components/seasonPaceTrendChartOptions.ts` — the exact
  page/hook/URL-state shape to mirror.
- `frontend/src/features/tyre-performance/components/CompoundSequenceStrip.tsx` — takes exactly
  `compoundSequence: string[]` / `stintLengths: number[]`, the same two fields already on
  `DriverStrategySummary`. **Already built, already used** (by
  `StrategySummaryPanel.tsx`, one row per driver, session-wide) — reusable **unchanged** for one
  row per session, season-wide. This is the single most important reuse finding in this design: it
  means M21 needs **no new chart-options file** (avoiding chart-options file #11 — Stage A §7
  already flagged 10 such files as a real, if minor, duplication pattern; this design adds zero
  more).
- `frontend/src/features/tyre-performance/components/StrategySummaryPanel.tsx` — the direct
  structural template for the new page's list: one row per item, a label, a count, a
  `CompoundSequenceStrip`. M21's list is the same shape with sessions in place of drivers.
- `frontend/src/features/race-context/compoundColor.ts` / `tyre-performance/compoundOrder.ts` —
  both already fall back gracefully for an unrecognized compound string. Confirmed relevant by a
  real-data finding (§4): at least one real historical `Stint.compound` value is the literal string
  `"None"` (2022, ALB) — a pre-existing data-quality artifact, unrelated to this milestone, already
  safely handled by this existing, unmodified frontend code.
- `frontend/src/features/session-select/DriverSelectPage.tsx` — the exact entry-point pattern to
  extend (a second link per driver card, alongside the existing M17 "Pace Trend" link).
- `backend/tests/test_driver_trends_route.py` (M17) and `backend/tests/test_stints_compare_route.py`
  (M15) — the exact test-fixture conventions to mirror (dedicated multi-session fixture,
  `FakeRaceContextRepository` override for `get_race_context_repository`).

## 3. API Design — resolved

**Route**: `GET /drivers/{driver_id}/seasons/{season}/tyre-trend?session_type=`

Added to the **existing** `app/api/driver_trends.py` file, sharing the existing `router =
APIRouter(prefix="/drivers", tags=["driver-trends"])` — not a new file, not a new router. Decision,
not left implicit: `driver_trends.py`'s own name and tag ("driver-trends," not "pace-trend") are
already generic across trend *kinds*, and this route is a genuine sibling of the pace-trend route
in the same "cross-season, one-driver, one-season" family, sharing its roster-check pattern
line-for-line — splitting it into a second file would be a new module for one route, working
against the "smallest extension" direction.

`tyre-trend`, not `stint-trend`: matches this codebase's own established vocabulary
(`/tyre-performance`, `TyrePerformanceResponse`, the `tyre_performance` service package, British
spelling throughout) rather than introducing a new term.

**Response models** — added to the **existing** `app/models/driver_trends.py` (same reasoning:
one file, one trend-response family, not a new file per trend kind):

```python
class SeasonTyreTrendPoint(ApiModel):
    session_id: str
    event_id: str
    event_name: str
    round_number: int
    session_date: str | None
    strategy: DriverStrategySummary  # app.models.tyre_performance, reused unchanged


class SeasonTyreTrendResponse(ApiModel):
    driver_id: str
    season: int
    session_type: SessionType
    points: list[SeasonTyreTrendPoint]
```

**Why `strategy: DriverStrategySummary` nested, not flattened** (M17 flattened its subset of
`DriverSummary`'s fields directly onto its point instead): M21 reuses **all** of
`DriverStrategySummary`'s fields, not a subset, and `app/models/stint_comparison.py` (M15) already
establishes the real precedent of nesting this exact model
(`DriverStintComparisonSide.strategy: DriverStrategySummary`) rather than flattening it. Nesting
here matches the closer, more relevant existing precedent.

**Identity fields** (`session_id`/`event_id`/`event_name`/`round_number`/`session_date`) are
byte-for-byte the same five fields M17's `SeasonPaceTrendPoint` carries, in the same order, for the
same reason (§9's cross-document/cross-endpoint consistency rule, carried into API design here):
the frontend can label a point without re-deriving identity from response order.

**Metrics decision — resolved, not left to "whatever's available":** the endpoint returns
`DriverStrategySummary` **only** (`stint_count`, `compound_sequence`, `stint_lengths`) — not
`StintPace`'s per-stint consistency figures, not raw laps, not pit-stop timing. Three reasons,
matching the explicit "do not add metrics merely because they're available" instruction:

1. `stint_lengths` already answers "stint durations/lap counts" — the task's own candidate list —
   without needing `join_laps_to_stints`/`identify_boundary_laps`/`stint_consistency_by_stint` (the
   heavier machinery `build_driver_stint_pace` needs, which requires **both** laps and pit-stops
   per session and produces per-lap detail M17 itself already decided is "not meaningful at
   trend-point granularity" for the sibling pace-trend endpoint — the identical reasoning applies
   here).
2. Per-stint pace consistency, if wanted for one specific session, is already one click away via
   the existing `GET /sessions/{id}/drivers/{id}/stint-pace` endpoint (M11) — duplicating it here
   would be exactly "adding a metric because it's available," not because this view needs it.
3. Pit-stop **timing** is a different axis entirely ("pit-stop comparison" in the capability
   matrix, not "tyre usage") and is out of scope; pit-stop **count** was considered and explicitly
   rejected — it's redundant with `stint_count` in the overwhelming majority of real cases
   (`pit_stop_count ≈ stint_count - 1`), and where it diverges, that divergence is itself an
   unresolved M12 §18-adjacent data-quality question this milestone must not touch (§8). Including
   it would also double the Postgres query count per session for a field usually reconstructable
   from what's already returned.

**Session-type semantics**: identical to M17 — `session_type` query param, `Query(default=
SessionType.RACE, ...)`, using the same `SessionType` enum, no new vocabulary.

**Ordering**: `list_sessions_for_driver_season` unchanged — `session_date` ascending, `round_number`
tiebreaker, `SessionType` declaration-order fallback for an undated session. Identical to M17,
reused verbatim, not reimplemented.

**Missing-data semantics — resolved, mirroring M17 exactly**:

- A season/session_type with zero matching sessions → `200`, `points: []` (never 404 — `driver_id`
  and `season` are aggregation keys, not persisted resources, the same reasoning `/seasons/{season}/
  events` and M17's own pace-trend already establish).
- A session the driver **did not enter** (roster-absent — confirmed via real substitution data,
  §4) → **omitted from `points` entirely**, not a null point. Matches M17 §5.1 case 1 verbatim.
- A session the driver entered but has **zero stint data** (a genuine data gap — confirmed to exist
  in real historical data, 2020 HUL, §4) → **point still included**, with
  `strategy.stint_count=0`, `compound_sequence=[]`, `stint_lengths=[]` — self-evident from the
  empty arrays, no warning field needed. `driver_strategy_summary([])` already produces exactly
  this shape with no special-casing required. Matches M17's own "0 valid laps still gets a point"
  precedent, not M15's warning-code mechanism (there is no *pairing* here for a warning to be about
  — this is a single-driver trend, not a comparison).

**Never 404s** (driver_id/season): identical reasoning to M17, restated for this route rather than
cross-referenced only, since it's a real, load-bearing behavior of *this* endpoint.

## 4. Real-Data Verification Case — chosen and run this session

Benchmarked against the real, live dataset (Parquet + Postgres) to select a case that genuinely
exercises every semantic path above, not a synthetic one:

**2023, driver `DEV` (Nyck de Vries), `session_type=race`**: entered 10 of 22 real races (the real,
documented mid-season substitution by Ricciardo/Lawson) — exercises roster-absence omission on 12
real sessions. Across the 10 he entered: 4 real compounds observed (`SOFT`, `MEDIUM`, `HARD`,
`INTERMEDIATE`), multiple stints per race, zero stint-data gaps within his own races.

**Secondary case for the zero-stint-data path**: 2020, driver `HUL` — entered 3 of 17 races, one of
which (confirmed by direct query) has zero recorded stints despite the driver being on the roster —
a real instance of the "entered but zero stint data" path, available if the primary case's own data
doesn't independently exercise it during implementation.

Both were found by direct, read-only, real-data queries this session (not assumed or invented) —
see §5 for the exact benchmark that discovered them.

## 5. Performance / Access Pattern — measured, not assumed

Per the explicit instruction not to assume performance is fine: the proposed orchestration —
for each session matching `(season, session_type)`: one `list_drivers()` (Parquet, roster check)
then, if the driver is present, one `list_stints(session_id, driver_id)` (Postgres) — was written
and **run against the real full 2023 season** before finalizing this design:

| Step | Measured |
|---|---|
| `list_sessions()` (full 704-session index build, one-time, shared cost every discovery/trend endpoint already pays) | 0.678s |
| Per-session loop: 22 real race sessions, 22 `list_drivers` (Parquet) + 22 `list_stints` (Postgres) calls | **0.053s** |
| **Total** | **~0.73s** |

This is a plain **O(N)** loop, N = sessions matching `(season, session_type)` (bounded by a real
season's ~20–24 races) — no N² pattern exists or was found: no repository call inside this loop
triggers another loop over sessions, laps, or stints. It is measurably **cheaper** than M17's own
per-session cost (which also fetches `list_laps` per session for the pace computation) —
`driver_strategy_summary` needs only `stints`, never touching Parquet's `laps.parquet` at all
beyond the one `list_drivers` roster check. No thin orchestration *layer* (a new service module) is
needed beyond a plain Python loop in the route function itself, matching M17's own precedent
exactly — the per-item work (`driver_strategy_summary`) is already a pure, existing function; the
loop has nothing non-trivial to factor out.

**Conclusion: no evidence requires redesigning any existing infrastructure.** The existing
`RaceContextRepository`/`TelemetryRepository`/`ParquetRepository` (including the full M17→M18→M19
caching lineage, which this route benefits from automatically — the session-index build above is
already memoized once per request, same as every other route) are sufficient as-is.

## 6. Backend Orchestration Shape — resolved

```python
def _to_tyre_trend_point(
    session: Session,
    driver_id: str,
    race_context_repository: RaceContextRepository,
) -> SeasonTyreTrendPoint:
    stints = race_context_repository.list_stints(session.session_id, driver_id)
    strategy = _to_driver_strategy_summary(driver_strategy_summary(driver_id, stints))
    return SeasonTyreTrendPoint(
        session_id=session.session_id,
        event_id=session.event_id,
        event_name=session.event_name,
        round_number=session.round_number,
        session_date=session.session_date,
        strategy=strategy,
    )


@router.get(
    "/{driver_id}/seasons/{season}/tyre-trend",
    response_model=SeasonTyreTrendResponse,
    summary="One driver's stint/tyre-strategy trend across one season",
)
def get_driver_season_tyre_trend(
    driver_id: str,
    season: int,
    session_type: SessionType = Query(default=SessionType.RACE, ...),
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> SeasonTyreTrendResponse:
    sessions = list_sessions_for_driver_season(
        telemetry_repository.list_sessions(), season, session_type
    )
    points: list[SeasonTyreTrendPoint] = []
    for session in sessions:
        drivers = telemetry_repository.list_drivers(session.session_id)
        if not any(driver.driver_id == driver_id for driver in drivers):
            continue
        points.append(_to_tyre_trend_point(session, driver_id, race_context_repository))
    return SeasonTyreTrendResponse(
        driver_id=driver_id, season=season, session_type=session_type, points=points
    )
```

**§6.5 — the `_to_driver_strategy_summary` mapper, a disclosed rule-of-three decision:**
`app/api/tyre_performance.py` and `app/api/stints_compare.py` **already each** independently define
this identical service-dataclass→Pydantic-model mapper (confirmed by direct re-read this session —
`stints_compare.py`'s own comment literally says "Mirrors app/api/tyre_performance.py's own
`_to_driver_strategy_summary`"). Adding a third copy in `driver_trends.py` **crosses the rule-of-
three threshold this project's own audits (M18/M20 Stage A) treat as the trigger for extraction.**

**Decision: add the third copy anyway, do not extract.** This is a deliberate, disclosed choice,
not an oversight: extracting a shared helper is a small, real, but **unrelated** cleanup — fixing a
pre-existing duplication pattern that predates this milestone, discovered *while* building an
unrelated feature. Every prior Stage A audit's own scope discipline ("don't fix unrelated issues
discovered during the audit") applies with equal force to unrelated issues discovered during
*design*. The mapper is five lines, stateless, and zero-risk either way; a future milestone (or a
`docs/backlog.md` entry, not this design note) is the right place to decide whether to extract it.
This is noted explicitly per this design's own instruction not to leave load-bearing decisions
implicit — this one is decided, not deferred.

## 7. Frontend Design — resolved

**Route**: `/drivers/:driverId/seasons/:season/tyre-trend` — added to `App.tsx`'s existing
`<Routes>`, top-level (not nested under `/sessions/:sessionId`), matching M17's own reasoning for
its sibling route (season-scoped, not session-scoped).

**Page**: `frontend/src/features/driver-trends/DriverSeasonTyreTrendPage.tsx` — new file, structural
mirror of `DriverSeasonPaceTrendPage.tsx`: `useParams` for `driverId`/`season`, `useSearchParams`
for `session_type` and `fromSession`, the same `FILTERABLE_SESSION_TYPES`/`SESSION_TYPE_LABELS`
reused **unchanged** (no new session-type vocabulary), the same `LoadingState`/`ErrorState`/
`EmptyState`/`Card` primitives, the same back-link pattern (`fromSession` param, falling back to
the trend's own first point's `session_id`, omitted if neither available).

**Hook**: `frontend/src/features/driver-trends/hooks/useDriverSeasonTyreTrend.ts` — new file,
line-for-line structural mirror of `useDriverSeasonPaceTrend.ts` (plain `useEffect`+`useState`,
refetches on driver/season/session_type change).

**API client**: `frontend/src/api/client.ts` **modified** — add `SeasonTyreTrendPoint`/
`SeasonTyreTrendResponse` TypeScript interfaces and `getDriverSeasonTyreTrend(driverId, season,
sessionType)`, mirroring `getDriverSeasonPaceTrend`'s exact shape (same `getJson<T>` helper, same
query-param handling).

**Chart/visual representation — resolved, and simpler than a "chart":** a new component,
`frontend/src/features/driver-trends/components/SeasonTyreTrendList.tsx`, structurally mirroring
`StrategySummaryPanel.tsx` (§2) — one row per **season point** (in the API's own already-
chronological order, never re-sorted) instead of one row per driver: a label (`R{round_number}
{event_name}`, the exact format `seasonPaceTrendChartOptions.ts` already uses), a stint count, and
`CompoundSequenceStrip` fed directly from `point.strategy.compound_sequence`/`stint_lengths` —
**unchanged**, zero props added to that component. **No new ECharts option builder is created** —
this deliberately avoids adding an 11th `chartOptions.ts` file to the pattern Stage A already
flagged as crossing a duplication threshold (10 files, all hand-rolling the same dark-theme
literals). A row-list is also a better fit for this data than a line/bar chart would be: a
compound sequence is categorical and per-stint, not a single scalar per session the way pace's
`best_lap_ms` is — `CompoundSequenceStrip` already solves exactly this visualization problem.

**Why not M14 cursor synchronization — explained, not assumed:** cursor-sync exists to move a
shared **hover position along a continuous distance axis** across multiple charts that share that
axis (telemetry traces + track map). This page has neither: it's one categorical list indexed by
*session identity*, not distance, and there is only one view on the page, not multiple charts
needing a shared cursor. There is nothing here for `useCursorSync`/`cursorStore` to synchronize
against. This matches M17's own pace-trend page, which also correctly has no cursor-sync
involvement for the identical reason.

**Handling of missing sessions / substitutions**: entirely a backend concern (§3) — the frontend
renders exactly the `points` array it receives; a driver with 10 of 22 real points (§4) renders 10
rows, with no gap-filling, no synthetic "missing" row, matching how `DriverSeasonPaceTrendPage`
already handles the identical shape for pace data.

**Entry point**: `frontend/src/features/session-select/DriverSelectPage.tsx` **modified** — a
second link per driver card, alongside the existing M17 "Pace Trend" link, reusing the season
value that page already fetches (no new API call needed): `to={`/drivers/${driver.driver_id}/
seasons/${season}/tyre-trend?fromSession=${sessionId}`}`, labeled "Tyre Trend". This is the single
entry point, matching M17's own "one minimal entry point" precedent — no second, no sidebar link
(the pace-trend precedent already established that cross-season trend pages are contextual, not
sidebar-tier, and this design follows the same tier for consistency, §9 of the M20 design note's
own cross-document rule extended here).

**URL persistence/shareability**: identical to M17 — `session_type` and `fromSession` are both
plain query params, so the page's full state is shareable/bookmarkable exactly as the pace-trend
page already is.

**Avoiding multi-driver comparison UI**: no `SessionPicker`, no second driver selector, no pairing
UI of any kind is added — `driverId`/`season` come from the route alone, matching M17's own
explicit "no picker UI needed" reasoning (both are already carried by the one approved entry
point).

## 8. M12 §18 — explicitly not touched

This milestone resolves none of the seven open M12 §18 questions and generates no new evidence for
any of them, re-confirmed directly against this design's own scope:

- **Round-number stability** (Q3): this design's ordering explicitly does **not** depend on it —
  inherited unchanged from `list_sessions_for_driver_season`, which already documents (§2, and its
  own docstring) that it deliberately orders by `session_date` first, `round_number` only as a
  tiebreaker, *because* this question remains open.
- **Postgres season/event denormalization** (Q1): not touched — this design adds no new query
  shape to `RaceContextRepository`, reusing `list_stints(session_id, driver_id)` exactly as it
  exists today.
- The remaining five (event-name uniqueness, `Deleted`-flag availability, telemetry-channel
  availability by session type, earliest supported season, testing-event exclusion mechanism) are
  simply unrelated to this milestone's scope — it touches no ingestion, no provider, no FastF1 call
  of any kind.

No ingestion architecture is modified. No provider is touched.

## 9. Testing Strategy — resolved

### Backend

New file `backend/tests/test_driver_tyre_trend_route.py`, mirroring `test_driver_trends_route.py`'s
own conventions exactly (a dedicated multi-session Parquet fixture — not `tests/fixtures.py`'s
single-session shape — plus `FakeRaceContextRepository` for the Postgres side, following
`test_stints_compare_route.py`'s established combined-override pattern):

1. **Route contract**: a season with 3+ sessions, the driver present with real stint data in each
   — response shape, field values, and `points` ordering match the fixture exactly.
2. **Session ordering**: sessions written to the fixture out of chronological order — response
   `points` come back `session_date`-ascending regardless of fixture insertion order (mirrors
   `test_driver_trends_route.py`'s own ordering test).
3. **Roster-absent session omitted**: a season with 3 sessions, driver present in only 2 — response
   has exactly 2 points, the third session's `session_id` does not appear anywhere in the response.
4. **Zero-stint-data session still produces a point**: driver present (via `list_drivers`) but
   `FakeRaceContextRepository` returns `[]` for that session — point is present with
   `strategy.stint_count == 0`, `compound_sequence == []`, `stint_lengths == []`.
5. **Multiple compounds/stints**: a session with 3+ stints across different compounds — `strategy`
   fields match exactly, `stint_lengths` computed correctly (`end_lap - start_lap + 1` per stint,
   reusing `driver_strategy_summary`'s own already-tested arithmetic, not re-derived).
6. **Unknown driver / unknown season**: `200`, `points: []`, never `404` (mirrors M17's own test).
7. **`session_type` filtering**: a season with both `race` and `qualifying` sessions for the same
   driver — default (`race`) and explicit `session_type=qualifying` return disjoint, correct point
   sets.
8. **Regression, M11 unchanged**: full existing `test_tyre_performance_route.py`/
   `test_stints_compare_route.py` suites continue to pass unmodified — this milestone touches
   `driver_strategy_summary`'s **callers**, never its own implementation or the two existing routes
   that already call it.
9. **Regression, M17 unchanged**: full existing `test_driver_trends_route.py` suite continues to
   pass unmodified — the new route is additive to the same file/router, the existing
   `get_driver_season_pace_trend` function and route are untouched.
10. **Full backend suite**: unaffected count (340 + new tests), `ruff check`, `ruff format --check`,
    `mypy --strict` all clean, matching every prior milestone's own gate.

### Frontend

New files `DriverSeasonTyreTrendPage.test.tsx`, `useDriverSeasonTyreTrend.test.ts`,
`SeasonTyreTrendList.test.tsx`, mirroring the equivalent M17 test files' structure:

1. Route renders correctly for a real `driverId`/`season`, calls the hook with the right params.
2. Hook: fetches on mount, refetches on `session_type` change, sets `loading`/`error` correctly,
   mirrors `useDriverSeasonPaceTrend.test.ts`'s existing test shape.
3. `SeasonTyreTrendList`: given a `points` array, renders one row per point in the given order
   (never re-sorts), each row's `CompoundSequenceStrip` receives exactly that point's
   `compound_sequence`/`stint_lengths` — no data transformation beyond passing fields through.
4. Loading/error/empty states: `LoadingState` while fetching, `ErrorState` on fetch failure,
   `EmptyState` for a `points: []` response (mirrors the pace-trend page's own three-state
   handling).
5. `session_type` filter: changing the dropdown updates the URL query param and triggers a refetch
   (mirrors `DriverSeasonPaceTrendPage.test.tsx`'s existing filter test).
6. `fromSession` back-link: present when the query param is set, falls back to the first point's
   `session_id` once loaded, absent when neither is available.
7. Entry point: `DriverSelectPage.test.tsx` gains a test confirming the new "Tyre Trend" link
   renders alongside the existing "Pace Trend" link, with the correct `href`, once `season` has
   loaded.
8. Full frontend suite: unaffected, no existing test's assertions change.

### Real-Data Verification

Against the real dataset (§4), read-only:

- `GET /drivers/DEV/seasons/2023/tyre-trend` — confirm exactly 10 points, in chronological order,
  each with real compound/stint data matching a direct `RaceContextRepository`/`TelemetryRepository`
  query for the same session/driver; confirm the 12 non-participating rounds are absent.
- If the primary case doesn't naturally surface a zero-stint-data point, `GET /drivers/HUL/seasons/
  2020/tyre-trend` as the secondary case, confirming the one known zero-stint session appears as a
  point with empty arrays, not omitted.
- Wall-clock timing re-confirmed at implementation time against §5's numbers (~0.73s for a full
  real season) — supplementary evidence, not a pass/fail gate, matching this project's own
  established convention (M17–M19 design reviews) of deterministic tests as the real gate and
  timing as corroborating evidence only.
- Zero Postgres writes, zero Parquet writes, zero `session.parquet`/`stints`/`pit_stops` row-count
  change before/after, confirming no data mutation.

## 10. Scope Discipline — Non-Goals (explicit)

- No cross-driver comparison, no N-way comparison, no `SessionPicker`/second-driver UI.
- No fitted tyre-degradation curve, no regression/slope, no predictive tyre-life model.
- No automated "best strategy" verdict, no cross-driver ranking, no AI-generated interpretation —
  inheriting M11's descriptive-only boundary unchanged, the same boundary M15 already inherited
  without modification.
- No weather/position/gap ingestion, no new provider, no new FastF1 call.
- No schema change, no migration, no new dependency.
- No change to `/stints/compare`, `/sessions/{id}/tyre-performance`, `/sessions/{id}/drivers/{id}/
  stint-pace`, or any existing endpoint's contract — all three remain byte-for-byte unchanged;
  their existing test suites are the regression proof (§9).
- No change to `driver_strategy_summary`, `join_laps_to_stints`, or any other existing M11 service
  function's behavior — only new callers are added.
- No unrelated performance optimization (the `session_analytics` residual cost, `docs/backlog.md`,
  is untouched by this milestone).
- No documentation reconciliation bundled in — this design note and the eventual implementation
  are the only doc-adjacent artifacts; `README.md`/`CHANGELOG.md`/`docs/prd.md` etc. are not
  updated as part of M21 itself (that happens at the same cadence prior feature milestones — M13,
  M15, M17 — already established: recorded at commit time in `CHANGELOG.md`, reconciled into the
  living docs at the next dedicated reconciliation pass, not proactively here).
- No extraction of the now-three-times-duplicated `_to_driver_strategy_summary` mapper (§6.5,
  explicitly decided, not deferred by accident).

## 11. ADR Assessment

**No ADR required.** Re-verified against CLAUDE.md's own trigger ("new dependency, new layer
boundary, reversal of a prior decision") rather than assumed from precedent alone:

- **New dependency?** No.
- **New layer boundary?** No — one new route in an existing router, two new response models in an
  existing models file, zero new repository methods (both `list_stints` and `list_drivers` already
  exist with exactly the signatures this design calls), zero new service functions
  (`driver_strategy_summary` is called, not extended or modified).
- **Reversal of a prior decision?** No — this extends, rather than revisits, M17's cross-season
  route pattern and M11's descriptive-only tyre boundary; ADR-0006 (`TelemetryRepository`),
  ADR-0011 (hybrid storage), and ADR-0009 (anti-corruption boundary) all continue to hold exactly
  as before.

Matches the same conclusion M13, M15, and M17 each reached for comparable thin-route,
existing-boundary features.

## 12. Files — Exact Scope

### Modified

- `backend/app/api/driver_trends.py` — one new route function + one new helper, added alongside
  the existing M17 route and its own helper.
- `backend/app/models/driver_trends.py` — two new Pydantic classes added alongside the existing
  M17 pair.
- `frontend/src/api/client.ts` — new TypeScript interfaces + one new client function, mirroring
  the existing `getDriverSeasonPaceTrend` block.
- `frontend/src/App.tsx` — one new `<Route>` entry.
- `frontend/src/features/session-select/DriverSelectPage.tsx` — one new `<Link>` per driver card.

### Created

- `backend/tests/test_driver_tyre_trend_route.py`
- `frontend/src/features/driver-trends/DriverSeasonTyreTrendPage.tsx`
- `frontend/src/features/driver-trends/DriverSeasonTyreTrendPage.module.css`
- `frontend/src/features/driver-trends/hooks/useDriverSeasonTyreTrend.ts`
- `frontend/src/features/driver-trends/components/SeasonTyreTrendList.tsx`
- `frontend/src/features/driver-trends/components/SeasonTyreTrendList.module.css`
- Corresponding `*.test.tsx`/`*.test.ts` files for each new frontend file above, plus one new test
  added to the existing `DriverSelectPage.test.tsx`.

### Explicitly Untouched

- `app/repositories/parquet_repository.py`, `app/repositories/postgres_race_context_repository.py`,
  `app/repositories/race_context.py`, `app/repositories/base.py` — no repository interface or
  implementation change of any kind.
- `app/services/tyre_performance/` (all files) — called, never modified.
- `app/services/session_discovery/grouping.py` — `list_sessions_for_driver_season` reused verbatim.
- `app/api/tyre_performance.py`, `app/api/stints_compare.py`, `app/api/race_context.py` and their
  models/tests — zero changes; their existing suites are this design's own regression proof.
- `frontend/src/features/tyre-performance/components/CompoundSequenceStrip.tsx`,
  `compoundColor.ts`, `compoundOrder.ts` — reused unchanged, zero prop or behavior changes.
- `frontend/src/features/driver-trends/DriverSeasonPaceTrendPage.tsx`,
  `hooks/useDriverSeasonPaceTrend.ts`, `components/seasonPaceTrendChartOptions.ts` — the M17 page
  is mirrored, not modified.
- Any pipeline file, any migration, any schema, any dependency manifest, any data file.
- `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`, `docs/architecture.md`,
  `docs/api-model.md`, `docs/data-model.md`, `docs/backlog.md` — no documentation reconciliation
  bundled into M21 (§10).
- `docs/m9-design-review.md` and every other `docs/mNN-*.md` historical record.

## 13. Deviations / Open Questions

None load-bearing. Every question the Stage B brief posed under §12 ("Design Decisions") is
resolved above with a specific mechanism (exact route, exact response model, exact metrics, session-
type semantics, ordering, missing-data semantics, backend orchestration shape, frontend route,
chart representation, URL state, entry point, performance/access pattern, testing strategy,
real-data verification case) — none left as an implementation-time guess.

One disclosed, deliberate (not accidental) scope boundary, restated from §6.5 for visibility: the
`_to_driver_strategy_summary` mapper becomes a third, independently-duplicated copy rather than
being extracted into a shared helper. This is a considered decision to keep this milestone's scope
to exactly the feature it was approved for, not a gap requiring resolution before implementation.

## Document History

- v1 (this document): M21 Stage B design, approved direction (cross-season driver tyre/stint-
  strategy trend), grounded in fresh re-reads of the M11/M15/M17 source this design reuses and a
  real, live-data (Parquet + Postgres) performance/verification-case benchmark run this session.

## Safety Confirmation

- Exactly one file was created by this task: `docs/m21-design-review.md`.
- No other file was created, modified, staged, committed, or pushed.
- `docs/m9-design-review.md` remains at its pre-existing baseline diff (`+1` blank line),
  unmodified, unstaged.
- No ingestion, no database write, no Parquet write occurred — all verification this session was
  read-only against real, already-ingested/already-populated data.
- Nothing has been committed or pushed.

**Stop.** Awaiting explicit approval before any M21 implementation.
