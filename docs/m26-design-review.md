# PitWall — M26 Design Review: Two-Driver Cross-Season Tyre-Trend Comparison

## Status

Stage B design. Not yet implemented. Awaiting explicit approval before Stage C.

## 1. Problem Statement / Evidence

M17 shipped one driver's race-pace trend across a season and explicitly deferred the two-driver
case (`docs/m17-design-review.md` §11: *"Multi-driver trend comparison (one driver only, per this
milestone's own stated goal)"*). M21 mirrored that exact deferral for tyre/stint-strategy trends
(`docs/m21-design-review.md` §7: *"Avoiding multi-driver comparison UI"*). M25 satisfied the
pace-trend half and explicitly handed off the tyre-trend half: `docs/m25-design-review.md` §13
lists *"Tyre-trend comparison (a real, separately-scoped, likely-next milestone — not part of
M25)"* as a non-goal. M26 (Stage A, approved) closes this: the last of the three deferrals named
across M17/M21/M25.

## 2. Fresh Source Verification (this session, not carried from M21/M25 design notes)

### 2.1 Backend — single-driver tyre trend (M21, unmodified, to be reused)

`get_driver_season_tyre_trend` (`backend/app/api/driver_trends.py:147-178`):

```python
def get_driver_season_tyre_trend(
    driver_id: str,
    season: int,
    session_type: SessionType = Query(default=SessionType.RACE, ...),
    telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository),
    race_context_repository: RaceContextRepository = Depends(get_race_context_repository),
) -> SeasonTyreTrendResponse: ...
```

Confirmed by direct read: **two repository dependencies**, not one — `telemetry_repository` (for
`list_sessions_for_driver_season` and the roster check) and `race_context_repository` (for
`list_stints`, via `_to_tyre_trend_point`). This is the one concrete signature difference from
`get_driver_season_pace_trend` (which takes only `repository: TelemetryRepository`) that M26's
comparison route must account for — both dependencies need to be threaded through to both sides.

`SeasonTyreTrendResponse`/`SeasonTyreTrendPoint` (`backend/app/models/driver_trends.py:61-103`,
re-read fresh): `driver_id`, `season`, `session_type`, `points: list[SeasonTyreTrendPoint]`; each
point nests `DriverStrategySummary` (M11) unchanged. Never 404s — identical roster-absent-omission
and unknown-driver/season → empty-list semantics to the pace-trend endpoint, confirmed by the same
`docs/m21-design-review.md` cross-reference already in the model's own docstring, and independently
by `backend/tests/test_driver_tyre_trend_route.py`'s existing test names (roster-absent, roster-
present-zero-stints, unknown-driver/season).

### 2.2 Backend — M25's comparison pattern (re-read fresh, not assumed)

`backend/app/api/driver_trends_compare.py` (full file re-read this session): `router =
APIRouter(prefix="/drivers", tags=["driver-trends-comparison"])`. `compare_pace_trends` imports
`get_driver_season_pace_trend` from `driver_trends.py` and calls it **twice**, directly, as a plain
function — not a service extraction, not a reimplementation. `SeasonPaceTrendComparisonResponse`
(`app/models/driver_trends.py`, appended after `SeasonTyreTrendResponse`): `{a:
SeasonPaceTrendResponse, b: SeasonPaceTrendResponse}`, no `warnings` field. Registered in
`app/main.py` as a second `app.include_router(...)` call immediately after `driver_trends.router`.

**One load-bearing structural observation, confirmed by reading `driver_trends.py`'s own file
contents, not inferred**: `driver_trends.py` already hosts *both* `get_driver_season_pace_trend`
(M17) and `get_driver_season_tyre_trend` (M21) in the **same file**, added in different milestones.
This is direct, unambiguous precedent that trend routes sharing a concern share a file regardless
of which milestone introduced them — resolving §2.5 below (route file placement) without
guesswork.

### 2.3 Frontend — M25's page (full file re-read this session)

`DriverPaceTrendComparisonPage.tsx`: `driverA`/`seasonA`/`driverB`/`seasonB`/`sessionType` derived
live from `searchParams` every render, **no local-state mirror** for resolved state. Local
`useState` exists only for the **form's in-progress input values**
(`driverAInput`/`seasonAInput`/`driverBInput`/`seasonBInput`), initialized once from the URL at
mount. `sessionType` writes to the URL immediately on `<select>` change (`{replace: true}`, no
Compare click needed). `driverA`/`seasonA`/`driverB`/`seasonB` write to the URL only inside
`handleSubmit`, one atomic `setSearchParams` call (`{replace: true}`), using `setOrDelete` to
normalize empty values to absent rather than writing `""`. Two independent `<TrendColumn>` /
`SeasonPaceTrendChart` instances, no shared axis. One Sidebar link, gated `driverId && season`,
seeding only `driverA`/`seasonA`.

`useDriverPaceTrendComparison.ts` (full file re-read): plain `useEffect`+`useState`, gates the
fetch on all four of `driverA`/`seasonA`/`driverB`/`seasonB` being defined, returns
`{comparison, loading, error}`.

`frontend/src/api/client.ts` (re-read the M25 block, lines 567-595): `SeasonPaceTrendComparisonResponse`,
`ComparePaceTrendsParams`, `comparePaceTrends()` — inserted immediately after
`getDriverSeasonPaceTrend`, immediately before the pre-existing M21 tyre-trend block
(`SeasonTyreTrendPoint`/`SeasonTyreTrendResponse`/`getDriverSeasonTyreTrend`, lines 597+).

`App.tsx`: `<Route path="/drivers/pace-trend/compare" element={<DriverPaceTrendComparisonPage />} />`,
placed directly after the M21 tyre-trend route.

`Sidebar.tsx` (re-read in full): the M25 link is the only addition since M24; gated `driverId &&
season`; no other link touched.

### 2.4 Frontend — tyre-trend display components (re-read fresh)

`SeasonTyreTrendList.tsx` (`frontend/src/features/driver-trends/components/`): props are exactly
`{ points: SeasonTyreTrendPoint[] }` — a `<ul>`, one `<li>` per point, each rendering the round/event
label, stint count, and a `CompoundSequenceStrip` fed directly from
`point.strategy.compound_sequence`/`point.strategy.stint_lengths`. **No prop addition is needed for
reuse** — passing a second, independently-fetched `points` array to a second `<SeasonTyreTrendList>`
instance is sufficient; the component has no notion of "which side" it's rendering and needs none.

`CompoundSequenceStrip.tsx` (re-read in full): props `{ compoundSequence: string[], stintLengths:
number[] }`, already consumed exactly this way by `SeasonTyreTrendList` — confirmed zero changes
needed here either.

**Confirmed: no x-axis or event-alignment question exists for this milestone at all.** M25 had to
resolve a real design problem (§7/§8 of `docs/m25-design-review.md`) because `SeasonPaceTrendChart`
builds a category axis from each driver's own round labels. `SeasonTyreTrendList` is a plain
ordered list with no axis, no chart, no shared coordinate space of any kind — two independent lists
side by side need no alignment reasoning whatsoever. This makes M26 architecturally simpler than
M25, not merely parallel to it.

### 2.5 Backend test conventions (re-read `test_driver_tyre_trend_route.py` in full)

**Concrete, load-bearing difference from `test_pace_trend_compare_route.py`'s own fixture**:
`test_driver_tyre_trend_route.py` overrides **both** `get_telemetry_repository` (real
`ParquetRepository` over a `tmp_path` fixture) **and** `get_race_context_repository` (an in-memory
`FakeRaceContextRepository` from `tests/fixtures.py`, keyed by `stints_by_driver:
dict[tuple[str, str], list[Stint]]` and `pit_stops_by_session: dict[str, list[PitStop]]`) — matching
`test_stints_compare_route.py`'s own established "fake the relational side, real-Parquet the
telemetry side" precedent (ADR-0006's stated fakeability benefit). It also writes **no
`laps.parquet` content** (an empty frame is still required for `ParquetRepository`'s footer-metadata
row-count check, but no rows), since `get_driver_season_tyre_trend` never calls `list_laps`. This is
the fixture shape M26's own backend test must mirror — not `test_pace_trend_compare_route.py`'s
laps-focused one.

## 3. Approved Scope (restated, verified against source — nothing added)

Two-driver cross-season tyre-trend comparison only. Mirrors M25's proven pattern. Reuses
`get_driver_season_tyre_trend`, `SeasonTyreTrendList`, `CompoundSequenceStrip` unchanged. URL-
persisted from the start. No N-way, no computed deltas/verdicts/rankings, no ingestion, no schema,
no provider changes, no generalized framework, no picker-component redesign, no Sidebar redesign
beyond one new entry.

## 4. API Design

**Exact route**: `GET /drivers/tyre-trend/compare`

**Query parameters** (identical naming convention to `compare_pace_trends`, all required except
`session_type`):

```
?driver_a=<str>&season_a=<int>&driver_b=<str>&season_b=<int>&session_type=<SessionType>
```

**File placement — resolved, not a new file**: added to the **existing**
`backend/app/api/driver_trends_compare.py`, alongside `compare_pace_trends`, not a new file.
Justification (§2.2): `driver_trends.py` itself already hosts both single-driver trend routes
(pace M17, tyre M21) in one file, added in different milestones — this is direct file-content
precedent, not an assumption, for `driver_trends_compare.py` following the identical shape as its
sibling comparison routes accumulate. Router/prefix (`APIRouter(prefix="/drivers", tags=[...])`)
already exists; no new `app.include_router(...)` call is needed in `main.py` — the existing
`driver_trends_compare.router` registration already covers the new route once it's added to that
router.

**Delegation approach — resolved by direct comparison of the three options** (as instructed):

- *Importing/calling the existing route function directly, twice* (M25's approach): guarantees
  byte-for-byte semantic parity with `get_driver_season_tyre_trend` by construction — impossible to
  silently diverge, since it's literally the same function object. **Selected.**
- *Extracting shared service logic* (e.g. a `_build_trend(driver_id, season, session_type, ...) ->
  list[Point]` helper used by both the single-driver route and the comparison route): would require
  either genericizing over `SeasonPaceTrendPoint`/`SeasonTyreTrendPoint`'s different shapes (a real
  abstraction cost) or building two separate typed helpers (no simpler than what already exists).
  Rejected — solves a problem the direct-call approach doesn't have.
- *Duplicating the session-filter/roster-check/point-building loop*: rejected outright — this is
  exactly the risk direct delegation eliminates (semantic drift from the single-driver endpoint).

**Response model**: `SeasonTyreTrendComparisonResponse{a: SeasonTyreTrendResponse, b:
SeasonTyreTrendResponse}`, added to `app/models/driver_trends.py` immediately after
`SeasonPaceTrendComparisonResponse` (mirroring where `SeasonTyreTrendResponse` already sits
immediately after `SeasonPaceTrendResponse` in the same file — same ordering convention). No
`warnings` field, for the identical reason `SeasonPaceTrendComparisonResponse` has none
(§4 of `docs/m25-design-review.md`, reconfirmed here: a season-granularity comparison has no
single-session "different circuit" concern, and an empty side's `points` list already self-
describes "no data," exactly as the pace-trend comparison and every single-driver trend endpoint
already establish).

**Route function**: `compare_tyre_trends`, in `driver_trends_compare.py`, threading both
`telemetry_repository: TelemetryRepository = Depends(get_telemetry_repository)` and
`race_context_repository: RaceContextRepository = Depends(get_race_context_repository)` through to
each `get_driver_season_tyre_trend(...)` call — the one concrete parameter-list difference from
`compare_pace_trends` (§2.1).

**Semantics, resolved by direct inheritance from the single-driver endpoint** (never independently
decided, always delegated):

- `session_type` shared across both sides, optional, defaults to `"race"` — identical to
  `compare_pace_trends`'s own resolved decision (`docs/m25-design-review.md` §3.1), for the
  identical reasoning (comparing race pace/strategy is the default question; per-side session-type
  divergence has no evidenced demand).
- Unknown driver/season on one side: that side's `points` is `[]`; the other side is completely
  unaffected — inherited directly from `get_driver_season_tyre_trend`'s own never-404s,
  independent-per-call behavior, proven again by calling the same function twice.
- Identical A/B selections: allowed, not rejected — mirrors `compare_pace_trends`'s own
  `test_pace_trend_compare_identical_driver_and_season_on_both_sides_is_not_rejected` precedent.
- Cross-season pairs: allowed — nothing in either call depends on the other side's season.
- Missing required query params → 422 (FastAPI's own `Query(...)` validation, unchanged).
- OpenAPI: the new path and `SeasonTyreTrendComparisonResponse` schema appear automatically via
  the existing router registration — no manual OpenAPI configuration needed, matching every other
  route in this codebase.

## 5. Frontend URL-State Design

**M25's architecture is reused exactly, not modified** — fresh inspection (§2.3/§2.4) found no
tyre-trend-specific reason to diverge:

- `driverA`/`seasonA`/`driverB`/`seasonB`/`sessionType` live solely in `searchParams` — no local
  mirror for resolved state.
- Free-text driver inputs + season `<select>`s are local form `useState`, initialized from the URL
  on mount, committed only via the explicit Compare submit — for the identical reason M25 resolved
  this (`docs/m25-design-review.md` §6): no debounce pattern exists anywhere in this codebase, and
  writing on every keystroke would fire a fetch per character typed.
- One atomic `setSearchParams` call on submit, `{replace: true}` — identical rationale (a multi-
  field "build a comparison" action shouldn't create multiple history entries).
- `sessionType` updates the URL immediately on change, not gated behind Compare — identical
  rationale (a discrete `<select>`, no free-text/debounce concern, matches
  `DriverSeasonTyreTrendPage`'s own existing live filter).
- Empty-value normalization (`getParam`/`setOrDelete`, treating `""` identically to an absent
  param) — identical mechanism.
- Unrelated query parameters preserved automatically via the updater-function form of
  `setSearchParams` — identical mechanism, no explicit allow-list.
- Refresh/deep-link/copy-paste: a fresh mount reads directly from `searchParams`, resolving
  immediately with no interaction required — identical to M25's own case-A guarantee.
- Back/Forward: identical, inherited characteristic — a session-analogous "driver identity" field
  here has no picker-remount concept at all (there is no picker, §6 of `docs/m25-design-review.md`'s
  own DriverLapPicker-specific caveat doesn't even apply), so there is no equivalent accepted
  limitation to carry forward or document; every field is derived live from `searchParams` on every
  render, so Back/Forward "just works" for all five fields uniformly — **simpler than M25's own
  guarantee, not merely equal to it**.

No concrete tyre-trend-specific issue was found during source verification that would justify any
deviation from M25's URL-state mechanism.

## 6. Frontend Component Design

- Two independent `<TrendColumn>`-equivalent wrappers, each rendering a `Card` containing one
  `<SeasonTyreTrendList points={side.points} />` — mirrors M25's `TrendColumn` structure exactly,
  substituting the list component for the chart component.
- Each side's own chronological ordering is preserved unchanged — `SeasonTyreTrendList` already
  never re-sorts (`docs/m21-design-review.md` §7, reconfirmed by direct source read, §2.4).
- Independent loading/error states: the new `useDriverTyreTrendComparison` hook mirrors
  `useDriverPaceTrendComparison`'s own single `{comparison, loading, error}` shape for the *whole*
  comparison (not per-side) — matching M25's own resolved decision (a request-level loading/error
  state, not two independent per-side states, since both sides resolve in one backend round-trip).
  Per-side **emptiness** (zero points) is still handled independently per side, exactly as M25's
  `TrendColumn` does — a side with an empty `points` array renders `EmptyState`, its sibling
  renders normally.
- A/B labeling: `{label} — {side.driver_id} — {side.season}` heading, identical format to M25's
  `TrendColumn` heading — no reason to diverge, same identity fields available
  (`driver_id`/`season`).
- Confirmed (§2.4): **no artificial alignment between the two lists is possible or attempted** —
  `SeasonTyreTrendList` has no axis, no shared coordinate space, and each list's own `<li>` count is
  whatever that side's own `points` length is. Two lists of different lengths (different seasons,
  different attendance) render side by side with no padding, truncation, or synthetic row.
- `SeasonTyreTrendList`/`CompoundSequenceStrip`: **zero prop additions, zero modifications** —
  confirmed by direct prop-shape inspection (§2.4), not assumed from M21's design note.

## 7. Sidebar / Routing

- **New route**: `/drivers/tyre-trend/compare` (identical frontend/backend path-identity
  convention every prior comparison route already follows).
- **`App.tsx` placement**: new `<Route>` immediately after the M25 pace-trend-compare route (which
  itself sits immediately after the M21 tyre-trend route) — same file, same list, one new line.
- **Sidebar link**: one new `NavLink`, gated `driverId && season` (identical condition to the M25
  link), seeding only `driverA=${driverId}&seasonA=${season}` — identical seed-one-side-only
  pattern as both "Compare Sessions" and "Compare Pace Trends" already establish. Placed
  immediately after the "Compare Pace Trends" link (grouping the two trend-comparison entry points
  together, immediately before "Session Analytics"/"Tyre Performance").
- **Arrival without query parameters**: identical to M25 — both driver inputs and both season
  selects render empty, no fetch fires (the hook's own four-field gate), no error state, matching
  `useDriverPaceTrendComparison`'s existing "no fetch and returns null when a required field is
  missing" behavior exactly.
- No Sidebar redesign — no existing link touched, reordered, or removed.

## 8. API Client / Hook

**Frontend API additions** (`frontend/src/api/client.ts`), inserted immediately after the existing
`getDriverSeasonTyreTrend` block (§2.3 — mirroring exactly where `comparePaceTrends` sits
immediately after `getDriverSeasonPaceTrend`):

```ts
export interface SeasonTyreTrendComparisonResponse {
  a: SeasonTyreTrendResponse;
  b: SeasonTyreTrendResponse;
}

export interface CompareTyreTrendsParams {
  driverA: string;
  seasonA: number;
  driverB: string;
  seasonB: number;
  sessionType?: SessionType;
}

export async function compareTyreTrends(
  params: CompareTyreTrendsParams,
): Promise<SeasonTyreTrendComparisonResponse> { ... }
```

Query-string construction mirrors `comparePaceTrends` exactly (`driver_a`/`season_a`/`driver_b`/
`season_b`/optional `session_type`), pointed at `/drivers/tyre-trend/compare`.

**Hook**: `useDriverTyreTrendComparison.ts`, in
`frontend/src/features/driver-trends/hooks/`, mirroring `useDriverPaceTrendComparison.ts`'s plain
`useEffect`+`useState` shape and four-field gate exactly, calling `compareTyreTrends` instead of
`comparePaceTrends`.

**Generic `useDriverTrendComparison` hook — explicitly rejected.** This would be exactly **two**
call sites (pace, tyre) — below this project's own consistently-applied rule-of-three threshold
(the same threshold that keeps `_to_driver_strategy_summary` duplicated at *three* copies, and that
kept `useDriverSeasonPaceTrend`/`useDriverSeasonTyreTrend` themselves separate at M21 despite being
nearly identical in shape). A generic version would also need to abstract over
`SeasonPaceTrendResponse` vs. `SeasonTyreTrendResponse`'s different point shapes for no real payoff
at two instances. **Decision: a second, independent, nearly-parallel hook file, matching the
established `useDriverSeasonPaceTrend`/`useDriverSeasonTyreTrend` precedent exactly.**

**`getParam`/`setOrDelete` duplication — a real, disclosed, deliberately-deferred decision, not an
oversight.** Fresh count (§2.3, confirmed by grep this session): these two small helpers already
exist, identically, in `ComparisonPage.tsx`, `StintComparisonPage.tsx` (both M24), and
`DriverPaceTrendComparisonPage.tsx` (M25) — **three** copies already, with M25's own design review
(§13) explicitly flagging this as "a real rule-of-three trigger, deliberately not pulled in as an
unrelated refactor during this milestone." Adding a fourth copy in M26's new page pushes this
further past that threshold. **Decision: still do not extract, for the same reason CLAUDE.md's own
scope discipline and this project's `_to_driver_strategy_summary` precedent both establish** —
duplication past the nominal threshold is not automatically milestone-worthy; extraction is a
disclosed, standalone cleanup decision, not something to fold into an unrelated feature milestone
"while already in the area." This is flagged explicitly (§12, §13) as real, present debt worth a
future dedicated pass — not resolved here.

## 9. Testing Strategy

### 9.1 Backend (`backend/tests/test_tyre_trend_compare_route.py`, new file)

**Fixture mirrors `test_driver_tyre_trend_route.py`'s pattern (§2.5), not
`test_pace_trend_compare_route.py`'s** — both `get_telemetry_repository` (real `ParquetRepository`)
and `get_race_context_repository` (`FakeRaceContextRepository`, in-memory) overridden; no
`laps.parquet` content written (unused by this route family); a two-season, two-driver stint
fixture (VER/HAM across 2024, plus a second season 2023 for the cross-season case, mirroring how
`test_pace_trend_compare_route.py` added a second season beyond `test_driver_trends_route.py`'s
single-season fixture).

Tests (mirroring `test_pace_trend_compare_route.py`'s exact naming convention, substituting "tyre"
for "pace" and stints for laps):

- `test_tyre_trend_compare_returns_the_full_contract_shape`
- `test_tyre_trend_compare_same_season_two_drivers`
- `test_tyre_trend_compare_cross_season_two_drivers`
- `test_tyre_trend_compare_session_type_filters_both_sides`
- `test_tyre_trend_compare_defaults_to_race_session_type`
- `test_tyre_trend_compare_each_side_ordered_independently`
- `test_tyre_trend_compare_identical_driver_and_season_on_both_sides_is_not_rejected`
- `test_tyre_trend_compare_unknown_driver_b_returns_200_with_empty_points_on_that_side_only`
- `test_tyre_trend_compare_unknown_season_on_one_side_returns_200_with_empty_points`
- `test_tyre_trend_compare_roster_absent_side_does_not_affect_the_other_side`
- `test_tyre_trend_compare_roster_present_zero_stints_side_still_produces_a_point` — the one
  tyre-specific case with no pace-trend analog (mirrors
  `test_driver_tyre_trend_route.py`'s own "roster-present, zero stints" case, §2.5 fixture's round-1-
  qualifying scenario), confirming `driver_strategy_summary([])`'s existing shape carries through
  the comparison route unchanged.
- `test_tyre_trend_compare_missing_required_query_params_returns_422`
- `test_tyre_trend_compare_matches_the_two_single_driver_endpoints_exactly` — the direct reuse
  proof, mirroring M25's own `test_pace_trend_compare_matches_the_two_single_driver_endpoints_exactly`.
- `test_openapi_includes_the_tyre_trend_compare_path`
- `test_openapi_tyre_trend_comparison_schema_has_no_warnings_or_computed_fields`

### 9.2 Frontend (`DriverTyreTrendComparisonPage.test.tsx`, new file)

Mirrors `DriverPaceTrendComparisonPage.test.tsx`'s exact conventions, with the chart-mocking
boilerplate (`vi.mock("echarts/core", ...)`, `fakeChart`) **omitted entirely** — `SeasonTyreTrendList`
renders no chart, so nothing to mock:

- Empty form / no fetch with no query params.
- Resolves from a fully specified URL with no interaction.
- Pre-fills form inputs from the URL on mount.
- Does not update the URL while typing into driver inputs (three sequential `fireEvent.change`
  calls, assert the `LocationProbe`'s search stays empty and `compareTyreTrends` isn't called).
- Writes the complete state to the URL in one `{replace: true}` navigation on Compare.
- Reproduces an identical comparison on refresh (re-mount at the same URL).
- Renders both trend lists independently with correct A/B driver+season labels.
- Refetches immediately with the selected session type, without a Compare click.
- Shows an empty state for a side with no matching sessions, without affecting the other side.
- Loading/error states.
- Fetches exactly once per resolved parameter set (no per-keystroke fan-out).
- **Sidebar navigation** — a new case not in M25's own page test file (better placed in
  `Sidebar.test.tsx`, §9.3), so not duplicated here.

### 9.3 `Sidebar.test.tsx` additions

Two new tests mirroring the existing M25 pair exactly: "shows the Compare Tyre Trends link once a
driver is selected, seeding only side A" and "does not show the Compare Tyre Trends link before a
driver is selected."

### 9.4 `useDriverTyreTrendComparison.test.ts`

Mirrors `useDriverPaceTrendComparison.test.ts`'s six cases exactly (gate on missing fields, fetch
and return, correct call args, error surfacing, refetch on season change, clears previous
comparison before a new fetch settles).

## 10. Real-Data Validation Plan

- **Primary**: `driver_a=VER&season_a=2023&driver_b=PER&season_b=2023` against the real backend —
  verify both sides' `points` counts and content, then verify `.a`/`.b` are **byte-identical** to
  `GET /drivers/VER/seasons/2023/tyre-trend` and `GET /drivers/PER/seasons/2023/tyre-trend`
  respectively (the same parity-proof technique §12 of `docs/m25-design-review.md` used, and the
  same real dataset already confirmed stable across every prior audit this session: 704 sessions,
  54,148 `stints` rows, 50,844 `pit_stops` rows).
- **Cross-season pair**: `VER` 2023 vs `VER` 2022 (or an equivalent real pair confirmed present in
  the ingested dataset at Stage C time), verifying each side reflects only its own season.
- **Ordering**: confirm each side's `points` remain `session_date`-ascending, matching the
  single-driver endpoint's own already-verified ordering.
- **`session_type` behavior**: verify the shared filter narrows both sides identically against real
  qualifying/race data.
- **Frontend**: build a comparison through the real UI (VER/2023 vs PER/2023), confirm the URL
  contains the complete state, refresh, open the resulting URL in a fresh browser context, confirm
  identical rendering on both sides, confirm the Sidebar entry point via the real click-through
  navigation flow (Seasons → Events → Sessions → Drivers, not a direct `page.goto()` jump — the
  same methodology correction M25's own browser verification required, §"deviations" of the M25
  implementation report), confirm zero console errors.
- No Postgres writes, no Parquet writes, at any point.

## 11. Performance Design

Expected: **exactly 2x** `get_driver_season_tyre_trend`'s own already-measured cost (§7 of the M26
Stage A audit: single-driver `/tyre-trend` ≈0.8s against real data). M25's own real, measured
`/pace-trend/compare` response time (≈0.45s, vs. ≈0.42s for the single-driver equivalent) already
demonstrated that doubling this class of work — two independent, sequential calls to an existing
sub-second route — does not produce a materially worse response time in practice, not merely in
theory. No caching, memoization, or optimization is introduced; none is justified by any evidence
gathered this session or in M25's own. Validation: a real-data timing check at Stage C
(`time curl` against the real dataset, mirroring the exact check already run for M25), not a formal
benchmark suite.

## 12. Data / Schema / Dependency Impact

Confirmed via direct source inspection, not assumed:

- No Postgres schema change — `stints`/`pit_stops` tables and `RaceContextRepository`'s interface
  are completely unmodified; `list_stints` is called exactly as `get_driver_season_tyre_trend`
  already calls it.
- No Parquet layout change.
- No ingestion/`pipeline/` change.
- No new provider.
- No new dependency (no new PyPI or npm package).
- No migration.
- No `docs/data-model.md` change needed (no schema changed).

## 13. Explicit Non-Goals

Pace-trend comparison (shipped, M25); N-way comparison; more than two drivers; computed deltas;
strategy verdicts; driver ranking; event/round alignment across sides (§6 — confirmed structurally
impossible to even attempt, since `SeasonTyreTrendList` has no axis); merged/overlay visualization;
predictive/fitted tyre degradation; recommendation generation; weather/position/gaps/standings;
bulk querying; a generic trend-comparison framework (§8 — explicitly evaluated and rejected at two
instances); Sidebar redesign beyond the one new entry; fixing the pre-existing, unrelated "Compare
Stints" Sidebar discoverability gap (confirmed still present, unchanged, out of scope);
`_to_driver_strategy_summary` extraction; the `getParam`/`setOrDelete` extraction question (§8 —
explicitly deferred, not resolved, disclosed as real debt); any performance work unrelated to this
feature (`session_analytics`'s tracked residual cost is untouched by this milestone).

## 14. Architectural Risk Review

| Risk | Classification | Notes |
|---|---|---|
| Route-function delegation coupling (`compare_tyre_trends` calling `get_driver_season_tyre_trend` directly) | **Accepted** | Identical shape to M25's own already-shipped, already-proven pattern; a signature change to the single-driver route would need updating in exactly one place either way. |
| Duplicated comparison-response-model pattern (`{a, b}` shape now exists twice: pace, tyre) | **Accepted, non-load-bearing** | Two instances, below rule-of-three; each model is 3 lines; no shared base type exists to extract without genericizing over unrelated point shapes. |
| URL-state mechanism reused unmodified | **Mitigated by verification** | §5 confirmed no tyre-specific reason to diverge exists; this is the lowest-risk item in the design, having already shipped once. |
| Uncontrolled free-text driver inputs | **Accepted** | Identical to M25's own resolved decision — no validation exists anywhere in this route family for `driver_id`; an invalid value simply yields an empty side, not an error. |
| API error semantics (never-404) | **Mitigated by inheritance** | Not independently decided — inherited directly from `get_driver_season_tyre_trend`, proven by direct function reuse rather than asserted. |
| One-sided empty/error handling | **Mitigated by design** | Single request-level loading/error state (matches M25), independent per-side emptiness handling (also matches M25) — both already exercised in production by M25's shipped page. |
| `getParam`/`setOrDelete` at 4 copies, future abstraction pressure | **Load-bearing debt, explicitly deferred** | Real, disclosed, not resolved in this milestone (§8/§13) — the one item in this review that is genuinely accumulating pressure and should be flagged for a future dedicated pass, not silently ignored. |
| Generic hook/hook-family abstraction pressure | **Accepted, non-load-bearing** | Two instances only; same threshold reasoning as the response-model duplication above. |

No hypothetical risk is inflated into a blocker; the table above is exhaustive for this milestone's
actual scope.

## 15. Deviations / Open Questions

**Load-bearing open questions: zero.** Every architectural question Stage B was asked to resolve
has a concrete, source-verified answer above.

**Non-load-bearing implementation choices, left for Stage C:**

- Exact Sidebar link ordering relative to "Compare Pace Trends" (immediately after, per §7 — a
  concrete recommendation, not strictly forced).
- Whether the season `<select>`'s default-to-most-recent-season UX nicety (already present in
  M25's page) is copied verbatim or re-derived — purely cosmetic, no behavioral difference either
  way.
- Exact wording of test names beyond the concrete list in §9 (naming style is fixed by precedent;
  exact phrasing is not load-bearing).

**Deviations from M25's architecture**: **one**, concretely justified by source (§2.1) — the new
route function threads two repository dependencies instead of one, because
`get_driver_season_tyre_trend` itself requires both. This is not a design choice; it is inherited
directly from the function being reused. No other deviation exists — every other architectural
decision in this document is a direct, source-verified continuation of M25's shipped pattern.

## 16. Exact Stage C File List

**Backend:**
- `backend/app/api/driver_trends_compare.py` (modified — add `compare_tyre_trends`, no new file)
- `backend/app/models/driver_trends.py` (modified — add `SeasonTyreTrendComparisonResponse`)
- `backend/tests/test_tyre_trend_compare_route.py` (new)

*Not modified*: `backend/app/main.py` (the existing `driver_trends_compare.router` registration
already covers the new route once added to that router — confirmed, not assumed, since FastAPI
routers register all their routes at include-time, not per-route).

**Frontend:**
- `frontend/src/api/client.ts` (modified — add `SeasonTyreTrendComparisonResponse`,
  `CompareTyreTrendsParams`, `compareTyreTrends()`)
- `frontend/src/features/driver-trends/DriverTyreTrendComparisonPage.tsx` (new)
- `frontend/src/features/driver-trends/DriverTyreTrendComparisonPage.module.css` (new — mirrors
  `DriverPaceTrendComparisonPage.module.css`'s structure; a shared stylesheet was considered and
  rejected for the same reason the two pages' TSX stay separate, §8)
- `frontend/src/features/driver-trends/DriverTyreTrendComparisonPage.test.tsx` (new)
- `frontend/src/features/driver-trends/hooks/useDriverTyreTrendComparison.ts` (new)
- `frontend/src/features/driver-trends/hooks/useDriverTyreTrendComparison.test.ts` (new)
- `frontend/src/App.tsx` (modified — one new `<Route>`)
- `frontend/src/components/Sidebar.tsx` (modified — one new gated `NavLink`)
- `frontend/src/components/Sidebar.test.tsx` (modified — two new tests)

*Not modified*: `SeasonTyreTrendList.tsx`, `CompoundSequenceStrip.tsx` (§2.4 — zero prop changes
needed), `driver_trends.py` (`get_driver_season_tyre_trend` reused verbatim), any repository or
service file, any pipeline/data/migration file, `docs/backlog.md`, `docs/data-model.md`,
`docs/api-model.md` (documentation reconciliation is explicitly out of scope for this milestone,
§13, matching M25's own equivalent exclusion).

## Document History

- v1 (this document): M26 Stage B design for two-driver cross-season tyre-trend comparison.

## Safety Confirmation

Only `docs/m26-design-review.md` (this file, newly created) was created or modified during Stage B.
`docs/m9-design-review.md` remains untouched — byte-identical to its pre-existing baseline diff.
Nothing has been staged, committed, or pushed. No backend or frontend implementation file has been
created or modified.

**STOP — awaiting explicit approval before proceeding to Stage C.**
