# PitWall — M15 Design Review: Cross-Session Stint & Tyre-Strategy Comparison

**Status:** Design only — no implementation, no schema change, no migration, no ingestion change.
**Baseline:** M14 complete (`867a299`) — synchronized telemetry cursor (V2) + M13 discoverability
links. Nothing implemented since.
**Author's framing:** senior engineering design review, matching the M12/M13/M14 precedent — every
claim below is checked directly against the current, real source, not copied from the M15 Stage A
audit's prose.

---

## 0. Problem

`GET /laps/compare` (M6, generalized cross-session in M13) lets a user compare two laps' telemetry
side by side, from independently-selected sessions/drivers. Race strategy — stints, compounds,
pit-stop timing, per-stint pace consistency — has no equivalent. `GET /sessions/{id}/tyre-performance`
and `GET /sessions/{id}/drivers/{id}/stint-pace` (M10/M11) are both **single-session-scoped**; there
is no way today to put driver A's session-X strategy next to driver B's session-Y strategy.

M13's own design review named this gap and predicted its shape exactly: *"Cross-session stint/tyre
comparison — would follow the identical pattern (§5's boundary): extend
`app/services/tyre_performance/` similarly session-agnostically, add its own new route calling
`RaceContextRepository` twice. Nothing in this milestone's response model, route, or service needs
to change to make room for it."* (`docs/m13-design-review.md` §14). This design follows that
prediction and verifies it against the code that actually exists today, rather than assuming it
still holds.

## 1. Motivation

Per the M15 Stage A audit: this is the one candidate where architecture, data, and a twice-deferred
open technical question (M12 §18 Q1) all point the same direction — reusing two already-mature
subsystems (M13's session-pair pattern, M10/M11's race-context/tyre-performance data) rather than
building a new capability from scratch.

## 2. Current architecture (verified against code)

### 2.1 M10/M11 API contracts (`backend/app/api/race_context.py`, `tyre_performance.py`)

Four existing routes, all session-scoped, all GET, all following the same "delegate session-existence
to `TelemetryRepository`, 200+empty rather than 404 for absent-but-valid data" convention:

| Route | Response | Scope |
|---|---|---|
| `GET /sessions/{id}/drivers/{id}/stints` | `list[Stint]` | one driver |
| `GET /sessions/{id}/pit-stops?driver_id=` | `list[PitStop]` | one session, optional driver filter |
| `GET /sessions/{id}/drivers/{id}/stint-pace` | `DriverStintPaceResponse` | one driver |
| `GET /sessions/{id}/tyre-performance` | `TyrePerformanceResponse` | one session, all drivers |

`DriverStintPaceResponse` (`app/models/tyre_performance.py:73-79`) is the closest existing shape to
"one side of a comparison": `{session_id, driver_id, laps: StintPaceLap[], stints: StintPace[]}`.

### 2.2 `RaceContextRepository` access pattern (`backend/app/repositories/race_context.py`,
`postgres_race_context_repository.py`)

```python
list_stints(session_id: str, driver_id: str | None = None) -> list[Stint]
list_pit_stops(session_id: str, driver_id: str | None = None) -> list[PitStop]
```

Both are direct, single-table SQL reads (`postgres_race_context_repository.py:21-35`) keyed on
`WHERE session_id = %(session_id)s AND (driver_id filter)`. The Postgres schema
(`pipeline/pitwall_pipeline/migrations/0001_create_stints.sql`, `0002_create_pit_stops.sql`) gives
`stints`/`pit_stops` a **composite primary key `(session_id, driver_id, stint_number|stop_number)`**
— `session_id` is the PK's leading column, so this filter is a PK-prefix lookup, not a scan. No join
between the two tables, no join back to Parquet, no season/event_name column exists on either table
today.

### 2.3 Reusable aggregation functions (`backend/app/services/tyre_performance/`)

Two pure functions are exactly the per-side building blocks this design needs, **reusable unchanged**:

- **`build_driver_stint_pace(laps, stints, pit_stops) -> DriverStintPace`**
  (`orchestration.py:80-104`) — takes one driver's already-scoped laps/stints/pit-stops, returns
  `{annotated_laps, consistency_by_stint}`. This is the literal function `get_driver_stint_pace`'s
  route already calls once per request (`tyre_performance.py:195`); this design calls it twice.
- **`driver_strategy_summary(driver_id, stints) -> DriverStrategySummary`**
  (`strategy_summary.py:38-47`) — `{driver_id, stint_count, compound_sequence, stint_lengths}`,
  already the exact "strategy shape" fact set item 5 below asks for.

Both are pure, side-agnostic, precondition only "already scoped to one driver" — identical
precondition shape to `app.services.lap_comparison`'s functions, which M13 already proved compose
cleanly into a two-sided comparison without modification.

### 2.4 What genuinely new logic is required

Not much. Per driver-session side: three repository calls already made today by
`get_driver_stint_pace` (`telemetry_repository.list_laps`, `race_context_repository.list_stints`,
`.list_pit_stops`) plus the two pure functions above — **zero new repository methods, zero new
service-layer functions**. The only new code is:

1. A thin route (mirrors `laps_compare.py`'s own thinness) that runs that exact sequence twice and
   assembles a paired response — the "genuinely new comparison/assembly logic," and it is glue, not
   analysis.
2. Two new warning checks (circuit mismatch, empty-stint-data-per-side) at the route layer, mirroring
   `laps_compare.py:76-92`'s `_circuit_mismatch_warning` — same pattern, necessarily re-implemented
   rather than imported, for the same reason M13 kept that check at the route layer: circuit identity
   is a session-level concept neither `app.services.lap_comparison` nor
   `app.services.tyre_performance` should have to know about (`docs/m13-design-review.md` §5/§9).
3. New Pydantic wrapper models (§4) — no new *fact* fields, only a new *pairing* shape around
   `StintPace`/`DriverStrategySummary`/`PitStop`, all three reused directly, unmodified.

## 3. Proposed architecture

**Backend:** one new route file `backend/app/api/stints_compare.py` (mirrors `laps_compare.py`
exactly in shape/naming), one new model file `backend/app/models/stint_comparison.py`. No new
service module — the route calls `app.services.tyre_performance.orchestration.build_driver_stint_pace`
and `.strategy_summary.driver_strategy_summary` directly, exactly as thin as `race_context.py`'s
existing routes.

**Frontend:** one new feature folder `frontend/src/features/stint-comparison/`, mirroring
`lap-comparison/`'s own top-level placement (not nested under `track-map/` or `tyre-performance/`,
since it spans both). Reuses `SessionPicker`, `StintTimeline`, `StintConsistencyTable`, `PitStopList`
**unchanged** (§6). One new small component (`DriverPicker`) and one new hook/API-client function
pair, mirroring `DriverLapPicker`/`useLapComparison`/`compareLaps`'s existing shapes.

## 4. Proposed API contract

```
GET /stints/compare
  ?session_id_a=<str>&driver_a=<str>
  &session_id_b=<str>&driver_b=<str>
```

Top-level, not nested under `/sessions/{id}` — mirrors `/laps/compare`'s M13 rationale exactly:
neither side is privileged, both are independently resolved. No `resolution`/lap-number parameters
exist here — there is no distance grid or per-lap alignment problem in this design (§8).

```python
# app/models/stint_comparison.py — new file, imports existing models, adds no new fact fields
from app.models.race_context import PitStop
from app.models.tyre_performance import DriverStrategySummary, StintPace

class StintComparisonWarningCode(str, Enum):
    DIFFERENT_CIRCUIT = "different_circuit"
    NO_STINT_DATA_A = "no_stint_data_a"
    NO_STINT_DATA_B = "no_stint_data_b"

class StintComparisonWarning(ApiModel):
    code: StintComparisonWarningCode
    detail: str | None = None

class DriverStintComparisonSide(ApiModel):
    session_id: str
    driver_id: str
    strategy: DriverStrategySummary   # stint_count, compound_sequence, stint_lengths
    stints: list[StintPace]           # per-stint compound/laps/tyre_life/consistency_ms/cv
    pit_stops: list[PitStop]          # driver_id, stop_number, lap_number, pit_lane_time_seconds

class StintComparisonResponse(ApiModel):
    a: DriverStintComparisonSide
    b: DriverStintComparisonSide
    warnings: list[StintComparisonWarning]
```

`404` if either session doesn't exist (`telemetry_repository.get_session`, same as every other
route). No 404 for an unknown/typo'd `driver_id` or a driver with zero stints — see §9/§10; both
surface as `NO_STINT_DATA_{A,B}`, not an error, matching this exact area's existing precedent
(`get_driver_stint_pace` never validates driver existence either — `tyre_performance.py:182-197`).

**Deliberately excluded from the response, by design (§5, open decision A):** per-lap
`StintPaceLap[]` detail. Only `StintPace` (per-stint summary) is included.

## 5. Service-layer design / what's exposed

Item 5's five candidate facts, checked against what's actually available and meaningful:

| Fact | Include? | Source |
|---|---|---|
| Stint sequence/compound | **Yes** | `DriverStrategySummary.compound_sequence` — reused unchanged |
| Stint duration/lap counts | **Yes** | `DriverStrategySummary.stint_lengths` + `StintPace.start_lap/end_lap` |
| Stint pace metrics | **Yes, summary-level** | `StintPace.consistency_ms/consistency_cv/eligible_lap_count` — reused unchanged |
| Pit-stop count/timing | **Yes** | `PitStop[]` per side, reused unchanged; count = `len(pit_stops)`, computed by the frontend, not the API (matches `TyrePerformanceResponse` never precomputing a count the client can trivially derive) |
| Tyre-strategy "differences" | **Yes, as juxtaposition — not as a computed delta** (open decision B) | Both sides' data returned independently; no `stint_count_delta`/`pit_time_delta`-style field |

**Decision B, stated plainly:** this design does **not** compute any numeric strategy delta (e.g.
"A stopped 1 fewer time than B", "A's total pit-lane time was 4.2s less"). `app/models/tyre_performance.py`'s
own docstring (`tyre_performance.py:10-15`) draws a hard line against anything shaped like a
comparative verdict — `RawLapTimeByCompound`'s docstring is explicit that raw lap-time differences
between drivers are confounded by fuel load, track position/traffic, and session conditions this
data model doesn't control for (`tyre_performance.py:136-145`). The same confound applies to a
stop-count or pit-time delta: a driver who pitted once fewer may have run an undercut, a safety-car
opportunist strategy, or simply had a problem-free stint — the raw fact alone doesn't say which, and
computing a bare numeric delta without that context risks implying a verdict this codebase has
consistently refused to make anywhere else. Juxtaposition (rendering both sides side by side) lets a
human reader draw that conclusion themselves, with context the API cannot see. This is a genuine
design decision, not an oversight — flagged for approval in the summary below.

## 6. Frontend reuse audit

| Component | Reusable unchanged? | Why |
|---|---|---|
| `SessionPicker` (`lap-comparison/components/SessionPicker.tsx`) | **Yes, zero changes** | Fully generic — takes only `label`/`onSelect`/`onClose`, calls `listSeasons`/`listEventsForSeason`/`listSessionsForEvent` directly, has no coupling to lap-comparison concepts (verified: no import of `comparisonStore` or any lap-specific type) |
| `StintTimeline` (`race-context/components/StintTimeline.tsx`) | **Yes, zero changes** | Takes `stints: Stint[]`; `StintPace` is a structural superset (`start_lap`/`end_lap`/`compound`/`stint_number` all present) — this exact reuse is already proven, `StintPacePage.tsx:19-21`'s own docstring states it verbatim for the identical reason |
| `StintConsistencyTable` (`tyre-performance/components/StintConsistencyTable.tsx`) | **Yes, zero changes** | Already takes `stints: StintPace[]` directly — the response's native shape |
| `PitStopList` (`race-context/components/PitStopList.tsx`) | **Yes, zero changes** | Takes `pitStops: PitStop[]`, no page coupling |
| `DriverLapPicker` | **No — needs a new sibling** | Couples driver selection to lap selection (`listLaps` call, lap `<select>`); this design has no lap dimension |

**New, small:** `DriverPicker.tsx` — `{sessionId, label, onSelect, onClose?}`, driver-only `<select>`
via `listDrivers`, dropping `DriverLapPicker`'s entire lap half. This is the one genuinely new UI
component this design requires.

**Compound-naming/incomplete-data handling (item 9):** already solved, unchanged, verified —
`compoundColor.ts:23-26` falls back to a neutral status color for any compound string outside its
five-entry table rather than throwing; `compoundOrder.ts` appends unrecognized compounds
alphabetically rather than dropping them. Both `StintTimeline` and `StintConsistencyTable` already
route every compound through these. **No new normalization work is needed** — this was verified
against the actual fallback code, not assumed.

## 7. Frontend state/UI architecture

`StintComparisonPage.tsx`, route `/stints/compare` (top-level, mirrors `/laps/compare`). Local
`useState`, mirroring `ComparisonPage.tsx:38-42` exactly, minus the lap dimension:

```ts
const [sessionIdA, setSessionIdA] = useState<string | null>(searchParams.get("sessionA"));
const [sessionIdB, setSessionIdB] = useState<string | null>(searchParams.get("sessionB"));
const [driverIdA, setDriverIdA] = useState<string | null>(searchParams.get("driverA"));
const [driverIdB, setDriverIdB] = useState<string | null>(searchParams.get("driverB"));
const [pickingSession, setPickingSession] = useState<"a" | "b" | null>(null);
```

No new Zustand store — nothing here is cursor/hover state (§14), and this state is exactly as local
and page-scoped as `ComparisonPage`'s own A/B state already is.

`useStintComparison(sessionIdA, driverIdA, sessionIdB, driverIdB)` — mirrors `useLapComparison.ts`'s
plain `useEffect`+`useState` shape exactly (`hooks/useLapComparison.ts:30-61`); fetches once all four
values are present, clears before each new fetch.

Layout: two-column A/B, each column reusing the exact card sequence `StintPacePage.tsx` already
established (Strategy → Stint Detail → Pit stops), just duplicated into two side-by-side columns
instead of one. No new chart, no new visualization type — pure reuse of already-built,
already-tested display components.

**Discoverability (minimal, single entry point — flagged for confirmation, not a hard requirement):**
one cross-link added to `StrategyPage.tsx`'s existing `headerRow` (alongside its current "View Stint
Pace" link, `StrategyPage.tsx:41-46`), reading "Compare Strategy", to
`/stints/compare?sessionA=<id>&driverA=<id>`. Without at least one entry point the route is only
reachable by typing the URL by hand — this is the smallest possible fix for that, one link in one
already-existing cross-link row, not a Sidebar/SessionListForEventPage change (that surface is M14's
already-shipped territory, not reopened here).

## 8. Why there is no alignment problem (unlike M6/M13)

M6/M13's hard problem was distance-aligning two laps with different sample counts/max-distance onto
one shared grid (`build_distance_grid`, `align_lap`). **Nothing here needs that.** Stints/pit-stops
are discrete, ordered lists, not continuous samples — side A's and side B's `stints: StintPace[]`
are independent lists of possibly different lengths, rendered independently (two proportional bars of
possibly different total width via `StintTimeline`, two independently-sized tables via
`StintConsistencyTable`). "Sessions have different numbers of stints" (item 9) requires **no special
handling** — it's just two lists of different `len()`, which every reused component already renders
correctly today (verified: `StintTimeline`/`StintConsistencyTable` have no length-parity assumption
anywhere in their code).

## 9. Error/edge-case behavior (full table)

| Case | Behavior |
|---|---|
| Drivers are different (the normal case) | No special handling — `driver_a != driver_b` is the expected input, same as M13's `driver_a != driver_b` |
| Sessions are different circuits | `StintComparisonWarning(code=DIFFERENT_CIRCUIT)`, comparison still computed and returned in full (disclose, don't block — §10) |
| A driver has missing/empty stint data | `StintComparisonWarning(code=NO_STINT_DATA_A` or `_B)`; that side's `stints`/`strategy.stint_count` reflect the empty list (`stint_count=0`, matching `build_session_tyre_performance`'s existing "list every driver, regardless of data" convention, `orchestration.py:125-131`); **not** a 404 — an unknown/typo'd `driver_id` is indistinguishable from a valid driver with zero stints under the current repository contract (§4), and no existing route in this area validates driver existence either |
| Sessions have different numbers of stints | No special handling needed — not an alignment problem (§8) |
| A session has no pit stops | Normal, not a warning — `pit_stops: []`, `PitStopList` already renders its existing "No pit stops recorded" empty state unchanged; matches ADR-0011's "absence is data, not failure" |
| Compound naming differs / is incomplete | No new handling needed — already solved by `compoundColor`/`compoundOrder`'s existing fallback behavior (§6), verified against their real code |
| Same session, same driver on both sides (`session_id_a == session_id_b, driver_a == driver_b`) | Degenerate but not rejected — returns two identical sides, no warning; matches M13's own precedent of not special-casing the fully-identical case for lap comparison |

## 10. Error/warning policy

Follows the project's established disclose-don't-block convention exactly (M13 §9,
`docs/m13-design-review.md`; ADR-0011's "absence is data, not failure"): every case in §9 that isn't
a genuine 404 (session not found) returns `200` with the comparison fully computed, plus warnings
where the comparison might be misleading. No new error-envelope shape — `StintComparisonWarning`
mirrors `ComparisonWarning`'s exact `{code, detail}` shape (`lap_comparison.py:77-81`), a new enum
rather than extending `WarningCode`, since (per §2.4) circuit-mismatch logic is deliberately
re-implemented per feature at the route layer, not shared.

## 11. Performance implications of querying two sessions

No new repository methods, no join, no aggregate query. Per side: 3 repository calls
(`list_laps` — Parquet, `list_stints`/`list_pit_stops` — Postgres), identical to what
`get_driver_stint_pace`'s existing route already does once per request. A comparison is exactly that
sequence run twice, in-process, sequentially — the same shape M13's `compare_laps` already
established for telemetry (`laps_compare.py:115-132`, two independent `get_session`/`list_laps`/
`get_telemetry` calls) and has been running in production since M13 shipped with no reported issue.
This is a structural-parity argument, not a fresh benchmark — no profiling was run as part of this
design (correctly: Stage B is design, not implementation).

## 12. `ParquetRepository`/`RaceContextRepository` cost at 704 sessions

**Parquet side:** `ParquetRepository._find_session` re-globs/re-reads every session's
`session.parquet` on every call (`docs/backlog.md`, "Backend / performance"), and `list_laps` calls
it. A comparison's two `list_laps` calls pay this cost twice — proportionally identical to what
`compare_laps` already pays today (also two `list_laps` calls). This design adds no new instance of
the risk, it just exercises the same already-accepted one one more time. The backlog entry's own
stated trigger ("if/when the ingested session count grows enough for this to matter") is closer than
when it was written — 704 sessions ingested (2020–2026 backfill, `docs/architecture.md` §1) — but
this is a pre-existing, already-tracked item, not something this milestone's design needs to fix as a
prerequisite; it would resurface identically whether or not M15 ships.

**Postgres side:** `list_stints`/`list_pit_stops` are `WHERE session_id = ...` reads against a table
whose primary key's leading column is `session_id` (§2.2) — a PK-prefix index lookup, cheap
regardless of total row count, and unaffected by whether 704 or 7000 sessions exist. Four such
queries per comparison (stints × 2 sides, pit_stops × 2 sides) is not a meaningful cost at any
foreseeable PitWall scale.

## 13. M12 §18 Q1 — Postgres `season`/`event_name` denormalization

**Original question** (`docs/m12-design-review.md` §18 Q1, verbatim): *"add denormalized
`season`/`event_name` columns to `stints`/`pit_stops` now (cheap, unused) or defer until a real
cross-session query exists? Not decided — no current read pattern needs it."* M13's own design
review revisited and deferred it again, predicting *"a future stint/tyre cross-session milestone is
what would finally answer it"* (`docs/m13-design-review.md` §14) — this is that milestone.

**The actual query pattern this design needs, defined concretely (§4, §11):**

```sql
SELECT ... FROM stints    WHERE session_id = %(session_id_a)s AND driver_id = %(driver_a)s
SELECT ... FROM stints    WHERE session_id = %(session_id_b)s AND driver_id = %(driver_b)s
SELECT ... FROM pit_stops WHERE session_id = %(session_id_a)s AND driver_id = %(driver_a)s
SELECT ... FROM pit_stops WHERE session_id = %(session_id_b)s AND driver_id = %(driver_b)s
```

Every query is resolved by an already-known `session_id` (the frontend already has it — it came from
`SessionPicker`, itself backed by the Parquet-side `listSeasons`/`listEventsForSeason`/
`listSessionsForEvent` discovery endpoints, §6). **Nothing in this design ever needs to filter or
join `stints`/`pit_stops` by `season` or `event_name` at the Postgres layer** — season/event identity
is resolved entirely on the Parquet/discovery side, before a `session_id` ever reaches
`RaceContextRepository`. This is the same reason M13's own read pattern generated no new evidence for
Q1 (`docs/m13-design-review.md` §14): a *pairwise, session-scoped* comparison is structurally
incapable of needing a season/event column, because it never has an "all sessions in season X" query
to satisfy. Only the query-engine-shaped feature M13 explicitly separated out ("every lap under 1:30
across all seasons") would ever need one.

**Conclusion, with evidence, per the instruction not to force this decision: M12 §18 Q1 remains
correctly open.** This design generates no new evidence that the columns are needed, and adding them
speculatively would violate this project's own stated principle for that table
(`docs/adr/0011-hybrid-storage-architecture.md`'s "Implementation Constraints": natural composite
keys, no unused columns). **If a future milestone's query pattern ever does need "all of driver X's
stints across a season" or similar, that is the concrete trigger this document identifies for
revisiting Q1** — and at that point it would be a schema migration (new columns + backfill via
re-ingestion, since `pipeline/pitwall_pipeline/postgres_writer.py` would need to start writing them),
which this design explicitly does not propose or begin.

## 14. M13 compatibility

- `/laps/compare` — not touched. `app/api/laps_compare.py` has zero diff in this design.
- `LapComparisonResponse` — not touched. `app/models/lap_comparison.py` has zero diff.
- `SessionPicker` — reused, not reworked (§6) — zero diff to
  `frontend/src/features/lap-comparison/components/SessionPicker.tsx`. It is imported by the new
  `stint-comparison/` feature folder, the same cross-feature-folder import
  `TrackMapDelta.tsx` already does for `TrackMap` (`lap-comparison/components/TrackMapDelta.tsx:6`) —
  established precedent for reusing a component across feature-folder boundaries without moving it.

## 15. M14 compatibility

No cursor architecture change. This design was checked against `useCursorSync`/`CursorSlice`
(`components/useCursorSync.ts`) and found no demonstrated need: there is no distance-aligned,
continuously-hoverable chart anywhere in this design (§8) — `StintTimeline` is a discrete proportional
bar, `StintConsistencyTable`/`PitStopList` are plain tables, none of which M14's cursor mechanism was
built to synchronize (M14 itself only wired `TelemetryCharts`/`DeltaChart`/`TrackMap`/`TrackMapDelta`,
`docs/m14-design-review.md` §4). No third `CursorSlice` store is added. Corner highlighting is not
bundled (explicit non-goal, §16).

## 16. Explicit non-goals

- **N-way (>2) comparison** — stays pairwise, matching `/laps/compare`'s existing UI pattern.
- **Weather, position/gap history, live timing, standings** — different data sources entirely, not
  present in the FastF1 provider (Stage A audit finding); unrelated cost profile.
- **Corner highlighting** — separate, already-scoped-out (M14 §3) polish item.
- **An aggregate query engine** ("every driver's average stop time across all 2024 races") —
  explicitly the different-shaped problem M13 §14 already separated out; this design's pairwise,
  session-scoped pattern doesn't block or presuppose an answer to it.
- **Driver career/trend analytics** — out of scope; this stays single-comparison-scoped like
  `/laps/compare`.
- **Any Postgres schema change** — see §13; none proposed.
- **Any change to `/laps/compare`, `LapComparisonResponse`, `SessionPicker`, or M14's cursor stores**
  — see §14/§15.
- **Fixing `ComparisonPage`'s existing stale-URL behavior** (Stage A audit finding: it never calls
  `setSearchParams`) — this design's own new page matches that same read-once-on-mount behavior for
  consistency (§7), and does not attempt to fix the pre-existing gap in a page this design doesn't
  otherwise touch. Flagged as a separate, already-identified follow-up, not bundled in here.
- **Computed strategy-delta numbers** (stop-count difference, pit-time-saved, etc.) — see §5 decision
  B.
- **Full per-lap `StintPaceLap[]` data in the comparison response** — see §4/§5 decision A.

## 17. URL/deep-linking

Matches M13's existing convention exactly (`ComparisonPage.tsx:38-39`,
`docs/m13-design-review.md` §7): `sessionA`/`driverA`/`sessionB`/`driverB` query params read once on
mount as an optional deep-link (populated by the new `StrategyPage` cross-link, §7), not written back
as the user changes selections. This intentionally does not expand scope to fix the live-URL-sync gap
Stage A flagged in `ComparisonPage` (§16) — the same limitation is accepted here for consistency with
the pattern being mirrored, not silently improved upon.

## 18. Testing strategy

- **Backend, fixture-based, two independent sessions** (mirrors
  `backend/tests/`'s existing `laps_compare` test shape): a same-session-same-driver case, a
  same-session-different-driver case, a genuinely different-session-and-circuit case (asserting
  `DIFFERENT_CIRCUIT` appears), an empty-stints-for-one-side case (asserting `NO_STINT_DATA_A`/`_B`
  and `stint_count=0`, not a 404), a no-pit-stops-for-one-side case (asserting empty list, no
  warning), a different-stint-count-both-sides case (asserting both full lists returned, no error), a
  session-not-found case (404), an unknown-driver-id case (asserting it behaves identically to
  empty-stints, per §9's stated non-check).
- **Frontend Vitest/RTL**: `useStintComparison` hook tests (mirrors `useLapComparison.test.ts`
  shape); `StintComparisonPage` tests reusing the mocking pattern `ComparisonPage.test.tsx` already
  established for `SessionPicker`/child components; `DriverPicker` unit tests (mirrors
  `DriverLapPicker`'s own, minus the lap half); confirm `StintTimeline`/`StintConsistencyTable`/
  `PitStopList` are passed the correct per-side data unchanged (no new tests needed for those
  components themselves — reused unmodified, already covered by their own existing suites).
- **Edge cases from §9** — each gets an explicit test, both backend and (where user-visible) frontend.
- **Real-data verification**: using genuinely ingested sessions (the same 2023 Monza/2023 Italian GP
  fixtures already used for manual verification in M13/M14's own implementation reports) — verify a
  real two-stop vs. three-stop strategy comparison renders correctly, and verify a real
  different-circuit pair (e.g. two different 2023 events) surfaces `DIFFERENT_CIRCUIT` correctly
  against real `Session.location` values.

## 19. Acceptance criteria (for eventual implementation)

- `GET /stints/compare?session_id_a=&driver_a=&session_id_b=&driver_b=` returns a `200`
  `StintComparisonResponse` for two valid sessions/drivers, reusing `build_driver_stint_pace`/
  `driver_strategy_summary` unchanged.
- Either session not found → `404`, matching every other route's existing convention.
- Different-circuit sessions → `DIFFERENT_CIRCUIT` warning, comparison still fully computed.
- A side with zero stints → `NO_STINT_DATA_{A,B}` warning, `stint_count=0`, not a 404.
- Different stint counts between sides → both full lists returned, no error, no alignment logic
  invoked.
- `app/services/lap_comparison/`, `app/models/lap_comparison.py`, `app/api/laps_compare.py` have zero
  diff (verified by inspection, as in M13/M14).
- `frontend/src/features/lap-comparison/components/SessionPicker.tsx` has zero diff.
- `components/useCursorSync.ts`, both `CursorSlice` stores have zero diff.
- No Postgres migration, no `pipeline/` diff.
- `StintComparisonPage` renders both sides' strategy/stint-detail/pit-stops via the reused,
  unmodified `StintTimeline`/`StintConsistencyTable`/`PitStopList` components.
- One working entry point (`StrategyPage`'s new "Compare Strategy" link) reaches the new page with a
  correctly pre-filled `sessionA`/`driverA` deep link.

## 20. Documentation impact (after implementation — not now)

Learning from M14's own deferred-docs precedent (`docs/m14-design-review.md` §16, never actioned —
Stage A audit finding): this section names what will go stale, without performing the pass now.

- `docs/success-metrics.md` — V3's stint/tyre criteria may need a "cross-session" addendum; V3's own
  text currently only describes single-session stint/pit-stop data.
- `README.md` — milestone table gains M15; stale "Current milestone: M12" line (already stale before
  this milestone, per Stage A) needs correcting regardless.
- `CHANGELOG.md` — new entry; **M13 and M14 both still have no entry at all** (Stage A finding) —
  this document takes no position on whether M15's implementation should also backfill those two, but
  flags that the gap will be three milestones deep by the time M15 ships if it isn't addressed then.
- `docs/architecture.md` — no data-flow diagram change (still Parquet+Postgres, no new engine), but
  its repo-structure notes listing existing feature folders would gain `stint-comparison/`.
- No ADR is triggered — no new dependency, no new layer, no reversal of a prior decision (§13 leaves
  the one schema-adjacent question open rather than resolving it).

---

## Document history

- v1 (this document): initial design, produced against M14's real, shipped state (`867a299`), with
  every architectural claim checked directly against current source per the M15 Stage A audit's own
  standard, rather than assumed from that audit's prose.
