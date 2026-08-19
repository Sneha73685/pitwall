# PitWall — M25 Design Review: Two-Driver Cross-Season Pace-Trend Comparison

## Status

Stage B design. Not yet implemented. Awaiting explicit approval before Stage C.

## 1. Context / Problem

M17 shipped one driver's race-pace trend across one season (`GET /drivers/{driver_id}/seasons/
{season}/pace-trend`) and explicitly named the two-driver case as deferred, twice, across two
separate milestones:

- `docs/m17-design-review.md` §11: *"Multi-driver trend comparison (one driver only, per this
  milestone's own stated goal)."*
- `docs/m21-design-review.md` §7: *"Avoiding multi-driver comparison UI: no `SessionPicker`, no
  second driver selector, no pairing UI of any kind is added... matching M17's own explicit 'no
  picker UI needed' reasoning."*

M25 picks this up for the pace-trend case only (tyre-trend comparison is a real, separately-scoped
follow-up — §11). This is the fourth time this project generalizes a single-entity view into a
two-sided comparison (M13 laps, M15 stints, now pace trends), and the first to ship after M24
established URL-persisted comparison state as the norm rather than an afterthought.

## 2. Current Implementation Analysis (verified against source this session)

### 2.1 Single-driver pace trend (M17) — reused, unmodified

- `GET /drivers/{driver_id}/seasons/{season}/pace-trend?session_type=` (`backend/app/api/
  driver_trends.py`) calls `list_sessions_for_driver_season(repository.list_sessions(), season,
  session_type)` (`app/services/session_discovery/grouping.py`) — a **pure, in-memory filter**
  over an already-fetched session list, no new repository method, no I/O beyond what
  `list_sessions()` already does. For each matching session, the route checks the driver's roster
  (`repository.list_drivers(session.session_id)`) and, if present, calls `summarize_driver` (M8,
  unchanged) with an empty `telemetry_by_lap` — telemetry is never fetched.
- `SeasonPaceTrendResponse` (`app/models/driver_trends.py`): `driver_id`, `season`, `session_type`,
  `points: list[SeasonPaceTrendPoint]`. **Never 404s** — `driver_id`/`season` are not persisted,
  independently-checkable resources; an unknown driver or season simply produces an empty
  `points` list (confirmed via `test_pace_trend_unknown_driver_returns_200_with_empty_points` and
  `test_pace_trend_unknown_season_returns_200_with_empty_points`, `backend/tests/
  test_driver_trends_route.py`).
- **`driver_id` has no standalone catalog anywhere in this schema** — confirmed via
  `docs/m17-design-review.md:240-243`: *"not validated against any standalone 'drivers' catalog —
  none exists anywhere in this schema (drivers only exist as per-session roster rows)."* Confirmed
  independently this session: `list_drivers(session_id)` (`app/repositories/base.py`) is the
  **only** driver-listing method anywhere in the backend, and it is always session-scoped. There is
  no "list all drivers in a season" or "list all drivers globally" capability.
- `season`, by contrast, **is** backed by a real, listable resource: `GET /seasons`
  (`app/api/seasons.py`) returns every season PitWall has actually ingested sessions for
  (`SeasonSummary{season, event_count}`), already consumed by the frontend via `listSeasons()`
  (`frontend/src/api/client.ts:250-252`).
- `DriverSeasonPaceTrendPage.tsx` (`frontend/src/features/driver-trends/`): `driverId`/`season`
  come from route params (`/drivers/:driverId/seasons/:season/pace-trend`), not a picker — its own
  docstring states why: *"Season/driver are fixed by the route params; no picker UI is needed
  here, since the one approved entry point (`DriverSelectPage`'s 'Pace Trend' link) already carries
  both."* `session_type` is the only control, read live from `searchParams` with no local-state
  mirror, written via `setSearchParams((params) => { params.set(...); return params; })` — **no
  `{replace: true}`**, since a single-field filter change doesn't create the multi-step-churn
  problem M24 solved for.
- `SeasonPaceTrendChart.tsx` + `seasonPaceTrendChartOptions.ts`: takes `points:
  SeasonPaceTrendPoint[]`, builds a **category x-axis** from each point's own `R{round_number}
  {event_name}` label, in the order the API already returns (`session_date` ascending, never
  re-sorted). **This is the single most important fact for M25's chart design (§6, §7)**: the
  x-axis categories are derived entirely from one driver's own points — there is no shared,
  aligned axis to merge two drivers onto without inventing one.

### 2.2 `StintComparisonPage` + M24's URL-state model — the pairing pattern to mirror, and where it doesn't apply

- `stints_compare.py`'s `compare_stints` route: `session_id_a`, `driver_a`, `session_id_b`,
  `driver_b` query params, a `_build_side()` helper called twice (fully independently — own
  session-existence check, own repository reads), assembled into `StintComparisonResponse{a, b,
  warnings}`. **This `_a`/`_b`-suffixed query-param convention, and the "call the existing
  single-entity logic twice, assemble a paired response" shape, is exactly what M25 mirrors** for
  the backend (§3).
- `StintComparisonWarning`/`StintComparisonWarningCode` exist specifically for a **circuit-mismatch**
  concern that is meaningful at single-session granularity (`docs/adr` reasoning: two different
  circuits' stint strategies may not be comparable). **This concern does not transfer to a
  season-granularity comparison** — a season already spans every circuit on the calendar by
  definition, so "different circuit" is not a coherent warning here (§3 resolves this: no warnings
  model at all).
- `StintComparisonPage.tsx` (current, post-M24, re-read fresh this session): `sessionIdA`/
  `sessionIdB` derived live from `searchParams` every render (no local state — nothing validates a
  session ID before use); `driverIdA`/`driverIdB` remain local `useState`, populated only through
  `DriverPicker`'s own roster-validated `initialDriverId` prop (itself read fresh from
  `searchParams`, not from the local state — the fix M24 needed for correct Back/Forward
  behavior); every URL write happens at one of three atomic call sites (`handleSessionPicked`,
  `handleSelectA`/`handleSelectB`), always with `{replace: true}`, always via the
  updater-function form of `setSearchParams`.
- **The reason this exact hybrid model does not transfer unchanged to M25**: it exists specifically
  because `DriverPicker`/`DriverLapPicker` have an async, session-scoped roster-validation gate
  (fetch `listDrivers(sessionId)`, confirm the pre-selected driver is really on that roster, only
  then fire `onSelect`). M25's `driver_id` has **no such gate anywhere** — the backend never
  validates it (§2.1) — so there is nothing to preserve "picker/validation authority" over. §4/§5
  resolve what replaces it.

## 3. API Shape

**New route**: `GET /drivers/pace-trend/compare`

**New file**: `backend/app/api/driver_trends_compare.py` — a **separate file** from
`driver_trends.py`, mirroring the established precedent that comparison routes get their own file
distinct from the single-entity route file even when closely related (`stints_compare.py` is
separate from `race_context.py`/`tyre_performance.py`; `laps_compare.py` is separate from
`sessions.py`). **Same `/drivers` prefix as `driver_trends.py`**, registered as a second
`APIRouter(prefix="/drivers", ...)` — confirmed safe and already precedented: `sessions.py`,
`session_analytics.py`, `race_context.py`, `track.py`, and `telemetry.py` are five separate files
already sharing `prefix="/sessions"` in `app/main.py`. No path collision: the new route
(`/drivers/pace-trend/compare`, 2 segments after the prefix) and the existing route
(`/drivers/{driver_id}/seasons/{season}/pace-trend`, 4 segments) have different shapes entirely.

**Query parameters** (mirroring `compare_stints`'s `_a`/`_b` suffix convention exactly):

```
GET /drivers/pace-trend/compare
    ?driver_a=<str>&season_a=<int>
    &driver_b=<str>&season_b=<int>
    &session_type=<SessionType>   (optional, default "race" -- shared by both sides, see §3.1)
```

**Route function**: `compare_pace_trends`, matching `compare_laps`/`compare_stints`'s naming
exactly. Body is a thin adapter calling the existing `_to_trend_point`-equivalent logic twice — see
§8 for why this is not two new code paths.

### 3.1 Why `session_type` is shared, not per-side

Considered per-side (`session_type_a`/`session_type_b`) and rejected: comparing "driver A's race
pace vs. driver B's qualifying pace" is not a coherent race-engineering question, has no evidence
of demand, and would double the UI's filter controls for a case nobody asked for. A single,
shared, optional `session_type` (default `"race"`, matching M17/M21's own default) applies to both
sides — "compare both drivers' pace across the season, for a given session type" is the actual
question this milestone answers.

## 4. Response Shape

**Decision: a dedicated comparison response model wrapping two complete, unmodified
`SeasonPaceTrendResponse` sides — not a new flattened shape, not a new computed-metric shape.**

```python
class SeasonPaceTrendComparisonResponse(ApiModel):
    a: SeasonPaceTrendResponse
    b: SeasonPaceTrendResponse
```

Added to `app/models/driver_trends.py`, alongside the models it reuses. Rejected alternatives:

- **Two independent existing single-driver responses fetched separately by the frontend** (no new
  backend route at all): rejected because it would require the frontend to make two round-trips
  and reconstruct the pairing itself, unlike every other comparison feature in this app
  (`/laps/compare`, `/stints/compare`), which resolve server-side in one request. Consistency with
  the established pattern outweighs the marginal backend simplicity.
- **A new flattened per-side point shape** (mirroring how `SeasonPaceTrendPoint` itself flattens a
  subset of `DriverSummary`): rejected — `SeasonPaceTrendResponse` already carries everything a
  side needs (`driver_id`, `season`, `session_type`, `points`), and reusing it unchanged, nested,
  mirrors `SeasonTyreTrendPoint`'s own precedent for "every field is reused, so nest the existing
  model rather than restating it" (`app/models/driver_trends.py:68-73`).
- **No `warnings` field.** Unlike `StintComparisonResponse`, there is no season-granularity
  equivalent of "different circuit" (§2.2), and an empty side's `points` list already
  self-describes "no data for this driver/season" exactly the way the single-driver endpoint's own
  empty-list convention already does (no special-casing needed, matching
  `test_pace_trend_unknown_driver_returns_200_with_empty_points`'s existing behavior). Adding a
  warnings vocabulary here would be inventing a concern with no evidenced need.

## 5. Driver/Season Semantics

- **Same driver on both sides** (e.g. `VER` 2023 vs `VER` 2024): allowed, not rejected — mirrors
  `compare_stints`'s own `test_compare_stints_identical_session_and_driver_on_both_sides_is_not_
  rejected` precedent. A driver comparing their own pace year-over-year is a legitimate use case.
- **Same season on both sides** (the overwhelmingly common case — "who was faster this season"):
  the default expectation, fully supported.
- **Different drivers, different seasons** (e.g. `VER` 2023 vs `HAM` 2021): allowed — nothing in
  either side's computation depends on the other side's driver or season. Each side is a fully
  independent call to the existing `list_sessions_for_driver_season` + roster-check + `
  summarize_driver` pipeline (§8).
- **`session_type` filtering**: applies identically to both sides (§3.1) — no per-side override.
- **Ordering**: unchanged from the single-driver endpoint — each side's own `points` list is
  ordered `session_date` ascending (falling back to `SessionType`'s declaration order), exactly
  matching `SeasonPaceTrendResponse`'s existing, documented ordering guarantee. No cross-side
  ordering exists or is meaningful (§7).
- **Missing/invalid driver or season**: never 404s, on either side independently — mirrors
  `SeasonPaceTrendResponse`'s own "unknown driver/season → empty `points`" behavior exactly (§2.1).
  An invalid side A does not affect side B's resolution.
- **Empty seasons** (season not yet ingested, or genuinely had zero matching sessions of that
  type): that side's `points` is `[]`; the other side is unaffected.
- **Sessions where a driver is absent from the roster**: same roster-absent-omission rule as
  today — omitted from that side's `points` entirely, not represented as a null point (unchanged
  from `SeasonPaceTrendResponse`'s existing §5.1 rule, referenced in `app/models/
  driver_trends.py:51-52`).

## 6. Frontend URL State

**Decision: the URL is the sole source of truth for the resolved comparison — no local-state
mirror for `driverA`/`seasonA`/`driverB`/`seasonB`/`sessionType` at all**, extending
`DriverSeasonPaceTrendPage`'s own existing pattern (session_type read live from `searchParams`,
no local state) to all five fields, rather than M24's hybrid model — because, unlike M24's driver/
lap fields, **none of these five fields has a validation gate to preserve** (§2.2/§5): `driver_id`
is never validated anywhere, `season` is never validated against a catalog either (only `GET
/seasons` offers a real list to *populate a dropdown from*, which is a UI convenience, not a
validation gate).

**Route**: `/drivers/pace-trend/compare` (frontend route matches the backend path exactly,
mirroring `/stints/compare`'s and `/laps/compare`'s own precedent of frontend and backend paths
being identical strings).

**URL parameters**: `driverA`, `seasonA`, `driverB`, `seasonB`, `sessionType` — capitalization
matches the frontend's own existing convention for these exact concepts (`ComparisonPage`'s
`driverA`/`lapA`, `StintComparisonPage`'s `driverA`; `DriverSeasonPaceTrendPage`'s own
`session_type` is the one outlier, using the backend's snake_case directly since it's a
pass-through query param rather than a frontend-side comparison-state field — M25 uses
`sessionType`, camelCase, since it's now a page-level comparison field like the others, not a
single pass-through filter).

**Initialization**: `driverA`/`seasonA`/`driverB`/`seasonB`/`sessionType` are read directly from
`searchParams` on every render via the same `getParam`/normalize-empty-to-absent helper M24
already established (duplicated locally per M24's own rule-of-three reasoning, §9 below — or
reused if Stage C finds a natural single import site, see §14). `season_a`/`season_b` are parsed
with `Number(...)`, guarded the same way `DriverSeasonPaceTrendPage` already guards its own
`season` param (`Number.isNaN` check).

**Write timing — the one genuinely new problem this milestone introduces**: driver identity is
entered via a **free-text input** (§7, no catalog to pick from), not a discrete picker. Writing to
the URL on every keystroke (mirroring M24's "write at the atomic onSelect callback" model naively)
would: (a) create URL/history churn on every character typed, even under `{replace: true}`, and
(b) fire the comparison fetch on every partial keystroke ("V", "VE", "VER"), since the fetch hook's
dependency array would be driven directly by the live URL value — wasteful, repeated network
calls for a value that isn't done being typed yet. No debounce utility or pattern exists anywhere
in this codebase (confirmed via a full-tree grep this session) — introducing one would be a new,
unprecedented pattern for a single milestone's use.

**Resolution: an explicit "Compare" submit action**, not live-as-you-type sync. Each side's driver
text input and season `<select>` are local, uncontrolled-until-submit `useState` (initialized from
the current URL on mount, so re-opening/refreshing an existing comparison pre-fills the form with
its current values — this is the one place M25 keeps local state, and it is form-editing state,
not comparison-resolution state). On submit, **one** `setSearchParams` call writes all five fields
atomically, `{replace: true}`, using the updater-function form (preserves unrelated params
automatically, matching M24's §4-E precedent exactly). A URL that already fully specifies a
comparison (a deep link, a refresh, a copied URL) resolves immediately with **no submit required**,
since the fetch is driven directly by `searchParams`, not by "has this session's form been
submitted" — satisfying the same case-A requirement M24's own design established (§4 there).

This is not a deviation from M24's *principles* (URL authoritative for resolvable state, `replace:
true` for atomic actions, unrelated params preserved, empty values normalized, refresh/copy-paste
reproduces, no URL↔local-state loop) — every one of them holds. It is a different *mechanism*
because the underlying input is fundamentally different (free text vs. a validated picker
callback), and Stage A's own instruction was to reuse M24's principles, not force-fit its exact
call-site shape onto a problem M24 never had.

## 7. Picker Architecture

**`DriverPicker`/`DriverLapPicker` are not reused, not extended, not wrapped.** Both are
session-scoped roster pickers (`listDrivers(sessionId)`) with no applicability here — there is no
session to scope a roster fetch from; a season contains many sessions, and picking one specific
session just to borrow its roster would be indirect, confusing ("why do I have to pick a race just
to compare a whole season?"), and contrary to the single-driver page's own explicit reasoning for
needing no picker at all (§2.1).

**New, minimal, page-local input**: per side, a free-text `<input>` for the driver code (matching
the "driver_id is just an opaque filter string, never independently validated" convention already
established for this entire route family, §2.1) plus a `<select>` populated from `listSeasons()`
(fetched once at the page level, shared by both sides — real, existing, already-used
infrastructure, not new). Implemented as a small page-local function component (mirroring
`StintComparisonPage`'s own `SessionSlot`/`StrategyColumn` — small, page-scoped view helpers, not
extracted to their own file) rather than a new reusable "picker component library" entry, since
there is no roster-validation behavior to encapsulate.

No case-normalization of the driver-code input is required for correctness (a lowercase or
mistyped code simply yields zero matching points on that side — the existing, unmodified "empty is
a valid, self-describing state" behavior, §5) — an uppercase-on-input UX nicety is a legitimate,
non-load-bearing Stage C implementation detail, not a design requirement.

## 8. Comparison UI

**Two side-by-side `SeasonPaceTrendChart` instances, each fed its own side's unmodified `points`
array — not a merged, single-axis, two-series chart.** This is not a stylistic preference; it is
forced by §2.1's finding that the existing chart's x-axis is a **category axis built from each
driver's own round/event labels**. Two drivers being compared across different seasons (or even
the same season with different session_type-filtered attendance) do not share a common category
axis to merge onto without inventing an alignment scheme — exactly the "no artificial alignment or
interpolation" instruction this task gives. Reusing `SeasonPaceTrendChart`/
`buildSeasonPaceTrendChartOption` **completely unchanged**, twice, is both the minimal
implementation and the only one that avoids inventing a generalized comparison-chart framework
this milestone has no evidenced need for.

**Layout**: mirrors `StintComparisonPage`'s two-column `.columns` layout exactly — a `Card` per
side titled with the driver ID and season (e.g. "VER — 2023"), matching `StintComparisonPage`'s
own `StrategyColumn` heading convention (`{label} — {side.driver_id}`, extended here with the
season since that's the added dimension this comparison introduces). No swap button (§9 —
"swap A/B" only makes sense when both sides are freshly, symmetrically resolved from a picker
callback the way `ComparisonPage`'s laps are; here, swapping would just mean re-typing the same
four values in reverse order, which the user can already do directly by editing the form — adding
a swap button would be UI for a problem the free-text form doesn't actually have).

## 9. Cross-Season Semantics

Directly answering the four named cases:

- **VER 2023 vs PER 2023**: two independent calls to the existing pipeline, `season=2023` both
  sides, `driver_id` differs. No special-casing anywhere.
- **VER 2023 vs PER 2022**: identical code path — `season` is just a parameter each side's own
  independent computation uses; nothing compares the two seasons to each other. The two resulting
  charts show two different sets of round/event categories, side by side, exactly as they would if
  viewed on the two existing single-driver pages independently — this comparison changes nothing
  about what each side *computes*, only that both are fetched and displayed together.
- **Different numbers of sessions between sides**: each side's own `points` array is whatever
  length its own season/session_type/roster produces — no padding, no truncation, no forced
  alignment. The two charts simply have different numbers of x-axis categories, which is not a
  defect; it's an accurate reflection of two different seasons.
- **A session exists for one driver but not the other**: already fully handled by each side's own,
  independent, pre-existing roster-absent-omission rule (§5) — there is no interaction between
  sides to define, because there is no shared computation between sides at all (§10 confirms this
  is not accidental — it's the whole reason this stays O(sessions) not O(sessions²)).

No artificial alignment, interpolation, or synthetic "missing round" placeholder is introduced
anywhere in this design.

## 10. Performance

**Exactly 2x the existing single-driver route's work — no N² architecture.** `compare_pace_trends`
calls the same `list_sessions_for_driver_season` + per-session roster-check + `summarize_driver`
sequence **twice**, once per side, with no shared state and no cross-side loop. This is the same
shape `compare_stints` already established (`_build_side` called twice) and the same reasoning
`docs/m17-design-review.md` already gave for why the single-driver route itself is not N²
(`list_sessions_for_driver_season` is a single pure in-memory filter, not a per-session repository
call). No new abstraction is introduced to "generalize" this into a reusable N-way comparison
engine — that would be solving a problem (§11 explicitly excludes N-way) this milestone doesn't
have.

Given M24 touched zero backend files and this route reuses M17's already-measured-fast pipeline
unchanged, no new performance benchmark is required before Stage C; the existing `/pace-trend`
route's own measured cost (sub-second, per M23's fresh benchmark) is the accurate baseline
expectation for one side of this comparison, doubled.

## 11. Testing Strategy

### 11.1 Backend (`backend/tests/test_pace_trend_compare_route.py`, new file, mirroring
`test_driver_trends_route.py`'s and `test_stints_compare_route.py`'s fixture conventions exactly —
own dedicated multi-session, multi-driver, multi-season fixture, not stretched onto the shared
single-fixed-session fixture)

- `test_pace_trend_compare_returns_the_full_contract_shape` — both sides present, correct nesting.
- `test_pace_trend_compare_same_season_two_drivers` — the common case.
- `test_pace_trend_compare_cross_season_two_drivers` — different `season_a`/`season_b`, confirms
  no cross-side interaction.
- `test_pace_trend_compare_session_type_filters_both_sides` — one shared filter applied uniformly.
- `test_pace_trend_compare_each_side_ordered_independently` — mirrors
  `test_pace_trend_orders_by_session_date_ascending`, applied per side.
- `test_pace_trend_compare_unknown_driver_b_returns_200_with_empty_points_on_that_side_only` —
  mirrors `test_compare_stints_unknown_driver_b_returns_200_with_no_stint_data_warning`'s shape,
  minus the warning (§4).
- `test_pace_trend_compare_unknown_season_on_one_side_returns_200_with_empty_points` — mirrors
  `test_pace_trend_unknown_season_returns_200_with_empty_points`, per side.
- `test_pace_trend_compare_identical_driver_and_season_on_both_sides_is_not_rejected` — mirrors
  `test_compare_stints_identical_session_and_driver_on_both_sides_is_not_rejected`.
- `test_pace_trend_compare_response_never_includes_full_throttle_pct_or_per_lap_data` — mirrors the
  existing single-driver contract test, applied to both nested sides.
- `test_pace_trend_compare_missing_required_query_params_returns_422`.
- `test_pace_trend_compare_side_b_computation_does_not_depend_on_side_a` — a direct proof of §9/§10
  (e.g. an invalid/empty side A doesn't affect a valid side B's `points`).
- `test_openapi_includes_the_pace_trend_compare_path`.

### 11.2 Frontend (`DriverPaceTrendComparisonPage.test.tsx`, mirroring
`StintComparisonPage.test.tsx`'s and `ComparisonPage.test.tsx`'s M24 URL-persistence test block
conventions)

- Mounts with no query params → both sides show the empty form, no fetch.
- Mounts from a fully specified URL (all five params) → both charts render with **no interaction**
  (mirrors M24's own "fully specified URL, no interaction needed" test case, §11 of
  `docs/m24-design-review.md`).
- Submitting the form with both sides filled writes all five params to the URL in one `{replace:
  true}` navigation (assert via the same `LocationProbe`/`useNavigationType` test pattern M24's own
  test files established).
- Editing only one side and resubmitting updates only that side's params, leaves the other
  side's URL params and the shared `sessionType` untouched.
- Refresh (re-mount at the same URL) reproduces the identical comparison.
- Correct A/B driver + season labeling in each `Card`'s title.
- Both trend datasets render via two real `SeasonPaceTrendChart` instances (asserted the same way
  `StintComparisonPage.test.tsx` asserts on `stint-comparison-side-a`/`-b` test IDs).
- Loading/error/empty states per side — mirrors `DriverSeasonPaceTrendPage.test.tsx`'s existing
  empty-points `EmptyState` case, applied independently per side.
- Unrelated query parameters preserved across a submit (mirrors M24's own test).
- Empty query values normalize to absent (mirrors M24's own test).
- No swap-button test (§8 — no swap button exists).

## 12. Real-Data Verification

- **VER vs PER, 2023** (same season, the primary case) — both drivers and this season are already
  used throughout this session's prior milestone verification (M23's benchmark, M24's Playwright
  verification) and are known-good, real, ingested data.
- **At least one cross-season pair** — e.g. VER 2023 vs VER 2022 (same driver, different seasons,
  §5's explicitly-allowed case) or VER 2023 vs PER 2022, using whichever pairing the real ingested
  dataset (704 sessions, confirmed stable across every audit this session) actually supports at
  Stage C verification time.
- Verification compares the new comparison endpoint's `a`/`b` sides **against the two existing
  single-driver `/pace-trend` endpoints' real responses for the same driver/season/session_type**
  (i.e. `GET /drivers/pace-trend/compare?driver_a=VER&season_a=2023&driver_b=PER&season_b=2023`'s
  `.a` must be byte-identical in content to `GET /drivers/VER/seasons/2023/pace-trend`'s own
  response, and `.b` identical to `GET /drivers/PER/seasons/2023/pace-trend`) — proving the
  comparison route is a genuine, faithful composition of the existing, already-verified logic, not
  a reimplementation that could silently diverge. No invented expected numbers.

## 13. Scope Discipline — Explicit Non-Goals

- Tyre-trend comparison (a real, separately-scoped, likely-next milestone — not part of M25).
- N-way (more than two drivers/seasons) comparison.
- Fitted degradation/pace curves or any predictive metric.
- Computed "who is faster" verdicts, deltas, or statistical significance of any kind — `a`/`b` are
  returned independently, exactly matching `StintComparisonResponse`'s own "disclose, don't judge"
  precedent (`docs/m21`/`m15` design reviews' shared reasoning).
- Cross-driver ranking beyond the selected pair.
- Weather/position/gap/standings data of any kind.
- A generalized bulk/multi-session query framework — this route is bounded (two drivers, two
  seasons, one shared session-type filter), not a filter/query surface, mirroring M17's own
  identical non-goal (§11 of `docs/m17-design-review.md`).
- Sidebar redesign or reordering — the one new Sidebar entry (§14, file list) follows the exact
  existing placement/gating pattern of every prior comparison feature's own addition (M13's
  "Compare Sessions," M11's "Tyre Performance"); no existing link is touched, reordered, or
  removed, and the separately-identified nav-discoverability gap for `/stints/compare` and the
  trend pages (M23/M24 audits) is **not** fixed here — unrelated to this milestone.
- Documentation-only cleanup beyond this design note itself.
- Extraction of the `getParam`/`setOrDelete` helpers into a shared module — two existing call
  sites (`ComparisonPage.tsx`, `StintComparisonPage.tsx`) plus this milestone's new page would make
  three, which is a real rule-of-three trigger, but Stage C should only extract it if actually
  implementing the third copy proves it's genuinely identical (not "close enough") — see §14.

## 14. Architecture / ADR Decision

**No ADR required.** Applying `CLAUDE.md`'s actual trigger list (new dependency, new architectural
layer, provider change, schema change, major reversal, new cross-cutting infrastructure): this
milestone introduces none of them. It is a new route (in a new file, using the existing
`APIRouter`/multi-file-per-prefix pattern already precedented five times over) and a new frontend
page (using existing `useSearchParams`/`setSearchParams` APIs M24 already established as this
project's URL-state idiom). Every prior milestone that generalized a single-entity view into a
two-sided comparison (M13, M15, M17, M21, M24) reached the identical "no ADR" conclusion for
structurally comparable work — no new evidence here changes that.

## 15. Candidate File List

**Definitely expected (Stage C will create/modify these):**

- `backend/app/api/driver_trends_compare.py` — new file, `compare_pace_trends` route.
- `backend/app/models/driver_trends.py` — add `SeasonPaceTrendComparisonResponse`.
- `backend/app/main.py` — one new `app.include_router(driver_trends_compare.router)` line.
- `backend/tests/test_pace_trend_compare_route.py` — new file (§11.1).
- `frontend/src/api/client.ts` — add `ComparePaceTrendsParams` interface,
  `SeasonPaceTrendComparisonResponse` interface, `comparePaceTrends()` function (mirroring
  `compareStints`'s exact construction pattern).
- `frontend/src/features/driver-trends/DriverPaceTrendComparisonPage.tsx` — new page.
- `frontend/src/features/driver-trends/DriverPaceTrendComparisonPage.module.css` — new.
- `frontend/src/features/driver-trends/DriverPaceTrendComparisonPage.test.tsx` — new (§11.2).
- `frontend/src/features/driver-trends/hooks/useDriverPaceTrendComparison.ts` — new hook, mirroring
  `useDriverSeasonPaceTrend.ts`'s plain `useEffect`+`useState` shape.
- `frontend/src/features/driver-trends/hooks/useDriverPaceTrendComparison.test.ts` — new.
- `frontend/src/App.tsx` — one new `<Route path="/drivers/pace-trend/compare" .../>`.
- `frontend/src/components/Sidebar.tsx` — one new conditional `NavLink` (§8, §13).

**Potentially required (Stage C confirms during implementation):**

- `frontend/src/components/Sidebar.test.tsx` — if the new link needs its own gated-visibility test
  (mirroring how "Compare Sessions"/"Tyre Performance" are already tested there, if they are).
- A shared `getParam`/`setOrDelete` module, **only if** Stage C's third copy proves genuinely
  identical to the existing two (§13's explicit rule-of-three condition) — not created by default.

**Explicitly not expected:**

- Any change to `DriverPicker.tsx`, `DriverLapPicker.tsx`, `SessionPicker.tsx` (§7 — none are
  reused, none need modification).
- Any change to `driver_trends.py`, `SeasonPaceTrendPoint`, `SeasonPaceTrendResponse`,
  `summarize_driver`, `list_sessions_for_driver_season` (all reused completely unchanged).
- Any change to `SeasonPaceTrendChart.tsx`/`seasonPaceTrendChartOptions.ts` (§8 — reused unchanged,
  twice).
- Any change to `docs/data-model.md` (no schema change) or any `pipeline/`/`data/`/`migrations/`
  file.
- `docs/backlog.md` (not touched merely because it's nearby).
- Any file related to tyre-trend comparison (§13 — separately scoped, not this milestone).

## 16. Deviations — What's Legitimate vs. What Requires Stopping

**Legitimate Stage C deviation (proceed, then disclose in the implementation report):**

- Exact wording of test names, as long as coverage matches §11's intent.
- Minor UX details not resolved here as load-bearing (§7's uppercase-on-input nicety; whether the
  season `<select>` defaults to the most recent ingested season).
- The `getParam`/`setOrDelete` sharing decision (§13/§15), resolved concretely once the third copy
  actually exists to compare against.
- Small CSS/layout adjustments within the two-column mirror already decided (§8).

**Requires stopping and returning for approval, not silent expansion:**

- Any warnings/computed-metric field added to `SeasonPaceTrendComparisonResponse` (§4 explicitly
  rejected this).
- Any N-way (more than two sides) capability, even as an "easy to add while I'm here" extension.
- Any change to `DriverPicker`/`DriverLapPicker`/`SessionPicker` internals.
- Any new backend capability for listing drivers globally or per-season (§2.1's finding that none
  exists is load-bearing to this whole design's driver-input approach — if Stage C discovers this
  finding was wrong, or that some other constraint makes the free-text approach infeasible, that
  invalidates §6/§7 and must come back for a design revision, not a silent workaround).
- Any Sidebar change beyond the one new, gated link described in §15.
- Tyre-trend comparison in any form.

## 17. Final Design Verdict

- **Exact API contract**: `GET /drivers/pace-trend/compare?driver_a=&season_a=&driver_b=&season_b=
  &session_type=` → `SeasonPaceTrendComparisonResponse{a: SeasonPaceTrendResponse, b:
  SeasonPaceTrendResponse}`. Never 404s, on either side independently. New file
  `backend/app/api/driver_trends_compare.py`, `/drivers`-prefixed router registered alongside
  `driver_trends.py`'s own.
- **Exact frontend route**: `/drivers/pace-trend/compare`, identical string to the backend path.
- **URL parameter names**: `driverA`, `seasonA`, `driverB`, `seasonB`, `sessionType`.
- **Response shape**: two complete, unmodified `SeasonPaceTrendResponse` sides, no warnings, no
  computed metrics.
- **Comparison semantics**: two fully independent computations, zero cross-side interaction, no
  invented alignment — same-season, cross-season, same-driver, and differing-attendance cases all
  fall out of the existing single-driver logic unchanged.
- **Reuse strategy**: `list_sessions_for_driver_season`, `summarize_driver`,
  `SeasonPaceTrendResponse`/`SeasonPaceTrendPoint`, `SeasonPaceTrendChart`/
  `buildSeasonPaceTrendChartOption`, and `listSeasons()` are all reused completely unchanged.
  `DriverPicker`/`DriverLapPicker`/`SessionPicker` are deliberately **not** reused — no roster
  concept applies here (§2.1, §7).
- **URL-state model**: URL is the sole source of truth for all five fields (no local-state mirror,
  unlike M24's hybrid model) — justified because none of these fields has a validation gate to
  preserve. Free-text driver inputs are local, submit-committed form state; submission writes all
  five fields atomically, `{replace: true}`.
- **Testing plan**: §11.1 (backend, new dedicated multi-driver/multi-season fixture) and §11.2
  (frontend, mirroring M24's own URL-persistence test conventions).
- **Real-data verification plan**: VER vs PER 2023 (primary) plus one cross-season pair, each side
  verified byte-identical in content to the corresponding existing single-driver endpoint's real
  response (§12).
- **Explicit non-goals**: §13, in full.
- **Risks**: low. The one genuinely new design problem (free-text input vs. URL-write timing, §6)
  is resolved with a concrete, evidence-grounded mechanism, not deferred. The one load-bearing
  factual finding this whole design depends on — that no driver catalog exists anywhere (§2.1) — is
  independently confirmed via direct source grep this session, not assumed from a prior report.

## Document History

- v1 (this document): M25 Stage B design for two-driver cross-season pace-trend comparison.

## Safety Confirmation

No repository file other than this one (`docs/m25-design-review.md`, newly created) was modified,
staged, committed, or pushed during Stage B. `docs/m9-design-review.md` remains exactly as found —
untouched, still showing only its pre-existing +1 blank-line diff. No code, test, schema, or API
change was made or is proposed. Nothing has been staged, committed, or pushed.

**STOP — awaiting explicit approval before proceeding to Stage C.**
