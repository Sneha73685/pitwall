# PitWall — M11 Implementation Plan: Tyre & Stint Performance Analytics (Descriptive)

**Status:** Phases 0–6 are all complete. Phases 1–5 (domain logic, backend API, frontend data layer,
UI, and tests/integration) were implemented and verified as planned below — phase descriptions are
left as originally written, not rewritten after the fact. Phase 6 (documentation) is recorded as
complete at the end of this document. Companion to `docs/m11-design-review.md`, which this plan does
not re-argue; read that document first for the scope rationale, the A/B/C/D metric audit, and the
non-goals this plan is bound by.

Phased per the established project pattern (M8/M10 implementation plans). Each phase lists intent,
inputs, and open decisions to resolve *when that phase actually starts* — this document does not
write code, only scopes it.

**Phase 0.1 update (this pass):** the design review's four originally-open items are now resolved
(design review §5.2, §6.1, §6.3, §4.3) — this plan is updated to match, replacing every "resolve
Open Question N here" hedge below with the actual decision. Phase 1 is unblocked by this pass; see
the end-of-document consistency audit for the full check.

---

## Phase 0 — Audit / Verification (complete — this is its record)

Done as part of `docs/m11-design-review.md`. Summary for traceability:

- Read all governing docs and ADRs (design review §2).
- Read the full M10 implementation (pipeline, backend, frontend, tests).
- Migrated and populated a local PostgreSQL instance (previously empty) and re-ran ingestion against
  the already-warm FastF1 cache for the 2024 Bahrain GP Race to get real `stints`/`pit_stops` rows,
  rather than trusting the design docs' description of the schema (design review §3.2).
- Verified exact Parquet column lists, null counts, and row counts (design review §3.1).
- Classified 19 candidate metrics as A/B/C/D (design review §4.1) and confirmed, with a concrete
  live example (`HUL`'s 1-lap stint), a data-quality risk M10 had only flagged hypothetically
  (design review §3.2, §12).
- Confirmed one real, additive `RaceContextRepository` interface gap (design review §6.1) — not
  a new store, not an ADR trigger.

No further Phase 0 work is anticipated before Phase 1 starts, other than the Open Questions listed
in the design review, which the relevant later phase should resolve at the point it becomes
load-bearing (each is cross-referenced below).

---

## Phase 1 — Domain Logic (complete)

**Goal:** pure, storage-agnostic functions that join and filter `Lap`/`Stint`/`PitStop` data into
the shapes M11's metrics need — no FastAPI, no repository changes, no database access. Mirrors
`app/services/session_analytics/`'s existing internal structure and its "plain frozen dataclasses,
not Pydantic models yet" convention (`aggregation.py`'s own docstring).

**Proposed package:** `backend/app/services/tyre_performance/` — one package regardless of the two
endpoints it eventually backs (design review §6.3 resolved this: two endpoints, one cohesive
service layer underneath, same as `session_analytics/` backing two routes today).

**Proposed modules**, each scoped to one A/B-classified metric group from the design review:

- `stint_join.py` — joins a driver's `Lap` list against their `Stint` list by lap-number range;
  produces a per-lap "which stint, which lap-index-within-stint" annotation. This is the foundation
  every other module depends on (design review §4.1 #6, #7).
- `boundary_laps.py` — identifies in-laps (from `PitStop.lap_number`) and out-laps (from
  `Stint.start_lap` for every stint after the first), given a driver's stints and pit stops (design
  review §4.1 #7, §5.2). This module alone resolves what used to be a separate "short-stint" concern
  (see next bullet) — a stint whose every lap is an in-lap or out-lap simply has zero laps left after
  this step, with no additional rule needed.
- `stint_eligibility.py` (renamed from the original plan's `stint_filtering.py`; no separate
  minimum-length constant, per design review §5.2's resolution) — given `boundary_laps.py`'s output,
  exposes the post-exclusion lap population for a stint and a small `has_trend_shape(laps) -> bool`
  helper (`len(laps) >= 2`) used by the chart-serialization layer (Phase 2) to decide whether to
  connect points into a line. This is a geometric check, not a statistical one, and the module's own
  docstring must say so explicitly (design review §5.2: "what this threshold does not mean") so a
  future reader doesn't mistake `>= 2` for a significance threshold.
- `stint_consistency.py` — reuses `session_analytics/consistency.py`'s `consistency_ms`/
  `consistency_cv` functions directly (they already take a plain `Sequence[float]`, no
  session-analytics-specific coupling) against a stint-scoped lap-time subset, post
  `boundary_laps.py` exclusion. No new statistics logic needed, and no new minimum-length check
  either — `consistency_ms`/`consistency_cv` already return `None` below 2 laps on their own (design
  review §5.2). Confirm at implementation time whether to import the existing functions directly or
  duplicate them into this package; importing is preferred unless it creates an unwanted
  cross-package dependency the codebase doesn't already have a precedent for.
- `compound_aggregation.py` — session-wide, per-compound grouping of stint-pace data (design review
  §4.1 #10, §5.3) — grouping and raw/median/percentile summarization only, explicitly **no
  regression, no `numpy.polyfit`, no trend-line fitting of any kind** (design review §4.2 — this is
  the one module where that boundary is easiest to accidentally cross, so it gets called out here
  by name, not just in the design review).
- `driver_compound_comparison.py` — the raw, per-driver (not pooled) variant of
  `compound_aggregation.py`'s grouping, for the side-by-side comparison view (design review §4.1
  #18, §4.3). Returns parallel per-driver series aligned on lap-in-stint index, explicitly
  **unsorted by pace and with no "fastest"/ranking field of any kind** — this module's output shape
  is the thing that makes it structurally impossible for Phase 2/4 to accidentally render a
  leaderboard, so the "no ranking" rule is enforced here, at the source, not left to UI discipline
  alone.
- `strategy_summary.py` — per-driver stint count/compound-sequence and session-wide compound-usage
  distribution (design review §4.1 #3, #4).

**Test plan (no DB, no FastAPI needed — pure function tests):**

- Hand-built `Lap`/`Stint`/`PitStop` fixtures, following the exact pattern
  `pipeline/tests/test_normalize_stints.py` already uses for its own hand-built DataFrames — except
  these tests build the *domain models* directly (Pydantic `Lap`/`Stint`/`PitStop` from
  `app/models/telemetry.py`/`app/models/race_context.py`), since this layer sits downstream of both.
- Explicit test case reproducing the `HUL` single-lap-stint shape from real data (design review
  §3.2, §5.2, §12): assert `boundary_laps.py` + `stint_eligibility.py` together produce **zero**
  trend-eligible laps for that stint, demonstrating the resolved rule end-to-end rather than
  asserting a length constant was applied.
- Explicit test case with 3 compounds and a 1-stop driver (design review §12 risk row) — the local
  real dataset only has 2 compounds and no 1-stop driver, so this must be a synthetic fixture, not
  drawn from `data/processed/2024/bahrain_grand_prix/race/`.
- A test asserting `compound_aggregation.py`'s output contains no fitted parameter, slope, or
  coefficient field — an intentionally unusual "assert the absence of a feature" test, justified
  because this is the one place a future edit is likeliest to accidentally reintroduce exactly what
  §4.2 rules out; the test exists to catch that at review time, not just rely on code review noticing.
- A parallel test asserting `driver_compound_comparison.py`'s output contains no ranking, sort-by-
  pace, or "fastest" field — the same "assert the absence of a feature" pattern, guarding design
  review §4.3/§8's non-goal instead of §4.2's.

---

## Phase 2 — Backend API (complete)

**Goal:** expose Phase 1's domain logic through typed endpoints, plus the one `RaceContextRepository`
extension the design review identified (§6.1).

**2.1 — `RaceContextRepository`: widen `list_stints`, per design review §6.1 (resolved)**

Change the interface method's signature in `backend/app/repositories/race_context.py` from
`list_stints(self, session_id: str, driver_id: str) -> list[Stint]` to `list_stints(self,
session_id: str, driver_id: str | None = None) -> list[Stint]`, and update
`backend/app/repositories/postgres_race_context_repository.py`'s SQL to match
`_LIST_PIT_STOPS_SQL`'s existing optional-filter shape (`AND (%(driver_id)s::text IS NULL OR
driver_id = %(driver_id)s::text)`) instead of writing a new query pattern from scratch. Add
`driver_id: str` to the `Stint` API model (`app/models/race_context.py`) — the model this method
both returns and serializes, per the existing single-model-layer convention. The existing per-driver
route is unaffected (still passes `driver_id` explicitly); its response gains one additive field.

No new method, no new file, no Open Question left to resolve here — this was the entire point of
choosing option B in the design review.

Test with the existing fake-repository pattern (`app.dependency_overrides`) at the route level, and
against a real test Postgres at the repository level — exactly the two-tier test strategy M10 §9
already established. Add one repository-level test case exercising `driver_id=None` against the
existing `test_postgres_race_context_repository.py` fixture data, alongside the pre-existing
single-driver cases (which must continue passing unmodified).

**2.2 — New Pydantic response models**

New file, `backend/app/models/tyre_performance.py` (not an extension of `race_context.py` — these
models represent *derived* analytics, not raw storage-shaped facts, the same distinction that
already separates `session_analytics.py` from `telemetry.py`). Independently defined per ADR-0009,
matching every prior milestone — no field imported from Phase 1's internal dataclasses. (The one
field that *does* touch an existing model, `Stint.driver_id`, is scoped to Phase 2.1 above, not
this new file.)

Response shape must include, for every A/B metric in design review §5.1: stint-scoped raw lap-time
series with in/out-lap flags attached per lap (not silently filtered — design review §5.2, §11's
success criteria) and a per-stint `has_trend_shape` flag (from Phase 1's `stint_eligibility.py`) so
the frontend knows when not to draw a connecting line; stint consistency figures; session-wide
compound-aggregate/strategy-summary figures; and the raw per-driver compound-comparison series from
`driver_compound_comparison.py`. Must **not** include any field named or shaped like a degradation
rate, slope, fitted coefficient, ranking, or "fastest driver" indicator (Phase 1's two
absence-tests carry both constraints forward to the API contract).

**2.3 — New endpoints: two, per design review §6.3 (resolved)**

```
GET /sessions/{session_id}/drivers/{driver_id}/stint-pace
GET /sessions/{session_id}/tyre-performance
```

Both follow the existing session-scoped-path, 404-if-session-missing, 200-empty-if-no-strategy-data
convention `race_context.py`'s routes already establish — reuse `get_telemetry_repository`'s
existence check exactly as `race_context.py`'s current routes do, don't duplicate that check's logic.
`stint-pace` serves one driver's `stint_join.py`/`stint_eligibility.py`/`stint_consistency.py`
output; `tyre-performance` serves the session-wide `compound_aggregation.py`/
`driver_compound_comparison.py`/`strategy_summary.py` output, calling the now-widened
`list_stints(session_id)` (§2.1) for all drivers in one query.

**2.4 — Dependency injection**

Both repositories (`TelemetryRepository`, `RaceContextRepository`) are already independently
injectable via existing `Depends()` providers in `app/dependencies.py` — M11's routes are the first
to need both at once for actual data (not just the existence check `race_context.py` already does),
which is exactly the case M10 §5.4 anticipated and left for whoever needed it first ("a route that
needs both... would declare both dependencies").

**Test plan:** route-level tests via `app.dependency_overrides` with fake repositories (no real
Parquet or Postgres needed), following `test_race_context_route.py`'s existing pattern exactly.

---

## Phase 3 — Frontend Data Layer (complete)

**Goal:** typed API client coverage and data-fetching hooks for the new endpoints — no UI yet.

- Extend the typed API client (`frontend/src/api/`) with the new endpoint(s), following the existing
  `getJson<T>`-based pattern every prior client method uses.
- New hook(s) in the proposed `frontend/src/features/tyre-performance/hooks/` directory (design
  review §7), modeled on `race-context/hooks/useRaceContext.ts`'s loading/error/data shape, which
  itself follows `session-analytics`' hook conventions.
- No Zustand store changes — per ADR-0007 and M9's explicit precedent ("stores are scoped by
  concern... nothing UI-only gets added"), this is fetched data, not UI or selection state.

**Test plan:** hook tests against a mocked API client, matching `useRaceContext.test.ts`'s existing
pattern.

---

## Phase 4 — Visualization / UI (complete)

**Goal:** render the descriptive views design review §5.1 and §7 describe. This phase's exact
component breakdown is intentionally left light here — per the design review's own posture (§7,
"frontend consumption is a follow-up design note... this document does not finalize component-level
design"), a dedicated frontend design note should precede this phase's implementation, the same
sequencing M8 → M9 and M10 → (its own deferred frontend note) already used. What's fixed now:

- Chart library: ECharts (ADR-0008), raw-array-in / chart-side-transform pattern (M8's
  `PaceDistributionChart` precedent) — no backend-computed trend line, no frontend-computed
  regression either (the design review's "no fitted curve" boundary applies at every layer, not just
  the backend).
- Color scheme: reuse `race-context/compoundColor.ts` unmodified.
- In/out-lap-excluded laps must be visually distinguishable in any per-lap trace (e.g. a distinct
  marker/opacity), not silently omitted from the chart — matching the "different populations, not
  deletion" principle from design review §5.2/§12 at the UI layer. A stint whose `has_trend_shape`
  flag (Phase 1/2.2) is `false` renders its remaining points unconnected (no line) rather than being
  hidden.
- The raw multi-driver compound-comparison view (design review §4.3, §7): render as parallel series
  with no sort-by-pace, no "fastest" badge/label, no color-coding by relative speed — enforced at
  the data layer already (Phase 1's `driver_compound_comparison.py` has no such field to render),
  this bullet is the UI-layer half of the same constraint.
- New feature directory: `frontend/src/features/tyre-performance/components/`.

**Test plan:** component tests following the existing `StintTimeline.test.tsx`/
`PitStopList.test.tsx` pattern (render with fixture data, assert key figures/labels present) —
exact test list deferred to the frontend design note this phase should start with.

---

## Phase 5 — Tests / Integration (complete)

**Goal:** end-to-end confidence that Phase 1–4's pieces compose correctly, beyond each phase's own
unit tests.

- Repository-level integration test for the new `RaceContextRepository` method against a real test
  Postgres (Phase 2.1), following `test_postgres_race_context_repository.py`'s existing setup/
  teardown pattern.
- Route-level integration test exercising both new endpoints with fake repositories covering: a
  driver with a normal multi-stint race, a driver with the `HUL`-style single-lap stint (real-data
  case, Phase 1), and a session with 3+ compounds (synthetic fixture, Phase 1) — the three cases the
  design review's risk table (§12) specifically calls out as under-covered by the one real local
  session.
- A regression check that every pre-existing endpoint (`/laps`, `/telemetry`, `/analytics/drivers`,
  `/stints`, `/pit-stops`, etc.) is unchanged — matching M10's changelog precedent of naming the
  specific pre-existing test files re-run unmodified as evidence.
- Full pipeline: run the actual ingestion CLI against the local Bahrain dataset once more after all
  code changes, confirm `stint-pace`/`tyre-performance` endpoints return real, sane data matching the
  numbers recorded in the design review's §3.2 audit (e.g., `HUL` stint 1 correctly flagged as
  excluded from aggregate stats, `BOT`'s 74.951s pit stop correctly surfaced as the true max, not
  silently dropped as an "outlier").

---

## Phase 6 — Documentation / Release (complete)

- `docs/architecture.md`: added the `tyre_performance` service package to the repo-structure listing
  (§5) and a new paragraph in §3 documenting it as the first domain-logic layer reading from both
  repositories at once, joined in application code (design review §6.2) — confirmed this does not
  touch ADR-0011's cross-engine-FK constraint.
- `docs/api-model.md`: documented both new endpoints and their actual shipped response models
  (`DriverStintPaceResponse`/`StintPaceLap`/`StintPace`, `TyrePerformanceResponse` and its five
  nested models), plus the `RaceContextRepository.list_stints` widening and `Stint.driver_id`
  addition — following the exact section format M10's addition already used ("M10 addition: stints
  and pit stops" → "M11 addition: tyre & stint performance analytics").
- `docs/data-model.md`: confirmed Phase 1/2 introduced no new persisted field — a short "M11: no new
  persisted schema" section was added, not a new entity.
- `CHANGELOG.md`: added `## M11 — Tyre & Stint Performance Analytics (Descriptive)`, matching the
  M10 entry's structure and tone; explicitly not described as degradation modeling.
- `README.md`: fixed the stale "Current milestone: M5" status line and extended the milestone table
  through M11 (M6–M10 had also shipped without the table being updated); added an M11 capabilities
  paragraph alongside the existing M10 one.
- `docs/backlog.md`: **not** updated. Its stated scope is code-level technical debt found during an
  audit ("Code-level improvements... deliberately not implemented"), not product/milestone
  proposals — design review §11's flagged candidate (a narrowly-scoped track-status-ingestion
  milestone) is a roadmap item, the same category as `docs/prd.md` §5's existing "Intentionally
  Deferred" table (which already lists track status/weather/position under V3). No existing backlog
  convention fits a future-milestone candidate, so nothing was added there; the candidate remains
  recorded in the design review's own Open Questions (§ at the end of that document) as this plan
  originally anticipated it might.
- Repo-wide consistency audit: searched for stale M10/M11/M5 milestone references, endpoint lists
  missing the two new routes, and architecture descriptions missing `tyre_performance`; fixed the
  ones in scope (the six files above). `docs/prd.md`'s milestone roadmap (§3) and `docs/releases/`
  still stop at M7/M5 respectively — pre-existing gaps from M8–M10 that this pass did not expand
  into, per CLAUDE.md's scope discipline (not M11-specific staleness).

---

## Explicit Non-Goals (carried forward from the design review, restated for implementers)

Do not implement, in any phase of this plan, without a new design review and team sign-off first:

- Any regression, curve fit, or slope/coefficient presented as a measurement.
- Fuel-load correction of any kind.
- Safety-car/yellow-flag/weather-adjusted metrics (the data does not exist in the schema yet).
- Traffic/gap/position-relative metrics (the data does not exist at all, not even unused-but-fetched).
- Cross-session, cross-event, or cross-driver-field aggregation beyond one session.
- Undercut/overcut strategic-outcome verdicts.
- Any driver ranking or "faster on this compound" claim — sort order, badge, color-coding, or
  copy — attached to the raw multi-driver compound-comparison view (design review §4.1 #18, §4.3,
  §8). Raw side-by-side display only.
- Any change to `TelemetryRepository`'s method set, or to Parquet's schema — M11 is read-only
  domain logic over M10's existing two stores; if implementation discovers a genuine need to persist
  a new derived field, stop and revisit the design review rather than adding it ad hoc.

## Architectural Decision Record status

**No ADR is required for M11** as scoped by the design review (§6.1, §9): no new store, no new
layer boundary, no reversal of a prior decision — only a widened parameter on an existing interface
method (design review §6.1, resolved as the smaller of two options — smaller even than the "new
method" originally sketched in the first Phase 0 pass) and a new domain-logic package reading from
two already-existing repositories. If Phase 1 or Phase 2 implementation discovers a need that
doesn't fit this framing (e.g., a reason `RaceContextRepository` and `TelemetryRepository` need to
be unified, or a reason Postgres needs a new table beyond `stints`/`pit_stops`), implementation must
stop and flag it for a design review addendum before proceeding, per CLAUDE.md's Definition of Done
— not write the ADR retroactively after the fact.
