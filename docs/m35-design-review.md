# PitWall — M35 Design Review: Lap-by-Lap Position / Running-Order Chart

**Status:** Complete — Stage C implemented and validated; awaiting explicit approval for commit/push.
**Baseline:** M34 complete (`a818c61e3244775132440d5330e7ee56b88ff249`), session race classification shipped.

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `a818c61e3244775132440d5330e7ee56b88ff249`, re-verified at the start of this stage.
- `git status --short --branch`: clean, tracking `origin/main`, nothing else.
- `git diff --cached --stat`: empty.
- `docs/m35-design-review.md` did not exist before this file was written.
- No source, test, dependency, data, or other documentation file has been modified. Every command run this stage was read-only: `grep`/`find`/`sed`, and local, no-network Python introspection of the already-installed `fastf1` package (`inspect.getsource`, reading `core.py` directly) — no FastF1 session was loaded, no network call was made, no Parquet or Postgres write occurred.

## 2. Stage A Recommendation vs. What This Stage Actually Found

Stage A recommended: add `Lap.position`, "thread it through the existing backend `DriverLapMetrics`/session-analytics aggregation path," and build `PositionTrendChart` "using the existing `LapTimeTrendChart`/`lapTimeTrendChartOptions` architecture as the concrete precedent." **Both of those specific mechanisms turned out to be wrong once inspected directly, and this stage corrects them — this is the main substantive work Stage B did.**

- **`LapTimeTrendChart` is a single-driver chart.** Read directly: `LapTimeTrendChart.tsx`'s props are `{ laps: DriverLapMetrics[] }` for **one** driver, rendered inside `DriverDrillDown` (a per-driver panel that only appears after a row is clicked in `DriverSummaryTable`), fed by the per-driver route `GET /sessions/{id}/analytics/drivers/{driver}/laps`. A position chart built this way would show one lone line per driver-at-a-time — it would not deliver the actual product value of a running-order chart, which is seeing every driver's line together.
- **The full-grid route's response, `DriverSummary`, does not nest `DriverLapMetrics` at all.** `GET /sessions/{id}/analytics/drivers` (the route `SessionAnalyticsPage` already calls once, "zero new fetches" per M9's own docstring precedent) returns `DriverSummary` objects with only aggregate fields (`best_lap_ms`, `median_lap_ms`, `lap_times_ms`, ...) — no per-lap-number list. Threading `position` through `DriverLapMetrics` alone would not make it reachable from the one request that actually feeds the whole-grid page.
- **The correct existing precedent is a different file entirely**: `frontend/src/features/tyre-performance/components/driverCompoundComparisonChartOptions.ts` (`DriverCompoundComparisonChart`) — a genuinely multi-driver, multi-line-series chart, one connected line per driver, colored by `driverColor(driver_id)`, with a legend and per-point tooltip. This is structurally what a position chart needs; `LapTimeTrendChart` is not.

Everything below reflects this corrected understanding, not Stage A's literal wording.

## 3. Domain / Model Placement — `Lap.position`

**Pipeline** (`pipeline/pitwall_pipeline/models.py`), current `Lap` has no position field. Planned addition, matching the exact additive/nullable shape of `compound: str | None = None` (M10) and M34's four `Driver` fields:
```python
position: int | None = None
```

**Semantics of FastF1's `Laps.Position` column — verified directly from the installed library's source, not documentation prose** (`fastf1/core.py`, the block that computes it):
```python
laps['Position'] = np.nan  # create empty column
if self.name in self._RACE_LIKE_SESSIONS:
    for lap_n in laps['LapNumber'].unique():
        ...  # sort each lap-number's drivers by cumulative Time, rank 1..N
laps.loc[dnf_and_generated, 'Position'] = np.nan  # crashed-on-lap-1 drivers excluded
```
- `Position` is a **derived** value FastF1 itself computes (rank-by-cumulative-time at each lap boundary among drivers who reached that lap), not a raw telemetry field — it inherits FastF1's own tie-breaking and edge-case handling (a driver who crashed with only one FastF1-generated lap gets `NaN`, not a fabricated rank). PitWall does not need to (and should not attempt to) recompute or validate this — it is exactly as trustworthy as `lap_time_seconds` or any other already-trusted FastF1-derived field this pipeline already passes through unmodified.
- `int | None` is exactly correct: the underlying dtype is `float64` "to support NaN," but every non-null value is a clean integer rank (`range(1, len(laps_eq_n) + 1)`) — no fractional or tied positions are ever produced.
- **Session-type population, confirmed from `_RACE_LIKE_SESSIONS` directly, not assumed**: `self._RACE_LIKE_SESSIONS` is `('Race', 'Sprint', 'Sprint Qualifying')` for sessions dated ≤2023, or `('Race', 'Sprint')` for 2024+ (2024 renamed "Sprint Qualifying" to mean the *qualifying-style* sprint format, moving it to `_QUALI_LIKE_SESSIONS` instead). Concretely:
  - **Race, Sprint**: always populated.
  - **Sprint Qualifying**: populated for ≤2023 events (grid-setting sprint race format), `NaN` for 2024+ events (qualifying-style format) — **this year-dependent distinction is entirely internal to FastF1**; PitWall's normalization code does not need to know about it or special-case it in any way, because it only ever reads whatever value is already in the `Position` column.
  - **Qualifying, Practice**: never populated (`NaN` for every row, every year).

**Backend** (`backend/app/models/telemetry.py`), current API `Lap` — identical addition: `position: int | None = None`.

**Only one construction site exists for `Lap`** in each workspace (confirmed by `grep -rn "Lap(" pipeline/pitwall_pipeline/ backend/app/`, excluding unrelated `Lap*`-prefixed classes): `normalize_laps()` (pipeline) and `_lap_from_row()` (backend, `app/repositories/parquet_repository.py`) — the entire read/write surface for this field.

## 4. Normalization Design

**`normalize_laps()`** gains one line inside its existing per-row loop:
```python
position=_optional_int(row.get("Position")),
```
using the pipeline's already-existing `_optional_int` helper (added in M34, `normalize.py`) — no new helper needed. `.get()`, not bracket access, matching this file's own established `Compound`/M34 precedent for a column that isn't guaranteed present in a hand-built test fixture even though real FastF1 output always has it.

**Backend `_lap_from_row()`** gains: `position=_optional_int(row.get("position"))`, reusing the `_optional_int` helper `parquet_repository.py` already gained in M34 — no new backend helper needed either.

**No other normalization behavior is touched** — `normalize_stints`, `normalize_pit_stops`, `normalize_drivers`, `normalize_session`, `normalize_telemetry` are all unaffected.

## 5. Analytics Path — Corrected Design

**`position` is descriptive, not computed, and does not belong in the aggregation/filtering pipeline.** `_lap_metrics()` (`aggregation.py`) builds `DriverLapMetrics` from genuinely *derived* analytics values (`is_outlier`, `delta_to_theoretical_best_ms`, `exclusion_reason`) computed *over* a driver's laps — `lap_number` itself is the one field in that struct that's a plain passthrough from the input `Lap`, and `position` belongs in that same category, not the derived-metrics one. **Per §2's correction, `DriverLapMetrics` is not actually consumed by anything this milestone needs** (it only feeds the single-driver `LapTimeTrendChart`/`DriverDrillDown` path) — so it is **not touched at all** in this design, which is a smaller footprint than Stage A assumed, not a larger one.

**New addition, instead, directly on `DriverSummary`** (the full-grid, already-fetched-once response `SessionAnalyticsPage` uses):

Service layer (`aggregation.py`):
```python
@dataclass(frozen=True)
class LapPosition:
    lap_number: int
    position: int | None


@dataclass(frozen=True)
class DriverSummary:
    ...  # existing fields unchanged
    positions: list[LapPosition] = field(default_factory=list)
```
Built inside `summarize_driver()` from the **full, unfiltered** `laps` list (the same population `DriverSummary.laps: list[DriverLapMetrics]` already uses — "includes every lap the driver has, valid or not," per that field's own existing docstring) — **not** `aggregate_laps` (the yellow-flag-excluded subset used for pace statistics). This is a deliberate choice, reasoned explicitly: a position trend is a *narrative* of the whole race, and the moments the aggregate-stats filter excludes (an anomalous slow lap under yellow, a pit-stop lap) are frequently exactly where a position change happens — filtering them out would remove the most informative points on the chart, not just noisy ones.
```python
positions = [LapPosition(lap_number=lap.lap_number, position=lap.position) for lap in laps]
```

**Explicit reasoning against the specific edge cases the Stage B brief named:**
- **Missing laps / retired drivers**: a driver with fewer laps than the session's max simply has a shorter `positions` list — no padding, no fabricated trailing entries. The chart (§ below) plots exactly the points it's given; a shorter line simply stops where the driver's data stops, which is the honest representation of a retirement.
- **Drivers entering/leaving the dataset**: not a real concern for `Laps`/`results` (every driver who appears in the session's roster has *some* row for every lap they attempted); not fabricated or assumed otherwise.
- **Duplicate lap numbers**: not specific to this field — `normalize_laps()` already iterates the Laps DataFrame exactly as FastF1 provides it with no dedup step for any existing field (`lap_time_seconds` etc.); `position` inherits the same (non-)behavior, introducing no new risk beyond what already exists.
- **Session types without meaningful position**: covered in full in §3 — the field is uniformly `None` for Qualifying/Practice, handled by the same `None`-tolerant path as every other case, no special-casing required anywhere in the backend.
- **Partial telemetry**: irrelevant — `position` comes from `results`-derived lap timing, not telemetry, and is present/absent independently of `has_telemetry`.
- **Ordering/alignment between drivers and lap numbers**: solved structurally by using explicit `{lap_number, position}` pairs (§ below), not parallel arrays or an implicit index — this was a deliberate design choice specifically to avoid any alignment assumption breaking for a driver with a shorter or gap-containing lap list.

**API layer** (`app/models/session_analytics.py`):
```python
class LapPosition(ApiModel):
    lap_number: int
    position: int | None


class DriverSummary(ApiModel):
    ...  # existing fields unchanged
    positions: list[LapPosition]
```
Mapped in `_to_driver_summary_model()` (`app/api/session_analytics.py`), one line added to the existing field-by-field mapper: `positions=[LapPosition(lap_number=p.lap_number, position=p.position) for p in summary.positions]`.

## 6. Session-Type Semantics — UI Behavior

Fully covered by §3's source-verified `_RACE_LIKE_SESSIONS` finding. **UI rule**: `SessionAnalyticsPage` renders the new chart Card only when at least one driver has at least one non-null `position` value anywhere in the response (`analytics.drivers.some((d) => d.positions.some((p) => p.position !== null))`). For Qualifying/Practice sessions, this is `false` for every driver, so the entire chart section is omitted — mirroring exactly M34's `DriverSelectPage` precedent (omit, don't show an empty/confusing state) rather than rendering an empty chart with an explanatory message.

## 7. Historical Data / Backfill — Re-Evaluated Specifically for `Lap.position`

**Option B (no backfill) is still the correct choice for this stage — no ingestion is run, no Parquet is rewritten.** But this milestone's Option-B consequence is **materially larger and more visible than M34's was**, and that difference deserves to be stated plainly, not glossed over:

M34's four `Driver` fields degrade *per driver, per badge* — an old session's `DriverSelectPage` just shows slightly less info per card, everything else on the page is unaffected. **`Lap.position` for a pre-M35 session means every lap of every driver in that session's `laps.parquet` has no `position` column at all** (confirmed directly, §4/M34's own equivalent check on `drivers.parquet`) — so `positions` will be `[{lap_number: n, position: None}, ...]` for every driver, the "any non-null position" check in §6 will be `false`, and **the entire new chart Card will not appear at all for any of the 704 currently-ingested sessions**, including real Race sessions where the chart would otherwise be most valuable. This is not a partial-degradation case like M34 — it is total, for every existing session, until either a new ingest happens or a future backfill runs.

This is named here explicitly as a real, user-visible cost of Option B for this specific feature — not hidden behind the same reasoning that justified it for M34. The reasoning that still makes Option B correct for *this stage* is unchanged from M34 (§6 of `docs/m34-design-review.md`): no re-ingestion precedent exists for patching already-ingested Parquet safely, a full 704-session re-ingest is an 8–17+ hour operation with real risk of touching unrelated already-correct fields, and Stage B/C are explicitly forbidden from running any ingestion regardless. **What's different here is only that this cost is worth flagging prominently as a reason a future, deliberately-scoped backfill — likely narrower than a full 704-session sweep, e.g. Race/Sprint-type sessions only, where `position` is ever non-null in the first place — is a stronger candidate for a near-future milestone than it was after M34.** Not decided, scheduled, or performed here.

## 8. API Contract

Route count unchanged — `GET /sessions/{session_id}/analytics/drivers` already exists; no new route. `DriverSummary` and `Lap` both gain one new field each, purely additively (a new nested list field on `DriverSummary`, a new nullable scalar on `Lap`) — no existing field renamed or removed, no existing route's behavior changed. `DriverLapMetrics`/`DriverLapsResponse`/the per-driver `.../laps` route are **not touched at all** (§5's correction) — confirmed zero risk of regressing `LapTimeTrendChart`/`DriverDrillDown`.

## 9. Frontend Design

**New files** (mirroring `driverCompoundComparisonChartOptions.ts`'s structure, §2, not `lapTimeTrendChartOptions.ts`'s):
- `frontend/src/features/session-analytics/components/positionTrendChartOptions.ts` — `buildPositionTrendChartOption(drivers: DriverSummary[]): EChartsCoreOption`. One line series per driver (`drivers.map(driver => ({ name: driver.driver, type: "line", data: driver.positions.filter(p => p.position !== null).map(p => [p.lap_number, p.position]), color: driverColor(driver.driver), lineStyle: { color: driverColor(driver.driver) } }))`), matching `driverCompoundComparisonChartOptions.ts`'s exact filter-then-map-then-color pattern.
  - **X-axis**: `type: "value"`, name "Lap", `minInterval: 1` — identical convention to every other lap-indexed chart in this codebase.
  - **Y-axis**: `type: "value"`, name "Position", **`inverse: true`** (ECharts' native axis-inversion option — P1 renders at the top, matching every real F1 position chart's convention), plus `minInterval: 1` (positions are always whole numbers).
  - **Legend**: `data: drivers.map(d => d.driver)`, matching `driverCompoundComparisonChartOptions.ts`'s legend exactly.
  - **Tooltip**: `trigger: "axis"` (not `"item"` — unlike the compound-comparison chart's single-compound-at-a-time view, a position chart's whole point is comparing every driver's position at the same lap, so an axis-triggered tooltip showing every driver's value at the hovered lap is the correct interaction, matching `LapTimeTrendChart`'s own `trigger: "axis"` choice for the same reason).
  - **Missing values**: a driver's line simply has fewer points wherever `position` is `null` (retired, or a Qualifying/Practice lap that slipped through — shouldn't happen given §6's page-level gate, but the chart-builder itself is defensively correct regardless of what calls it).
- `frontend/src/features/session-analytics/components/PositionTrendChart.tsx` — thin wrapper component, structurally identical to `LapTimeTrendChart.tsx` (same `useEChartsInstance` lifecycle pattern, same `role="img"`/`aria-label`/`data-testid` conventions), taking `{ drivers: DriverSummary[] }`.
- `frontend/src/features/session-analytics/components/PositionTrendChart.module.css` — copy of `LapTimeTrendChart.module.css`'s single `.chart { }` rule (no new styling concept needed).

**Relocation required, and why**: `driverColor()` currently lives at `frontend/src/features/tyre-performance/driverColor.ts`, feature-scoped. This codebase has **zero** existing cross-feature imports anywhere (`grep -rn "from \"../../features/"` across every feature returns nothing) — every shared, identity-keyed helper of this kind (`teamColor.ts`, `sessionTypeLabels.ts`, `urlSearchParams.ts`) lives in `frontend/src/components/`. Since `PositionTrendChart` (in `session-analytics/`) genuinely needs the same per-driver color function `tyre-performance/` already has, and duplicating a second copy would be a known, deliberate duplication at authoring time (not an organic one to later evaluate against a 3-copy threshold), the correct move is relocating `driverColor.ts` (+ its existing test) to `frontend/src/components/driverColor.ts`, updating the one existing import site (`driverCompoundComparisonChartOptions.ts`). This is a pure file move plus import-path updates — the function's implementation and its existing test are untouched, matching the precedent this project already used for `urlSearchParams.ts`/`sessionTypeLabels.ts` (small, identity-scoped, cross-feature-needed helpers belong in `components/`).

**Placement in `SessionAnalyticsPage.tsx`**: a new, full-width `<Card title="Position by Lap">` (or similar), placed as its own row — **not** squeezed into the existing `.chartRow` (a fixed 2-column grid intended for `PaceDistributionChart`/`DriverRankingChart`'s narrower charts; a 20-driver multi-line chart needs full page width to stay legible). `SessionAnalyticsPage.module.css`'s `.dashboard` is already a `flex-direction: column` container with `gap` — **no new CSS is needed**; a new top-level `<Card>` sibling stacks correctly using the page's existing layout rules. Rendered conditionally per §6's gate.

**`frontend/src/api/client.ts`**: `Lap` interface gains `position?: number | null` (optional+nullable, matching `compound`'s and M34's established rationale — existing `Lap`-literal test fixtures stay uncompiled-unaffected). `DriverSummary` interface gains a new nested type and field:
```ts
export interface LapPosition {
  lap_number: number;
  position: number | null;
}

export interface DriverSummary {
  // ...existing fields unchanged
  positions?: LapPosition[];
}
```
**Resolved this stage, not left open**: `positions` is optional (`?:`), matching `Lap.position`'s and every M34 field's established rationale. Checked directly: exactly 5 existing files construct `DriverSummary` literals (`DriverRankingChart.test.tsx`, `PaceDistributionChart.test.tsx`, `DriverSummaryTable.test.tsx`, `paceDistributionChartOptions.test.ts`, `driverRankingChartOptions.test.ts`) — none of them are otherwise in this milestone's scope, and none should need touching just to keep compiling. Making the field optional keeps all 5 untouched; `PositionTrendChart`'s own tests (§10) construct their `DriverSummary` fixtures with `positions` explicitly set, same as any other optional-field consumer in this codebase already does.

## 10. Tests — Exactly What's Needed, and Why

**Pipeline** (mirroring M34's exact two-test pattern):
1. `test_normalize_laps_maps_position` — a Race-shaped `laps` fixture with `Position` populated → asserts correct `int` extraction.
2. `test_normalize_laps_handles_non_applicable_position` — a Qualifying/Practice-shaped fixture with `Position` all `NaN` → asserts `None`, not an error.

**Backend:**
3. One new `test_parquet_repository.py` case: a `laps.parquet` written **with** the `position` column → asserts correct deserialization (mirrors M34's `test_list_drivers_maps_classification_fields_when_present`). The existing, untouched shared fixture (no `position` column) continues to prove backward compatibility for free, exactly as it did for M34 — no separate "old file" test needs writing.
4. One new `test_session_analytics_aggregation.py` case: `summarize_driver()` given laps with a mix of populated and `None` positions → asserts `DriverSummary.positions` is the correct, order-preserving `{lap_number, position}` list, using the existing `lap()` fixture helper (`tests/lap_comparison_fixtures.py`) with `position=` passed via its existing `**overrides` mechanism — **no fixture-file change needed**, since `Lap.position` defaults to `None` and `lap(**overrides)` already forwards arbitrary keyword overrides.
5. One new `test_session_analytics_route.py` case: the full `GET /sessions/{id}/analytics/drivers` response includes `positions` correctly for a fixture session — proving the mapper (`_to_driver_summary_model`) wiring end-to-end, not just the service layer in isolation.

**Frontend:**
6. `positionTrendChartOptions.test.ts` (new file) — mirroring `driverCompoundComparisonChartOptions.test.ts`'s structure: correct series count/driver-name mapping, `null`-position laps excluded from a driver's line (not plotted as `0`), y-axis `inverse: true` present.
7. `PositionTrendChart.test.tsx` (new file) — mirroring `LapTimeTrendChart.test.tsx`'s smoke-render structure.
8. `SessionAnalyticsPage.test.tsx` — extended with one new case asserting the chart renders when at least one driver has non-null positions, and one asserting it's absent when none do (§6's gate) — the existing tests for the page's other charts/cards are unaffected and need no modification.
9. `driverColor.test.ts` — **relocated, not rewritten**: moves with `driverColor.ts` to `components/`; its existing assertions are untouched (a pure-function test has no dependency on its file's directory).

**Deliberately not added**: no new test for `_lap_from_row`'s backward-compatibility with an old-style Parquet file lacking `position` — the untouched, pre-existing shared fixture used by many other backend tests already proves this identically to how it proved it for M34's four `Driver` fields; writing a second, near-duplicate proof would be coverage for its own sake, not justified by new risk.

## 11. Documentation

**`docs/data-model.md` and `docs/api-model.md`**: both need their `Lap` field-list line extended with `position`, mirroring exactly the pattern M34 used for `Driver`. **Observed but explicitly out of scope**: neither line currently lists `compound` (added in M10) either — a pre-existing gap this milestone did not create and will not fix, per the explicit instruction not to perform broader reconciliation. Only `position` is added to each line, nothing else in either file is touched.

**No mention of `DriverSummary.positions`/`LapPosition` is planned for `docs/api-model.md`** beyond the `Lap` line — that file does not currently give `DriverSummary` its own field-by-field bullet (unlike `Driver`/`Lap`/`TelemetrySample`, `DriverSummary` is only referenced contextually elsewhere in the file, e.g. in the M17-addition sections) — introducing that documentation pattern for the first time is a larger, unrelated documentation-architecture decision this milestone should not make unilaterally.

## 12. Validation Plan (Stage C)

1. `uv run pytest` (pipeline) — expect current baseline (149) + 2 new.
2. `uv run mypy .` / `ruff check .` / `ruff format --check .` (pipeline) — must stay clean.
3. `uv run pytest` (backend) — expect current baseline (387) + 3 new.
4. `uv run mypy .` / `ruff check .` / `ruff format --check .` (backend) — must stay clean.
5. `npx vitest run` (frontend) — expect current baseline (552) + new cases from §10 items 6–8; `driverColor.test.ts` continues to pass at its new location.
6. `npx tsc -b --noEmit` — must stay clean (confirms the `driverColor.ts` relocation's import-path update is correct).
7. `npx eslint .` / `npx prettier --check .` — must stay clean.
8. `git diff --check`.
9. A direct fixture-based Parquet-compatibility check (temp directory, no real data), mirroring M34's Stage C proof exactly: an old-style `laps.parquet` (no `position` column) loads via `list_laps()` with `position: None` for every row.
10. A direct API-contract check (introspecting `Lap.model_fields`/`DriverSummary.model_fields`, or reading a route test's response body) confirming both new fields are present alongside every pre-existing field.

**No browser testing is claimed** — no browser-automation tool is available in this environment (confirmed during M31's Stage C investigation and unchanged since); Stage C will not assert visual verification it has not actually performed.

## 13. Exact Stage C File Scope

**Definitely modified:**
- `pipeline/pitwall_pipeline/models.py` — `Lap.position`
- `pipeline/pitwall_pipeline/normalize.py` — `normalize_laps()`
- `pipeline/tests/test_normalize.py` — 2 new tests (§10)
- `backend/app/models/telemetry.py` — API `Lap.position`
- `backend/app/models/session_analytics.py` — new `LapPosition`, `DriverSummary.positions`
- `backend/app/repositories/parquet_repository.py` — `_lap_from_row()`
- `backend/app/services/session_analytics/aggregation.py` — new `LapPosition` dataclass, `DriverSummary.positions`, `summarize_driver()`
- `backend/app/api/session_analytics.py` — `_to_driver_summary_model()` mapper
- `backend/tests/test_parquet_repository.py` — 1 new test (§10)
- `backend/tests/test_session_analytics_aggregation.py` — 1 new test (§10)
- `backend/tests/test_session_analytics_route.py` — 1 new test (§10)
- `frontend/src/api/client.ts` — `Lap.position`, new `LapPosition`, `DriverSummary.positions`
- `frontend/src/features/session-analytics/SessionAnalyticsPage.tsx` — new chart Card, §6 gate
- `frontend/src/features/session-analytics/SessionAnalyticsPage.test.tsx` — 2 new cases (§10)
- `frontend/src/features/tyre-performance/components/driverCompoundComparisonChartOptions.ts` — one import path updated (relocation)
- `docs/data-model.md`, `docs/api-model.md` — `Lap` field-list line each

**Definitely created:**
- `frontend/src/features/session-analytics/components/positionTrendChartOptions.ts`
- `frontend/src/features/session-analytics/components/positionTrendChartOptions.test.ts`
- `frontend/src/features/session-analytics/components/PositionTrendChart.tsx`
- `frontend/src/features/session-analytics/components/PositionTrendChart.module.css`
- `frontend/src/features/session-analytics/components/PositionTrendChart.test.tsx`
- `frontend/src/components/driverColor.ts` (moved from `features/tyre-performance/`)
- `frontend/src/components/driverColor.test.ts` (moved from `features/tyre-performance/`)
- `docs/m35-design-review.md` (this file)

**Deleted** (as part of the relocation, not separately): `frontend/src/features/tyre-performance/driverColor.ts`, `frontend/src/features/tyre-performance/driverColor.test.ts`.

**Conditionally modified:** none identified — every file above is definitely in scope.

**Explicitly untouched:**
- `backend/app/models/session_analytics.py`'s `DriverLapMetrics`, `DriverLapsResponse` and their construction sites (§5's correction — not needed for this milestone)
- `frontend/src/features/session-analytics/components/DriverDrillDown.tsx`, `LapTimeTrendChart.tsx`, `lapTimeTrendChartOptions.ts` (and their tests)
- Any weather/race-control code
- Any historical backfill or ingestion
- Any dependency manifest
- `docs/backlog.md`, `docs/success-metrics.md`, `docs/architecture.md`
- Any M33-style broader documentation reconciliation
- `_to_stint_pace`, trend-hook consolidation, or any other unrelated debt item

## 14. Risks

- **The `driverColor.ts` relocation is the one change with any real mechanical risk** (an import path in an existing, working file changes) — mitigated by it being a pure move with no logic change, and by `tsc -b --noEmit` catching any missed reference immediately.
- **Option B's chart-invisible-for-all-existing-sessions consequence** (§7) is real and larger than M34's equivalent — named prominently rather than downplayed, though it does not change Stage C's own scope or actions.
- **Rollback**: trivial — every file is either a small additive field change or a new/moved frontend file; no data, dependency, or schema-migration risk of any kind.

## 15. Explicit Non-Goals

Weather; race-control messages; `results.Q1/Q2/Q3` (qualifying results); any historical backfill or targeted re-ingestion (named as a stronger future candidate in §7, not scheduled); any dependency change; any M33-style documentation reconciliation beyond the two `Lap`-line edits in §11; `_to_stint_pace`; trend-hook consolidation; any change to `DriverLapMetrics`/`DriverLapsResponse`/`LapTimeTrendChart`/`DriverDrillDown` (§5, §13); any new route.

## 16. Deviations From Stage A

Substantial and load-bearing, all detailed in §2/§5/§9 above: `LapTimeTrendChart` is not the right precedent (single-driver, wrong route); `DriverLapMetrics` does not need to change at all for this milestone; the actual new backend surface is a new `LapPosition` type nested on the already-fetched `DriverSummary`, not a passthrough on the per-driver drill-down path; the correct chart precedent is `driverCompoundComparisonChartOptions.ts`, requiring a small, justified relocation of `driverColor.ts` to `components/`. Stage A's overall recommendation (ship a lap-by-lap position chart, additive `Lap.position`, no backfill, on `SessionAnalyticsPage`) stands; its assumed implementation mechanism did not survive contact with the actual source and has been replaced with one that was verified against it.

## 17. Stage C — Actual Implementation and Deviations

**Two deviations from §13's exact file list, both discovered mid-implementation, both justified:**

1. **`frontend/src/features/session-analytics/SessionAnalyticsPage.test.tsx` was not created** — it does not exist today; `SessionAnalyticsPage` has always relied on its child components' own tests (`DriverRankingChart.test.tsx`, `PaceDistributionChart.test.tsx`, `DriverSummaryTable.test.tsx`) plus `hooks/useSessionAnalytics.test.ts`, never a page-level integration test. Creating one now, for a single one-line conditional (`analytics.drivers.some(...)`), would be new test infrastructure disproportionate to what it protects — `PositionTrendChart`'s own tests (§10 items 6–7, both written) already thoroughly cover the component the conditional gates.
2. **`pipeline/tests/fixtures.py` was modified** (adding `Position` values to `build_laps_df()` and a new `build_practice_laps_df()`) — not explicitly named in §13's list, but a necessary, in-spirit consequence of the two pipeline tests §10 already approved; the same category of omission M34's own Stage B list had for its equivalent fixture file.

Every other file in §13 was touched exactly as planned; no file outside the approved scope (plus these two named corrections) was touched.

## 18. Validation Results (Stage C)

**Pipeline**: `pytest` — 151 passed (149 baseline + 2 new). `mypy .` / `ruff check .` / `ruff format --check .` — clean.

**Backend**: `pytest` — 390 passed (387 baseline + 3 new). `mypy .` / `ruff check .` / `ruff format --check .` — clean.

**Frontend**: `vitest run` — 564 passed (552 baseline + 12 new: 8 `positionTrendChartOptions.test.ts` + 4 `PositionTrendChart.test.tsx`); `driverColor.test.ts` passes unchanged at its new location; `driverCompoundComparisonChartOptions.test.ts` passes unchanged with its updated import. `tsc -b --noEmit` — clean. `eslint .` — clean. `prettier --check src/` — clean.

`git diff --check` — clean.

**Targeted verification, all directly proven, not assumed**:
- Exactly 3 `LapPosition` definitions exist: the backend service dataclass (`aggregation.py`), the backend API model (`models/session_analytics.py`), and the frontend interface (`api/client.ts`) — the same intentional dual/triple-model anti-corruption pattern this project already uses elsewhere (e.g. `DriverStrategySummary`), not an accidental duplicate.
- `position=_optional_int(row.get("Position"))` confirmed present in `normalize.py`.
- `DriverLapMetrics` confirmed unchanged (printed its exact 9-field definition — identical to before).
- `DriverLapsResponse` confirmed unchanged (`git diff` shows no hunk touching it).
- `LapTimeTrendChart.tsx`, `lapTimeTrendChartOptions.ts`, `DriverDrillDown.tsx` confirmed unchanged (`git status --short` on all three: empty).
- `Lap.model_fields` (backend, live introspection): `[..., 'compound', 'position']` — both pre-existing and new fields present.
- `DriverSummary.model_fields`: `[..., 'lap_times_ms', 'positions']` — confirmed.
- Route count re-confirmed at 22 (unchanged).
- Y-axis `inverse: true` confirmed present via a dedicated test (`positionTrendChartOptions.test.ts`'s "inverts the Y-axis so P1 renders above P2" case).
- Missing-position handling confirmed via three dedicated tests at three layers: pipeline (NaN → `None`), backend (absent column → `None`), frontend chart-options (`null` position excluded from a driver's line, not plotted as 0; a driver with zero non-null positions produces no series at all).
- Parquet compatibility: direct fixture proof (temp directory) that an old-style `laps.parquet` (no `position` column) loads via `list_laps()` with `position: None`, and (via `test_list_laps_maps_position_when_present`) that a new-style file loads the real value.
- **No real data was modified**: read (not wrote) the actual `data/processed/2023/bahrain_grand_prix/race/laps.parquet` — its columns remain exactly `[..., 'compound']`, no `position` column, confirming Option B was honored.
- **No backfill/ingestion ran**: PostgreSQL counts re-checked, unchanged (704 sessions, 54,148 stints).

## 19. Documentation Changes

`docs/data-model.md` and `docs/api-model.md`: each `Lap` field-list line extended with `position`, stating its source and its `None` cases (non-applicable session type, or pre-M35 data) — no other line in either file touched, no broader reconciliation performed.

---

**STOP — Stage C complete. Awaiting explicit approval before `git add`/`commit`/`push`.**
