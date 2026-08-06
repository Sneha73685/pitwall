# PitWall — M9 Design Note: Professional Telemetry UI

**Status:** Design note — implementation follows immediately (small, presentational scope)
**Baseline:** M8 complete (session analytics, backend + frontend + tests all merged)

## Problem statement

The frontend is functionally complete through M8 but entirely unstyled: zero CSS files, zero `className` usage anywhere in `frontend/src`. Every page is plain semantic HTML. This note records the small set of architectural decisions needed before restyling the whole app, so they don't get made ad hoc file-by-file.

## Scope

Purely presentational. No routing, data model, or backend changes. No new API endpoints. No refactor of existing fetch/state logic — only JSX wrapper/`className` additions, plus one net-new chart (driver ranking, session analytics dashboard — uses data already fetched by `useSessionAnalytics`, zero new calls).

## Decisions

1. **Styling = CSS Modules + a shared `frontend/src/styles/tokens.css`.** Vite has built-in CSS Modules support (`*.module.css`), so this adds zero new dependencies — no Tailwind, no CSS-in-JS. Consistent with the project's existing minimal-dependency posture (only `zustand`/`echarts`/`d3-scale`/`d3-shape` exist as UI-adjacent deps today, each added because nothing simpler covered the need).
2. **No new ADR.** Per CLAUDE.md's Definition of Done, an ADR is required for "a new dependency, a new layer boundary, or a reversal of a prior decision." CSS Modules is none of those — it's a convention, not a dependency or architectural boundary. This design note satisfies "design before code" instead.
3. **Team colors are procedurally generated, not real liveries.** CLAUDE.md explicitly forbids "official logos, liveries, or broadcast graphics" in this repo. Driver/team cards get a deterministic hash of `team_name` → HSL color instead of hardcoded real team colors — same visual utility (consistent, distinct per-team accents) without reproducing brand identity.
4. **Fields the UI can't show because the data doesn't exist, and won't be fabricated:** tire compound (explicitly dropped from the M8 schema — see comment in `backend/app/models/session_analytics.py`), driver finishing position, telemetry steering channel, per-corner numeric gain/loss (only 3-sector deltas exist; the existing segment-colored track map already covers this visually — see M6 design §13, corner-level was explicitly deferred). A session-wide "braking events" KPI is also skipped: that stat is only available per-lap, per-driver (`DriverLapsResponse`, fetched on demand in drill-down) — surfacing it session-wide up front would mean an N+1 fetch per driver.
5. **Shared UI primitives live in `frontend/src/components/`** (already exists, empty) — this is the documented home for cross-feature UI per `docs/architecture.md`, as opposed to `features/<name>/` for feature-specific pieces.
6. **No new Zustand store state.** Per ADR-0007, stores are scoped by concern; nothing UI-only gets added to `selectionStore`/`comparisonStore`. Any sidebar/nav UI state that's needed stays local component state.

## Non-goals (explicitly out of scope, deferred per PRD)

Cursor-sync hover (V2), tire strategy/pit stops/weather (V3), >2-driver comparison (out of V1 scope), live/real-time data, user accounts, a dedicated native mobile layout. Basic responsive breakpoints for the existing web app ARE in scope.
