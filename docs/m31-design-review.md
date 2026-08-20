# PitWall — M31 Design Review: React Router 6→7 Migration

**Status:** Design review — implementation follows in Stage C.
**Baseline:** M30 complete (`7162a3fa6890ac018e1c8eab5d8813875b7c1888`), frontend dependency remediation shipped (0 findings at the time, prior to this advisory's publication).

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `7162a3fa6890ac018e1c8eab5d8813875b7c1888`, re-verified at the start of this stage.
- `git status --short`: clean, nothing to commit.
- `git diff -- docs/m9-design-review.md`: empty — untouched.
- `git diff --cached`: empty.
- `docs/m31-design-review.md` did not exist before this file was written.
- No `package.json`, `package-lock.json`, source, test, or other doc file has been modified. Every command run this stage was read-only: `npm audit` / `npm audit fix --dry-run` (dry-run, does not write), `npm view`, `curl` against the public npm registry / unpkg CDN / GitHub raw content (public package metadata and `.d.ts` files, no repo interaction), `grep`/`find`/`sed`, and three baseline verification runs that produce no repo changes — `npx vitest run`, `npx tsc -b --noEmit`, `npx eslint .` — each confirmed via `git status --short` (empty) immediately after.

## 2. Problem Statement

Stage A found `npm audit` reports exactly 2 moderate vulnerabilities, both attributable to `react-router`/`react-router-dom`, with no fix available inside the 6.x line — confirmed independently in this stage (§3, §10). `docs/backlog.md` has carried this item since the M1 release audit (2026-07-30); M30 confirmed and left it explicitly deferred as "worth its own future milestone once a React Router 7 migration is deliberately scoped, not a drive-by patch." This stage performs that scoping.

## 3. Exact Current Dependency State

| Package | Declared (`package.json`) | Installed (`package-lock.json` / `node_modules`) |
|---|---|---|
| `react-router-dom` | `^6.30.4` | `6.30.6` |
| `react-router` (transitive) | — | `6.30.6` |
| `@remix-run/router` (transitive) | — | `1.23.4` |
| `react` / `react-dom` | `^18.3.0` | unaffected |

Fresh `npm audit --json` (re-run this stage, matching Stage A's finding exactly — no drift):

| Advisory | Severity | Vulnerable range | Fixed range |
|---|---|---|---|
| GHSA-wrjc-x8rr-h8h6 — open redirect via backslash in `<Link>`/`useNavigate` | moderate | `>=6.0.0 <7.18.0` | `>=7.18.0` |
| GHSA-337j-9hxr-rhxg — arbitrary constructor injection via `deserializeErrors()` in SSR hydration | moderate | `>=6.4.0 <7.18.0` | `>=7.18.0` |

**Installed `6.30.6` (the latest 6.x release) is inside both vulnerable ranges** — confirmed independently of M30's original finding; there is still no 6.x patch.

**Target version determination** — not "latest" chosen blindly, three independent confirmations converge on the same version:
1. Both advisories' fixed range is `>=7.18.0` — the minimum version that resolves either.
2. `npm audit fix --dry-run` (read-only) independently proposes `react-router-dom@7.18.2`.
3. `npm view react-router-dom dist-tags` shows `"latest": "7.18.2"` with **no `v8` published or pre-released** (`dist-tags` has no `next`/`v8`/etc. beyond `7.18.2`) — so "minimum fixed version" and "latest stable" happen to coincide; there is no risk of the target being a moving/unstable pick.

**Target: `react-router-dom@^7.18.2`** (which resolves `react-router@7.18.2` as its sole, exact dependency — confirmed via `npm view react-router-dom@7.18.2 dependencies`). No `@remix-run/router` after the bump: it was collapsed into the `react-router` package itself at v7.0.0 (§9).

`react-router-dom@7.18.2`'s own `peerDependencies`: `react: ">=18"`, `react-dom: ">=18"` — satisfied by the current `^18.3.0` declarations, no React bump needed. `engines.node: ">=20.0.0"` — satisfied by CI/Docker's existing Node 22 pin (unchanged since M30, §9).

## 4. Complete Router API Inventory

Fresh `grep -rn "from \"react-router-dom\""` across `frontend/src` (39 files). Named imports actually used, by symbol:

| Symbol | Used in (source) | Used in (tests) |
|---|---|---|
| `BrowserRouter` | `main.tsx` (1) | — |
| `Routes`, `Route` | `App.tsx` (1) | 15 test files |
| `Link` | `App.tsx`, `DriverSeasonPaceTrendPage.tsx`, `DriverSeasonTyreTrendPage.tsx`, `StrategyPage.tsx`, `DriverSelectPage.tsx`, `EventListPage.tsx`, `LapSelectPage.tsx`, `SessionListForEventPage.tsx`, `StintPacePage.tsx`, `StrategySummaryPanel.tsx`, `SeasonListPage.tsx` (11 files) | — |
| `NavLink` | `Sidebar.tsx` (1) | — |
| `useParams` | 12 source files (`StrategyPage`, `TrackMapPage`, `DriverSelectPage`, `LapSelectPage`, `SessionListForEventPage`, `EventListPage`, `SessionAnalyticsPage`, `StintPacePage`, `TyrePerformancePage`, `DriverSeasonPaceTrendPage`, `DriverSeasonTyreTrendPage`) | — |
| `useSearchParams` | 6 source files (`ComparisonPage`, `StintComparisonPage`, `DriverPaceTrendComparisonPage`, `DriverTyreTrendComparisonPage`, `DriverSeasonPaceTrendPage`, `DriverSeasonTyreTrendPage`) | — |
| `useNavigate` | `LapSelectPage.tsx` (1 file) | `ComparisonPage.test.tsx`, `StintComparisonPage.test.tsx` |
| `useLocation` | **none** (test-only) | `ComparisonPage.test.tsx`, `StintComparisonPage.test.tsx`, `LapSelectPage.test.tsx`, `DriverPaceTrendComparisonPage.test.tsx`, `DriverTyreTrendComparisonPage.test.tsx` (5 files, `LocationProbe` pattern per M24/M25) |
| `useNavigationType` | **none** (test-only) | same 4 comparison-page test files (push-vs-replace assertions) |
| `MemoryRouter` | — | 17 test files (every page test) |
| `createBrowserRouter` / `RouterProvider` | **not used** | **not used** — appears only inside explanatory code comments in `ComparisonPage.test.tsx`/`StintComparisonPage.test.tsx` stating *why* a data router is deliberately not used |
| `Outlet` | not used | not used |
| `Navigate` (component) | not used | not used |
| `future={{...}}` prop | `main.tsx` (1 occurrence) | 17 test files, 26 total occurrences (some files define multiple render helpers, e.g. `App.test.tsx` ×5, `ComparisonPage.test.tsx` ×2) |

No `createMemoryRouter`, no `loader`/`action`, no `Form`/`useFetcher`/`useSubmit`, no route-module type imports (`+types/*`) anywhere in the codebase. Confirms Stage A's/M30's finding: this app uses **only the classic declarative router surface**.

## 5. Route-Tree Analysis

`App.tsx`'s full `<Routes>` tree (read in full) is **16 flat, sibling `<Route>` elements** — zero nesting (no `<Route>` contains a child `<Route>`), zero wildcard/splat (`*`) paths, zero `index` routes. Every path is either static (`/laps/compare`) or uses named colon-params (`/sessions/:sessionId/drivers/:driverId/laps/:lapNumber`). Every path string is unaffected by any v7 change: v7's only path-matching behavior change (`v7_relativeSplatPath`, §9) exclusively concerns splat routes and relative-link resolution *within* a splat route's subtree — neither exists in this app, so it has zero effect here regardless of the flag's now-default status.

**Confirmed:**
- Route paths remain byte-for-byte identical — no change required or possible (v7 uses the same path-pattern syntax as v6).
- No nested routes exist to preserve/break.
- No wildcard routes exist to preserve/break.
- Parameter routes (`:sessionId` etc.) — syntax and `useParams()` return shape unchanged (§7).
- Navigation behavior (`Link`/`NavLink`/`useNavigate`) — unchanged at the component-prop and hook-signature level (§7, §8).
- **No data-router migration is required or proposed** — confirmed no `createBrowserRouter`/`RouterProvider` usage exists to migrate away from, and none will be introduced (§12, §14 non-goals).

## 6. URL-State Contract (load-bearing)

Read `urlSearchParams.ts` (M27 extraction) in full: `getParam`/`setOrDelete` operate exclusively on the standard `URLSearchParams` Web API type — **zero import from `react-router-dom`**, by the M27 design's own explicit choice (documented in the file's own header comment). This helper, and therefore every one of its four consumer pages' empty-value normalization (`"" → null`) and unrelated-param preservation (mutate-in-place on the existing `URLSearchParams` object, never reconstructing it), is **entirely unaffected by the router version**.

Read every `setSearchParams(...)` call site across `ComparisonPage.tsx`, `StintComparisonPage.tsx`, `DriverPaceTrendComparisonPage.tsx`, `DriverTyreTrendComparisonPage.tsx`, `DriverSeasonPaceTrendPage.tsx`, `DriverSeasonTyreTrendPage.tsx` (14 call sites total): all use the function-updater form, `setSearchParams((params) => { ...; return params }, { replace: true })`.

Fetched `react-router@7.18.2`'s actual shipped type declarations (`unpkg.com`, not memory) and confirmed byte-for-byte:
```ts
declare function useSearchParams(defaultInit?: URLSearchParamsInit): [URLSearchParams, SetURLSearchParams];
type SetURLSearchParams = (nextInit?: URLSearchParamsInit | ((prev: URLSearchParams) => URLSearchParamsInit), navigateOpts?: NavigateOptions) => void;
interface NavigateOptions {
  replace?: boolean;
  // ...mask, state, preventScrollReset, relative, flushSync, viewTransition, etc.
}
```
**Identical shape to what every call site already uses** — the function-updater form and `{ replace: true }` are both still present, unrenamed, unchanged in meaning. `replace: true` still means "replace the current history entry" (doc comment: *"Replace the current entry in the history stack instead of pushing a new one"*) — same semantics M24 designed against.

**Verified, all preserved with zero source change:**
- Existing query-parameter names (`sessionA`/`driverA`/`lapA`/`sessionB`/`driverB`/`lapB` etc.) — untouched, these are app-defined strings, not router API.
- Empty-value normalization (`getParam`) — untouched, plain `URLSearchParams.get()`.
- Unrelated query-param preservation — untouched, `setOrDelete` mutates the existing `params` object in place; the updater-function form still receives the *current* `URLSearchParams`, unchanged in v7.
- Replace-vs-push semantics — `NavigateOptions.replace` unchanged.
- Refresh/deep-link reproduction — governed by the URL itself plus `useSearchParams`'s initial read, both unaffected by router version.
- Back/Forward behavior — delegated to the browser's native History API by `BrowserRouter` in both v6 and v7; not a router-version-specific mechanism.
- Search-param encoding/decoding — delegated to the native `URLSearchParams` constructor in both versions, not reimplemented by react-router in either.

**No redesign proposed or needed anywhere in this section**, per the task's explicit instruction.

## 7. Navigation / Active-State Behavior

Read `Sidebar.tsx` in full: 9 `NavLink` usages, all using the function-`className` form: `className={({ isActive }: { isActive: boolean }) => isActive ? ... : ...}`, several with the boolean `end` prop.

Fetched `NavLinkProps`/`NavLinkRenderProps` from `react-router@7.18.2`'s shipped types:
```ts
interface NavLinkProps extends Omit<LinkProps, "className" | "style" | "children"> {
  children?: React.ReactNode | ((props: NavLinkRenderProps) => React.ReactNode);
  caseSensitive?: boolean;
  className?: string | ((props: NavLinkRenderProps) => string | undefined);
  end?: boolean;
  // ...
}
// NavLinkRenderProps: { isActive: boolean; isPending: boolean; isTransitioning: boolean }
```
`end` and the function-`className` form with `{ isActive }` are both present, unrenamed. **No Sidebar.tsx call site requires a source change.**

- **Active matching**: unchanged algorithm (path-segment prefix matching, `end` restricts to exact match) — not touched by any v7 future-flag default change (those only affect splat-route relative resolution, §5).
- **Relative links**: no relative `to=` values exist in this codebase (every `Link`/`NavLink to=` is grep-confirmed to be an absolute, `/`-rooted template string built from app-owned IDs) — `v7_relativeSplatPath`'s behavior change is scoped to splat routes and relative paths, neither of which this app uses, so it has no observable effect here.
- **Trailing-slash behavior**: no route or link in this codebase has a trailing slash; not exercised either way.
- **Navigation history semantics**: delegated to the browser History API via `BrowserRouter`, unchanged (§6).

**The one real navigation-surface change**, found by inspecting the actual shipped v7.18.2 type declarations rather than assuming API stability: `BrowserRouterProps`/`MemoryRouterProps` **no longer declare a `future` prop at all**. It has been replaced with a single `useTransitions?: boolean`:
```ts
interface BrowserRouterProps {
  basename?: string;
  children?: React.ReactNode;
  useTransitions?: boolean; // replaces the v6.28+ "future" flag object for declarative routers
  window?: Window;
}
```
Doc comment on `useTransitions`: *"When left `undefined`, all router state updates are wrapped in `React.startTransition`"* — i.e., **the default in 7.18.2 is unconditionally what `future={{ v7_startTransition: true }}` explicitly opted into in v6.30.6.** `v7_relativeSplatPath` has no surviving prop at all in 7.18.2 — it is permanently default behavior with no opt-out, consistent with §5's finding that it doesn't apply to this app anyway.

**Practical consequence**: `main.tsx` and all 17 test files currently pass `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to `BrowserRouter`/`MemoryRouter` (26 occurrences total, §4). Under 7.18.2's actual type declarations, `future` is not a recognized prop on either component — passing it produces a TypeScript excess-property error (`Object literal may only specify known properties, and 'future' does not exist in type '...RouterProps'`). **This prop must be removed** at all 18 sites. This is a **required, mechanical, zero-behavior-change edit**: the app already runs today, in production and in every test, under exactly the behavior 7.18.2 makes unconditional — removing the now-invalid prop changes nothing observable, only removes dead/rejected syntax.

## 8. Hooks and API Compatibility

`react-router-dom`'s entire public surface is a re-export (`export * from 'react-router'`, confirmed by fetching the actual shipped `dist/index.d.ts` for `react-router-dom@7.18.2` — not assumed). Checked each hook against the shipped `.d.ts`:

| Hook | Source-compatible? | Notes |
|---|---|---|
| `useSearchParams` | Yes, no change | Signature identical, confirmed §6 |
| `useNavigate` | Yes, no change | `NavigateFunction` signature and `NavigateOptions` shape unchanged (§6); CHANGELOG's only note is that `useNavigate()`'s *returned promise* is now exposed for v7's React-19-oriented data-router APIs — irrelevant here since this app never awaits `navigate()`'s return value (confirmed: `LapSelectPage.tsx`'s call site doesn't use the return value) |
| `useLocation` | Yes, no change | `Location` shape unchanged; used only in tests (`LocationProbe` pattern) |
| `useParams` | Yes, no change | Generic-typed record return, unchanged |
| `useNavigationType` | Yes, no change | `NavigationType` enum (`"POP"`/`"PUSH"`/`"REPLACE"`) unchanged, used only in tests to assert push-vs-replace |

**No behavioral change required for any hook call site.** The only required change across the entire hooks/components surface is the `future`-prop removal (§7).

## 9. Tests

- **`MemoryRouter` remains valid** — same import, same `initialEntries`/`initialIndex`/`children` props; only the invalid `future` prop needs removing (same fix as `BrowserRouter`, §7).
- **Existing render helpers remain valid structurally** — every test file's local `renderAt`/`renderWithProbe`-style helper needs exactly one edit: delete the `future={{...}}` prop from its `<MemoryRouter>` JSX. No helper needs restructuring.
- **`LocationProbe` pattern** (`useLocation`/`useNavigationType`, established M24/M25 for verifying replace-vs-push) remains fully valid — both hooks unchanged (§8).
- **No v6-specific test API needs replacing** beyond the prop removal — no test imports `createMemoryRouter`, no test uses any data-router testing utility.
- **No additional test is genuinely required.** The existing 549-test suite (fresh baseline run this stage, §13) already exercises every router-touching page, including the exact `LocationProbe` replace/push assertions this migration must not regress. Since the only change is a mechanical, zero-behavior-change prop deletion, no new test scenario is introduced for it to cover — consistent with this project's own established convention (M29 §7: "per the Stage A/B brief's own instruction not to add coverage the existing tests already prove").

## 10. TypeScript Compatibility

`frontend/tsconfig.app.json`'s `"moduleResolution": "bundler"` is the resolution strategy that correctly follows a package's `exports` map (confirmed against `react-router-dom@7.18.2`'s actual `package.json`, which declares conditional `types`/`import`/`default`/`node` entries) — no `tsconfig` change is needed for the package itself to resolve correctly.

**One and only one guaranteed compile error identified** if the package were bumped without any source change: the `future` prop on all 18 `BrowserRouter`/`MemoryRouter` call sites (§7) — TypeScript's excess-property check on object literals rejects an unknown key on a typed JSX prop. This is captured fully in §7/§12's required-change list; no other type error is anticipated, since every other used symbol's signature was checked directly against the shipped `.d.ts` (§6, §8) and found unchanged. `strict`, `noUnusedLocals`, `noUnusedParameters` are not expected to newly trigger elsewhere: the fix is a prop deletion inside existing JSX, not an import or variable change.

## 11. Build/Tooling Interaction

- **Vite 6.4.3 / Vitest 3.2.7 / `@vitejs/plugin-react` 4.7.0** (all M30-current): `react-router-dom@7.18.2` ships both `dist/index.js` (CJS) and `dist/index.mjs` (ESM) with a standard conditional `exports` map — the same dual-format pattern every other dependency in this project's tree already uses; Vite's dev-server/bundler resolution requires no special handling for it.
- **Peer/engine requirements** (§3): `react`/`react-dom >=18` and `node >=20.0.0` are both already satisfied by the current toolchain (`^18.3.0`, Node 22 pinned in CI/Docker since before M30) — no cascading bump required.
- **No `vite.config.ts` change identified.** The file (read in full) contains only `plugins: [react()]`, a dev-server port, and the `test` block — nothing router-specific. Mirrors M30's own finding for its Vite bump: no config in this file interacts with the dependency being upgraded.
- No other dependency is touched, checked, or implicated by this change.

## 12. Migration Risk Assessment

**Mechanical (no judgment required, one repeated pattern):**
- `frontend/package.json`: `"react-router-dom": "^6.30.4"` → `"^7.18.2"`.
- `frontend/package-lock.json`: regenerated lockfile reflecting the above (removes `@remix-run/router` as a separate transitive entry, per §3/§9 — it's absorbed into `react-router` itself at v7.0.0).
- Remove the `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` prop from `main.tsx` and all 17 test files (26 occurrences total, exact list in §4) — a no-op behaviorally (§7), required only because the prop no longer type-checks.

**Required semantic verification (not a code change, but must be confirmed, not assumed):**
- Confirm the full test suite and a manual smoke pass behave identically once every router state update is unconditionally wrapped in `React.startTransition` — low risk specifically *because* this is not a new condition being introduced: the app has run this way in production and in every test since whenever the `future` flags were adopted pre-M31 (both `main.tsx` and every test file already had them set), so v7.18.2's default merely removes the now-redundant opt-in syntax rather than changing runtime behavior.

**Optional v7 modernization — explicitly OUT OF SCOPE, none of it entered this design:**
- No `createBrowserRouter`/`RouterProvider`/data router adoption.
- No `loader`/`action`/`Form`/fetcher usage.
- No route-module type-safety codegen (`+types/*` imports) — a v7 framework-mode feature this app's plain Vite SPA setup doesn't use.
- No explicit `useTransitions` prop addition — leaving it unset preserves the exact current default behavior; setting it to anything would be an unrequested behavior change.
- No adoption of `react-router`'s new v8-oriented `FutureConfig` flags (`v8_passThroughRequests`, `v8_trailingSlashAwareDataRequests`, `v8_middleware`) surfaced while inspecting the shipped types (§7) — these belong to a future v8 migration, not this one, and are not referenced anywhere in this design.

## 13. Scope Decision — Atomic Single-Step Migration

**The migration can and should be atomic**, not phased. Evidence, contrasted directly with why M30's dependency work *did* need staged groups:
- M30 staged three *unrelated* dependency chains (patch-only fixes / vite+vitest+plugin-react / echarts) because each had independent failure modes and no shared root cause.
- This migration is **one package**, changed for **one reason**, producing **one class of required edit** (the `future`-prop removal, repeated identically at all 18 sites) — there is no second, independent risk surface to isolate a failure to.
- Every hook and component signature this app actually uses was checked directly against the real shipped v7.18.2 types and found unchanged (§6–§8); the route tree has no nesting, no splat, no data router to migrate (§5); the URL-state contract is verified byte-for-byte unaffected (§6).
- The existing 549-test suite already exercises every one of the 18 affected files.

**No phased structure is proposed.** A single coordinated change — `package.json`/`package-lock.json` bump plus the 18-file prop removal — lands and validates together in one Stage C pass.

## 14. Approved Implementation Scope (Stage C)

**Definitely required:**
- `frontend/package.json` — `react-router-dom` `^6.30.4` → `^7.18.2`.
- `frontend/package-lock.json` — regenerated lockfile.
- `frontend/src/main.tsx` — remove the `future={{...}}` prop from `<BrowserRouter>`.
- 17 test files — remove the `future={{...}}` prop from each `<MemoryRouter>` usage (26 occurrences total; exact file list in §4/§7): `App.test.tsx`, `components/Sidebar.test.tsx`, `features/lap-comparison/ComparisonPage.test.tsx`, `features/race-context/StrategyPage.test.tsx`, `features/track-map/TrackMapPage.test.tsx`, `features/session-select/SeasonListPage.test.tsx`, `features/session-select/LapSelectPage.test.tsx`, `features/session-select/SessionListForEventPage.test.tsx`, `features/session-select/EventListPage.test.tsx`, `features/stint-comparison/StintComparisonPage.test.tsx`, `features/session-select/DriverSelectPage.test.tsx`, `features/tyre-performance/StintPacePage.test.tsx`, `features/tyre-performance/TyrePerformancePage.test.tsx`, `features/driver-trends/DriverSeasonPaceTrendPage.test.tsx`, `features/driver-trends/DriverTyreTrendComparisonPage.test.tsx`, `features/driver-trends/DriverSeasonTyreTrendPage.test.tsx`, `features/driver-trends/DriverPaceTrendComparisonPage.test.tsx`.

**Conditionally required, only if Stage C's actual validation surfaces something this design didn't predict:**
- Any other source file touching `react-router-dom`, *only if* `tsc -b`/`vitest run` reveals a type or behavior mismatch this investigation's direct `.d.ts` inspection missed. Not expected — every used symbol was checked directly (§6–§8).

**Explicitly forbidden / out of scope:**
- Any `createBrowserRouter`/`RouterProvider`/data-router adoption (§12).
- Any `loader`/`action`/`Form`/fetcher usage (§12).
- Any route path, URL query-param name, or comparison-page behavior change (§6).
- Any `useTransitions` prop addition (§12).
- Any backend, pipeline, or data/schema file.
- Any other dependency version change (`vite`, `vitest`, `@vitejs/plugin-react`, `echarts`, `eslint` all stay exactly at their M30-landed versions).
- `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/api-model.md`, `docs/architecture.md` — no product-facing capability changes here; if any of these need a one-line mention, that belongs to the same deferred documentation-reconciliation pass M29/M30 already named, not this milestone.
- `docs/backlog.md` — not edited in Stage B; resolution recorded only after Stage C's implementation is verified (§16).

## 15. Validation Plan (Stage C)

In order:
1. `npm audit` — expect **0 findings** (down from 2; §3, §16).
2. `npx vitest run` — full existing suite, expect **549 passed** (fresh baseline confirmed this stage, §1) — no test added or removed by this migration.
3. `npx tsc -b --noEmit` — must stay clean (fresh baseline this stage: clean).
4. `npx eslint .` — must stay clean (fresh baseline this stage: clean).
5. `npm run build` (`tsc -b && vite build`) — not currently run in CI (same gap M30 §11 already found); Stage C must run it manually as the most direct signal for any production-bundling regression unit tests can't see.
6. Backend regression: **not needed** — this milestone touches zero backend files and zero API contracts.
7. Browser/manual smoke test (Stage C only — **not performed in this Stage B investigation**, no browser tooling was used here): app boot (`/`), one full Season→Event→Session→Driver→Lap navigation, Sidebar active-link highlighting at each depth, one comparison page's picker interactions confirming the URL updates via `replace` (M24 contract) and that browser Back after a `replace`-based update does *not* land on the pre-update URL (the same distinction the `LocationProbe` tests assert, now confirmed live in a real browser).

## 16. Documentation Decision

Per explicit instruction, `docs/backlog.md` is **not edited in Stage B**. Recording the decision for Stage C: once Stage C's implementation lands and `npm audit` is independently reconfirmed at 0 findings, the backlog's `react-router`/`react-router-dom` line (under "Security / dependencies") can be considered resolved and removed, following this project's own standing convention ("Items are removed once fixed, not marked done"). That edit is scoped to Stage C (or, if preferred, folded into the still-separately-deferred M28-style documentation reconciliation pass) — not performed now.

## 17. Risks

- **Highest-risk item, and it's a small one**: the 18-file `future`-prop removal is mechanical but touches every router-rendering test file — a single missed occurrence (e.g., if a 19th call site exists that this stage's grep didn't catch) would surface immediately as a `tsc -b` failure, not a silent runtime bug, since it's a type-level rejection.
- **Startup-behavior risk is low, not zero**: although the app already runs today under the exact behavior v7.18.2 defaults to (§7, §12), the *mechanism* by which that behavior is reached changes (an explicit opt-in flag object vs. an implicit default) — Stage C's browser smoke test (§15.7) is the concrete check that this is truly a no-op in practice, not just on paper.
- **Lockfile regeneration risk**: a fresh `npm install` after the `package.json` edit could, in principle, pick up an unrelated transitive update if any other dependency's range has moved since M30 — Stage C's `npm audit`/test/build gates (§15) would catch this as a distinct, attributable failure, not a silent one.
- **Rollback strategy**: since Stage C's baseline is the current, clean `HEAD == origin/main` with nothing staged, a failed validation at any point rolls back with `git checkout -- frontend/package.json frontend/package-lock.json frontend/src/main.tsx <any touched test file>` plus `npm install` to restore the pre-upgrade lockfile state — no commit will exist yet, so no revert/history rewrite is ever needed.

## 18. Decision / Rationale

Proceed with the single-step migration scoped in §14: bump `react-router-dom` to `^7.18.2` and remove the now-invalid `future` prop at its 18 call sites. This is the smallest change that satisfies the stopping condition in §10 of the Stage B brief — both current `npm audit` findings resolved, zero findings remaining attributable to this dependency — while changing no route, no URL contract, no navigation behavior, and no other dependency. Every hook, component prop, and URL-state mechanism this app actually uses was checked directly against the real shipped v7.18.2 type declarations rather than assumed from general v7 knowledge; the one required source change was discovered exactly this way (§7) and would have been missed by a purely changelog-level read.

## 19. Deferred Follow-Up

- `docs/backlog.md` resolution line-item removal — Stage C, after verified (§16).
- The still-outstanding M28-style documentation reconciliation (README/CHANGELOG/`docs/prd.md`/`docs/api-model.md`/`docs/architecture.md` through M28–M31) — unrelated to this migration, already identified and deliberately deferred by M29 §8 and M30 §12; not addressed here.
- Any future React Router v8 migration (package split reversal, `v8_*` flags) — out of scope entirely; not evidenced as needed by anything in this codebase today (§12).

---

**STOP — awaiting explicit approval before Stage C.**
