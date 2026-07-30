# ADR-0010: react-router-dom Over TanStack Router for Frontend Routing

**Status:** Accepted
**Date:** 2026-07-30

## Context

M3 (`docs/prd.md` §3) calls for routing as part of the frontend shell: session, driver, and lap
selection each need their own URL so a selection state is shareable/bookmarkable, and so M4+'s
additional views (track map, comparison) have a place to live without retrofitting navigation later.
No routing library had been chosen yet — unlike every other frontend library decision (Zustand,
ECharts), which each got an ADR before use.

## Decision

`react-router-dom`, using its standard `<BrowserRouter>`/`<Routes>`/`<Route>` API (not the newer
data-router API with loaders/actions — the app's data fetching stays in component-level `useEffect`
calls through the typed API client, matching the pattern already established for the health check
in M0/M2).

## Consequences

**Positive:** the most widely recognized routing library for React (same hiring-context rationale as
ADR-0003's React-over-Svelte choice — reviewers pattern-match on it fastest); mature, stable API;
straightforward nested/dynamic routes (`/sessions/:sessionId`, `/sessions/:sessionId/drivers/:driverId`)
map directly onto the session → driver → lap selection flow.

**Negative:** the basic `<Routes>` API doesn't give type-safe route params or built-in data loading
the way TanStack Router does — acceptable for V1's small number of routes; revisit only if the route
tree grows complex enough that untyped `useParams()` becomes a real source of bugs.

## Alternatives Considered

- **TanStack Router:** fully type-safe routes and params, built-in data loading. Rejected for the
  same reason ADR-0003 chose React over Svelte: it's less recognized by reviewers than
  react-router-dom, and this project optimizes for that when the technical difference is otherwise
  small. V1's route tree (three levels, no data loaders needed yet) doesn't need TanStack's stronger
  typing to stay correct.
- **No router, single-page state-driven flow:** simplest option, no new dependency. Rejected because
  PRD §3 explicitly lists routing as an M3 deliverable, and deferring it risks the same "retrofit
  navigation later" cost ADR-0007 (Zustand) already argued against for state management — M4's track
  map and M6's comparison view are much more likely to want their own URL than not.
