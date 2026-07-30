# M4 Release Summary — Track Map

**Status:** Complete
**Date:** 2026-07-30
**Milestone definition:** `docs/prd.md` §3

## Milestone goals

Per `docs/prd.md` §3:

> Render track shape from position telemetry, plot a lap's line, mark a point (static, not yet hover-driven).

## What was built

- A new backend endpoint, `GET /sessions/{id}/track`, exposing the track geometry M1's pipeline
  already derives and caches (`track.parquet`) but M2 deliberately left unexposed until a consumer
  existed.
- `TrackMap`, a React component using D3 purely for scale/path math (`d3-scale`'s `scaleLinear`,
  `d3-shape`'s `line()`) — React owns all actual SVG rendering, so the two libraries never fight
  over the DOM. It draws three things: the session's static track outline (from `TrackPoint`s,
  derived from the session's fastest lap per `docs/data-model.md`), the currently selected lap's own
  line (from that lap's `TelemetrySample` x/y positions), and a marker at the lap's start point.
- `TrackMapPage` at a new route, `/sessions/:sessionId/drivers/:driverId/laps/:lapNumber`, fetching
  both the session's track points and the selected lap's telemetry in parallel.
- `LapSelectPage`'s lap list now links to this route (previously, selecting a lap just set Zustand
  state with nothing to render — M3 had nothing to show yet; M4 does).

## Architectural decisions

None. `docs/architecture.md`'s tech stack table already specified D3 + SVG/canvas for the track map
(a decision made in M0, no ADR since it wasn't a contested alternative-vs-alternative choice at the
time). The backend endpoint implements exactly what `docs/api-model.md` deferred at M2 and designed
in detail before this milestone's implementation began.

One implementation-level interpretation worth recording (not an architectural fork): PRD's "mark a
point (static, not yet hover-driven)" is read as marking the lap's start point (its first telemetry
sample by distance) — a reasonable, unambiguous stand-in for what V2's hover-driven cursor will
eventually make interactive, without inventing analysis (like a corner apex) V1 doesn't call for.

## New modules

| Module | Purpose |
|---|---|
| `backend/app/api/track.py` | `GET /sessions/{id}/track` |
| `frontend/src/features/track-map/TrackMap.tsx` | D3-backed SVG track/lap rendering |
| `frontend/src/features/track-map/TrackMapPage.tsx` | Route wiring: fetches track points + lap telemetry |

## Public APIs

| Method | Path | Returns |
|---|---|---|
| GET | `/sessions/{session_id}/track` | `list[TrackPoint]` (404 if session missing, empty list if no points were derived) |

## Testing performed

- Backend: 4 new tests (2 repository, 2 API) covering sorted-by-distance ordering and the
  unknown-session empty-list/404 cases — the fixture cache now also writes `track.parquet`.
- Frontend: 6 new tests. `TrackMap.test.tsx` covers the outline/lap-line/marker rendering and the
  no-geometry message; `TrackMapPage.test.tsx` covers data loading and the error path.
  `LapSelectPage.test.tsx`'s old "selecting a lap records state" test was replaced with a
  link-target assertion, since that responsibility moved to `TrackMapPage`.

## Verification results

| Check | Backend | Frontend |
|---|---|---|
| Lint/format | ruff format + check: pass | eslint + prettier: pass |
| Type check | mypy strict: pass | `tsc -b --noEmit`: pass |
| Tests | pytest: 26/26 | vitest: 18/18 |
| Docker build | pass | pass |

No new dependencies were added in either workspace (D3 was already installed in M0), so no new npm
audit findings.

## Known limitations

- The map is genuinely static: no pan/zoom, no hover, no cursor sync — exactly as scoped (V2 per
  `docs/success-metrics.md`).
- The track outline and the lap line share one fixed 600×400 SVG viewBox with no responsive
  resizing; fine for a single static view, would need revisiting if the layout around it changes.
- If a lap's telemetry is empty (e.g., a lap FastF1 couldn't fully load, per the known limitation
  logged in `docs/releases/m1-summary.md`), the map falls back to showing just the track outline
  with no lap line or marker — silently, not with an explicit "no data for this lap" message.

## Technical debt

None new. No new dependencies, so no new `docs/backlog.md` entries this milestone.

## Next milestone

**M5 — Telemetry channel charts** (`docs/prd.md` §3): speed/throttle/brake/RPM/gear/DRS traces via
ECharts, aligned by distance. First milestone to give `getTelemetry` a second consumer beyond the
track map's x/y line, and the first to use the `echarts` dependency already installed in M0.
