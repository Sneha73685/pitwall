# PitWall — M24 Design Review: Comparison URL Persistence/Shareability

## Status

Stage B design. Not yet implemented. Awaiting explicit approval before Stage C.

## 1. Context / Problem

`ADR-0010` adopted `react-router-dom` specifically "so a selection state is shareable/bookmarkable."
`/laps/compare` (M6, generalized M13) and `/stints/compare` (M15) are the app's two flagship
interactive comparison surfaces, and both fail that goal today: they read an optional initial
selection from query params on mount, but never write back to the URL as the user completes a
comparison through the on-page pickers. The gap was named explicitly, twice, in the project's own
prior design reviews without ever being picked up:

- `docs/m17-design-review.md` §11: *"Comparison URL persistence/shareability (the `/laps/compare`/
  `/stints/compare` gap identified by prior audits) — unrelated to this milestone, not bundled in."*
- `docs/m15-design-review.md` §17: *"[sessionA/driverA/sessionB/driverB] read once on mount... not
  written back as the user changes selections. This intentionally does not expand scope to fix the
  live-URL-sync gap Stage A flagged in `ComparisonPage` (§16) — the same limitation is accepted here
  for consistency with the pattern being mirrored, not silently improved upon."*

M24 (Stage A, approved) picks this up as its own milestone: repair, not a new comparison capability.

## 2. Current Implementation Analysis (verified against source this session)

### 2.1 `ComparisonPage.tsx` state machine

- Query params read today: `sessionA`, `sessionB`, `driverA`, `lapA`, `driverB`, `lapB` (plus an
  unused `resolution` parameter on `useLapComparison` that has no UI control anywhere on this page
  and is always `undefined` in practice — confirmed via `ComparisonPage.test.tsx`'s
  `resolution: undefined` assertion; out of scope for this milestone, not a URL-encodable field).
- On mount: `sessionIdA`/`sessionIdB` seed a `useState<string | null>` directly from
  `searchParams.get(...)`. `selectionA`/`selectionB` (`DriverLapSelection | null`, i.e.
  `{driverId, lapNumber}`) start `null`; `initialSelectionA`/`initialSelectionB` are computed via a
  local `selectionFromParams(searchParams, "driverA", "lapA")` helper and passed to
  `LapPairSelector` → `DriverLapPicker` as a one-time seed.
- `DriverLapPicker` (`components/DriverLapPicker.tsx`, unmodified by M13/M15/M21/M22, **not in this
  milestone's file scope**) is **uncontrolled**: `selectedDriverId`/`selectedLapNumber` are internal
  `useState`. `initialSelection` is applied **exactly once**, gated by a `useRef` guard, and only
  after its own `listDrivers`/`listLaps` fetches confirm the driver and lap genuinely exist for that
  session — this is the picker's own validation gate. A later prop change to `initialSelection` (e.g.
  from a browser Back/Forward navigation) is never re-applied.
- `LapPairSelector` keys each `DriverLapPicker` as `` `${side}-${sessionId}` `` — changing a side's
  session **force-remounts** that picker (re-arming the `useRef` guard, so a fresh `initialSelection`
  is re-applied). Changing only the driver/lap URL param **without** a session change does **not**
  remount, and does **not** re-sync the picker's displayed value.
- `selectionA`/`selectionB` only ever become non-null via `DriverLapPicker`'s `onSelect` callback,
  which fires either (a) once its own validated-initial-selection effect confirms a URL-seeded
  driver+lap, or (b) on a genuine user pick. `handleDriverChange`/`handleLapChange` inside
  `DriverLapPicker` call `onSelect(null)` on any incomplete/cleared state — so `selectionA`/
  `selectionB` in `ComparisonPage` are **always exactly `null` or a fully-resolved pair**; there is no
  representable partial state (e.g. "driver picked, lap not yet") at the `ComparisonPage` level.
- `useLapComparison` only fetches once all six of `sessionIdA/driverA/lapA/sessionIdB/driverB/lapB`
  are defined (an explicit early-return guard) — this is the existing "resolved comparison" gate this
  milestone must not bypass.
- `handleSessionPicked` clears the dependent side's selection (`setSelectionA(null)` /
  `setSelectionB(null)`) synchronously alongside the session change, in the same event handler —
  React 18's automatic batching (confirmed: `react@^18.3.0`) commits both as one render.
- `handleSwap` swaps `sessionIdA↔sessionIdB` and `selectionA↔selectionB` via four `setState` calls in
  one handler — also one batched render, confirmed atomic today.
- `setSearchParams` is **never called** anywhere in this file (confirmed via grep) — this is the
  entire defect.

### 2.2 `StintComparisonPage.tsx` state machine

Structurally identical, minus the lap dimension:

- Query params: `sessionA`, `sessionB`, `driverA`, `driverB`.
- `sessionIdA`/`sessionIdB`/`driverIdA`/`driverIdB` all seed local `useState` from `searchParams` once
  on mount. `driverIdA`/`driverIdB` here are plain `string | null` (no atomic pairing needed — no lap
  dimension), populated via `DriverPicker`'s own `initialDriverId` prop, which has the identical
  "uncontrolled, applied once, gated by the roster having loaded" contract as `DriverLapPicker`
  (`components/DriverPicker.tsx`, **not in this milestone's file scope**), keyed the same
  `` `${side}-${sessionId}` `` way.
- `useStintComparison` gates its fetch on all four fields being defined — same shape of guard as
  `useLapComparison`.
- `handleSessionPicked` clears the dependent driver (`setDriverIdA(null)`/`setDriverIdB(null)`) in the
  same handler as the session change — same batching guarantee.
- **No `handleSwap`** exists on this page — `StintComparisonPage` has no swap button (verified: no
  "swap" text/handler anywhere in the file or its test file). §8 (handleSwap design) therefore applies
  to `ComparisonPage` only.
- `setSearchParams` is never called here either — the file's own docstring (lines 37–40) states this
  was a **deliberate choice to mirror `ComparisonPage`'s existing pattern**, not an oversight, citing
  the exact gap this milestone now closes.

### 2.3 Existing `setSearchParams` precedent in this codebase

`DriverSeasonPaceTrendPage.tsx`/`DriverSeasonTyreTrendPage.tsx` (M17/M21) already use
`useSearchParams()` **as the sole source of truth** — no local `useState` mirror at all:

```ts
const [searchParams, setSearchParams] = useSearchParams();
const sessionTypeParam = searchParams.get("session_type");
...
setSearchParams((params) => {
  params.set("session_type", nextSessionType);
  return params;
});
```

This is the project's own established, working, tested idiom for a URL-backed control — the updater-
function form, which mutates and returns the existing `URLSearchParams`, automatically preserving any
unrelated params. It does not use `{ replace: true }` — that page has exactly one filter field, so one
history entry per change is unremarkable; it is not evidence against using `replace` here, where up to
six fields resolve across a multi-step interaction (§6 addresses this directly).

No other `useSearchParams`/`setSearchParams`/`useNavigate`/history-mode usage exists anywhere else in
the frontend (confirmed via a full-tree grep) — these two pages plus the two comparison pages are the
entire population of URL-state-relevant code.

## 3. Canonical URL Contract

**`/laps/compare`** — six parameters, names unchanged from current source:
`sessionA`, `driverA`, `lapA`, `sessionB`, `driverB`, `lapB`.

**`/stints/compare`** — four parameters, names unchanged:
`sessionA`, `sessionB`, `driverA`, `driverB`.

Decisions:

- **Parameter names are kept exactly as they are today** — no renaming. Existing deep-links (Sidebar's
  `?sessionA=`, `SessionListForEventPage`'s `?sessionA=`, `LapSelectPage`'s "Compare Selected" full
  six-param link, `StrategyPage`'s "Compare Strategy" four-param link) all continue to work unchanged.
- **Empty values are never written and are treated as absent on read.** `URLSearchParams.get("x")`
  returns `""` (not `null`) for a bare `?x=` — both pages' *existing* code already has this latent
  quirk (an empty-string session ID would render as a blank `SessionSlot` rather than "No session
  selected"), which this milestone incidentally fixes as a direct, in-scope consequence of rewriting
  this exact read path (§3/§4-F explicitly ask this question) — not a separately bundled fix. Reads
  normalize `""` → treated as absent; writes always use `.delete(key)` rather than `.set(key, "")`.
- **Incomplete comparisons ARE representable in the URL** — this matches the app's own pre-existing
  convention (Sidebar's bare `?sessionA=X` link, `SessionListForEventPage`'s same pattern) of a
  session-only partial URL being a legitimate, already-supported shape. `driverA`/`lapA` (or
  `driverB`) are written **only as an atomic pair** (both together or neither) — `selectionA`/
  `selectionB` are never representable as a partial driver-without-lap state at the `ComparisonPage`
  level in the first place (§2.1), so there is no partial-pair case to design for.
- **Canonical representation of a complete comparison**: all six (or four) params present, exactly
  matching what a fresh mount at that URL would independently resolve to via the existing, unmodified
  picker-validation path (§2.1/§2.2) — i.e. the URL is always a faithful snapshot of a state the page
  itself already produced, never a hand-constructed alternate encoding.
- **Parameter ordering does not matter** — `URLSearchParams` is an unordered multimap from the
  consumer's perspective (`.get(key)` by name); no code anywhere reads positionally. Writes are not
  required to normalize ordering.
- **Stale dependent parameters**: when a session changes, that side's `driverX`/`lapX` (or `driverX`)
  are deleted from the URL in the **same** `setSearchParams` call that sets the new session — never
  left dangling to reference a driver/lap that belonged to the previous session (§5 elaborates the
  exact call sites).

## 4. Initial-Load and Invalid-URL Semantics

The existing picker/validation behavior is preserved unmodified in every case — no new error page, no
new API call, no new validation logic. Concretely, per Stage B's required cases:

**A. Fully specified, valid URL.** `sessionIdA`/`sessionIdB` resolve immediately (§2.1: never gated —
see §5's "which fields are read live" rule). `selectionA`/`selectionB` remain `null` until
`DriverLapPicker`'s own existing validated-initial-selection effect confirms the driver+lap are real
and fires `onSelect` — **identical timing to today**, since that gate is not being bypassed (§5).
Once resolved, `useLapComparison`/`useStintComparison` fetch exactly as they do today for a
user-driven pick.

**B. Partially specified URL** (e.g. only `sessionA`). Unchanged: the second session slot shows "No
session selected," `LapPairSelector`/driver pickers don't render until both sessions are set — exact
existing behavior.

**C. Invalid/stale session ID.** `DriverLapPicker`/`DriverPicker`'s own `listDrivers` call fails or
returns an empty roster; their existing `ErrorState`/empty-`<select>` handling applies unchanged. No
new error surface introduced.

**D. Valid sessions, invalid driver/lap combination.** `DriverLapPicker`'s validated-initial-selection
effect's guard condition (`selectedDriverId !== initialSelection.driverId ||
!laps?.some(lap => lap.lap_number === initialSelection.lapNumber)`) simply never becomes true —
`onSelect` never fires, the picker silently falls back to its normal empty "Select a driver" state.
This is **existing, unmodified behavior** — the effect has always silently no-op'd on a mismatch; this
milestone changes nothing about it.

**E. Unrelated query parameters.** Preserved automatically: every write in this design uses the
updater-function form of `setSearchParams((params) => { ...; return params; })`, which mutates the
live `URLSearchParams` object in place — any param this code never touches is untouched by
construction, not by an explicit preserve-list.

**F. Empty query values.** Normalized to absent on read (§3); never produced on write.

## 5. State Synchronization Model — the load-bearing rule

**Not** "call `setSearchParams` on every local state setter." The actual rule, derived from tracing
which fields have a validation gate and which don't (§2.1/§2.2):

- **`sessionIdA`/`sessionIdB` (both pages) are derived directly from `searchParams` on every render —
  no local `useState` mirror at all.** Justification: nothing gates these values before use today —
  `SessionPicker`'s `onSelect(sessionId)` sets them immediately, with no async roster check in
  between (unlike driver/lap). Reading them live from `searchParams` is therefore **behaviorally
  identical** to today's mount-time-seeded local state for every case except one: it also makes them
  correctly reactive to browser Back/Forward (§7) and eliminates any risk of a local-state/URL split
  for this pair, "for free," at zero behavioral cost. This mirrors the established
  `DriverSeasonPaceTrendPage`/`DriverSeasonTyreTrendPage` idiom (§2.3) exactly.
- **`selectionA`/`selectionB` (`ComparisonPage`) and `driverIdA`/`driverIdB` (`StintComparisonPage`)
  remain local `useState`, populated only through the existing, unmodified picker-validation pathway**
  (`initialSelection`/`initialDriverId` computed from `searchParams`, exactly as today → the picker's
  own roster/lap-existence check → `onSelect`). This is the one Stage B explicitly warns must not be
  bypassed ("preserve current picker/validation behavior unless there is a concrete reason not to") —
  there is no such reason here, so it isn't bypassed.
- **The URL is written to (one-way, local→URL) at exactly four call sites**, each already an existing,
  atomic state-change point — no new `useEffect` watching state and reacting is introduced (avoiding
  the "local state ↔ URL loop" risk category by construction: there is only one flow direction per
  field, never both):
  1. `handleSessionPicked` — in the same `setSearchParams` call that sets the new `sessionA`/
     `sessionB`, also `.delete()`s that side's `driverA`/`lapA` (or `driverB`, or `driverB`/`lapB`)
     from the URL, atomically with the session change. `setSelectionA(null)`/`setDriverIdA(null)` (the
     local-state clear) happens in the same handler, same batched render.
  2. The `onSelectA`/`onSelectB` callbacks passed to `LapPairSelector`/the driver picker — wrapped to
     both call the existing local setter (`setSelectionA`/`setDriverIdA`) **and** write the resolved
     pair (or single driver) into the URL via `setSearchParams`, or `.delete()` both/the one param if
     the callback fired with `null`.
  3. `handleSwap` (`ComparisonPage` only, §8) — one `setSearchParams` call swapping all six URL values
     atomically, in the same handler as the four local-state swaps.
- Each of these is a genuinely **atomic, already-resolved** state transition — `selectionA`/
  `selectionB`/`driverIdA`/`driverIdB` are always either fully resolved or `null` (§2.1/§2.2), so
  writing on every one of these four call sites never produces a URL claiming a state the UI hasn't
  actually reached. There is no intermediate "driver picked, lap pending" moment at this level to
  accidentally serialize.

## 6. History Semantics: `replace: true`

**Decision: every programmatic `setSearchParams` call in this design uses `{ replace: true }`.**

Rationale: building one comparison is a multi-step interaction (pick session A, pick session B, pick
driver+lap A, pick driver+lap B — up to four URL-writing events for one logical "I built a
comparison" action). Using default push semantics would create up to four browser-history entries for
what the user experiences as one action, so a single Back press would only unwind one field at a time
— confusing, and not how any other multi-step form in this app behaves (there is no other multi-step
form; the closest precedent, `DriverSeasonPaceTrendPage`'s single-field filter, doesn't have this
problem because it only ever changes one field per interaction). `replace: true` keeps the browser's
Back button meaningful as "leave this page" / "return to wherever I was before," not "undo my last
picker click."

**Expected behavior:**
- **Back** (from a completed comparison): returns to whatever page linked here (Sidebar, a session's
  driver list, `StrategyPage`) — not to an earlier, partially-built comparison state, since none of
  the picker steps pushed their own entry.
- **Forward**: symmetric — nothing to move forward to beyond the single replaced entry.
- **Refresh**: unaffected by history mode — reads whatever the current URL is, per §4.
- **Copy/paste URL**: unaffected by history mode — a copied URL is a fresh navigation in the recipient's
  browser, not a history replay.
- **`handleSwap`**: also `replace: true` — a swap is a correction of the current comparison, not a
  new navigable state worth its own Back-stop.

## 7. Browser Back/Forward Behavior

`useSearchParams()` is already reactive to `popstate` (browser Back/Forward) — react-router-dom
updates the returned `URLSearchParams` and triggers a re-render automatically; no additional
subscription/effect is needed to *detect* the change. The question is what each piece of state does
with that re-render:

- **`sessionIdA`/`sessionIdB`**: since these are derived directly from `searchParams` every render
  (§5), a Back/Forward navigation that changes either one is picked up **correctly and immediately** —
  `LapPairSelector`'s session-keyed `key` prop changes, force-remounting the affected
  `DriverLapPicker`/`DriverPicker`, which re-arms its validated-initial-selection effect against the
  new URL's `driverA`/`lapA` (or `driverB`/`driverA`). This is the one case where full bidirectional
  sync is both achievable and correct, and it falls out of §5's design with no extra code.
- **`driverA`/`lapA`/`driverB`/`lapB` (or `driverA`/`driverB`) changing alone, with the session
  unchanged**: the picker does **not** remount (same `key`), and — per its own existing, unmodified,
  out-of-scope internals (§2.1/§2.2) — does not re-read a changed `initialSelection`/`initialDriverId`
  prop after its one-time application. A Back/Forward step that only changes the lap or driver within
  the same session will correctly update the address bar (browser-native) but will **not** visually
  update the picker's `<select>` values or trigger a new fetch. **This is an explicit, accepted
  limitation**, not a bug this milestone leaves half-fixed: redesigning `DriverLapPicker`/
  `DriverPicker` into fully controlled components (or adding a finer-grained remount key) is a change
  to files outside this milestone's approved scope (§14), and is unnecessary for the two literal
  success criteria this milestone exists to satisfy — **refresh** and **copy/paste into a fresh
  tab/context** — both of which are full remounts, where the existing picker-validation path already
  works correctly end-to-end (case A, §4).
- **Source-of-truth model, stated precisely**: URL → local state, one-way, at mount and at any
  session-changing navigation (via remount); local resolved state → URL, one-way, at the four call
  sites in §5. There is no bidirectional field — `sessionIdA`/`sessionIdB` have no local state to
  desync from (they simply *are* `searchParams`, live); `selectionA`/`selectionB`/`driverIdA`/
  `driverIdB` only ever flow local→URL, never URL→local outside of the mount/remount path. No loop is
  possible by construction.

## 8. `handleSwap` (`ComparisonPage` only — `StintComparisonPage` has no swap button, §2.2)

Current implementation swaps four local values (`sessionIdA↔sessionIdB`, `selectionA↔selectionB`) via
four `setState` calls in one handler, batched into one render (§2.1). Under this design,
`sessionIdA`/`sessionIdB` are no longer local state, so the swap becomes:

- **One `setSearchParams` call**, reading the current `sessionA`/`driverA`/`lapA`/`sessionB`/
  `driverB`/`lapB` values off the params object being mutated and writing them back crossed —
  genuinely more atomic than today (one function call instead of two `setState` calls for the session
  half), in the same handler tick as the two `setSelectionA`/`setSelectionB` local-state swaps.
- Because both the URL mutation and the local-state swap happen synchronously inside the same event
  handler, React's automatic batching (§2.1, confirmed `react@^18.3.0`) guarantees one committed
  render reflecting the fully-swapped state — **no transient, half-swapped URL is ever written or
  visible**, satisfying §8's atomicity requirement directly from React's existing batching guarantee,
  not from any new locking/sequencing logic.
- `{ replace: true }` (§6): a swap corrects the current comparison in place, not a new Back-stop.

## 9. Shared Abstraction Decision

**Decision: no shared hook or helper module. Each page implements its own local URL-sync logic.**

Applying the project's own rule-of-three convention (already precedent: `_to_driver_strategy_summary`
stays independently duplicated three times across `driver_trends.py`/`stints_compare.py`/
`tyre_performance.py`, deliberately, per `CLAUDE.md`'s "three similar lines is better than a premature
abstraction"): this milestone has exactly **two** call sites, and their state shapes are genuinely
different, not superficially similar —

- `ComparisonPage`: six fields, with `driverA`/`lapA` (and `driverB`/`lapB`) written only as an atomic
  pair.
- `StintComparisonPage`: four fields, all independent single values, no pairing.

A shared hook generic enough to cover both shapes (e.g. "sync an arbitrary set of key groups, where
each group is atomic") would need more abstraction machinery than either page's own concrete logic —
exactly the "abstraction merely because two files look similar" trap `CLAUDE.md` warns against. The
one piece of code that *is* character-for-character identical between the two pages — a one-line
"set the param if the value is present, delete it if not" helper — is small enough (2–3 lines) that
duplicating it locally in each file is clearer than a shared import for a two-line utility, matching
the same "three similar lines" reasoning. If a third comparison-style page is ever added later
(**not** part of this milestone, no such page exists or is planned), that would be the actual
rule-of-three trigger to revisit this decision — not now.

## 10. API / Data / Schema Impact

Confirmed by direct source inspection this session, not assumed:

- **No backend route changes.** `compareLaps`/`compareStints` (`frontend/src/api/client.ts`) are
  called with exactly the same parameters as today; only *when* and *from what state* they're invoked
  changes (unchanged for the picker-driven path, §4-A).
- **No Pydantic model changes** — nothing in `backend/app/models/` is touched.
- **No repository changes** — nothing in `backend/app/repositories/` is touched.
- **No database changes, no Parquet changes, no ingestion changes** — `pipeline/`, `data/`,
  `migrations/` are untouched.
- **No dependency changes** — `useSearchParams`/`setSearchParams` are existing `react-router-dom`
  APIs, already imported and in use on both target files today.

This milestone is entirely confined to `frontend/src/features/lap-comparison/ComparisonPage.tsx`,
`frontend/src/features/stint-comparison/StintComparisonPage.tsx`, and their two test files.

## 11. Testing Strategy

Both pages, mirroring existing test conventions (`MemoryRouter` with `initialEntries`, `fireEvent`/
`waitFor`/`within`, `vi.spyOn(client, ...)`):

1. **No query parameters** — existing case, must remain unchanged (already covered by both current
   test suites; re-verify, don't rewrite).
2. **Mount from a fully specified valid URL** (all six / all four params) — **new** case: assert the
   comparison renders **without any simulated user interaction**, proving the existing
   picker-validation path still resolves correctly when every field is URL-seeded, not just
   partially (today's tests only exercise the mixed "sessions from URL, driver/lap via `fireEvent`"
   path — this closes that gap).
3. **A picker change updates the URL correctly** — for each of session A, session B, driver+lap A,
   driver+lap B (or driver A/B for stints): perform the pick via existing `fireEvent`/`selectDriverAndLap`
   helpers, then assert on the router's resulting search string (e.g. via a test-only location-display
   probe rendered inside the `MemoryRouter`, matching how this codebase already asserts on rendered
   text rather than reaching into router internals).
4. **Dependent picker changes clear stale URL params** — change session A after a full comparison is
   built; assert `driverA`/`lapA` are absent from the resulting URL, not left pointing at the old
   session's driver/lap.
5. **`handleSwap` updates all relevant parameters atomically** (`ComparisonPage` only) — assert the URL
   after one swap click reflects the fully-crossed state in a single assertion (no intermediate/partial
   read).
6. **Browser Back/Forward** — testable within `MemoryRouter` via its `history` object or by rendering
   two sequential `initialEntries` and driving `window.history.back()`-equivalent APIs `MemoryRouter`
   exposes; cover the one case §7 guarantees (a session-changing Back/Forward correctly re-resolves)
   and explicitly assert-and-document the accepted limitation (a same-session driver/lap-only
   Back/Forward does not re-sync the picker display) as a **known, intentional** test case, not an
   oversight.
7. **Invalid/incomplete URL** — mount with a nonexistent driver/lap combination for a valid session;
   assert the picker falls back to its normal empty state (existing `DriverLapPicker`/`DriverPicker`
   behavior, unmodified) rather than erroring.
8. **Empty query parameters** (`?sessionA=&driverA=`) — assert normalized-as-absent read behavior
   (§3/§4-F).
9. **Unrelated query parameters are preserved** — mount with an extra `?utm_source=test` alongside a
   real comparison; after a picker change, assert `utm_source` is still present in the URL (proves the
   updater-function form's automatic preservation, §4-E).
10. **No duplicate/noisy history entries** — assert (via `MemoryRouter`'s history length, or a spy on
    `setSearchParams`'s invocation pattern) that building a full six-field comparison does not exceed
    one net navigable history entry beyond the initial mount, confirming `replace: true` (§6) is
    actually wired through, not just designed.
11. **Refresh/shareability semantics, as far as unit tests establish** — equivalent to re-running case
    2 (a fresh mount from a URL previously produced by case 3), proving round-trip fidelity: the URL a
    completed comparison produces, fed back into a fresh mount, reproduces the same comparison.

## 12. Real-Browser Verification Plan

Using the same isolated-scratchpad Playwright approach established in M22 (installed outside the
repo, no `package.json` change):

**`/laps/compare`:**
1. Open `/laps/compare` (no params).
2. Pick Session A, Session B (same real session, to keep the flow simple and deterministic), Driver A
   + Lap A, Driver B + Lap B, through the real UI.
3. Read the resulting `page.url()`.
4. Open that exact URL in a fresh browser context (new `browser.newContext()`, not just a new tab
   sharing state) — proves it's genuinely self-contained, not relying on any in-memory app state.
5. Assert the same sessions/drivers/laps and comparison content render (sector table, delta chart,
   track map) without any picker interaction.
6. Reload (`page.reload()`) on the original context and re-assert the comparison still renders.
7. Click **Back**, assert the app returns to wherever the flow started (not an intermediate picker
   state); click **Forward**, assert it returns to the completed comparison.
8. Click the swap button; assert the URL's `driverA`/`driverB` (etc.) are crossed in the same
   navigation (`page.waitForURL` or an immediate `page.url()` read right after the click, with no
   intermediate poll catching a half-swapped state).

**`/stints/compare`:** repeat steps 1–7 (no swap button, §2.2) with Session A/B + Driver A/B.

No write-producing operation at any point — every step is a `GET` against the existing, unmodified
read-only endpoints.

## 13. Real-Data Verification

Reuse the same real session/driver/lap identifiers already established in this session's prior
milestones' verification passes (`2023_bahrain_grand_prix_race`, drivers `VER`/`PER`, lap numbers
already confirmed to exist and have telemetry from M22's own real-data validation) — no new or
invented IDs. Verification confirms the URL reproduces the **exact same semantic comparison**
(matching driver IDs, lap numbers, and rendered sector/delta values across the two contexts in
§12 step 5), not merely a 200 status.

## 14. Scope / Non-Goals

Explicitly preserved, unchanged by this milestone:

- No new comparison capability of any kind (no N-way comparison, no new comparison type).
- No backend/API change (§10).
- No new data model, no new persistence layer, no server-side saved comparisons.
- No authentication or share-link generation beyond the URL the browser already produces.
- No database-backed saved URLs.
- No change to comparison calculations (`app/services/lap_comparison/`, `app/services/
  tyre_performance/` — untouched, backend is out of scope entirely).
- No change to chart behavior/options (`chartOptions.ts`, `deltaChartOptions.ts` — untouched).
- No sidebar redesign (the separately-identified, much smaller nav-discoverability gap from M24 Stage
  A §5 is **not** part of this milestone — noted there as a possible tiny follow-up, not folded in
  here).
- No redesign of `DriverLapPicker`/`DriverPicker`/`SessionPicker`/`LapPairSelector` internals — all
  four remain byte-for-byte unmodified; the accepted Back/Forward limitation (§7) is a direct,
  disclosed consequence of that boundary, not an oversight.

Nothing discovered during Stage B's investigation requires expanding this scope — the hybrid
derived-vs-local state model (§5) resolves every load-bearing question using only the two approved
files.

## 15. Design Risks

- **Stale dependent URL parameters** — mitigated by design: session changes clear that side's
  driver/lap params in the *same* `setSearchParams` call (§5), never a separate step that could be
  skipped or reordered.
- **Local state ↔ URL synchronization loop** — structurally impossible here: `sessionIdA`/`sessionIdB`
  have no local state to loop with (derived live); `selectionA`/`selectionB`/`driverIdA`/`driverIdB`
  only flow local→URL, never URL→local outside the mount/remount path (§7). No effect watches
  `searchParams` to re-derive local state that then writes back.
- **Incomplete URLs** — always representable and always safely resolvable (§4), matching the app's
  own pre-existing partial-URL convention; no new failure mode introduced.
- **Browser history pollution** — addressed by uniform `{ replace: true }` (§6).
- **Back/Forward behavior** — correctly handled for the session dimension, explicitly *not* for the
  same-session driver/lap dimension (§7) — a real, disclosed, scope-bounded limitation, not
  overstated as fully solved.
- **Session/driver/lap dependency ordering** — unchanged from today; this milestone only adds writes
  at existing, already-ordered state-change points, it does not alter the dependency graph itself.
- **`handleSwap` atomicity** — guaranteed by React 18's automatic batching plus a single
  `setSearchParams` call (§8), not by any new synchronization primitive.
- **Accidental removal of unrelated query params** — prevented by construction via the
  updater-function form (§4-E), not by an explicit allow-list that could drift out of sync.
- **Differing state machines between the two pages** — explicitly not unified into one abstraction
  (§9); each page's design is derived from its own actual state shape, not forced into a common
  shape that fits neither cleanly.

No inflated/theoretical risk is carried forward beyond these — e.g. performance is a non-issue
(`setSearchParams` calls are bounded to human-interaction frequency, not a hot path), and no new
network request is introduced anywhere in this design.

## 16. Definition of Done

A complete `/laps/compare` or `/stints/compare` comparison, built through the existing UI, must:

- Encode all resolved state in the URL (six or four params respectively) using the exact existing
  parameter names, immediately after the resolving pick (§5) — verified by test case 3.
- Survive a page refresh, reproducing the identical comparison without any picker interaction —
  verified by test case 2/11 and browser-verification step 6.
- Reproduce identically when the URL is copied into a fresh browser context — verified by
  browser-verification steps 3–5.
- Never contain a stale param referencing a superseded session's driver/lap — verified by test case 4.
- Use `replace` semantics throughout, producing no more than one net history entry for a fully-built
  comparison beyond the initial mount — verified by test case 10.
- Leave backend/API/data behavior completely unchanged — verified by §10's confirmation and by the
  full existing backend test suite passing unmodified (no backend file is touched, so this is a
  non-event, not a new test to write).
- Preserve every existing test in both current test files passing unmodified, plus the new cases in
  §11, plus the full existing frontend suite (482 tests as of M23) passing with zero regressions
  elsewhere.

## 17. ADR Decision

**No ADR required.** Applying `CLAUDE.md`'s actual trigger list (new dependency, new architectural
layer, provider change, schema change, major reversal, new cross-cutting infrastructure): this
milestone introduces none of these. `useSearchParams`/`setSearchParams` are the same
`react-router-dom` API ADR-0010 already adopted and that two other pages (`DriverSeasonPaceTrendPage`,
`DriverSeasonTyreTrendPage`) already use in production; this milestone extends that same, already-
accepted pattern to two more pages. No new dependency, no new layer, no reversal of any prior
decision — if anything, this milestone is the app finally living up to the rationale ADR-0010 already
stated ("so a selection state is shareable/bookmarkable"), not a new architectural direction.

## 18. Deviations / Open Questions

No load-bearing question remains unresolved. Two genuinely non-load-bearing judgment calls, labeled
as such:

- **Exact test-ids/probe mechanism for asserting on the resulting URL in tests** (§11, case 3) — a
  concrete implementation detail (e.g. a small test-only component rendering `location.search`, vs.
  reaching into the `MemoryRouter`'s exposed history object) to be settled during Stage C, not
  load-bearing to this design.
- **Whether the one-line `setOrDelete(params, key, value)` write helper is a bare inline ternary at
  each call site or a 2-line local function per file** (§9) — purely a Stage C style choice, no
  behavioral difference either way.

## Document History

- v1 (this document): M24 Stage B design, resolving the state-synchronization model, canonical URL
  contract, history semantics, and scope boundary for comparison URL persistence/shareability.

## Safety Confirmation

No repository file other than this one (`docs/m24-design-review.md`, newly created) was modified,
staged, committed, or pushed during Stage B. `docs/m9-design-review.md` remains exactly as found —
untouched, still showing only its pre-existing +1 blank-line diff. No code, test, schema, or API
change was made or is proposed. Nothing has been staged, committed, or pushed.

**STOP — awaiting explicit approval before proceeding to Stage C.**
