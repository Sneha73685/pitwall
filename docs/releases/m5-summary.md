# M5 Release Summary — Telemetry Channel Charts

**Status:** Complete
**Date:** 2026-07-31
**Milestone definition:** `docs/prd.md` §3

## Milestone goals

Per `docs/prd.md` §3:

> Speed/throttle/brake/RPM/gear/DRS traces via ECharts, aligned by distance.

## What was built

- `TelemetryCharts` (`frontend/src/features/telemetry-charts/TelemetryCharts.tsx`): one ECharts
  instance with a stacked grid per channel — Speed, Throttle, Brake, RPM, Gear, DRS, in that order —
  all sharing a `distance_m` x-axis, per ADR-0008's "modular/tree-shaken component imports" decision
  (`echarts/core` + `echarts/charts`/`components`/`renderers` subpath imports, not the full bundle).
  Discrete channels (Brake, Gear, DRS) render as a step trace; continuous ones (Speed, Throttle, RPM)
  as an interpolated line.
- `buildChartOption` (`frontend/src/features/telemetry-charts/chartOptions.ts`): a pure function
  mapping a lap's `TelemetrySample[]` to the ECharts option above, kept in its own module (not the
  component file) so it's directly unit-testable and so the component file only exports the
  component itself (avoids an `eslint-plugin-react-refresh` warning about mixed exports).
- `TrackMapPage` now renders `TelemetryCharts` under the M4 track map, passing it the same
  `lapPoints` (`TelemetrySample[]`) the track map already fetches — no new API call, per
  `docs/releases/m4-summary.md`'s "next milestone" note that M5 would be `getTelemetry`'s second
  consumer.

## Architectural decisions

None new. ADR-0008 already chose ECharts and specified modular imports; M5 implements exactly that,
against the `GET /sessions/{id}/telemetry` endpoint M2 already exposed. No new dependency, no new
backend endpoint, no new ADR.

One implementation-level choice worth recording (not an architectural fork): channels are laid out
as six grids in a *single* ECharts instance rather than six separate chart instances. This isn't
required for V1 (which explicitly excludes cross-chart cursor sync — that's V2, see
`docs/success-metrics.md`), but a single instance is the natural substrate for V2's
`echarts.connect()`/`axisPointer.link` later, and today it deliberately does *not* call either — so
each channel's tooltip is independent, matching V1's "static, not yet interactive" scope.

## New modules

| Module | Purpose |
|---|---|
| `frontend/src/features/telemetry-charts/TelemetryCharts.tsx` | ECharts-backed multi-channel telemetry component |
| `frontend/src/features/telemetry-charts/chartOptions.ts` | Pure `TelemetrySample[]` → ECharts option mapping |

## Public APIs

None added. M5 is a frontend-only milestone — it consumes the existing
`GET /sessions/{id}/telemetry?driver_id=&lap_number=` endpoint from M2 (`docs/api-model.md`), which
already returned every field (`speed_kph`, `throttle_pct`, `brake_active`, `rpm`, `gear`,
`drs_active`) M5 needed.

## Testing performed

- Frontend: 11 new tests. `chartOptions.test.ts` (5 tests) covers channel ordering, distance
  pairing, boolean→0/1 mapping for Brake/DRS, step vs. line interpolation per channel, and the
  empty-samples case. `TelemetryCharts.test.tsx` (6 tests) mocks `echarts/core`'s `init`/`use` to
  verify the component initializes one chart instance, applies options built from its `samples`
  prop, re-applies options on prop changes without re-initializing, disposes on unmount, and
  toggles between the chart and a "no telemetry data" message without unmounting the chart
  container (so a later lap with data can reuse the same instance).
- `TrackMapPage.test.tsx` gained a test asserting the fetched telemetry is passed through to
  `TelemetryCharts` (mocked as a stub there — its own behavior is covered by its dedicated suite).

## Verification results

| Check | Backend | Pipeline | Frontend |
|---|---|---|---|
| Lint/format | ruff format + check: pass (no changes) | ruff format + check: pass (no changes) | eslint + prettier: pass |
| Type check | mypy strict: pass (no changes) | mypy strict: pass (no changes) | `tsc -b --noEmit`: pass |
| Tests | pytest: 26/26 (no changes) | pytest: 19/19 (no changes) | vitest: 30/30 |
| Docker build | pass (`--no-cache`) | pass (`--no-cache`, `--profile tools`) | pass (`--no-cache`) |

Docker runtime verification: `docker compose up` — both containers started, stayed up, no
import/module errors in logs. Verified via `curl` (`/health`, `/sessions`) and a real headless
Chromium (Playwright) walkthrough of `/sessions/:sessionId/drivers/:driverId/laps/:lapNumber` against
fixture-seeded session data: track map renders, the telemetry charts container renders a `<canvas>`
with all 6 channels visible and populated, and zero browser console/page errors were observed.

Backend and frontend host ports were temporarily remapped for this verification only (another,
unrelated project already held `8000`/`5173` on the verification machine) via a local, uncommitted
edit to `docker-compose.yml` and a temporary CORS-origin addition in `backend/app/main.py`; both
were reverted (`git checkout`) immediately after, and the repository's actual port configuration is
unchanged from M4.

## Known limitations

- No hover-driven cursor, no cross-chart or track-map-marker synchronization — exactly as scoped
  (V2 per `docs/success-metrics.md`). Each channel's ECharts tooltip is independent.
- Fixed 720px total chart height with no responsive resizing beyond a window-resize listener calling
  `chart.resize()` — matches the track map's existing fixed-viewBox limitation (`m4-summary.md`).
- If a lap's telemetry is empty (the known FastF1 partial-load limitation logged in
  `m1-summary.md`), `TelemetryCharts` shows a "No telemetry data available for this lap" message
  instead of an empty chart — an explicit message, unlike the track map's silent fallback for the
  same underlying condition.

## Technical debt

None new. No new dependencies (ECharts was already installed in M0); no new `docs/backlog.md`
entries this milestone.

## Next milestone

**M6 — Lap/sector comparison + delta graph** (`docs/prd.md` §3): two-lap overlay, sector time table,
cumulative delta computation and chart. Likely the first milestone needing new backend logic (delta
computation isn't just a read of existing Parquet columns), and the first frontend view comparing
two `getTelemetry` calls side by side rather than one.
