# M3 Release Summary — Frontend Shell

**Status:** Complete
**Date:** 2026-07-30
**Milestone definition:** `docs/prd.md` §3

## Milestone goals

Per `docs/prd.md` §3:

> React+TS app scaffold, typed API client, session/driver/lap selectors, routing.

The React+TS scaffold itself was already in place from M0; M3's real work was extending the typed
client to cover M2's endpoints and building the session → driver → lap selection flow as real,
navigable routes.

## What was built

- A routing decision and ADR (ADR-0010: `react-router-dom` over TanStack Router) — the one piece of
  M3's scope with no prior architectural decision recorded, unlike every other frontend library
  choice.
- Three routes covering the selection flow: `/` (session list), `/sessions/:sessionId` (driver
  list), `/sessions/:sessionId/drivers/:driverId` (lap list).
- Full typed API client coverage for M2's endpoints, refactored around a shared `getJson<T>` helper
  instead of repeating the same fetch/error-check logic per function.
- `SessionListPage`, `DriverSelectPage`, `LapSelectPage` under `features/session-select/` (the
  layout `docs/architecture.md` already planned for this flow) — each fetches via the typed client,
  handles loading/empty/error states, and records the user's choice in the existing `selectionStore`
  as they navigate.

## Architectural decisions

**ADR-0010** — `react-router-dom` chosen over TanStack Router and over deferring routing entirely,
using the standard `<Routes>`/`<Route>` API rather than the newer data-router/loader API (data
fetching stays in component `useEffect`s, matching the pattern already established for the M0/M2
health check). See the ADR for the full alternatives analysis.

## New modules

| Module | Purpose |
|---|---|
| `src/features/session-select/SessionListPage.tsx` | Root route: lists ingested sessions |
| `src/features/session-select/DriverSelectPage.tsx` | Lists a session's drivers |
| `src/features/session-select/LapSelectPage.tsx` | Lists a driver's laps, records the selection |

`src/api/client.ts` was extended, not replaced — `getHealth()` keeps its existing signature.

## Public APIs

No backend changes. The frontend now *consumes* all five of M2's endpoints via typed functions
(`listSessions`, `getSession`, `listDrivers`, `listLaps`, `getTelemetry`), though the UI only
exercises the first three so far — `getTelemetry` has no caller until M5 builds the channel charts.

## Testing performed

12 tests across 4 files, all mocking the typed client via `vi.spyOn` — no real network calls:

- `App.test.tsx` — disclaimer, backend online/offline, root-route session display. Also fixes a
  pre-existing `act()` warning by awaiting the health-check effect before asserting.
- `SessionListPage.test.tsx` — session list rendering, empty state, error state.
- `DriverSelectPage.test.tsx` — driver list rendering (via `MemoryRouter` + route params), records
  the selected session in `selectionStore`, error state.
- `LapSelectPage.test.tsx` — lap list rendering, records the selected driver, lap selection updates
  `selectionStore` and the UI, error state.

## Verification results

| Check | Result |
|---|---|
| `eslint` | Pass |
| `prettier --check` | Pass |
| `tsc -b --noEmit` | Pass |
| `vitest run` | Pass — 12/12, no warnings (fixed the pre-existing `act()` warning and the React Router v7 future-flag warnings introduced by adding the router) |
| `docker build` (frontend) | Pass |

## Known limitations

- Selecting a lap doesn't navigate anywhere further or render anything beyond a confirmation line —
  there's nothing to show yet until M4 (track map) and M5 (telemetry charts) exist.
- No URL-based deep-linking test beyond route-param passing; manual verification of
  back/forward-button behavior wasn't performed (no user-facing regression risk yet, since every
  route is read-only navigation with no forms or mutations).

## Technical debt

Two new frontend runtime dependencies (`react-router`, `react-router-dom`) added two more moderate
`npm audit` findings (open redirect via `<Link>`/`useNavigate`, and an SSR-hydration issue that
doesn't apply to this client-rendered SPA) — added to the existing dependency-upgrade item in
`docs/backlog.md` rather than fixed now (fixing requires react-router-dom v7, a breaking change,
bundled with the other pending major-version bumps).

## Next milestone

**M4 — Track map** (`docs/prd.md` §3): render track shape from position telemetry, plot a lap's
line, mark a point (static, not yet hover-driven). First milestone to actually call `getTelemetry`
and to introduce the D3 + SVG/canvas track-map component the tech stack table already anticipates.
