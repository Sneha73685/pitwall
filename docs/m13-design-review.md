# PitWall — M13 Design Review: Cross-Session Lap & Telemetry Comparison

**Status:** Design only — no implementation, no schema change, no migration, no ingestion change.
This document is the complete Stage A/B deliverable for the design phase; nothing past this begins
until it is reviewed.
**Baseline:** M12 complete (`e9846a2`) — 704 real sessions ingested across 2020–2026 (through round
11 of 2026), `Season → Event → Session` discovery/navigation shipped, no application code changed
since.
**Author's framing:** senior engineering design review, matching the M6/M8/M10/M11/M12 precedent —
every claim below is checked directly against the current, real source, not assumed from an earlier
milestone's own design note.

---

## 0. Problem

M6 shipped a two-lap, distance-aligned comparison (`GET /sessions/{session_id}/laps/compare`) that
is hard-scoped to **one** `session_id` — both compared laps must come from the session named in the
URL. M12's historical backfill makes that scoping the binding constraint: PitWall now holds 704
real sessions spanning 7 seasons, but there is no way to ask "how does this driver's lap here
compare to their lap at the same circuit last year" — the single most direct use of the archive M12
exists to provide. This document designs the smallest change that removes that constraint without
rebuilding the comparison engine.

---

## 1. Motivation

Verified directly (`grep` across `backend/app/api/*.py`): **every** analytics/comparison route in
this API — `laps/compare` (M6), `session_analytics` (M8), `tyre-performance`/`stint-pace` (M11),
`stints`/`pit-stops` (M10) — is prefixed `/sessions/{session_id}/...`. None accepts two independent
session identities. `docs/m12-design-review.md` §8 named this precisely while explicitly declining
to build it: *"cross-session aggregate analytics... is a hypothetical future milestone, not this
one,"* tying it to open question §18 Q1 (denormalized `season`/`event_name` Postgres columns) and
recommending that question stay open *until a concrete cross-session read pattern exists*. This
milestone is that pattern — for laps/telemetry specifically, which is Parquet-only, so §18 Q1
(a Postgres question) is unaffected and correctly stays open (§16).

---

## 2. Current architecture (verified against code)

- **Route** (`backend/app/api/laps_compare.py`): `GET /sessions/{session_id}/laps/compare?driver_a=&lap_a=&driver_b=&lap_b=&resolution=`.
  The single `session_id` path param is used for **both** sides: `repository.list_laps(session_id, driver_id=driver_a)` and the identical call with `driver_b`; same for `repository.get_telemetry(session_id, ...)`.
- **Response model** (`backend/app/models/lap_comparison.py`): `LapComparisonResponse.session_id: str` — one field, because today there is structurally only one session.
- **Service layer** (`backend/app/services/lap_comparison/`) — confirmed **already session-agnostic**: `alignment.py`'s `align_lap()`/`build_distance_grid()`, `delta.py`'s `compute_delta_ms()`, and `sectors.py`'s `compute_sector_deltas()` all take plain `list[TelemetrySample]`/`Lap` values. None imports `Session`, reads a `session_id`, or calls a repository. This module needs **zero changes**.
- **`validation.py` contains a direct, load-bearing precedent for this exact question.** Its own docstring: *"Deliberately does not check for a 'mismatched circuit'/session mismatch (docs/m6-design-review.md §10): the API is scoped to a single session_id path parameter... so there is nothing for this endpoint to violate, structurally."* And `docs/m6-design-review.md` §10's edge-case table originally specified: *"Laps of different track configurations (e.g., different session, different circuit) → Reject at the API layer with a clear 400."* That check was never built — not because the idea was abandoned, but because the single-`session_id` route made it structurally impossible to trigger. **Generalizing the route removes that structural guarantee and reopens exactly the question M6 deferred.** §9 below resolves it.
- **Frontend** (`ComparisonPage.tsx`): already holds `selectionA`/`selectionB` as **local component `useState`**, explicitly *not* in the global `selectionStore` — its own comment: *"Owns lap-selection state (selectionA/selectionB) directly -- not in comparisonStore."* `LapPairSelector` takes **one** `sessionId` prop and passes it to both `DriverLapPicker` instances — but `DriverLapPicker` itself already takes its own independent `sessionId` prop per instance. The only place hard-coding "same session for both" is `LapPairSelector` and `ComparisonPage`'s single `useParams<{ sessionId }>()`. `TrackMapDelta` fetches track geometry (`getTrackPoints`) from **one** `sessionId` and colors that track's outline by the delta — this is the one component with a real, undocumented same-circuit assumption (§9).

---

## 3. Proposed architecture

No new analytics engine, no new store, no schema. Three surgical changes:

1. **API**: `GET /sessions/{session_id}/laps/compare` → a new top-level `GET /laps/compare` accepting `session_id_a`/`session_id_b` independently (§4). Each side becomes two independent repository lookups instead of one shared one — the exact same repository calls, just addressed at two directories instead of one.
2. **Response**: `LapComparisonResponse.session_id: str` → `session_id_a: str`, `session_id_b: str` — the response now has to say which session each side came from, since the URL no longer implies one shared answer (§4).
3. **Frontend**: `ComparisonPage` widens its local `selectionA`/`selectionB` state to each carry their own `sessionId`, and gains a session-B picker built from the *existing* M12 discovery components, not a new nav system (§7, §8).

---

## 4. API contract

**Path:** `GET /laps/compare` — a new top-level route, not nested under `/sessions/{session_id}`.
Reasoning: nesting under one session's path no longer makes sense once neither side is privileged;
this mirrors the precedent M12 already set when `/seasons` was introduced as its own top-level
prefix rather than being force-fit under `/sessions` (`docs/m12-design-review.md` §7). Router stays
in `backend/app/api/laps_compare.py` (no reason to rename the file), `prefix=""`, tag unchanged
(`tags=["laps"]`).

**Query parameters:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `session_id_a` | `str` | yes | |
| `driver_a` | `str` | yes | unchanged from today |
| `lap_a` | `int` | yes | unchanged from today |
| `session_id_b` | `str` | yes | |
| `driver_b` | `str` | yes | unchanged from today |
| `lap_b` | `int` | yes | unchanged from today |
| `resolution` | `int` | no | unchanged (`DEFAULT_COMPARE_RESOLUTION`/`MAX_COMPARE_RESOLUTION`, untouched) |

**Validation/error behavior** (each check now runs independently per side, doubling the *number* of
checks, not introducing a new *kind* of check):

- `session_id_a`/`session_id_b` each independently checked via `repository.get_session(...)` → `404` naming which side ("Session A '...' not found" / "Session B '...' not found"), same shape as today's single check, just run twice.
- `driver_a`/`lap_a` and `driver_b`/`lap_b` resolved independently via `repository.list_laps(session_id_X, driver_id=...)` + the existing `_find_lap()` helper (unchanged) → `404` if the driver has no such lap **in that session**. This already correctly covers "driver doesn't exist in session B" — `list_laps` simply returns `[]` for an unknown driver, and `_find_lap` raises the same 404 it always has. No new code path needed (§6).
- Telemetry-empty check (`404`) and `validate_monotonic` (`422`) — unchanged, run per side against whichever session that side belongs to.
- **New**: a circuit-mismatch check, added at the route layer only (§9) — not a hard rejection (§9 explains why), a `ComparisonWarning`.

**Response model** (`LapComparisonResponse`): `session_id_a: str`, `session_id_b: str` replace
`session_id: str`. Both are required in the response — before, the frontend already knew the one
shared `session_id` from the URL it called; now there are two independent sessions and no shared
URL to infer them from, so the response has to say so explicitly (also needed by the frontend's
`TrackMapDelta`, §9, to know which session's geometry it's showing).

**Should the old `GET /sessions/{session_id}/laps/compare` remain, as a wrapper or deprecated
path?** No — **replaced outright, not wrappered.** Reasoning, considered explicitly rather than for
convenience:

- PitWall has exactly one consumer of this API (its own frontend); there is no published API
  version, no external integrator, no `docs/api-model.md` promise of route stability beyond "this
  is what's currently shipped." Keeping a second, near-duplicate route indefinitely is pure
  maintenance burden with no real second consumer to justify it.
- The same-session case is not a distinct feature needing its own code path — it is exactly the
  degenerate case `session_id_a == session_id_b`. Two independent repository calls against the same
  directory is correct and, per §8, not a measurable regression.
- Direct project precedent: M12 Phase 5 did not keep the old flat `SessionListPage` as a
  compatibility route once `Season → Event → Session` superseded it — it deleted it outright
  (`docs/m12-implementation-plan.md`, Phase 5). CLAUDE.md is explicit on this posture: *"Avoid
  backwards-compatibility hacks... If you are certain that something is unused, you can delete it
  completely"* and *"don't use feature flags or backwards-compatibility shims when you can just
  change the code."*
- The alternative (keep both routes, deprecate the old one later) was considered and rejected: it
  would require maintaining two response models and two sets of tests for a route that becomes
  redundant the moment the new one ships, for zero real migration-safety benefit given there is no
  external consumer to protect.

This **is** a breaking change to the one real consumer (the frontend) — acknowledged explicitly,
not hidden behind "additive." §11 covers the full migration.

---

## 5. Service-layer design

**No change to `app/services/lap_comparison/`.** Restated as an explicit boundary, since this is the
part of the design most at risk of accidental scope leakage:

**API layer's responsibility** (`backend/app/api/laps_compare.py`, widened):
- Resolve `session_id_a`/`session_id_b` independently via `TelemetryRepository.get_session()`.
- Resolve `driver_a`/`lap_a` against session A, `driver_b`/`lap_b` against session B, independently.
- Fetch each side's telemetry from its own session.
- Run the circuit-mismatch check (§9) — this is a **session**-level concept and must not enter the
  comparison service.
- Assemble `LapComparisonResponse`, now carrying `session_id_a`/`session_id_b`.

**Comparison service's responsibility** (`app/services/lap_comparison/`, unchanged):
- `align_lap()`/`build_distance_grid()` — distance-grid interpolation, taking only `list[TelemetrySample]`.
- `compute_delta_ms()` — pure array subtraction, taking only `AlignedLap` values.
- `compute_sector_deltas()` — taking only `Lap`, `list[TelemetrySample]`, the grid, and `delta_ms`.
- `validate_monotonic()`/`collect_warnings()` — taking only `list[TelemetrySample]`/`Lap` pairs.

None of these four modules gains a `session_id` parameter, a `Session` import, or any awareness that
two different sessions are even possible. This is the one hard invariant this design must not
violate — it's what keeps the engine reusable for whatever future milestone wants it (§15).

---

## 6. Frontend/state design

**Decision: extend `ComparisonPage`'s existing local state, do not touch `selectionStore`.**

`ComparisonPage` already isolates A/B selection in local `useState` rather than the global store —
this was a real, already-made M6 decision (§2), not something this milestone invents. The natural
generalization:

```ts
interface ComparisonSelection {
  sessionId: string;
  driverId: string;
  lapNumber: number;
}
```

replacing today's `DriverLapSelection` (`{ driverId, lapNumber }`) wherever it's used as the A/B
selection shape — `ComparisonPage` holds `selectionA: ComparisonSelection | null` and
`selectionB: ComparisonSelection | null` exactly as it holds `selectionA`/`selectionB` today, just
with one more field per side.

**Why not an explicit `ComparisonSelection` object *in the global store*, or A/B store namespaces?**
Rejected: `selectionStore` is scoped to the single primary navigation trail (`docs/adr/0007`'s
per-concern scoping) — the comment on that store already reserves it for "the first of PitWall's
selection concerns," with a separate `cursorStore` planned for V2 rather than folding more into this
one. Comparison-side A/B selection is not "the current primary session" — it doesn't affect the
Sidebar's trail, doesn't need to survive navigating away from `/laps/compare`, and doubling
`selectionStore`'s shape into `{primary, a, b}` would force every other consumer of that store
(Sidebar, every other page) to reason about fields that only ever matter on one page. Page-local
state, matching the M6 precedent, is the smaller, more correct answer.

**The existing primary session-selection workflow is untouched by this change** — `selectionStore`,
`Sidebar`, and every route outside `/laps/compare` are not modified.

**Route:** `/laps/compare` becomes a standalone route (no `:sessionId` param) — matching the backend
path shape (§4). Arriving from an existing session's driver/lap views (the current "Compare
Selected" entry point, `ComparisonPage.tsx`'s own `driverA`/`lapA`/`driverB`/`lapB` query-param
pre-fill) pre-fills **both** `sessionId` **and** driver/lap for side A from the session the user was
already in — this is additive to the existing `selectionFromParams` mechanism (add `sessionA=` next
to `driverA=`/`lapA=`), not a redesign of it.

---

## 7. Session-B selection flow

**Reuse, not a second navigation system**, exactly as instructed. The existing M12 stack —
`SeasonListPage`, `EventListPage`, `SessionListForEventPage`, and the client functions
`listSeasons`/`listEventsForSeason`/`listSessionsForEvent` — is not routing-only; each is already a
plain component reading its own props/params and rendering a list with `onSelect`-style navigation.
Two integration options, both viable, one recommended:

- **(Recommended) Modal/panel reuse, not page navigation.** A `SessionPicker` component wraps the
  same three list views in sequence (season → event → session) inside a dialog/panel opened from
  `ComparisonPage`, calling the same three `list*` client functions `EventListPage`/
  `SessionListForEventPage` already call — not new API calls, not a new component tree, just the
  same list-rendering logic lifted into a component that reports a selection via callback instead of
  navigating. This mirrors exactly how `DriverLapPicker` already reuses `listDrivers`/`listLaps`
  (the same data, called from a controlled picker instead of a routed page) — the established
  pattern for "session's own routed page" vs. "the same data in an unrouted picker used elsewhere,"
  already precedented in this exact feature area.
- **(Rejected) Full page navigation to the real `/seasons/...` routes, then back to `/laps/compare`
  with query params.** Preserves deep-linking almost for free, but loses Session A's in-progress
  selection unless it's round-tripped through query params on every intermediate page — real
  complexity for marginal benefit, and it duplicates `ComparisonPage`'s own query-param handling
  logic into three more pages that don't otherwise need it.

**Session A during Session-B browsing:** stays exactly as it is in `ComparisonPage`'s own `useState`
— opening the Session-B picker (a modal/panel over the same page, not a route change) never unmounts
`ComparisonPage`, so `selectionA` is never at risk.

**Browser back / deep-linking:** the modal approach means `/laps/compare` is the only URL involved
for the comparison flow itself; back-button behavior is whatever the dialog's own open/close state
does (no history entry per picker step) — acceptable, since M6 never deep-linked into an in-progress
*picker* state either (only into a *completed* comparison, via the four query params). A completed
cross-session comparison remains deep-linkable exactly as today, extended with `sessionA=`/`sessionB=`
alongside the existing `driverA=`/`lapA=`/`driverB=`/`lapB=`.

**Loading/error states:** the picker reuses whatever loading/error handling `EventListPage`/
`SessionListForEventPage` already implement (both already handle "season has no ingested
events"/"event has no ingested sessions" as empty states, per M12 Phase 5) — no new error-state
design needed.

---

## 8. Comparison semantics — what changes, what doesn't, and what was already fragile

**Distance alignment, delta computation, channel traces:** unchanged, and **correctly** unchanged —
`align_lap()`/`compute_delta_ms()` never assumed same-session in the first place (§2); they operate
on two independent `list[TelemetrySample]` regardless of where those samples came from. A delta
number between two different circuits is *mechanically* well-defined (distance-from-start-of-lap is
still a real axis on both sides) even when it isn't *meaningful* — that distinction is exactly why
this is a warning, not an engine change (§9).

**Sector boundaries:** unchanged — already documented as using lap A's own sector times as the
reference for both laps (`sectors.py`'s own docstring: *"there's no independent source of 'where
sector 1 actually ends'... lap A is treated as the single source of truth"*). This was already true
within one session and remains true across two — no new assumption introduced.

**Track geometry — the one real semantic gap this milestone must not paper over.**
`TrackMapDelta.tsx` fetches track geometry from **one** `sessionId` and colors that track's outline
by the comparison delta. Today that's always session A's (only) geometry, and it's correct by
construction — there is only one circuit in the picture. Once session A and session B can be
different circuits, rendering session A's track shape colored by "where B was ahead" is actively
misleading: B never drove that shape. **Resolution:** compare `Session.location` for A and B
(already a field on `Session`, no new field needed); if they match, render `TrackMapDelta` exactly
as today, using session A's geometry (extending the existing "lap A is the reference" convention,
not inventing a new one); if they don't match, **hide `TrackMapDelta` and show an explanatory
message** rather than rendering a shape that doesn't represent session B at all. This is a frontend
decision driven by the new `DIFFERENT_CIRCUIT` warning (§9), not a backend change.

**Session type / season differences (quali vs. race, this year vs. last):** explicitly **allowed**,
per this milestone's own stated goal, and mechanically fine — the engine never reads `session_type`
or `season`. The existing M6 §10 UI-copy disclaimer (*"raw delta, not tyre/fuel corrected... make
this explicit in UI copy so users don't over-interpret"*) already covers the interpretive risk here;
this milestone extends that same disclaimer's scope in prose (frontend copy only), not in a new
warning code — fuel/compound/session-type effects were never modeled or corrected for even within
one session, so nothing new needs modeling now.

---

## 9. Error/edge-case behavior (full table)

| Case | Behavior |
|---|---|
| `session_id_a` or `session_id_b` doesn't exist | `404`, names which side |
| `driver_a`/`driver_b` doesn't exist in their session | `404` (existing `_find_lap` 404, unchanged — driver-not-found and lap-not-found already produce the identical message shape) |
| `lap_a`/`lap_b` doesn't exist for that driver | `404`, unchanged |
| Telemetry empty for one side | `404`, unchanged, per side |
| Non-monotonic distance in one side | `422`, unchanged, per side |
| **Session A and session B have different `location`** | **New:** `200`, response includes a `ComparisonWarning(code=DIFFERENT_CIRCUIT)`; frontend hides `TrackMapDelta`, shows a banner |
| Different session types (quali vs. race) | `200`, allowed, no new warning — covered by existing UI-copy disclaimer (§8) |
| Different seasons | `200`, allowed, no new warning |
| `driver_a == driver_b`, `session_id_a == session_id_b`, `lap_a == lap_b` (today's identical-lap case) | unchanged: `delta ≡ 0`, allowed, no special-case rejection (M6 §10, still correct) |
| Different telemetry-channel *availability* (e.g. one session has zero telemetry, `SUCCESS_NO_TELEMETRY`/2018-class gap) | Covered by the existing "telemetry empty" `404` per side — there is no per-channel partial state in the `TelemetrySample` model to handle separately (§6 of the audit already established this) |
| Different max lap distance (out-lap, in-lap, sensor drift) | Unchanged: `min(max_distance_a, max_distance_b)` grid truncation (M6 §10, `build_distance_grid`) |

**New `WarningCode` value** (`backend/app/models/lap_comparison.py`, purely additive — the enum's
own comment already anticipated more codes arriving: *"WarningCode defines codes for those
conditions for forward-compatibility"*):

```python
class WarningCode(str, Enum):
    INVALID_LAP_A = "invalid_lap_a"
    INVALID_LAP_B = "invalid_lap_b"
    DIFFERENT_CIRCUIT = "different_circuit"  # new
```

Computed in `laps_compare.py` (the route/adapter layer), comparing the two already-fetched `Session`
objects' `location` fields — **not** added to `app/services/lap_comparison/validation.py`'s
`collect_warnings()`, which stays `Lap`-only per §5's boundary. A small, separate helper (e.g.
`_circuit_mismatch_warning(session_a, session_b) -> ComparisonWarning | None`) lives in the route
module itself.

**Why warn, not reject (reversing M6 §10's original "reject" intent):** M6 §10 planned a hard `400`
for circuit mismatch, but that was written before cross-session comparison was a real feature this
project wanted — it was a guard against a case that shouldn't be *reachable*, not a considered
product decision that circuit mismatch is meaningless to a user. Given this milestone's explicit
goal is to allow "different events in the same season, different seasons" (which, for the common
motivating case — "this driver's lap at this circuit, across years" — usually *is* the same circuit,
but the milestone doesn't restrict callers to that case), a hard reject would block legitimate
curiosity-driven comparisons the product now wants to allow. This also matches the project's
existing posture elsewhere (M6 §10: compound/fuel/track-evolution differences are "not corrected
for... disclose, don't block") — warn-and-disclose is the consistent house style, not an exception
invented for this milestone.

---

## 10. Backward compatibility

**Breaking, acknowledged, scoped:**

- `LapComparisonResponse.session_id` is removed, replaced by `session_id_a`/`session_id_b`.
- `GET /sessions/{session_id}/laps/compare` is removed (§4).
- Blast radius, verified by direct grep: exactly one backend route file
  (`app/api/laps_compare.py`), one response model (`app/models/lap_comparison.py`), and on the
  frontend: `client.ts`'s `compareLaps()`/`LapComparisonResponse` type, `useLapComparison.ts`,
  `ComparisonPage.tsx`, `LapPairSelector.tsx`, and their existing test files
  (`test_laps_compare_route.py`, `ComparisonPage.test.tsx`, and whatever `LapPairSelector`/
  `useLapComparison` tests currently assert the old single-`sessionId` shape). No other file in
  either workspace references `laps/compare` or `LapComparisonResponse`.
- **Migration strategy:** single-PR replacement, not a phased deprecation — given zero external
  consumers (§4), there is no benefit to a transition window, and a transition window is itself
  extra code to write, test, and then delete. Every reference above is updated in the same change
  that ships the new route.
- **No future removal step needed** — there is nothing left to remove after this migration, since
  nothing old is being kept around.

---

## 11. Performance considerations

**Finding: this milestone does not change the number of repository calls, only which directories
they hit.** Verified against the current route (§2): today's implementation already calls
`repository.list_laps(session_id, driver_id=driver_a)` and the identical call with `driver_b` as two
**separate** calls, even though both already hit the same session's Parquet directory —
`docs/backlog.md`'s own recorded finding is that `ParquetRepository._find_session` re-globs and
re-reads on *every* call, independent of whether two calls share a session. Generalizing to two
independent `session_id_a`/`session_id_b` does not add a third or fourth scan — it's still two
`get_session`/`list_laps`/`get_telemetry` call-pairs, now addressed at up to two directories instead
of always one. **No regression, and no new cost this milestone introduces.**

Per the task's explicit instruction, **no infrastructure change is recommended**: no database
denormalization, no new index, no caching layer, no Postgres telemetry storage, no materialized
cross-session table. The existing, already-documented `backlog.md` item ("worth an in-memory
session_id → directory index if/when the ingested session count grows enough for this to matter —
not before") remains exactly as accurate and exactly as deferred as it was before this milestone;
this design doesn't change when that threshold is crossed.

---

## 12. Testing strategy

Matching this project's established fixture-based, no-network convention throughout:

- **Backend:** `test_lap_comparison_alignment.py`/`_delta.py`/`_sectors.py`/`_validation.py` —
  unchanged, since the service layer is unchanged (§5); these use `lap_comparison_fixtures.py`'s
  bare `lap()`/`sample()` builders, which carry no `session_id` concept at all (confirmed: neither
  `Lap` nor `TelemetrySample` has one) and need no change either. `test_laps_compare_route.py` —
  rewritten for the new route shape, using **two distinct fixture sessions**; this is not a new
  pattern to introduce — the file already writes two independently-named real Parquet sessions today
  (`2023_monza_race`, via the shared `client`/`session_cache_dir` fixture in `conftest.py`, and
  `2024_testcircuit_race`, via its own `_write_non_monotonic_session()` helper for the non-monotonic
  test case), just never queried together in one request. New cases: session-A-not-found vs.
  session-B-not-found (distinguishable error messages), the new `DIFFERENT_CIRCUIT` warning (the
  two already-existing fixture sessions naturally have different `location` values), and an
  explicit same-session regression test (`session_id_a == session_id_b`, asserting output is
  byte-identical to what the old route would have produced for the same inputs).
- **Frontend:** `ComparisonPage.test.tsx` — extended for the `sessionA`/`sessionB` query-param
  pre-fill case and the new session-B picker interaction. New `SessionPicker` component test
  (reusing whatever loading/error fixtures `EventListPage.test.tsx`/`SessionListForEventPage.test.tsx`
  already use, per §7). `useLapComparison.ts`'s test — widened param list, cache-key/dependency-array
  behavior re-verified for the two new params.

---

## 13. Real-data verification plan

Matching this project's own established discipline (every milestone through M12 verified against
real ingested data, not only fixtures): once implemented, run one real cross-session comparison
against two genuinely different, already-ingested real sessions — the natural, on-theme choice given
M12's own backfill is the same driver's qualifying lap at the same circuit in two different real
seasons already sitting in `data/processed/` (e.g. any circuit ingested in both 2021 and 2025), plus
one deliberately-mismatched-circuit real pair to confirm the `DIFFERENT_CIRCUIT` warning fires
correctly and `TrackMapDelta` correctly hides itself on real data, not just a synthetic fixture.

---

## 14. Future extensibility

This design is deliberately shaped so a later milestone can add, without touching this one's code:

- **Cross-session stint/tyre comparison** — would follow the identical pattern (§5's boundary):
  extend `app/services/tyre_performance/` similarly session-agnostically, add its own new route
  calling `RaceContextRepository` twice. Nothing in this milestone's response model, route, or
  service needs to change to make room for it.
- **Cross-session aggregate queries** ("every lap under 1:30 across all seasons") — explicitly a
  different shape of problem (a query engine, not a pairwise comparison) and explicitly out of scope
  here (§16); this milestone's session-pair pattern doesn't block or presuppose an answer to it.
- **Postgres `season`/`event_name` columns (§18 Q1)** — still correctly deferred; this milestone's
  read pattern is Parquet-only (laps/telemetry), so it generates no new evidence either way for that
  question. A future stint/tyre cross-session milestone is what would finally answer it, per design
  review §8's own framing.

---

## 15. Explicit non-goals (this milestone)

Tyre/stint comparison; pit-stop comparison; weather; position/gap history; V2's synchronized
cursor; a driver career index; a bulk analytics/query engine; exports/CSV; AI/NL queries; any
Postgres schema change; any ingestion change. None of these are touched, implied, or made harder by
this design.

---

## 16. Risks

- **The response-model/route breaking change (§4, §10)** is real, even though scoped to one internal
  consumer — must ship as a single atomic change (backend + frontend together), not landed
  independently, or the frontend breaks against the old deployed backend mid-rollout.
- **The `DIFFERENT_CIRCUIT` warning's `TrackMapDelta`-hiding behavior is a frontend judgment call**,
  not a backend-enforced rule — if a future contributor adds a new comparison visualization without
  checking for this warning, it could reintroduce the same misleading-geometry problem in a new
  component. Worth a code comment at the warning's definition site pointing back to this document.
- **Scope-creep risk**, same shape as flagged in the Stage A audit: it will be tempting to also wire
  in cross-session stint context "since the session pair is already resolved here" — explicitly
  out of scope (§15).
- **`ComparisonSelection`'s extra `sessionId` field** touches several existing components
  (`LapPairSelector`, `DriverLapPicker`'s callers) — a mechanical but real refactor with a
  meaningful diff size; not risky, but not as small as it might look from the route change alone.

---

## 17. Acceptance criteria

- A user can compare a lap from session A against a lap from a genuinely different, already-ingested
  session B — different event, different season, or both — through the real UI, using the existing
  Season→Event→Session components to pick session B.
- The existing same-session comparison workflow continues to work, with output unchanged for
  `session_id_a == session_id_b` inputs (regression-tested, §12).
- A circuit mismatch between session A and session B surfaces as a `DIFFERENT_CIRCUIT` warning and
  correctly suppresses `TrackMapDelta` on the frontend, with no misleading geometry ever rendered.
- `app/services/lap_comparison/` has zero code changes — verified by diff, not just by intent.
- No Postgres/schema change. No new dependency. No new repository method.
- Existing pipeline/backend/frontend test suites remain green apart from the intentionally-updated
  `laps_compare`/`ComparisonPage` tests.

---

## 18. Implementation phases (proposed, not started)

1. Backend: route + model change (`laps_compare.py`, `lap_comparison.py` models), `DIFFERENT_CIRCUIT`
   warning helper, updated/extended tests (two-fixture-session pattern).
2. Frontend: `ComparisonSelection` type, `LapPairSelector`/`DriverLapPicker` prop widening,
   `SessionPicker` component (reusing M12 list components per §7), `ComparisonPage` wiring,
   `TrackMapDelta` circuit-mismatch handling, updated tests.
3. Real-data verification (§13) against two genuinely different real sessions.
4. Docs: `docs/api-model.md` (new route, removed old one, new warning code), `CHANGELOG.md` entry.

---

## Document history

- v1 (this document): initial design, produced against M12's real, shipped state (`e9846a2`), not
  against an assumed continuation of the Stage A audit's own prose.
