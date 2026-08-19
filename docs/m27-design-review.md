# PitWall — M27 Design Review: Comparison-Surface Consistency Pass

## Status

Stage B design. Not yet implemented. Awaiting explicit approval before Stage C.

## 1. Baseline Verification (this session)

- HEAD = `origin/main` = `42aaa534049218792dc3829717aa0e7b58d20523` (`feat(m26): add two-driver
  tyre trend comparison`) — confirmed equal.
- `git status --short --branch`: only ` M docs/m9-design-review.md`.
- `git diff -- docs/m9-design-review.md`: confirmed byte-identical to the known baseline (single
  `+1` blank line after the title).
- `docs/m27-design-review.md`: confirmed did not exist before this file was written.
- `git diff --cached --stat`: empty before this Stage B session began.

## 2. Problem Statement

M27's Stage A audit found `getParam`/`setOrDelete` — a tiny URL-normalization helper pair —
duplicated across four files, with the exact same duplication explicitly named and deliberately
deferred in three consecutive design reviews (`docs/m25-design-review.md` §13,
`docs/m26-design-review.md` §8/§13, referencing `docs/m24-design-review.md` §3/§9's original
pair). The comparison-feature family is now complete through M26; each further deferral repeats
the same disclosure rather than resolving it. Separately, `/stints/compare` remains the one
comparison surface with no Sidebar entry, confirmed absent across four consecutive audits
(M23–M26). Both are small, mechanical, low-risk, and share one theme: making the four comparison
surfaces (`/laps/compare`, `/stints/compare`, `/drivers/pace-trend/compare`,
`/drivers/tyre-trend/compare`) consistent with each other, both in code and in discoverability.

## 3. Existing Implementation Analysis (fresh source read this session)

### 3.1 Shared-utility location precedent

`frontend/src/` has no `utils/` directory. The project's actual, already-used convention for a
small, cross-feature, non-component pure-function module is `frontend/src/components/`:
`teamColor.ts` (`teamAccent`/`teamSurfaceTint`, plain functions, no component) is imported from
`features/race-context/compoundColor.ts` and `features/session-select/DriverSelectPage.tsx`;
`sessionTypeLabels.ts` (a plain lookup constant) is imported from five different feature
directories (`lap-comparison`, `track-map`, `session-select` ×2, `driver-trends`). Both have a
co-located `X.test.ts` (confirmed: `teamColor.test.ts` exists, same directory). **This is direct,
unambiguous precedent** — no new top-level directory is warranted for two small functions when an
established, actively-used location already exists.

### 3.2 Exact current call sites (all four files re-read this session)

- **`ComparisonPage.tsx`**: `getParam` called 4 times (lines 61, 62, 290, 291 — the last two
  inside the file's own `selectionFromParams` helper, not just the top-level state derivation).
  `setOrDelete` called 10 times across `handleSwap`, `handleSessionPicked`, `handleSelectA`,
  `handleSelectB`. `setOrDelete`'s `value` parameter type: `string | null` (callers pass
  `selection?.driverId ?? null`, `params.get(...)` results, and plain strings).
- **`StintComparisonPage.tsx`**: `getParam` called 4 times (2 for `sessionIdA`/`sessionIdB`
  derivation, 2 inline in JSX for `initialDriverId` props). `setOrDelete` called 2 times
  (`handleSelectA`/`handleSelectB`, passing `driverId: string | null` directly from `DriverPicker`'s
  callback). `setOrDelete`'s `value` parameter type: `string | null`.
- **`DriverPaceTrendComparisonPage.tsx`**: `getParam` called 5 times (`driverA`, `seasonAParam`,
  `driverB`, `seasonBParam`, `sessionTypeParam`). `setOrDelete` called 4 times in `handleSubmit`,
  always passed a plain `string` (`driverAInput.trim()`, `seasonAInput`, etc. — never `null`).
  `setOrDelete`'s `value` parameter type: `string`.
- **`DriverTyreTrendComparisonPage.tsx`**: identical shape to the pace-trend page — 5 `getParam`
  calls, 4 `setOrDelete` calls, `value` typed `string`.

### 3.3 Byte-level behavioral comparison

`getParam`'s body is **byte-for-byte identical** in all four files:

```ts
function getParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(key) || null;
}
```

`setOrDelete`'s **body** is byte-for-byte identical in all four files:

```ts
function setOrDelete(params: URLSearchParams, key: string, value: ...) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
```

The **only** difference across the four copies is `setOrDelete`'s parameter type annotation
(`string | null` in the two M24 files vs. `string` in the two M25/M26 files) — a static-typing
narrowing choice reflecting what each file happens to pass, not a runtime behavioral difference.
`params.set()`/`params.delete()` execute identically regardless. **No design/behavior variance
exists anywhere in the four copies.**

## 4. Shared Utility Location Decision

**`frontend/src/components/urlSearchParams.ts`**, with a co-located `urlSearchParams.test.ts` in
the same directory — matching `teamColor.ts`/`teamColor.test.ts`'s exact precedent (§3.1). No new
directory, no new architectural layer, no barrel/index file (none of the existing precedent modules
use one).

## 5. Exact Behavioral Contract (to be preserved exactly, not redesigned)

- **`getParam`, missing key**: `URLSearchParams.get(key)` returns `null` → `null || null` →
  returns `null`.
- **`getParam`, empty-string value** (a bare `?key=`): `URLSearchParams.get(key)` returns `""` →
  `"" || null` (empty string is falsy) → returns `null`. **Empty string is normalized identically
  to a missing key** — this is the one behaviorally significant thing `getParam` does beyond a raw
  `.get()` call, and it is the exact reason all four pages use it instead of calling `.get()`
  directly.
- **`getParam`, non-empty value**: returns the string unchanged, no trimming, no case
  transformation.
- **`setOrDelete`, non-empty (truthy) value**: calls `params.set(key, value)` — sets the key,
  overwriting any existing value for that key.
- **`setOrDelete`, empty string or `null`**: calls `params.delete(key)` — removes the key entirely
  if present; a no-op if the key was already absent.
- **`null`/`undefined` acceptance**: current call sites pass `string | null` (M24 pages) or plain
  `string` (M25/M26 pages) — **never `undefined`** anywhere in any of the four files, confirmed by
  direct grep. The shared signature accepts exactly `string | null`, matching current usage; no
  `undefined` branch is added speculatively (§9 — "do not redesign while extracting").
- **Mutation vs. return**: `getParam` is a pure read, no mutation, returns a value. `setOrDelete`
  **mutates the passed-in `URLSearchParams` instance in place** (via `.set()`/`.delete()`) and
  returns nothing (`void`) — it does not construct or return a new object. This exact mutate-in-
  place contract is what lets all four pages call it repeatedly inside one `setSearchParams`
  updater function and return the same, now-mutated `params` object at the end.
- **Unrelated-param preservation**: neither function is the mechanism that preserves unrelated
  params — that guarantee comes from each page's own `setSearchParams((params) => {...; return
  params;}, {replace: true})` updater-function call, which starts from the *existing* live
  `URLSearchParams` and only ever `.set()`/`.delete()`s the specific keys `setOrDelete` is told
  about. Extraction changes nothing here, since the helper is still invoked from inside each page's
  own unchanged updater function.
- **Parameter ordering**: per the `URLSearchParams` spec, `.set()` on an existing key updates its
  value in place (preserving original position); `.set()` on a new key appends it; `.delete()`
  removes the entry. No code anywhere in this app reads params positionally, so this is unchanged
  and non-load-bearing, exactly as it is today.
- **React Router dependency**: **none**. Neither function imports or references anything from
  `react-router-dom`. Both operate purely on the standard DOM `URLSearchParams` type (confirmed:
  `useSearchParams()` returns a real `URLSearchParams` instance, not a custom subtype). No
  `ReadonlyURLSearchParams` type exists anywhere in this codebase or in `react-router-dom`'s own
  type declarations (confirmed via direct grep this session — that type name is a Next.js App
  Router concept, not applicable here).

## 6. Type / API Design

```ts
export function getParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(key) || null;
}

export function setOrDelete(
  params: URLSearchParams,
  key: string,
  value: string | null,
): void {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
```

`setOrDelete`'s parameter widened to `string | null` (the M24 pages' existing type) rather than
`string` (the M25/M26 pages' existing type) — the **narrower** type of the two, since every
`string`-typed call site remains valid when the parameter accepts `string | null` (TypeScript
allows passing a `string` where `string | null` is expected), while the reverse is not true. This
is not a design choice invented for this milestone; it is the mechanical consequence of unifying
four call sites where one pair already needed the wider type. No `undefined` branch, no generic
type parameter, no options object — the narrowest signature that covers all four existing call
sites exactly, per §9's instruction to avoid unnecessary abstraction.

Both functions accept plain `URLSearchParams` — not a React-Router-specific type, not a wrapper —
matching §5's confirmed zero-router-dependency finding.

## 7. React Router Dependency Boundary

**No react-router-dom dependency.** `frontend/src/components/urlSearchParams.ts` will have zero
imports beyond nothing (pure TypeScript, operating on a standard Web API type). This keeps the
module trivially unit-testable without any router test harness (`MemoryRouter`, etc.) — confirmed
appropriate since `teamColor.ts`/`sessionTypeLabels.ts` are tested the same router-free way.

## 8. Import / Cycle Safety

- `frontend/src/components/` already has zero dependencies on `frontend/src/features/` (confirmed:
  `teamColor.ts` and `sessionTypeLabels.ts` are both leaf modules with no feature imports) — adding
  `urlSearchParams.ts` alongside them, itself importing nothing, cannot introduce a cycle.
- No feature-to-feature coupling is introduced: all four consuming pages already sit in different
  feature directories (`lap-comparison`, `stint-comparison`, `driver-trends` ×2) and none of them
  currently imports from any of the others; they will now each import from `components/`, exactly
  the same directionality `teamColor.ts`'s existing five-feature fan-out already establishes as
  safe and precedented.
- No router/component coupling: the new module exports two plain functions, not a component, not a
  hook — nothing to couple.

## 9. Four-Page Migration Design

Each page's local `function getParam(...)`/`function setOrDelete(...)` declarations (and their
accompanying "duplicated identically in X.tsx" comments) are deleted, replaced by one import line:

```ts
import { getParam, setOrDelete } from "../../components/urlSearchParams";
```

(relative depth adjusted per file: `../../components/` from `features/lap-comparison/`,
`features/stint-comparison/`, and `features/driver-trends/` — all three feature directories sit at
the same depth under `features/`, confirmed by directory listing, so the same `../../` prefix
applies uniformly to all four files).

**No call site changes** — every existing call (`getParam(searchParams, "driverA")`,
`setOrDelete(params, "sessionA", nextSessionA)`, etc.) stays character-for-character identical;
only the function *definitions* move out of each file. This is confirmed mechanical by §5/§6: the
shared implementation is byte-identical to what's already there.

**Explicitly confirmed unchanged, per file, because the extraction touches only the two helper
function *bodies*, never their call sites or the surrounding logic that calls `setSearchParams`**:

- `{ replace: true }` — set at each page's own `setSearchParams(updater, { replace: true })` call
  site, untouched.
- Updater-function semantics — each page's own `(params) => { ...; return params; }` closures,
  untouched.
- Empty-value normalization — `getParam`'s `|| null` behavior, preserved exactly (§5).
- Unrelated-param preservation — a property of each page's own updater-function usage, not of the
  helpers (§5), untouched.
- Existing submit-vs-picker timing — `ComparisonPage`/`StintComparisonPage`'s picker-`onSelect`-
  triggered writes vs. `DriverPaceTrendComparisonPage`/`DriverTyreTrendComparisonPage`'s Compare-
  submit-triggered writes are both **caller-side** behavior, entirely unaffected by where the two
  tiny helper functions physically live.
- Back/Forward behavior — governed by each page's own `searchParams`-derivation logic (already
  audited in `docs/m24-design-review.md` §7 and `docs/m25-design-review.md` §5), untouched.
- Deep-link behavior — governed by each page's own mount-time `searchParams` reads, untouched.

## 10. Sidebar Design

Fresh read of `Sidebar.tsx` and `Sidebar.test.tsx` in full (§3 of this document, repeated here for
the Sidebar-specific decision):

**Gating condition — resolved by source, not copied literally from the trend links.** The
instruction says to match the pace/tyre-trend links' pattern, but direct inspection of
`StintComparisonPage.tsx`'s actual URL contract shows it reads `sessionA`/`sessionB`/`driverA`/
`driverB` only — **no `season` parameter exists anywhere in that page**, unlike the two trend-
comparison pages which are driver+season-paired. Gating "Compare Stints" on `driverId && season`
(literally copying the trend links' condition) would be gating on a value the destination page
never reads — technically harmless (the link would just never seed a `seasonA` param, since none is
built into the href), but semantically wrong: it would make the link *disappear* if `season` were
ever `null` while `driverId` was set, for no reason connected to what the link actually needs.
**Resolved: gate on `driverId` alone** (matching that `sessionId` is already guaranteed true inside
the enclosing `sessionId && (<>...)` block, and `driverId` is the only additional fact the seeded
URL needs).

**Seed shape — resolved by the only existing entry point to this route.** `StrategyPage.tsx`'s
"Compare Strategy" link (`docs/m15-design-review.md`) is the sole pre-existing way to reach
`/stints/compare` today, and it seeds `?sessionA=${sessionId}&driverA=${driverId}` — both fields,
not session-only like "Compare Sessions" (which is deliberately unconditional on `driverId`, since
it can appear before a driver is even chosen). The Sidebar's own context, by the time any
`driverId`-gated link renders, already has both a specific session *and* a specific driver
selected — the same context `StrategyPage` has. **Resolved: seed both `sessionA` and `driverA`**,
mirroring `StrategyPage`'s own established seed shape exactly, not "Compare Sessions"' narrower one.

**Exact new link:**

```tsx
{driverId && (
  <NavLink
    to={`/stints/compare?sessionA=${sessionId}&driverA=${driverId}`}
    className={linkClass}
  >
    Compare Stints
  </NavLink>
)}
```

**Placement — resolved by pairing semantics, not milestone-chronological order.** `/laps/compare`
and `/stints/compare` are both **session/driver-paired** comparisons (mirroring each other exactly
per `docs/m15-design-review.md`'s own "mirrors ComparisonPage's own local-state shape" framing);
`/drivers/pace-trend/compare` and `/drivers/tyre-trend/compare` are both **driver/season-paired**
comparisons. Grouping by pairing semantics rather than ship order is the more legible ordering for
a reader of the rendered Sidebar: "Compare Sessions" immediately followed by "Compare Stints",
*then* the two trend-comparison links. **Resolved: insert "Compare Stints" directly after "Compare
Sessions", before "Compare Pace Trends".** No existing link is reordered, relabeled, or removed —
this only inserts one new line at one new position.

**Accessibility**: identical `<NavLink className={linkClass}>` pattern as every other link — no new
ARIA attributes needed or used anywhere else in this file; consistent.

## 11. Testing Strategy

### 11.1 Shared utility (`urlSearchParams.test.ts`, new, router-free per §7)

- `getParam` returns `null` for a missing key.
- `getParam` returns `null` for an empty-string value (`?key=`).
- `getParam` returns the value for a present, non-empty key.
- `setOrDelete` sets the key when given a non-empty value.
- `setOrDelete` deletes the key when given `null`.
- `setOrDelete` deletes the key when given an empty string.
- `setOrDelete` is a no-op (key absent, stays absent) when given `null`/`""` and the key was never
  present.
- `setOrDelete` overwrites an existing value rather than duplicating the key.
- `setOrDelete` does not touch any other key already present in the `URLSearchParams` instance
  (direct proof of the "unrelated params preserved" property at the unit level, complementing —
  not replacing — each page's own existing integration-level proof of the same thing).

### 11.2 Four existing page test suites — no new tests required for URL-state behavior

`ComparisonPage.test.tsx`, `StintComparisonPage.test.tsx`, `DriverPaceTrendComparisonPage.test.tsx`,
`DriverTyreTrendComparisonPage.test.tsx` already exercise every URL-state behavior this milestone
must not regress (empty-value normalization, replace semantics, unrelated-param preservation,
refresh/deep-link reproduction, no-write-while-typing, atomic submit) — re-running them unmodified
after the import swap is the correct regression proof; adding redundant new tests to these files
would test the same behavior twice for no reason, contrary to the explicit "avoid redundant tests"
instruction. **No changes to these four test files are planned or needed.**

### 11.3 `Sidebar.test.tsx` — two new tests, mirroring the existing M25/M26 pair exactly

- `shows the Compare Stints link once a driver is selected, seeding both side A session and
  driver` — asserts `href` equals `/stints/compare?sessionA=2024_bahrain_grand_prix_race&
  driverA=VER`.
- `does not show the Compare Stints link before a driver is selected`.

## 12. Scope / Exact Stage C File List

**Definitely expected:**

- `frontend/src/components/urlSearchParams.ts` (new)
- `frontend/src/components/urlSearchParams.test.ts` (new)
- `frontend/src/features/lap-comparison/ComparisonPage.tsx` (modified — remove local helpers, add
  import)
- `frontend/src/features/stint-comparison/StintComparisonPage.tsx` (modified — same)
- `frontend/src/features/driver-trends/DriverPaceTrendComparisonPage.tsx` (modified — same)
- `frontend/src/features/driver-trends/DriverTyreTrendComparisonPage.tsx` (modified — same)
- `frontend/src/components/Sidebar.tsx` (modified — one new gated `NavLink`)
- `frontend/src/components/Sidebar.test.tsx` (modified — two new tests)

**Explicitly not expected:**

- `ComparisonPage.test.tsx`, `StintComparisonPage.test.tsx`, `DriverPaceTrendComparisonPage.test.tsx`,
  `DriverTyreTrendComparisonPage.test.tsx` — no behavioral change to regress-test (§11.2).
- Any backend file.
- `docs/m9-design-review.md`.
- Any documentation-reconciliation file (`README.md`, `CHANGELOG.md`, `docs/prd.md`,
  `docs/api-model.md`) — out of scope (§13).
- `useDriverSeasonPaceTrend.ts`/`useDriverSeasonTyreTrend.ts`/`useDriverPaceTrendComparison.ts`/
  `useDriverTyreTrendComparison.ts` — out of scope (§13).
- `app/services/tyre_performance/strategy_summary.py` or any `_to_driver_strategy_summary` copy —
  out of scope (§13).

## 13. Explicit Non-Goals

- **Hook consolidation** (`useDriverSeasonPaceTrend`/`useDriverSeasonTyreTrend`/
  `useDriverPaceTrendComparison`/`useDriverTyreTrendComparison`): a real, related duplication, but
  each hook wraps a genuinely different client function with a genuinely different result shape —
  weaker rule-of-three case than `getParam`/`setOrDelete`'s byte-identical bodies, and repeatedly,
  deliberately left separate by M21/M25/M26's own design reviews for that reason. Not resolved
  here — a different milestone's decision, not this one's, and folding it in now would be exactly
  the "scope expands because related duplication exists" the Stage B brief explicitly warns
  against.
- **`_to_driver_strategy_summary` extraction**: unchanged since M21, still 3x duplicated, still
  deliberately deferred every time it's been noticed — no new evidence in this milestone changes
  that conclusion.
- **Comparison-route backend abstraction**: M27 Stage A's own backend audit found `compare_pace_
  trends`/`compare_tyre_trends` are 2 instances (below rule-of-three) and the four comparison
  routes overall don't share enough shape to generalize (session-paired vs. driver/season-paired
  are genuinely different patterns) — no backend change of any kind in this milestone.
- **Documentation reconciliation**: real drift exists (four undocumented milestones), but Stage A
  explicitly ranked it below this milestone's own evidence strength and it remains a distinct,
  separately-scoped kind of work — not bundled in.
- **Any new comparison feature, N-way comparison, or comparison-route UI change**: this milestone
  is a pure consistency/cleanup pass, not a feature addition.

## 14. API / Data / Performance

- No backend or API change of any kind — this is entirely a frontend refactor plus one new Sidebar
  link.
- No schema change, no ingestion, no database write of any kind (read-only Postgres access was used
  only during the Stage A audit, not here).
- No Parquet change.
- No dependency change — no new package, no version bump.
- No meaningful performance impact expected: two tiny pure functions moving from four files into
  one shared module has no runtime cost difference (same functions, same call count, same bundle
  inclusion — if anything, marginally smaller total bundle size from de-duplicated code, not a
  measurable amount worth stating as a benefit).

## 15. Validation Plan (Stage C gates)

- Focused frontend tests: `urlSearchParams.test.ts` (new), `Sidebar.test.tsx` (updated) — run in
  isolation first.
- Full Vitest suite — confirms the four unmodified comparison-page test files still pass unchanged
  after the import swap (the actual regression proof for §9's "no URL-state behavior changes"
  claim).
- `tsc --noEmit` / TypeScript build.
- ESLint.
- Prettier `--check`.
- Production Vite build.
- `git diff --check`.
- Real-browser smoke test covering all four comparison surfaces: build a comparison on each of
  `/laps/compare`, `/stints/compare`, `/drivers/pace-trend/compare`, `/drivers/tyre-trend/compare`;
  confirm URL state, refresh survival, and (for at least one) a fresh-browser-context deep-link
  reproduction — mirroring the exact verification pattern already used in M24/M25/M26's own
  implementation reports.
- Explicit verification that the new "Compare Stints" Sidebar link navigates correctly and seeds
  both `sessionA`/`driverA` as designed (§10).
- **Backend test execution**: not required as a gate — no backend file is touched by this milestone
  (§14) — but running the existing backend suite once as a trivial no-op confirmation costs nothing
  and matches this project's own established "run the full applicable suite" convention from every
  prior milestone's validation report; appropriate to do, not because backend risk exists, but for
  consistency with prior implementation reports' own format.

## 16. Risk Analysis

| Risk | Classification |
|---|---|
| Mechanical extraction introduces a subtle behavioral drift (e.g. a typo in the shared function) | Mitigated — full Vitest suite re-run against all four existing, already-comprehensive page test suites catches any drift immediately; §5's byte-level contract removes any ambiguity about what "correct" means. |
| `setOrDelete`'s widened `string \| null` type masks a future caller passing `undefined` unexpectedly | Non-load-bearing — `if (value)` already treats `undefined` as falsy → delete, the same safe behavior as `null`/`""`; not a behavior change even if it were to happen, and no current call site does. |
| Sidebar gating decision (`driverId` alone, not `driverId && season`) diverges from a literal reading of the Stage B brief's "match the existing pattern" instruction | Accepted, source-justified (§10) — literally copying the trend links' condition would gate on a value the destination page doesn't use; the *intent* of "match the pattern" (gate on what's needed to seed the link meaningfully) is honored, the literal condition is not blindly copied where it doesn't apply. |
| Import-path depth errors across three different feature directories | Mitigated — confirmed all three feature directories sit at the same nesting depth under `features/`, so one relative-path pattern (`../../components/`) applies uniformly; verified by directory structure inspection, not assumed. |

No risk in this milestone is architecturally significant; this is the lowest-risk milestone in the
M20–M27 series by design (pure extraction of already-tested, byte-identical pure functions, plus
one additive navigation link).

## 17. ADR Decision

**No ADR required.** This is the extraction of an already-established local convention
(`src/components/` as the shared-utility location, already used by `teamColor.ts`/
`sessionTypeLabels.ts`) applied to a third case — not a new architectural layer, not a new
dependency, not a provider change, not a reversal of any prior decision. Applying `CLAUDE.md`'s own
ADR trigger list directly: none of the five triggers (new dependency, new architectural layer,
provider change, schema change, major reversal) are met.

## 18. Stage C Acceptance Criteria

- `frontend/src/components/urlSearchParams.ts` exports `getParam`/`setOrDelete` with the exact
  contract in §5/§6.
- All four comparison pages import from it, with zero remaining local `function getParam`/
  `function setOrDelete` declarations anywhere in the four files.
- All four pages' own existing test suites pass **unmodified** (no edits to those four test files).
- `Sidebar.tsx` renders "Compare Stints" gated on `driverId`, seeding `sessionA`/`driverA`, placed
  immediately after "Compare Sessions".
- `Sidebar.test.tsx` has two new passing tests proving the above.
- `urlSearchParams.test.ts` passes, covering the full contract in §11.1.
- Full Vitest suite, `tsc`, ESLint, Prettier, production build, and `git diff --check` all pass.
- Real-browser verification confirms all four comparison surfaces and the new Sidebar link behave
  identically to before, plus the new link's correct navigation.
- No backend, schema, data, dependency, or documentation file is touched.

## Document History

- v1 (this document): M27 Stage B design for the comparison-surface consistency pass.

## Safety Confirmation

Only `docs/m27-design-review.md` (this file, newly created) was created or modified during Stage
B. `docs/m9-design-review.md` remains untouched — byte-identical to its pre-existing baseline diff.
No code, test, schema, or API change was made or is proposed. Nothing has been staged, committed,
or pushed. No backend file, no `Sidebar.tsx`, no comparison page, and no test file was modified
during this Stage B session — only read.

**STOP — awaiting explicit approval before proceeding to Stage C.**
