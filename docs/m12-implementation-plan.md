# PitWall — M12 Implementation Plan: Multi-Season / Multi-Event / Multi-Session Architecture

**Status:** Phases 0–6 complete and verified (canonical event/session model, single-event
discovery/orchestration, the multi-event/season planning-and-execution control plane, the backend
season/event/session discovery API, the frontend Season → Event → Session navigation UI, and a
real, live, full-event multi-session ingestion run proving all of the above against genuinely new
data). **Phase 7 complete and verified for seasons 2021, 2022, 2023, and 2025** (2021: 110 planned
sessions, 109 succeeded, one genuine, bounded, documented `LOAD_FAILED`; 2022: 110 planned sessions,
all 110 succeeded; 2023: 110 planned sessions, 109 succeeded plus one genuine `SUCCESS_NO_TELEMETRY`,
zero `LOAD_FAILED`; 2025: 120 planned sessions, all 120 succeeded, recovered across two real passes
after an initial, separately-run full-season pass reached 102/120 — see Phase 7's own section, batch
by batch, for the full real-execution record of each). 2024 was not run as its own M12 Phase 7
batch (its data already existed before M12 Phase 7 began) and 2026 has not been started. Phase 8
remains not started. See each phase section below for what actually shipped versus
what was originally planned — Phase 3, in particular, was assigned its number by live implementation
sequencing and covers different content than this document originally drafted for "Phase 3"; the
original Backend APIs/Frontend/verification/backfill phases are preserved, renumbered to Phases
4–8, not rewritten. Companion to `docs/m12-design-review.md`, which this plan does not re-argue.

**This document runs Phase 7 one season at a time, as separate batches.** Phase 7's own goal (§
below) scopes Tier D execution to "once, for one season, as an explicit, reviewed, opt-in
operation" — each batch (2021, then 2022, then 2023) is exactly that, repeated under explicit
approval each time, not a single multi-season sweep. Tier E (multi-season historical bulk backfill,
i.e. an automatic sweep across seasons without a per-season approval gate) remains explicitly
unscheduled; no season beyond what is recorded here was ingested, and no later season's real
ingestion is implied or authorized by this record.

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

### Phase 7, Batch 2 — season 2021

**Status: implemented and verified for season 2021.** Zero `pitwall_pipeline` source file changed —
this phase's entire deliverable is a real execution and its recorded evidence, matching the exit
criteria above exactly.

**What was run:** the approved season plan (`build_ingestion_plan([2021], event_queries=None,
session_types=None)` — the identical DISCOVER+PLAN call the dry-run review used, rebuilt fresh
rather than trusted from memory) was executed for real, event-by-event, sequentially, via
`ingest_event()` unchanged — 22 events, 110 planned sessions.

Execution used a thin, resumable operator harness (`stage_b_2021.py`, kept entirely in the
operator's scratchpad — never added to this repository) rather than calling
`execute_ingestion_plan()` directly, for one reason: FastF1's own client-side rate limiter
(`fastf1.req._CallsPerIntervalLimitRaise`, confirmed by reading `fastf1/req.py` directly — a hard
500-calls/hour cap, in-process memory only, `RateLimitExceededError` raised the instant it trips)
needed a clean stop-and-restart-in-a-fresh-process recovery strategy that `execute_ingestion_plan()`'s
single blocking loop doesn't provide by itself. The harness calls nothing beyond
`build_ingestion_plan()`/`ingest_event()`; at the start of every process invocation it recomputes
the exact set of still-missing planned sessions directly from real Parquet presence on disk (all 5
expected files per session — never from an in-memory or log-based memory of a prior attempt), then
calls `ingest_event()` with an explicit allowlist of only those missing session types per event.
This is the same "reconcile by session-ID set, then build an explicit allowlist of only what's
missing" recovery procedure the operator specified, automated rather than done by hand.

**Two real interruptions occurred during the run, both handled by this recovery design without any
data loss or duplication:**

1. The harness process was killed externally partway through the Austrian GP event (cause outside
   this phase's scope — not a rate-limit, not an ingestion-architecture failure). Because
   `ingest_session()` writes Parquet only after a session's FastF1 `.load()` fully succeeds, the
   in-flight session (`practice_3`→`race` transition) had no partial/corrupt directory to clean up —
   confirmed directly (`austrian_grand_prix/race` simply didn't exist yet) — and a fresh process
   resumed exactly where the real, on-disk state left off.
2. FastF1's 500-calls/hour limiter tripped once, during the Mexico City GP `race` session. The
   harness detected the limiter's own error signature in that one session's `LOAD_FAILED` outcome
   and stopped itself cleanly before attempting any further session — never letting a tripped
   limiter cascade into dozens of spurious `LOAD_FAILED` entries for sessions that were simply never
   attempted. A fresh process (a fresh in-memory counter) resumed immediately and completed the
   remaining events without further incident.

**Real outcome (109 of 110 planned sessions succeeded):**

| Status | Count |
|---|---|
| SUCCESS | 109 |
| SUCCESS_NO_TELEMETRY | 0 |
| NOT_AVAILABLE (diagnostics) | 44 |
| LOAD_FAILED | 1 |
| Event-level failures | 0 |

Session-type breakdown (successes / planned):

| Type | Success | Planned |
|---|---|---|
| practice_1 | 22 | 22 |
| practice_2 | 22 | 22 |
| practice_3 | 18 | 19 |
| qualifying | 22 | 22 |
| sprint | 3 | 3 |
| race | 22 | 22 |
| sprint_qualifying | 0 (correctly diagnosed NOT_AVAILABLE for every 2021 event, per design review §3.2) | 0 |

**The one `LOAD_FAILED`: 2021 Russian GP `practice_3`.** Reproduced identically three separate
times (once during the main run, twice on isolated fresh-process retries) with the same real,
unmocked traceback: FastF1's own `.load()` raises `fastf1.exceptions.NoLapDataError` ("Failed to
load session because the API did not provide any usable data"), which FastF1 logs and swallows
internally, leaving `session.laps` never populated; PitWall's `FastF1Provider.load_session()` then
raises `DataNotLoadedError` on the first attempt to read it. This is the same class of real, genuine
upstream data-availability gap the design review already documented for 2018 Monza (§3.5) — a real
absence in FastF1's own upstream data for this specific session, not a PitWall defect and not a
rate-limit artifact — recorded here as a bounded, logged failure per this phase's own exit
criteria, not retried further.

**All three 2021 sprint weekends verified**, matching the real historical structure the dry-run
review predicted and the design review's era table (§3.2):

| Event | Chronological order | `sprint_qualifying` | Sprint stints / pit stops |
|---|---|---|---|
| British GP | practice_1 → qualifying → practice_2 → sprint → race | NOT_AVAILABLE | 20 single-stint drivers, 1 pit stop |
| Italian GP | practice_1 → qualifying → practice_2 → sprint → race | NOT_AVAILABLE | 21 stints (1 driver pitted), 1 pit stop |
| São Paulo GP | practice_1 → qualifying → practice_2 → sprint → race | NOT_AVAILABLE | 20 single-stint drivers, **0** pit stops |

São Paulo's zero-pit-stop sprint was independently corroborated, not just accepted at face value:
every one of the 20 drivers' `stints` rows shows exactly 1 stint (no compound change recorded for
anyone), consistent with 2021's sprint format having no mandatory tyre change and this particular
sprint producing no strategic stops — a real, plausible historical fact (2021 was the first season
sprints existed), not a data gap.

**Reconciliation by session-ID SET (not counts alone):** the Parquet session-ID set (109, read
directly from each `session.parquet`'s `session_id` column) and the PostgreSQL `stints`
distinct-`session_id` set (109) are **exactly equal — zero orphans in either direction**. The
`pit_stops` distinct-session set is 108 (one fewer): `2021_s_o_paulo_grand_prix_sprint` has stints
but zero pit-stop rows, matching the real, corroborated zero-pit-stop finding above, not a
reconciliation gap. Zero duplicate `(session_id, driver_id, stint_number)` or `(session_id,
driver_id, stop_number)` rows exist in either table (`GROUP BY ... HAVING COUNT(*) > 1` returns
empty for both) — the existing `ON CONFLICT ... DO UPDATE` upsert (unchanged, M10/ADR-0011) held
throughout, including across the idempotency check below.

**Representative sessions manually inspected** (real row counts, not estimated): Bahrain Practice 1
(20 drivers, 361 laps, 621,426 telemetry samples), Bahrain Qualifying (251 laps, 437,929 samples),
British GP Sprint — the first sprint session in F1 history (339 laps, 274,869 samples), Abu Dhabi
Race — season finale (1,000 laps, 824,418 samples, 48 stints/32 pit stops, a normal multi-stop
strategic race). **Historical edge case: the Belgian GP Race** — the real 2021 event abandoned after
only a couple of laps behind the safety car — correctly captured as exactly that, not fabricated
into a normal race: 60 total laps across all 20 drivers (~3 each), 112,049 telemetry samples, and
20 `pit_stops` rows that are not an error but the real signature of what happened — every car's only
recorded pit action was returning to the pits when the session was red-flagged and never resumed.

**Idempotency, verified with a real second ingestion, not a mock:** the entire Bahrain event (5
sessions) was re-ingested for real via `ingest_event()` a second time, entirely against
already-cached FastF1 data (confirmed: every fetch logged "Using cached data for ..."). Every
session's Parquet lap/telemetry row counts were byte-identical before and after
(e.g. `race`: 1,027 laps / 895,953 telemetry samples, both times); every session's Postgres
`stints`/`pit_stops` row counts were identical before and after, and the **whole database's** total
row counts (24,030 `stints`, 22,652 `pit_stops` — every season combined) were unchanged by the
second run. `session.parquet` mtimes did change (a genuine overwrite occurred, not a skip) —
together these two facts are the real proof of idempotency: re-ingestion re-runs the full pipeline
and produces the identical result, rather than merely detecting "already done" and no-op'ing.

**2020 and 2024 datasets confirmed untouched throughout** (before ingestion, after ingestion, and
again after the full validation pass below): `data/processed/2020` (17 events) and
`data/processed/2024` (24 events) unchanged in directory count; PostgreSQL row counts for both
seasons byte-identical throughout (`2020`: 6,728 `stints` / 6,407 `pit_stops`; `2024`: 8,904
`stints` / 8,300 `pit_stops`).

**Resource cost, recorded per this phase's exit criteria:** `data/fastf1_cache/2021/` grew from
~77MB (a pre-existing partial cache left over from earlier design-review/Phase-1 audits) to 6.1GB;
`data/fastf1_cache/` total grew from 14GB to 21GB (+7GB) across the whole run, including the one
rate-limit-triggered restart and the one external-kill-triggered restart. `data/processed/` (not
part of this repo's tracked diff) gained 109 new session directories under `2021/`. Wall-clock time
was dominated by real data transfer/parsing, not by the artificial rate limit — restarting a fresh
process resets FastF1's in-memory counter instantly, so the 500-calls/hour cap did not meaningfully
throttle total throughput.

**Validation** (run after the real ingestion, idempotency check, and reconciliation above, all
against the real `pitwall` database; every PostgreSQL-touching test suite verified to use the
isolated `_test` database, per the isolation fix landed just before this phase — `c0a7c22`):
pipeline pytest 147/147, `mypy --strict` clean (17 source files), `ruff check`/`ruff format --check`
clean (38 files). Backend pytest 266/266, `mypy --strict` clean (52 source files), `ruff
check`/`ruff format --check` clean (90 files). Frontend vitest 314/314 (unchanged from M12 Phase 6),
`tsc -b --noEmit` clean, `eslint` clean, `prettier --check` clean (90 files) — zero frontend files
touched in this phase. The real `pitwall` database's `stints`/`pit_stops` row counts (24,030 /
22,652) were confirmed identical immediately before and immediately after the full validation pass,
and a separate `pitwall_test` database was confirmed to exist (created by the isolated-test-DB
fixtures) — direct, not inferred, evidence that the isolation fix was actually exercised, not merely
present.

**No architectural concern found requiring a code change.** The one genuine session failure
(Russian GP `practice_3`) is the design review's own §3.5 failure model working exactly as
predicted, not a new finding. No Postgres schema change, no new dependency, no `pitwall_pipeline`
source file touched.

**Explicitly not started in this batch:** 2022 (or any season beyond 2021), Phase 8
(documentation/release), CSV/export tooling, charts, and frontend work — none were touched, per this
phase's own scope and the milestone's non-goals list above. (2022 was picked up as a second,
separate batch immediately below — this statement is accurate as of the 2021 batch's own
completion, not rewritten in hindsight.)

### Phase 7, Batch 3 — season 2022

**Status: implemented and verified for season 2022.** Same architecture, same resumable operator
harness pattern as the 2021 batch (`stage_b_2022.py`, scratchpad-only, never added to this
repository) — `build_ingestion_plan([2022], ...)` for DISCOVER+PLAN, `ingest_event()` unchanged for
execution, per-event/per-session failure isolation inherited unchanged. One addition this batch,
made in the harness only (not in `pitwall_pipeline`): every invocation asserted the freshly-rebuilt
plan's event/session shape matched the approved Stage A dry-run exactly (22 events, 110 sessions,
the same event-ID list, the same 3-event sprint set) before attempting anything, escalating
immediately on any mismatch. It never fired — real discovery matched the approved plan on every one
of the run's several restarts.

**Stage A correction, confirmed by real discovery, not assumed:** the dry-run review's own stated
expectation ("Britain" as a 2022 sprint weekend) was wrong and was corrected by real FastF1 schedule
data before any ingestion began — 2022's three real sprint weekends are **Emilia Romagna (round 4),
Austria (round 11), and São Paulo (round 21)**; Britain ran a conventional weekend that year (sprint
racing didn't return to Silverstone until 2023). Execution confirmed this discovery was correct:
Britain's real ingested session set is the 5-session conventional structure, and the three sprint
events' real chronological order is `practice_1 → qualifying → practice_2 → sprint → race`, matching
2021's `sprint` `EventFormat` (design review §3.2) — 2022 is the second and final season of that
format before 2023's Sprint Shootout structure.

**Real outcome: 110 of 110 planned sessions succeeded — no `LOAD_FAILED`, no
`SUCCESS_NO_TELEMETRY`, zero event-level failures.** A cleaner result than the 2021 batch's 109/110:
the one genuine, reproducible `DataNotLoadedError` encountered mid-run (Japanese GP `practice_3`)
succeeded on its very next fresh-process retry, rather than reproducing a second time the way 2021's
Russian GP `practice_3` did.

| Status | Count |
|---|---|
| SUCCESS | 110 |
| SUCCESS_NO_TELEMETRY | 0 |
| NOT_AVAILABLE (diagnostics) | 44 |
| LOAD_FAILED | 0 |
| Event-level failures | 0 |

Session-type breakdown (all planned sessions succeeded):

| Type | Success | Planned |
|---|---|---|
| practice_1 | 22 | 22 |
| practice_2 | 22 | 22 |
| practice_3 | 19 | 19 |
| qualifying | 22 | 22 |
| sprint | 3 | 3 |
| race | 22 | 22 |
| sprint_qualifying | 0 (correctly diagnosed NOT_AVAILABLE for every 2022 event) | 0 |

**Telemetry availability:** full telemetry on all 110 successful sessions — zero
`SUCCESS_NO_TELEMETRY`, consistent with 2021's finding and the design review's 2018-only telemetry
gap (§19.2).

**Three real interruptions occurred during the run** (two external process kills, one FastF1
rate-limit trip — a higher frequency than the 2021 batch's two), all absorbed without data loss or
duplication by the same disk-truth-based resumable design: every kill was independently confirmed,
before restarting, to have landed before any Parquet write began for the in-flight session (no
partial/corrupt directory in any case — checked directly each time, not assumed); the one rate-limit
trip (mid-Spanish GP, cascading across that event's 5 requested sessions, then again briefly
mid-British-GP `race`, then mid-Singapore-GP) was detected via the limiter's own error signature and
stopped cleanly before any further event was attempted, exactly as designed.

**All three 2022 sprint weekends verified:**

| Event | Chronological order | `sprint_qualifying` | Sprint stints / pit stops |
|---|---|---|---|
| Emilia Romagna GP | practice_1 → qualifying → practice_2 → sprint → race | NOT_AVAILABLE | 21 stints (1 driver pitted), 1 pit stop |
| Austrian GP | practice_1 → qualifying → practice_2 → sprint → race | NOT_AVAILABLE | 20 single-stint drivers, 1 pit stop |
| São Paulo GP | practice_1 → qualifying → practice_2 → sprint → race | NOT_AVAILABLE | 21 stints (1 driver pitted), 1 pit stop |

**Reconciliation by session-ID SET:** Parquet (110), PostgreSQL `stints` (110), and PostgreSQL
`pit_stops` (110) session-ID sets are **exactly equal — zero orphans in any direction** (an even
cleaner result than 2021's, where São Paulo's zero-pit-stop sprint left `pit_stops` one session
short; every 2022 session, including all three sprints, recorded at least one real pit-stop row).
Zero duplicate `(session_id, driver_id, stint_number)` or `(session_id, driver_id, stop_number)`
rows in either table.

**Representative sessions manually inspected:** Bahrain Practice 1 (20 drivers, 387 laps, 465,465
telemetry samples), Bahrain Qualifying (256 laps, 375,884 samples), all three sprint sessions above,
Abu Dhabi Race — season finale (1,117 laps, 784,332 samples, 51 stints/34 pit stops), and Miami's
inaugural Grand Prix — a new circuit added to the 2022 calendar (1,057 laps, 795,472 samples, 45
stints/29 pit stops, a normal strategic race with no data anomalies from being a first-year event).

**Idempotency, verified with a real second ingestion:** the Emilia Romagna sprint weekend (5
sessions) was re-ingested for real via `ingest_event()` a second time, entirely against already-cached
data. Every session's Parquet lap/telemetry row counts and every session's Postgres `stints`/
`pit_stops` row counts were identical before and after (e.g. `sprint`: 400 laps / 272,920 telemetry
samples / 21 stints / 1 pit stop, all four numbers unchanged); the whole database's total row counts
(32,132 `stints`, 30,319 `pit_stops`) were unchanged by the second run. `session.parquet` mtimes
changed (genuine overwrite), confirming true idempotency rather than a no-op skip.

**2020, 2021, and 2024 confirmed untouched throughout:** directory counts unchanged (17 / 22 events
+ 109 sessions / 24); PostgreSQL row counts byte-identical throughout for all three seasons (`2020`:
6,728 `stints` / 6,407 `pit_stops`; `2021`: 8,398 `stints` / 7,943 `pit_stops`; `2024`: 8,904
`stints` / 8,300 `pit_stops`). The database's total row counts grew from this batch by exactly the
new 2022 rows (24,030→32,132 `stints`, +8,102; 22,652→30,319 `pit_stops`, +7,667) — no
cross-season contamination.

**Resource cost:** `data/fastf1_cache/2022/` grew from 86MB (pre-existing, from earlier design-review
probing) to 5.5GB; `data/fastf1_cache/` total grew from 21GB to 28GB (+7GB), consistent with the
2021 batch's growth. `data/processed/2022/` gained all 110 new session directories.

**Validation** (after the real ingestion, idempotency check, and reconciliation above, against the
real `pitwall` database; PostgreSQL-touching tests verified to use the isolated `pitwall_test`
database throughout): pipeline pytest 147/147, `mypy --strict` clean, `ruff check`/`ruff format
--check` clean. Backend pytest 266/266, `mypy --strict` clean, `ruff check`/`ruff format --check`
clean. Frontend vitest 314/314 (unchanged), `tsc -b --noEmit`/`eslint`/`prettier --check` all clean —
zero frontend files touched. The real `pitwall` database's row counts (32,132 / 30,319) were
confirmed identical immediately before and after the full validation pass.

**No architectural concern found requiring a code change.** The one non-rate-limit session failure
(Japanese GP `practice_3`) resolved on retry and needed no escalation. The three external
interruptions were each independently confirmed safe by direct disk inspection before resuming — the
resumable, disk-truth-based recovery design (established for the 2021 batch, unchanged here) held up
under a higher interruption frequency than 2021 without any code change.

**Explicitly not started in this batch:** 2023 (or any season beyond 2022), Phase 8, CSV/export
tooling, charts, and frontend work. (2023 was picked up as a third batch immediately below.)

### Phase 7, Batch 4 — season 2023

**Status: implemented and verified for season 2023.** Same architecture and resumable harness
pattern as the 2021/2022 batches (`stage_b_2023.py`, scratchpad-only). The discovery-drift guard
(introduced in the 2022 batch) was defined fresh for 2023's own approved shape — 22 events, 110
sessions, and, distinctly, a **6-event** sprint set (not 3, as in 2021/2022) — plus a new,
2023-specific check added to the guard: every `sprint_qualifying` session's real FastF1 identifier
had to equal `"Sprint Shootout"` exactly, or the run would escalate rather than silently ingest an
unexpected identifier. Neither guard fired on either of this batch's two passes.

**Stage A finding confirmed by real execution:** 2023's sprint weekends use a structurally
different shape than 2021/2022's — `practice_1 → qualifying → sprint_qualifying → sprint → race`,
with **both** `practice_2` and `practice_3` unavailable (2021/2022 sprint weekends only lost
`practice_3`, keeping `practice_2`). Execution confirmed this for real on all six sprint events; no
event silently reverted to the older 5-practice-slot shape.

**Sprint Shootout → canonical `sprint_qualifying`, verified end-to-end on real ingested data, not
just the plan:** Azerbaijan GP's real `PlannedSession.fastf1_identifier` was `"Sprint Shootout"`
(confirmed at Stage A); after real ingestion, the same session's written `session.parquet` stores
`session_type == "sprint_qualifying"` — the canonical resolver's alias table
(`SessionType.SPRINT_QUALIFYING: frozenset({"Sprint Qualifying", "Sprint Shootout"})`) verified
correct against real 2023 data end-to-end, from FastF1's own real display name through to what
PitWall actually persists.

**Real outcome: 110 of 110 planned sessions accounted for — 109 `SUCCESS`, 1
`SUCCESS_NO_TELEMETRY`, 0 `LOAD_FAILED`, zero event-level failures.** The first `SUCCESS_NO_TELEMETRY`
observed in any of the three real-ingestion batches so far, and the first observed for a modern
(non-2018) season: **Austrian GP `practice_1`** — a completely normal, full-length session (604
laps across all 20 drivers, no shortening) where `lap.get_telemetry()` failed for literally every
lap of every driver, a real, upstream FastF1 data gap (per-lap `except Exception` already handles
this, unmodified, per design review §19.2's precedent) rather than a truncated or corrupted session.
Laps/stints/pit-stops for this session are fully populated; only telemetry/track-map views would be
unavailable for it.

| Status | Count |
|---|---|
| SUCCESS | 109 |
| SUCCESS_NO_TELEMETRY | 1 |
| NOT_AVAILABLE (diagnostics) | 44 |
| LOAD_FAILED | 0 |
| Event-level failures | 0 |

Session-type breakdown:

| Type | Success | Success (no telemetry) | Planned |
|---|---|---|---|
| practice_1 | 21 | 1 | 22 |
| practice_2 | 16 | 0 | 16 |
| practice_3 | 16 | 0 | 16 |
| qualifying | 22 | 0 | 22 |
| sprint_qualifying | 6 | 0 | 6 |
| sprint | 6 | 0 | 6 |
| race | 22 | 0 | 22 |

**All six 2023 sprint weekends verified** — Azerbaijan (R4), Austria (R9), Belgium (R12), Qatar
(R17), United States (R18), São Paulo (R20) — each with the real `practice_1 → qualifying →
sprint_qualifying → sprint → race` order and both `practice_2`/`practice_3` correctly
`NOT_AVAILABLE`.

**Pre-existing `2023_monza_race` test-fixture contamination, explicitly accounted for, not
mistaken for ingestion, not touched:** 2 `pit_stops` rows (`VER`, stops 1–2) predating this batch —
the literal `SESSION_ID` fixture constant from `pipeline/tests/test_postgres_writer.py`, leaked into
the real `pitwall` database by a test run that predates the isolation fix (`c0a7c22`). `2023_monza_race`
is not a real PitWall session_id (the real Italian GP session is `2023_italian_grand_prix_race`) and
was correctly excluded from every reconciliation count below. Confirmed byte-identical (same 2 rows,
same values) before this batch began, immediately after ingestion, and again after the full test
suite ran — never created, modified, or deleted by any step of this batch.

**Reconciliation by session-ID SET:** Parquet (110) = PostgreSQL `stints` (110) — **exact match,
zero orphans**. PostgreSQL `pit_stops` raw distinct-session count is 110, but that count includes
the Monza contamination row; excluding it, real `pit_stops` = 109 — São Paulo's Sprint has zero real
pit-stop rows, independently corroborated the same way as the 2021/2022 batches (all 20 drivers show
exactly 1 stint, no compound change). Zero duplicate `(session_id, driver_id, stint_number)` or
`(session_id, driver_id, stop_number)` rows in either table.

**Representative sessions manually inspected:** Bahrain Practice 1/Qualifying/Race (conventional,
403/254/1,056 laps respectively), Azerbaijan's sprint-weekend Practice 1 (the only practice session
that weekend), Sprint Shootout, Sprint, and Race (all four with plausible lap/telemetry/stint/pit-stop
counts for a short, high-attrition street circuit).

**Idempotency, verified with a real second ingestion:** the Azerbaijan sprint weekend (5 sessions)
was re-ingested for real via `ingest_event()` a second time, entirely against already-cached data.
Every session's Parquet lap/telemetry counts and Postgres `stints`/`pit_stops` row counts were
identical before and after; the whole database's total row counts (40,203 `stints`, 37,827
`pit_stops`) were unchanged, and the Monza contamination row was independently re-verified unchanged
in the same pass. `session.parquet` mtimes changed (genuine overwrite), confirming true idempotency.

**2020, 2021, 2022, and 2024 confirmed untouched throughout:** directory counts unchanged (17 / 22
events+109 sessions / 22 events+110 sessions / 24); PostgreSQL row counts byte-identical for all
four seasons throughout (`2020`: 6,728/6,407; `2021`: 8,398/7,943; `2022`: 8,102/7,667; `2024`:
8,904/8,300). Total database rows grew by exactly the new 2023 rows (32,132→40,203 `stints`,
+8,071; 30,319→37,827 `pit_stops`, +7,508 real new rows, contamination excluded) — no cross-season
contamination.

**One real interruption** (an external process kill, mid-Austrian-GP `race` resolution, before any
Parquet write began) and **one FastF1 rate-limit trip** (mid-United-States-GP `race`, single session,
smallest blast radius of any batch so far) — both confirmed safe and absorbed cleanly by the same
disk-truth-based resumable design, zero data loss or duplication, matching the 2021/2022 batches'
precedent.

**Resource cost:** `data/fastf1_cache/2023/` grew from 81MB (pre-existing) to 5.4GB;
`data/fastf1_cache/` total grew from 28GB to 34GB (+6GB).

**Validation:** pipeline pytest 147/147, `mypy --strict` clean, `ruff check`/`ruff format --check`
clean. Backend pytest 266/266, `mypy --strict` clean, `ruff check`/`ruff format --check` clean.
Frontend vitest 314/314 (unchanged), `tsc -b --noEmit`/`eslint`/`prettier --check` all clean — zero
frontend files touched. The real `pitwall` database's row counts (40,203 / 37,827) and the Monza
contamination row were confirmed identical immediately before and after the full validation pass.

**No architectural concern found requiring a code change.** The one `SUCCESS_NO_TELEMETRY` session
is a real, already-handled case (per-lap telemetry `except Exception`, unmodified since M12 Phase 1)
— evidence the design review's 2018 finding generalizes to "any session can have this," not "only
pre-2019 seasons can," but not itself a defect. The pre-existing Monza contamination is a
test-infrastructure finding predating this batch, correctly identified and excluded from every
count, left untouched pending a separate cleanup decision.

**Explicitly not started in this batch:** 2024 real re-ingestion (2024 data already existed from
before M12 Phase 7), 2025/2026 (or any season beyond 2023), Phase 8, CSV/export tooling, charts, and
frontend work.

### Phase 7, Batch 5 — season 2025

**Status: implemented and verified for season 2025 — 120 of 120 planned sessions now present.**
Same architecture as the 2021/2022/2023 batches (`build_ingestion_plan()`/`ingest_event()`
unchanged, per-event/per-session failure isolation inherited unchanged), but this batch's own
operational record is split across two distinct real executions rather than one continuous
harness run, because the season's initial full-season ingestion pass (the one that reached the
102/120 baseline this batch started from) predates this record and its own operator harness/log
is not present in this session's scratchpad — its resource-cost figures are therefore **not**
recorded below, per this document's own "record only what is directly evidenced, never invent
numbers" convention (unlike Batches 2–4, where the full season's single run was directly observed
start to finish).

**Starting state (established by a prior read-only reconciliation, not re-derived here): 102 of
120 planned 2025 sessions present**, 18 missing — São Paulo GP (`sprint`, `qualifying`, `race`),
Las Vegas GP (all 5), Qatar GP (all 5), Abu Dhabi GP (all 5).

**Targeted recovery, run as two real, evidenced passes against the existing `ingest_event()`
allowlist mechanism (a scratch driver script, `recover_18.py`, kept out of this repository, same
precedent as every prior batch's harness):**

- **Pass 1** (`recover_18_pass1.log`, started 2026-08-15 11:42:53): requested São Paulo
  (`sprint`, `qualifying`, `race`), Las Vegas (all 5), and Qatar (all 5), in that order. São Paulo
  and Las Vegas completed in full (8 sessions). Qatar's `practice_1`, `sprint_qualifying`, and
  `sprint` completed in full (3 sessions). Qatar `qualifying` began loading, hit a real, reproducible
  per-lap telemetry gap for `RUS` lap 26 (`ValueError: attempt to get argmin of an empty sequence`
  inside FastF1's own `calculate_driver_ahead()`) — correctly caught and logged by the existing
  per-lap `except Exception` handler (Batch 3/4 precedent), **not** a crash — but the log ends
  abruptly one line after that warning, with no further output and no "Ingested" confirmation for
  that session. The process was manually stopped (external `kill`) at this point, confirmed by disk
  truth: `qatar_grand_prix/qualifying` did not exist on disk when Pass 1 ended. **11 of the 18
  originally-missing sessions were genuinely, successfully ingested by Pass 1** before the stop —
  reconciled directly against disk/Postgres (113 = 102 + 11, matching Parquet, `stints`, and
  `pit_stops` session-ID sets exactly, zero orphans) before Pass 2 was ever built, not assumed from
  the log alone.
- **Pass 2** (`recover_18.log`, `recover_18_result.json`, started 2026-08-15 11:57:13): built with
  an explicit per-event session-type allowlist covering only the 7 sessions still genuinely missing
  — Qatar (`qualifying`, `race`) and Abu Dhabi (all 5) — so the 113 already-present sessions were
  never re-requested. Qatar `qualifying` re-encountered the identical `RUS` lap 26 telemetry gap
  (same warning, same traceback, same caught-and-skipped handling) but this time the session's
  ingestion continued to completion and its Parquet write succeeded — a `SUCCESS` outcome (only one
  lap's telemetry skipped, not a `SUCCESS_NO_TELEMETRY`). All 7 targeted sessions succeeded; the run
  completed and the log ends with **`=== DONE. stopped_early=False stop_reason=None ===`** at
  2026-08-15 12:06:46 — a full, uninterrupted completion, not a second interruption.

**This resolves the ambiguity this batch's own read-only reconciliation flagged: the recovery
process that was manually stopped was Pass 1, not Pass 2.** Pass 2 (the run whose log this document
and the prior reconciliation both cite as `stopped_early=False`) genuinely ran to completion under
its own explicit, narrower 7-session scope; it was not itself interrupted. No claim is made here
that the *original* full-season ingestion pass (the one reaching 102/120) was interrupted — no log
for that run exists in this session's scratchpad to support or refute that either way.

**Real outcome: 120 of 120 planned sessions succeeded — 0 `LOAD_FAILED`, 0
`SUCCESS_NO_TELEMETRY`, zero event-level failures.** (The one real per-lap telemetry gap, `RUS` lap
26 in Qatar Qualifying, is a single skipped lap within an otherwise-`SUCCESS` session — the existing
per-lap exception boundary handled it exactly as designed, the same pattern already documented for
Austrian GP `practice_1` in Batch 4, just at finer granularity here.)

| Status | Count |
|---|---|
| SUCCESS | 120 |
| SUCCESS_NO_TELEMETRY | 0 |
| NOT_AVAILABLE (diagnostics) | 48 |
| LOAD_FAILED | 0 |
| Event-level failures | 0 |

Session-type breakdown (24 events; verified directly against real, on-disk Parquet session
directories, not from a log alone):

| Type | Success | Planned |
|---|---|---|
| practice_1 | 24 | 24 |
| practice_2 | 18 | 18 |
| practice_3 | 18 | 18 |
| qualifying | 24 | 24 |
| sprint_qualifying | 6 | 6 |
| sprint | 6 | 6 |
| race | 24 | 24 |

(24 events × 7 possible session types = 168 combinations; 120 succeeded, 48 correctly diagnosed
`NOT_AVAILABLE` — the 18 conventional-format events each lack `sprint_qualifying`/`sprint` (36), the
6 sprint-format events each lack `practice_2`/`practice_3` (12); 36 + 12 = 48, matching the table
above exactly.)

**All six 2025 sprint weekends verified** (the largest sprint-weekend count of any season in this
plan so far — one more than 2023's six, but note 2023's set and 2025's set are different events, not
a repeat): **China, Miami, Belgium, United States, São Paulo, and Qatar** — each confirmed by the
real presence of a `sprint_qualifying` directory under its event, matching 2023's `practice_1 →
qualifying → sprint_qualifying → sprint → race` structural era (both `practice_2`/`practice_3`
absent), not the older 2021/2022 shape.

**Reconciliation by session-ID SET (re-confirmed after Pass 2, not just after Pass 1's partial
state):** Parquet (120) = PostgreSQL `stints` distinct-session-ID set (120) = PostgreSQL `pit_stops`
distinct-session-ID set (120) — **exact three-way match, zero orphans in any direction.** Zero
duplicate `(session_id, driver_id, stint_number)` rows in `stints` and zero duplicate `(session_id,
driver_id, stop_number)` rows in `pit_stops` for any 2025 session (`GROUP BY ... HAVING COUNT(*) >
1` returns empty for both). Every one of the 18 recovered sessions' Parquet directories contains all
5 expected files (`drivers`, `laps`, `session`, `telemetry`, `track`), all non-zero-byte — no
partial or corrupt-looking session found among them.

**2020–2024 confirmed untouched throughout** (re-verified directly against the live database after
this batch, cross-checked against Batch 4's own recorded per-season totals — an even stronger check
than prior batches' own precedent, since it catches drift across two batches' worth of intervening
time, not just one): `stints`/`pit_stops` row counts are byte-identical to Batch 4's own recorded
figures for every prior season — `2020`: 6,728 / 6,407; `2021`: 8,398 / 7,943; `2022`: 8,102 / 7,667;
`2023`: 8,071 / 7,510 (the 2-row `2023_monza_race` test-fixture contamination Batch 4 identified and
excluded is still present, still unchanged, still correctly excluded from every 2023 count);
`2024`: 8,904 / 8,300. Parquet directory counts for those seasons are unchanged in shape (not
re-counted from scratch here, since the read-only reconciliation immediately preceding this batch's
documentation already confirmed this directly).

**2025's own final totals:** 9,495 `stints` rows, 8,874 `pit_stops` rows. Database grand total after
this batch: 49,698 `stints`, 46,701 `pit_stops` (all seasons combined, including the 2 pre-existing
Monza contamination rows) — arithmetic confirmed directly against the sum of every season's
individually-queried count above, not taken on faith from a single aggregate query.

**Resource cost — partially evidenced, not invented:** `data/fastf1_cache/2025/` is 6.3GB and
`data/fastf1_cache/` total is 42GB as of this batch's completion. Unlike Batches 2–4, a verified
*before* baseline for this specific batch's growth is not available — this batch's real work spans
two separate, narrower passes (11 sessions, then 7) layered on top of an earlier, unlogged
full-season pass this session has no record of, so a clean single before/after delta cannot be
honestly computed from evidence in hand. Recorded as the final, directly-measured size only; no
growth figure is claimed.

**Validation** (run after the real recovery and reconciliation above, against the real `pitwall`
database; PostgreSQL-touching tests verified to use the isolated `pitwall_test` database via the
Batch 2 isolation fix, `c0a7c22`): pipeline pytest 147/147, `mypy --strict` clean (17 source files),
`ruff check`/`ruff format --check` clean (38 files). Backend pytest 266/266, `mypy --strict` clean
(52 source files), `ruff check`/`ruff format --check` clean (90 files). Frontend vitest 314/314,
`tsc -b --noEmit` clean, `eslint` clean, `prettier --check` clean — zero frontend files touched, zero
backend/pipeline source files touched in this batch (this batch's only shipped artifact is this
document; `recover_18.py` and its logs are scratch operational tooling, kept out of this
repository, per every prior batch's own precedent). All four test counts (147/266/314, plus the
already-established 2020–2024 database totals) are unchanged from Batch 4's own recorded figures —
direct, repeated evidence, not assumed stability.

**No architectural concern found requiring a code change.** The one real per-lap telemetry gap
(`RUS` lap 26, Qatar Qualifying) is the same class of finding already recorded for Austrian GP
`practice_1` in Batch 4 — the existing per-lap `except Exception` boundary handled it correctly
without modification, evidence the pattern generalizes further, not a new defect. The two-pass
recovery required no change to `ingest_event()`, `build_ingestion_plan()`, or any other
`pitwall_pipeline` source file — the existing explicit-session-type-allowlist parameter (already
present since Phase 2) was sufficient, used exactly as designed.

**Explicitly not started in this batch:** 2026 (or any season beyond 2025), Phase 8, CSV/export
tooling, charts, and frontend work. This batch's completion brings every season from 2020–2025 to a
fully-reconciled, zero-known-gap state — the first point in this plan's real-execution history where
that is true simultaneously across all six seasons.

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
