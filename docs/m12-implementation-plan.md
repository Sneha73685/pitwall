# PitWall — M12 Implementation Plan: Multi-Season / Multi-Event / Multi-Session Architecture

**Status:** Phases 0–6 complete and verified (canonical event/session model, single-event
discovery/orchestration, the multi-event/season planning-and-execution control plane, the backend
season/event/session discovery API, the frontend Season → Event → Session navigation UI, and a
real, live, full-event multi-session ingestion run proving all of the above against genuinely new
data). Phases 7–8 remain not started. See each phase section below for what actually shipped versus
what was originally planned — Phase 3, in particular, was assigned its number by live
implementation sequencing and covers different content than this document originally drafted for
"Phase 3"; the original Backend APIs/Frontend/verification/backfill phases are preserved,
renumbered to Phases 4–8, not rewritten. Companion to `docs/m12-design-review.md`, which this plan
does not re-argue.

**This document does not begin Phase 7 or any later phase.** It exists so that when a future
session picks up Phase 7, the scope, sequencing, and evidence it depends on are already recorded —
the same posture `docs/m10-implementation-plan.md`/`docs/m11-implementation-plan.md` established
before their own build phases started.

---

## 0. The five granularities this plan distinguishes

Per this task's explicit instruction, "download everything" must not be the first implementation
step. This plan is structured around five genuinely different operations, of increasing scope, each
building on the last without a second ingestion system:

| Tier | Operation | What it costs | First exercised in |
|---|---|---|---|
| **A** | Metadata discovery | One schedule fetch per season (§3.4 of the design review — no `.load()`, no lap/telemetry data) | Phase 2 |
| **B** | Single-session ingestion | Exactly what `ingest_session()` already does today, unchanged | Already exists (M1); reused, not rebuilt |
| **C** | Event-level ingestion | A loop over Tier B for every session Tier A discovers for one event (2–5 sessions) | Phase 2 |
| **D** | Season-level ingestion | A loop over Tier C for every non-testing event Tier A discovers for one season (~20–24 events) | Planning/dry-run capability: Phase 3. First real, opt-in execution: Phase 7 |
| **E** | Historical bulk backfill | A loop over Tier D across multiple seasons | **Explicitly not scheduled by this plan** — a future decision, not a phase below |

Phases 1–5 below only ever reach Tier C (event-level) in anger, with Tier D exercised once, in a
controlled, single-season, explicitly-approved run (Phase 6) — not as a default or automatic
behavior. Tier E has no phase number because this plan does not schedule it; §7's non-goals restate
this explicitly.

---

## Phase 0 — Audit / Verification (complete — this document's companion is its record)

Done as `docs/m12-design-review.md`. Summary for traceability, mirroring the M10/M11 plans'
own Phase 0 pattern:

- Read every governing doc and ADR listed in this milestone's brief (CLAUDE.md, PRD, architecture,
  data-model, api-model, success-metrics, backlog, ADR-0004/0006/0007/0008/0009/0011, M10/M11
  design reviews and implementation plans, README).
- Read the full current pipeline, backend, and frontend implementation relevant to session
  identity, ingestion, and navigation (design review §2).
- Executed real, direct FastF1 calls (`fastf1==3.8.3`) against seven seasons' schedules and six
  representative sessions — not inferred from documentation (design review §3).
- Found and evidenced a real defect risk in the *already-merged* static session-identifier mapping
  (design review §3.3).
- Established the identity model (`(season, event slug)` for events, unchanged `session_id` for
  sessions) directly from collision evidence, not by default (design review §6, §3.7).
- Confirmed M10/M11 require zero changes for this plan to proceed (design review §12).
- Confirmed no ADR is triggered (design review §16) and recorded why.

No further Phase 0 work is anticipated. Phase 1 is unblocked by this pass.

---

## Phase 1 — Canonical Event/Session Model (complete)

**Goal:** give the identity model design review §5/§6 settled on a concrete, typed home in the
pipeline — a session-type resolution step that reads an event's real schedule instead of a static
dict, and an `Event` concept that groups sessions without changing `session_id`. **No ingestion
loop yet** — this phase makes discovery and resolution correct and testable in isolation first.

**Status: implemented and verified.** Before implementation, `docs/m12-design-review.md` §19 was
added, resolving three real-data unknowns §18 had left open (`Deleted`-flag availability, telemetry
availability across session types including a 2018 sample, and a broadened identity-stability
check) — one of which (§19.2) surfaced a new, real, reproducible finding (2018 telemetry access
fails, even though 2018 lap/stint data does not) that materially affects what "older season"
support can promise, recorded there rather than discovered later.

**What shipped:**

- `pitwall_pipeline/models.py`: `Event` (event_id, season, round_number, event_name, event_format,
  location, country, event_date) and `make_event_id(season, event_name)` — not persisted to Parquet
  or Postgres, per this phase's explicit boundary.
- `pitwall_pipeline/normalize.py`: `normalize_event()` (mirrors `normalize_session()`'s shape);
  `SessionNotAvailableError`; the canonical `_CANONICAL_SESSION_NAME_ALIASES` table (real FastF1
  display-name strings, not abbreviations, per design review §3.3/§5); `resolve_session_identifier()`
  and `available_session_types()`.
- `pitwall_pipeline/providers/fastf1_provider.py`: `FastF1Provider.load_session()` now calls
  `fastf1.get_event()` first (cheap, schedule-only, design review §3.4/§19.3) to resolve the
  requested `SessionType` against that specific event's real session names, **before** attempting
  any session load — replacing and removing the static, empirically-unsafe
  `_SESSION_TYPE_TO_FASTF1_IDENTIFIER` dict entirely (closing design review §3.3's verified defect).
  A resolved `Event` is logged (not persisted) for traceability.
- Tests: `pipeline/tests/test_session_resolution.py` (new, 16 tests) and
  `pipeline/tests/test_normalize_event.py` (new, 11 tests) cover all 15 scenarios this phase's brief
  required, using fixture shapes that reproduce the exact real session-name lists verified in the
  design review — not invented independently of that evidence. `pipeline/tests/test_fastf1_provider.py`
  gained 4 new integration-level tests (both real sprint-quali eras, the 2021 rejection case, and
  confirming SPRINT still resolves for a 2021 event) and had its 4 existing tests updated for the
  new (behavior-preserving, per design review §19.3) full-display-name identifier.
- **Real-data verification of the actual shipped code** (not just mocks): `FastF1Provider.load_session()`
  was run directly against real, already-cached FastF1 data — 2024 Bahrain Race (1129 laps, zero new
  network fetch, resolved and logged correctly) and 2021 British GP `SPRINT_QUALIFYING` (raises
  `SessionNotAvailableError` before any session load is attempted, closing the real defect with real
  data, not only a fixture).

**Validation:** `pytest` (pipeline: 71 passed; backend: 212 passed, unchanged), `mypy --strict`
(clean, 29 source files), `ruff check` (clean), `ruff format --check` (clean). No dependency added
(`git diff pipeline/pyproject.toml pipeline/uv.lock` empty). No file under `backend/` or `frontend/`
touched. `data/processed/` (PitWall's own ingested output) untouched throughout — confirmed before
and after every verification step.

- **Session-type resolution**: replace (or wrap, if a smaller change is found once this phase
  actually starts) `FastF1Provider._SESSION_TYPE_TO_FASTF1_IDENTIFIER`'s static dict with a
  function that resolves a `SessionType` against one real event's schedule row (`EventFormat` and
  its `SessionN` names, per design review §3.2's table), returning either the correct FastF1
  identifier for that specific event or an explicit "not applicable to this event" result — never
  a silent misresolution (closing design review §3.3's finding). This is pipeline-layer-only,
  consistent with ADR-0005's boundary (FastF1's shape is known only inside the `providers/`
  package).
- **`Event` as a discoverable, typed concept**: whether this is a new Pydantic model in
  `pitwall_pipeline/models.py`, a function returning `(season, event_slug, EventFormat, available
  session types)`, or something smaller, is an open implementation choice for this phase to
  resolve — design review §6 only commits to the identity *keys*, not a class shape. Whatever form
  it takes, it must not require a new persisted field on `Session`/`session_id` (design review §6's
  "additive, not a restructure" finding).
- **Testing-event exclusion**: the discovery/resolution layer defaults to excluding
  `EventFormat == "testing"` (via `get_event_schedule(..., include_testing=False)`, confirmed real
  in this FastF1 version — design review §3.7), matching design review §5's recommendation.
- **Test plan**: hand-built, FastF1-shaped fixture schedule rows covering all three sprint-quali
  eras from the design review's matrix (§4) plus a conventional-format event and a testing-format
  event — asserting correct identifier resolution for each real case found in the design review
  (§3.2, §3.3), and an explicit "not applicable" result (not an exception, not a misresolution) for
  2021/2022's absent sprint-qualifying slot. No real FastF1 network call in this phase's tests —
  fixtures encode the real shapes the design review already verified once.

**Exit criteria:** the resolution function correctly reproduces every real case in design review
§4's matrix against hand-built fixtures; `mypy --strict` and `ruff` clean; zero change to
`ingest_session`'s existing signature or behavior (this phase only prepares the piece Phase 2 wires
in).

---

## Phase 2 — Ingestion / Discovery Architecture (complete)

**Status: implemented and verified.** `ingest_session()` (Tier B) is unmodified in behavior — only
its return type widened from a bare `Path` to `IngestResult` (session_id, output_dir, lap_count,
telemetry_sample_count), additive and safe since no existing caller used the old return value.

**CRITICAL FUZZY-MATCHING SAFETY RULE, closed with real evidence:** `pitwall_pipeline/normalize.py`
gained `find_event_row()` — exact round-number match, or unambiguous case-insensitive substring
match against `EventName`/`Location`/`Country` only, never FastF1's own fuzzy/edit-distance
matching. Verified directly against real, live FastF1 data (not just fixtures):
`discover_event(2024, "xyz nonsense event")` now raises `EventNotFoundError` — the exact garbage
input design review §19.3 proved FastF1's own `get_event()` silently resolves to `"Chinese Grand
Prix"` — and never calls `fastf1.get_event()`/`get_session()` at all. `ingest_event()`'s
per-session loop passes `discovery.event.event_name` (the exact, already-safely-matched name) to
every `ingest_session()` call, never the caller's raw query again, plus a defense-in-depth
`RuntimeError` safety check that the ingested `session_id` actually belongs to the discovered
`event_id`.

**What shipped:**
- `pitwall_pipeline/models.py`: `EventDiscovery` (Event + real session names + resolved
  `SessionType -> FastF1 identifier` map).
- `pitwall_pipeline/normalize.py`: `EventNotFoundError`, `AmbiguousEventError`, `find_event_row()`.
- `pitwall_pipeline/providers/fastf1_provider.py`: `FastF1Provider.discover_event()`/
  `discover_sessions()` (Tier A, schedule-only, no `.load()`); `_event_session_names()` simplified
  to read `SessionN` columns directly (verified byte-identical to `get_session_name(n)`, and
  trivially fakeable with a plain DataFrame — a behavior-preserving simplification also applied to
  Phase 1's `load_session()` code path).
- `pitwall_pipeline/ingest.py`: `IngestResult` dataclass.
- `pitwall_pipeline/ingest_event.py` (new): `SessionIngestStatus` (SUCCESS /
  SUCCESS_NO_TELEMETRY / NOT_AVAILABLE / LOAD_FAILED — the 2018 telemetry finding is a status, not
  a failure), `SessionIngestOutcome`, `EventIngestResult`, `discover_event()`/`discover_sessions()`
  (thin wrappers), `ingest_event()` (Tier C orchestrator — discovers once, loops
  `ingest_session()` per available session with per-session `except Exception` isolation, logged
  loudly, never silently swallowed), and a single-event CLI (`--season`/`--event` only — one mode,
  no flag that could accidentally broaden scope).
- Tests: `test_find_event_row.py` (12), `test_ingest.py` (2), `test_ingest_event.py` (11), plus 5
  new `FastF1Provider.discover_*` tests in `test_fastf1_provider.py` — covering every scenario this
  phase's brief required (multi-session, missing-session, one-failure-isolated, reuse-not-
  duplication, exact-name-passing, telemetry-honest-reporting, garbage-input-rejected-before-any-
  ingestion, safety-check-triggers-on-mismatch).
- **Real, unmocked verification**: `discover_event`/`discover_sessions`/`ingest_event` run directly
  against real cached FastF1 data — 2024 Bahrain (conventional), 2024 China (confirms
  `SPRINT_QUALIFYING` → `"Sprint Qualifying"` for the current era), the garbage-input rejection
  above, and one real single-session `ingest_event()` call whose output `session_id` was confirmed
  to belong to the discovered event (the safety check passed silently, not just in a mock).

**Validation:** `pytest` (pipeline: 101 passed, up from 71; backend: 212 passed, unchanged),
`mypy --strict` (clean, 33 source files), `ruff check`/`ruff format --check` (clean). No dependency
added. `data/processed/` unchanged in shape (idempotent overwrite of the one pre-existing session
only — no new event or season directory appeared). `data/fastf1_cache/` unchanged in size (295MB,
same as end of Phase 1 — every real check in this phase reused already-cached data).

**Goal (original):** Tier A (discovery) and Tier C (event-level ingestion) as real, usable operations, built
on Phase 1's resolution function and the existing, unmodified `ingest_session` (Tier B) — per
design review §9's finding that the per-session function is already the right unit to loop over.

- **Discovery CLI/function** (Tier A): given a season (and optionally an event), list the real,
  discoverable sessions — using `fastf1.get_event_schedule()`/`get_event()`, confirmed cheap and
  `.load()`-free in the design review (§3.4). Read-only; writes nothing to Parquet or Postgres.
- **Per-session failure isolation** (design review §9's identified gap, §10's failure-model
  finding): a season/event-level driver must not let one session's load failure (design review
  §3.5's real, reproducible Monza case) abort the rest of the run. This phase adds the narrow
  try/except boundary at the *loop* call-site — `ingest_session` itself stays unchanged, matching
  the same pattern it already uses internally for its own Postgres write (a precedent, not a new
  idea).
- **Event-level ingestion** (Tier C): a loop over Phase 1's discovery output for one event, calling
  the existing `ingest_session` once per discovered `(event, session_type)` pair, with per-session
  failure isolation from above. This is the first tier this plan actually exercises against live
  data (Phase 5).
- **Logging/progress**: per-session start/success/failure/skip ("not applicable to this event")
  logged individually — design review §10 distinguishes "doesn't exist for this event/era" from
  "should exist but failed to load," and this phase's logging must preserve that distinction, not
  collapse both into one generic failure line.
- **Idempotency/resume**: design review §10 reasons that existing single-session idempotency
  (deterministic Parquet overwrite, Postgres natural-key upsert) already makes a simple "re-run and
  re-attempt everything" resume strategy sufficient, *given* failure isolation from above — this
  phase implements that reasoning as the actual resume behavior, and if real multi-session runs in
  Phase 5 show that reasoning wrong, that's a Phase 5 finding to record, not something to
  silently paper over.
- **Test plan**: discovery tested against hand-built schedule fixtures (no network); event-level
  looping tested with a fake/stubbed `ingest_session` (asserting it's called once per discovered
  session, and that one stubbed failure doesn't stop the loop) — no real FastF1 or Postgres
  dependency in this phase's unit tests, matching every prior milestone's test-isolation
  convention.

**Exit criteria:** discovery correctly lists sessions for a fixture event matching every real shape
in design review §4; event-level ingestion runs to completion against a stubbed failure without
aborting; `ingest_session` itself is provably unchanged (existing pipeline tests pass unmodified).

---

## Phase 3 — Multi-Event / Multi-Season Ingestion Control Plane (complete)

**Sequencing note:** this phase's live scope (a controlled multi-event/season planning and
execution layer, built directly on Phase 2) was assigned the number "Phase 3" by live
implementation instruction, ahead of this document's originally-drafted Phase 3 ("Backend APIs").
That original section's content is preserved, unedited, renumbered to **Phase 4** below (and every
phase after it shifts by one accordingly) — nothing in this document's original Phase 3–7 planning
was rewritten, only relabeled to make room. This phase also substantially advances what the
original plan called Tier D (season-level ingestion, §0's granularity table) and part of what it
called Phase 5/6 (controlled multi-session verification, historical backfill tooling) — see the
cross-references in the renumbered Phase 6/7 sections below for exactly what remains open there.

**Goal:** `DISCOVER → PLAN → REVIEWABLE PLAN → EXECUTE`, strictly separated — a deterministic,
inspectable `IngestionPlan` built entirely from discovery (zero ingestion, zero writes), and a
sequential executor that consumes a previously built plan, reusing Phase 2's `ingest_event()`
unchanged. Infrastructure for eventual historical backfill, not the backfill itself — no season-wide
or multi-season ingestion was actually executed in this phase, only planned and, for one small real
case, idempotency-verified.

**What shipped:**

- `pitwall_pipeline/providers/fastf1_provider.py`: `FastF1Provider.discover_season(season) ->
  list[EventDiscovery]` — `discover_sessions()` generalized to every real, non-testing event in a
  season, from **one** `fastf1.get_event_schedule()` call total (verified: `Session1..5` are already
  columns on every schedule row, so no per-event follow-up call is needed).
- `pitwall_pipeline/normalize.py`: `select_events()` — safe, non-fuzzy selection of a subset of an
  already-discovered season's events (one event, several explicitly named events, or all), reusing
  `find_event_row`'s exact matching semantics (extracted into a shared `_event_name_query_matches`
  predicate so the two can't silently drift apart) against in-memory `EventDiscovery` objects instead
  of a fresh FastF1 call per query.
- `pitwall_pipeline/ingest_plan.py` (new): `PlannedSession`, `PlanDiagnostic`, `IngestionPlan`
  (deterministic ordering — events by `(season, round_number, event_id)`; sessions within one event
  by that event's own real weekend chronology, i.e. each session's position in its actual
  `Session1..5` schedule, not a fixed global `SessionType` order, since weekend order itself varies
  by era — design review §3.2), `build_ingestion_plan()` (DISCOVER+PLAN, zero side effects),
  `EventLevelFailure`, `MultiEventIngestResult`, `execute_ingestion_plan()` (EXECUTE — sequential,
  reuses `ingest_event()` per planned event, two-level failure isolation: one event's total failure
  never stops the rest, and each event's own per-session isolation, inherited unchanged from Phase
  2), and a CLI with explicit safety gates (`--all-events` required to select a whole season instead
  of `--event`; `--confirm-multi-season` required for more than one `--season`; `--dry-run` performs
  discovery and planning only).
- **Fuzzy-matching safety, extended to the executor**: `execute_ingestion_plan()` passes
  `plan.requested_session_types` (not a fresh derivation) to every `ingest_event()` call, so
  execution ingests exactly what the plan/dry-run already showed — never more. `ingest_event()`'s
  own exact-name-passing and hard safety check (Phase 2) are inherited unchanged per event.
- Tests: `test_select_events.py` (10), `test_ingest_plan.py` (27), plus 2 new
  `FastF1Provider.discover_season()` tests in `test_fastf1_provider.py` — covering season discovery,
  event selection (exact/multiple/all/nonexistent/ambiguous/garbage), session selection (missing
  types, mixed event structures, historical sprint terminology), plan generation (exact plan,
  deterministic ordering, no duplicates), dry-run (zero `ingest_event()` calls), execution
  (event-level and session-level failure isolation, `SUCCESS_NO_TELEMETRY` preserved through
  aggregation), CLI safety gates, and orchestration-level idempotency.
- **Real, unmocked verification**: `build_ingestion_plan()` run against real, mostly-already-cached
  FastF1 schedules for 2024 Bahrain (conventional), 2024 China (sprint_qualifying era — confirmed
  chronological plan order `practice_1, sprint_qualifying, sprint, qualifying, race`, matching the
  real weekend), 2021 British GP (sprint era — confirmed `SPRINT_QUALIFYING` correctly absent),
  2024 Australian GP (ordinary event), 2018 Bahrain (older season), a garbage-input rejection, and a
  real two-season plan (2023+2024 Bahrain, correctly season-sorted). One small real
  ingestion+idempotency check: `execute_ingestion_plan()` run **twice** against the same one-event,
  one-session plan (2024 Bahrain Race, already cached) — both runs produced the identical
  `session_id`, and a direct Postgres query before/after confirmed `stints`/`pit_stops` row counts
  (63/43, matching the design review's original §3.2 audit exactly) were unchanged by the second run
  — real, not mocked, proof of idempotency through the full new orchestration layer.

**Validation:** pipeline pytest 140/140 (up from 101), backend pytest 212/212 (unchanged), frontend
vitest 298/298 (unchanged), `mypy --strict` clean across all three workspaces, `ruff check`/`ruff
format --check`/`eslint`/`prettier --check` all clean. No dependency added. No backend or frontend
source file touched. No Postgres schema change. `data/processed/` unchanged in shape throughout
(only the one pre-existing 2024 Bahrain Race directory); `data/fastf1_cache/` unchanged in size
(295MB, same as end of Phase 2) since every real check reused already-cached schedule/session data.

---

## Phase 4 — Backend APIs (complete)

**Goal (original):** expose season/event grouping to the backend, informed by whatever Phase 2
actually produces — this phase is explicitly sequenced after real multi-session data exists to
design against (the same "design against real data, not hypothetical shapes" discipline M10/M11
both followed for their own API phases).

**Decisions, resolving the three open questions above:**

- `GET /sessions` keeps its existing shape and gains no query parameters. Grouping stays a
  Parquet-directory-derived, computed-on-read concern (`app/services/session_discovery/`, pure
  functions over `TelemetryRepository.list_sessions()`'s already-existing output) — no new
  persisted index, no Event table. Three new routes were added instead, under a new `/seasons`
  prefix (`app/api/seasons.py`): `GET /seasons`, `GET /seasons/{season}/events`, `GET
  /seasons/{season}/events/{event_id}/sessions`.
- `ParquetRepository`'s linear scan is untouched — still O(sessions), same as every existing route
  that calls `list_sessions()`/`get_session()`. Not addressed here; the real dataset (one session)
  gives no evidence an index is yet justified, consistent with the design review §7 finding this
  phase was scoped to confirm, not fix.
- `TelemetryRepository` gained exactly one new abstract method, `has_telemetry(session_id) ->
  bool` — genuinely forced by a real consumer (`Session.has_telemetry`, directly motivated by the
  verified 2018 finding, design review §19.2), implemented via Parquet footer metadata only (no
  data read). `RaceContextRepository` was not touched at all; capability flags for
  stints/pit-stops were considered and deliberately deferred (see "What was NOT built" below) —
  neither repository was unified or merged.
- **Event is not persisted.** `event_id` is a computed field (`app/utils/ids.py`, an independent
  copy of the pipeline's `make_event_id` formula, parity-tested against it), added additively to
  the existing `Session` model. No Event table, no new migration, no new Postgres column — the
  Phase 0 decision (design review §7) held.

**What shipped:**

- `backend/app/utils/ids.py` — `slugify`/`make_event_id`, independently defined per ADR-0009,
  parity-tested against `pitwall_pipeline`'s copy (`backend/tests/test_ids.py`).
- `backend/app/models/telemetry.py` — `Session` gains two additive fields: `event_id: str` and
  `has_telemetry: bool`. No existing field renamed, retyped, or removed; the one existing
  construction call site (`ParquetRepository._session_from_row`) is the only place updated.
- `backend/app/repositories/base.py`/`parquet_repository.py` — `TelemetryRepository.has_telemetry()`
  (new abstract method) and `ParquetRepository`'s implementation (Parquet metadata-only row count,
  via `pyarrow.parquet.ParquetFile(...).metadata.num_rows` — no new dependency, `pyarrow` was
  already direct).
- `backend/app/models/discovery.py` (new) — `SeasonSummary`, `EventSummary`, independently defined
  response models (ADR-0009), never expose pipeline dataclasses.
- `backend/app/services/session_discovery/` (new) — pure grouping/ordering functions
  (`list_seasons`, `list_events_for_season`, `list_sessions_for_event`), matching the
  `session_analytics`/`tyre_performance` package convention of keeping domain logic
  repository-agnostic and independently unit-testable.
- `backend/app/api/seasons.py` (new) — the three routes above, registered in `app/main.py`.
- **404 vs. 200 [] resolved, documented explicitly** (in `app/api/seasons.py`'s own module
  docstring): `season` and `event_id` are never independently checked for existence, because
  neither is a persisted resource — both are aggregation keys over `list_sessions()`, not rows in
  a catalogue. Both return `200 []` uniformly for "nothing ingested yet," consistent with
  ADR-0011's existing "absence is data, not failure" posture; `404` stays reserved for
  `session_id`, the one identity a repository can check against a real, individually-stored
  Parquet directory. This is a deliberate divergence from this phase's own illustrative example
  (which suggested 404 for an unknown event) — implementing that would require either a persisted
  Event catalogue or a runtime FastF1 call, both explicitly forbidden by this same phase's other
  constraints, so 200 [] is the only compliant, principled answer.
- **Ordering, documented per level**: seasons descending (newest first, matching
  `SessionListPage.tsx`'s existing client-side convention); events by `(round_number, event_id)`
  ascending (identical rule to the pipeline's `IngestionPlan`, M12 Phase 3); sessions within one
  event by `session_date` ascending (the real timestamp already on every `Session` — the backend
  has no access to the pipeline's `Session1..5` schedule data and must not call FastF1 to get it),
  falling back to `SessionType`'s declaration order for the rare undated session.
- Tests: `test_ids.py` (6), `test_session_discovery_grouping.py` (17, pure functions),
  `test_seasons_route.py` (17, route-level, multi-session/multi-season fixture), plus additive
  tests in `test_parquet_repository.py` (6, `has_telemetry`/`event_id`) and `test_sessions_api.py`
  (4, additive fields on the existing `/sessions` routes).
- **Real-data verification** against the actual, already-ingested 2024 Bahrain Race (the only
  session locally present after Phase 3 — Practice/Qualifying were never locally ingested,
  confirmed by listing `data/processed/`): `GET /seasons` correctly reports one season with one
  event; `GET /seasons/2024/events` reports `session_types: ["race"]` only — **not** fabricating
  Practice/Qualifying merely because FastF1's upstream schedule knows about them; the existing
  `GET /sessions/{id}`/`GET /sessions/{id}/laps` routes are unchanged in behavior (1129 laps,
  matching every prior milestone's audit count) and now carry the two additive fields.

**What was NOT built (deliberately, and why):**

- `has_stints`/`has_pit_stops` capability flags — considered, not implemented. Adding them to
  `Session` would require `TelemetryRepository`'s own model to depend on `RaceContextRepository`
  (Postgres) data inside a single repository method, crossing the clean storage-boundary
  separation ADR-0011/M10 established. No concrete consumer needs this in the discovery response
  yet — the existing M10 `/stints`/`/pit-stops` endpoints already answer it directly, per request,
  for a client that needs to know. Flagged as a real, future extension point if a concrete
  consumer emerges, not built speculatively now.
- A richer "session detail" response beyond the existing (now additively extended) `GET
  /sessions/{session_id}` — the existing route already serves this role; a new, separate detail
  endpoint would have duplicated it for no concrete new need.
- Any Postgres schema change, new table, or migration — none was genuinely required; Event
  identity and capability flags were both answerable from existing Parquet data plus one
  additive, computed field.

**Validation:** backend pytest 260/260 (up from 212), `mypy --strict` clean (88 files), `ruff
check`/`ruff format --check` clean. Pipeline (140/140) and frontend (298/298, `tsc`, `eslint`,
`prettier`) unchanged and green — zero frontend files touched, zero pipeline files touched in this
phase. No new dependency (`pyarrow` was already direct). No migration, no new Postgres table/column.
`data/processed/`/`data/fastf1_cache/` byte-identical in size before and after — every real-data
check was read-only against the existing cache.

---

## Phase 5 — Frontend Session Navigation (complete)

**Goal:** the `Season → Event → Session → Driver/Analysis` navigation model, built against Phase
4's real API surface — not designed here, matching the design review's own explicit deferral (§11)
and this project's established M8→M9/M10→its-frontend-note/M11-backend→M11-frontend-note
sequencing. A dedicated frontend design note preceded this phase's implementation, the same way
`docs/m11-frontend-design-note.md` preceded M11 Phase 4 — see `docs/m12-frontend-design-note.md`.

**What shipped:** the old flat, all-sessions `SessionListPage` (client-filtered, no hierarchy) was
replaced by three new pages consuming Phase 4's discovery API unchanged: `SeasonListPage` (`/`),
`EventListPage` (`/seasons/:season`), `SessionListForEventPage`
(`/seasons/:season/events/:eventId`) — all in the existing `features/session-select/` directory,
alongside the untouched `DriverSelectPage`/`LapSelectPage`. Everything from the existing
`/sessions/:sessionId` route onward is byte-for-byte unchanged. `selectionStore` gained `season`/
`eventId` fields with the same cascading-clear pattern the existing `sessionId`/`driverId`/`lapId`
fields already used (additive to the existing store, per ADR-0007 — no new store). `Sidebar` gained
two new conditional trail links (`Events`, `Sessions`) using the identical pattern its existing
links already used. `api/client.ts` gained `SeasonSummary`/`EventSummary` types and
`listSeasons`/`listEventsForSeason`/`listSessionsForEvent`, and `Session` gained the two additive
fields (`event_id`, `has_telemetry`) Phase 4 already added on the backend.

**No hardcoded season/event/session anywhere** — every value rendered comes from the fetched
response; verified directly (not just by code inspection) in the real-browser check below, where
the app correctly showed only the one real season/event/session PitWall actually has ingested, with
no fabricated Practice/Qualifying entries.

**Tests added:** `SeasonListPage.test.tsx` (3), `EventListPage.test.tsx` (3),
`SessionListForEventPage.test.tsx` (4, including the "no telemetry data" capability-flag case),
`Sidebar.test.tsx` (5, new — the trail-link behavior specifically), `selectionStore.test.ts` (4,
new — the cascading-clear behavior specifically). `App.test.tsx` and the three existing `Session`-
literal-building test files (`TrackMapPage.test.tsx`, `TopSummaryPanel.test.tsx`,
`TyrePerformancePage.test.tsx`) updated additively for the two new required `Session` fields.
`SessionListPage.test.tsx` deleted alongside the page it tested.

**Real-data verification (real browser, real backend, real already-ingested data — not mocked):**
backend (`uvicorn`) and frontend (`vite`) dev servers started against the actual
`data/processed/2024/bahrain_grand_prix/race/` cache (no ingestion triggered); driven headlessly
with Playwright (chromium, already locally cached — not added as a project dependency) through the
full `/` → `/seasons/2024` → `/seasons/2024/events/2024_bahrain_grand_prix` →
`/sessions/2024_bahrain_grand_prix_race` flow. Confirmed: real season/event/round/location data
render; `session_types` correctly shows only `["race"]` (Practice/Qualifying were never locally
ingested, and are not fabricated); the session card correctly does *not* show "no telemetry data"
(real 2024 data has full telemetry); clicking through lands on the existing, unmodified
`DriverSelectPage` route and loads the real 20-driver grid; the Sidebar trail builds up correctly
(Seasons → Events → Sessions → Drivers). One console 404 was investigated and confirmed to be the
browser's default `/favicon.ico` request — no favicon exists anywhere in this project, a
pre-existing, unrelated gap, not a regression.

**Validation:** frontend vitest 314/314 (up from 298), `tsc -b --noEmit` clean, `eslint` clean,
`prettier --check` clean. Backend (260/260) and pipeline (140/140) unchanged and green — zero
backend/pipeline files touched in this phase.

**Deviation from the implementation plan as originally drafted:** none in scope — the plan's own
Phase 5 entry deferred all design decisions to a dedicated design note, which this phase produced
first (`docs/m12-frontend-design-note.md`) and then implemented, matching the stated exit criteria
exactly.

---

## Phase 6 — Controlled Multi-Session Ingestion Verification

**Status note:** Phase 3 already delivered a meaningful slice of this phase's original goal for
real —  a small real ingestion+idempotency check (2024 Bahrain Race, executed twice) and real
discovery/plan verification across a sprint weekend (2024 China), a sprint-era event (2021
British), an ordinary event (2024 Australian), and an older season (2018 Bahrain). What remains
genuinely open here, not yet done: an actual real, full **multi-session** ingestion run of every
session in one sprint weekend (Practice 1, Sprint Qualifying, Sprint, Qualifying, Race — Phase 3's
real checks only ingested one session for real), and the frontend-UI verification bullet below,
which depends on backend API work (now Phase 4) this document still treats as not yet started.

**Goal:** prove Phases 1–4 work against real, live, multi-session data — deliberately scoped to
Tier C (event-level), not Tier D (season-level) — before any larger run is even considered.

- Ingest one real, complete event exercising as much of the design review's matrix as one event
  can: a modern sprint-format event (e.g. a 2024 sprint weekend) covering Practice 1, Sprint
  Qualifying, Sprint, Qualifying, and Race in one real ingestion run — five real sessions, one
  event, using Phase 3's `execute_ingestion_plan()` for the first time against live FastF1 data for
  every session in one weekend (not fixtures, and not just the single session Phase 3's own real
  check exercised).
- Verify design review §3.6's finding empirically through PitWall's own pipeline (not just raw
  FastF1, as the design review itself did): confirm `normalize_stints`/`normalize_pit_stops`
  produce sensible, non-empty output for the ingested Practice/Qualifying/Sprint-Qualifying
  sessions, not just the Race — closing the "untested outside Race" gap the design review names in
  §2.4/§14.
- Verify the frontend's existing "unconditional strategy/tyre-performance links" (design review
  §2.3, §11) render sensibly — real data, real UI, not a hypothetical — against at least one
  non-Race session from this event, without modifying any frontend code to do so (this is
  verification of *existing* M10/M11 UI, not new Phase 5 work).
- Confirm per-session failure isolation (Phase 2/3) behaves correctly if any real session in this
  live run fails to load (design review §3.5 proved this is a real, not hypothetical, occurrence).

**Exit criteria:** one real event's full session set ingested and readable through the existing
API/UI without a backend or frontend code change beyond what Phases 1–5 already added; every
finding (expected or surprising) recorded before Phase 7 is considered.

**Status: implemented and verified. Zero backend/pipeline/frontend source file changed** — this
phase's entire deliverable is a real execution and its recorded evidence, exactly matching its own
exit criteria's "without a backend or frontend code change beyond what Phases 1–5 already added."

**What was run:** `python -m pitwall_pipeline.ingest_plan --season 2024 --event "Chinese Grand
Prix"` (dry-run first, then executed for real) — the 2024 Chinese GP, a genuine `sprint_qualifying`
era sprint weekend (design review §3.2's fourth table row), chosen because it was already the
design review's own worked example (§3, §19) and had partial schedule-level cache from that audit,
but had **never** been through `ingest_event()`/`execute_ingestion_plan()` for real before this
phase — every session below is newly, actually ingested, not replayed from a prior real run.

- Plan (dry-run, zero writes): 5 sessions planned, 2 correctly diagnosed `not available`
  (`practice_2`, `practice_3` — this event has none, matching the sprint-format schedule shape),
  0 event-level failures. Matches design review §3.2's predicted shape exactly before any ingestion
  was attempted.
- Execute (real, live FastF1 network calls — `data/fastf1_cache/` grew ~254MB, 295MB → 549MB;
  `data/processed/` is gitignored and not part of this repo's tracked diff): **5 succeeded, 0
  failed, 2 not available, 0 event(s) failed entirely.** Every session landed as
  `SessionIngestStatus.SUCCESS` (not `SUCCESS_NO_TELEMETRY`) — full telemetry loaded cleanly for
  every session, expected for 2024 data per design review §19.2 (the telemetry gap found there was
  2018-specific).

| Session | Laps | Telemetry samples | Drivers |
|---|---|---|---|
| `practice_1` | 453 | 558,129 | 20 |
| `sprint_qualifying` | 218 | 324,625 | 20 |
| `sprint` | 378 | 294,864 | 20 |
| `qualifying` | 279 | 473,401 | 20 |
| `race` | 1,032 | 862,980 | 20 |

(Row counts read directly from the written Parquet files after the real run, not estimated.)

**Stint/pit-stop normalization verified non-empty for every non-Race session** (this phase's second
goal, closing design review §2.4/§14's "untested outside Race" gap) — real PostgreSQL row counts
after ingestion, by session:

| Session | `stints` rows | `pit_stops` rows |
|---|---|---|
| `practice_1` | 71 | 71 |
| `sprint_qualifying` | 53 | 51 |
| `sprint` | 21 | 2 |
| `qualifying` | 94 | 93 |
| `race` | 60 | 41 |

All plausible for their session type (e.g. `sprint`'s low pit-stop count matches a short, normally
non-strategic race distance; `sprint_qualifying`'s real compound sequence for several drivers
includes a `MEDIUM → INTERMEDIATE` change, confirming this was — correctly, unprompted — a wet
session in the real 2024 data, not a fixture). `normalize_stints`/`normalize_pit_stops` needed no
change to produce this; design review §12's finding (they were already session-type-generic) is
now empirically confirmed, not just inferred from code inspection.

**Frontend/API verification against this real, new data (headless Playwright, chromium, cached —
not a project dependency, same precedent as Phase 5), zero frontend code touched:**
`GET /seasons` → `2024` now shows `event_count: 2`; `GET /seasons/2024/events` lists both Bahrain
(unchanged, `session_types: ["race"]`) and the new Chinese GP (`session_types: ["practice_1",
"qualifying", "sprint_qualifying", "sprint", "race"]`); `GET
/seasons/2024/events/2024_chinese_grand_prix/sessions` returns all 5, correctly ordered by real
`session_date` (not slot position) — `practice_1` (04-19 03:30) → `sprint_qualifying` (04-19
07:30) → `sprint` (04-20 03:00) → `qualifying` (04-20 07:00) → `race` (04-21 07:00), matching the
real weekend's actual chronology; every session correctly shows `has_telemetry: true`. Clicked
through `/` → `/seasons/2024` → `/seasons/2024/events/2024_chinese_grand_prix` →
`/sessions/2024_chinese_grand_prix_sprint_qualifying` (a genuine non-Race session) → both the
existing, unconditional "View session analytics" and "View tyre performance" links (design review
§2.3) — both rendered real data with no error state and no console errors. This directly closes
this phase's third goal: the "untested but accidentally plausible" links design review §2.3 flagged
are now verified-correct against real non-Race data, not just plausible by inspection.

**Per-session failure isolation:** the isolation machinery (Phase 2/3) executed correctly for the
*expected*, non-error case — `practice_2`/`practice_3` were correctly reported as `NOT_AVAILABLE`
and never attempted, never counted as failures. This real run did not happen to reproduce a genuine
`LOAD_FAILED` case (design review §3.5's Monza-class failure) — 2024 Chinese GP loaded cleanly for
all 5 requested sessions, so the `except Exception` boundary in `ingest_event()` was not exercised
by a real failure in this run. This is recorded honestly as not exercised, not claimed as verified
by inference from the fixture-level tests that already cover it (Phase 2's `test_ingest_event.py`).

**Two findings recorded, neither requiring a code change in this phase's scope:**

1. **Execution order inside `ingest_event()` follows `SessionType`'s enum declaration order
   (`practice_1, practice_2, practice_3, qualifying, sprint_qualifying, sprint, race`), not the
   event's real weekend chronology** — visible in this run's own log (`qualifying` was attempted
   before `sprint_qualifying`/`sprint`, even though the real weekend order is
   `practice_1, sprint_qualifying, sprint, qualifying, race`). This is purely a display/logging-order
   difference, not a correctness defect: `IngestionPlan.sessions` (used by `plan.describe()`) is
   already correctly chronological, per-session identifier resolution is independently correct
   regardless of attempt order, and no session's data was mislabeled or misordered as a result — only
   confirmed by inspection and the real run's log, not by a persisted defect. Recorded here per this
   phase's "every finding, expected or surprising" requirement; not fixed, as it is cosmetic and
   outside this phase's scope.
2. **The local Postgres instance is shared, unpartitioned, between real ingestion and
   `backend/tests/test_postgres_race_context_repository.py`, which `TRUNCATE TABLE stints,
   pit_stops` as test setup against whatever `PITWALL_DATABASE_URL` resolves to** — unset in this
   environment, so both the pipeline's ingestion and the backend's test suite default to the same
   `postgresql://pitwall:pitwall@localhost:5432/pitwall`. Running this phase's required backend
   `pytest` validation pass (as instructed) truncated the real `stints`/`pit_stops` rows this
   phase's own real ingestion had just written, as a side effect unrelated to any assertion in that
   test file. This is pre-existing behavior (the test and its `TRUNCATE` call predate M12 entirely —
   M10 Phase 3) exposed, not introduced, by this phase's combination of real ingestion against the
   same database the test suite also targets. **Not fixed here** — introducing test-database
   isolation is a testing-infrastructure change outside this phase's approved scope (no schema
   change, no new config was authorized), and is recorded as a real, evidence-based finding for
   whoever owns test/CI infrastructure next, not improvised as a fix. The Postgres rows above were
   restored by re-running `ingest_event()` a second time against the now-fully-warm FastF1 cache
   (confirmed: no new network calls, `data/fastf1_cache/` size unchanged by the second run) — the
   same, already-verified, idempotent operation this phase already executed once for real, not a new
   design. Parquet (`data/processed/`) was never affected; it is unconditionally idempotent and was
   never in question.

**Validation:** pipeline pytest 140/140 (unchanged), backend pytest 260/260 (unchanged — run before
the Postgres-restoring second ingestion pass above, per the finding just recorded), frontend vitest
314/314 (unchanged), `mypy --strict` clean (both workspaces), `ruff check`/`ruff format --check`
clean, `eslint`/`tsc -b --noEmit`/`prettier --check` clean. **Zero test count change, zero source
file changed, in any workspace** — this phase's exit criteria explicitly did not call for new code
or new tests, and none were added.

**Real-data verification method, stated in full per this project's evidence-disclosure convention**
(design review §3's own method section): all data above comes from a directly executed
`fastf1==3.8.3` `execute_ingestion_plan()` run against live FastF1 endpoints for the 2024 Chinese
Grand Prix (5 sessions), not from documentation, inference, or replaying a previously-cached
PitWall ingestion — this event had no prior `data/processed/` entry before this phase. Frontend/API
verification used the actual local Postgres (`pitwall-postgres-1` Docker container) and the actual
`data/processed/` Parquet cache this run produced, driven through real `uvicorn`/`vite` dev servers
and a headless Playwright browser — not mocked, not a fixture. This phase did not broaden scope
beyond one event: no season-wide or multi-season ingestion was run, no other event or season was
touched, and `data/processed/2024/bahrain_grand_prix/` is confirmed byte-for-byte untouched
throughout.

---

## Phase 7 — Historical Backfill Tooling

**Status note:** Phase 3 already built the planning/dry-run infrastructure a season-level driver
needs (`build_ingestion_plan()` already accepts multiple seasons and an `--all-events` selection,
gated behind explicit CLI confirmation flags) and proved it against a real two-season plan
(2023+2024 Bahrain, discovery/planning only). What remains genuinely open here, not yet done: an
actual real, full **season-wide** `execute_ingestion_plan()` run (every non-testing event in one
season, for real) — this phase's own explicit, opt-in, once-only execution, not exercised by Phase
3's deliberately narrow (one event, one session) real-ingestion check.

**Goal:** Tier D (season-level ingestion), exercised **once, for one season, as an explicit,
reviewed, opt-in operation** — not a default, not automatic, not the first thing this plan builds
(per this task's explicit "don't make download everything the first step" instruction, honored
throughout every earlier phase already).

- Run `execute_ingestion_plan()` once, against one real, complete season's `build_ingestion_plan()`
  output (Phase 3 — already the season-level driver, built directly on Phase 2's event-level
  ingestion; no new orchestration code needed here, only the actual execution and its real-world
  results), with the same per-session and per-event failure isolation Phase 2/3 established, and the
  results — success/failure/skip counts, total time, total disk — recorded as this phase's own
  evidence, the same way the design review recorded real FastF1 evidence rather than estimating it.
- **Tier E (multi-season historical bulk backfill) is explicitly not part of this phase and is not
  scheduled anywhere in this plan.** If a future milestone wants it, that milestone designs its own
  rate-limiting, storage-growth, and operational posture against this phase's real single-season
  numbers — not against a guess.

**Exit criteria:** one full season ingested successfully (allowing for a bounded, logged number of
individual session failures per design review §3.5/§10's expected-failure model — not a
zero-failure requirement, since §3.5 already proved that's not realistic even for FastF1's own
data); the actual resource cost (time, disk, request count) recorded for future planning.

---

## Phase 8 — Documentation / Release

- `docs/architecture.md`: document the discovery layer and the `Event` concept (Phase 1), and the
  event/season-level ingestion control plane (Phase 2/3/7), at the level of detail this document's
  own companion (M10/M11's final documentation pass) established as convention — extend, don't
  rewrite, the existing data-flow diagram and repository-structure listing.
- `docs/data-model.md`: document `Event` (Phase 1) and confirm whether Phase 4's backend decision
  introduced any new persisted field (most likely not, per design review §7's finding that the
  existing layout already suffices) — a confirmation section, matching M11's own "no new persisted
  schema" precedent, unless Phase 4 genuinely found otherwise.
- `docs/api-model.md`: document whatever season/event-scoped read surface Phase 4 actually shipped.
- `CHANGELOG.md`: a new `## M12` entry, following the exact structure of the M10/M11 entries,
  describing the actual shipped scope (through whichever phase this milestone's real implementation
  reaches — not assumed in advance to be all eight phases in one pass).
- `README.md`: milestone status table update, matching the M11 Phase 6 precedent of also fixing any
  staleness discovered at that time, not before.
- Confirm whether design review §18's open questions (Postgres season/event columns, event-name
  uniqueness, round-number stability, `Deleted`-flag availability, telemetry-channel-by-session-type)
  were resolved incidentally by Phases 1–7's real work, and record which remain genuinely open for
  a future milestone.

---

## Explicit Non-Goals (carried forward from the design review, restated for implementers)

Do not implement, in any phase of this plan, without a new design pass and explicit sign-off first:

- Tier E (multi-season historical bulk backfill) — no phase number, not scheduled, not implied by
  Phase 3's multi-season *planning* capability or Phase 7's single-season *execution* scope.
- Testing-event ingestion (design review §5) — excluded by default; supporting it is a new,
  unscoped decision.
- Any Postgres schema change adding season/event columns to `stints`/`pit_stops` (design review
  §8) — recorded as an open question, not authorized here.
- Any change to `TelemetryRepository`, `RaceContextRepository`, `app/services/session_analytics/`,
  or `app/services/tyre_performance/` — design review §12 confirmed none is needed; if a later
  phase discovers otherwise, that is a finding to record and escalate, not a change to make
  quietly.
- Any degradation modeling, weather ingestion, position/gap history, or other M10/M11-adjacent
  deferred feature — unrelated to this milestone.
- A new opaque/surrogate event-ID scheme (design review §6 — considered and rejected for this
  phase; no real consumer justifies it yet).
- Automatic or default season-level (Tier D) or historical (Tier E) ingestion triggered by any
  code path added in Phases 1–6 — Phase 3's plan-building accepts multiple seasons/events, but
  execution stays at the caller's explicit control (CLI safety gates: `--all-events`,
  `--confirm-multi-season`) and no code path defaults to a broad scope. Tier C (event-level) is the
  ceiling for anything actually *executed* for real, in this document, except Phase 7's own single,
  explicit, logged season-wide run.

## Architectural Decision Record status

**No ADR is required for M12 as scoped by this plan and its design-review companion** (design
review §16): the identity model is additive to `session_id` (no restructure), no new store or
layer boundary is introduced, `TelemetryRepository`/`RaceContextRepository` are unchanged, and
nothing here reverses a prior decision — it extends discovery and ingestion above an unchanged
foundation. If any phase, once actually started, discovers a need that doesn't fit this framing
(e.g. a reason the Postgres schema question in design review §8 turns out to be load-bearing sooner
than expected, or a reason `TelemetryRepository` itself needs to change), implementation must stop
and flag it for a design addendum before proceeding — per CLAUDE.md's Definition of Done, matching
every prior milestone's posture on this exact question.
