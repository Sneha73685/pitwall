# PitWall — M12 Design Review: Multi-Season / Multi-Event / Multi-Session Architecture (Phase 0 Audit)

**Status:** Phases 0–5 approved/implemented and verified (see `docs/m12-implementation-plan.md`
for the phase-by-phase record, and `docs/m12-frontend-design-note.md` for Phase 5's own design
record). §19 (appended during Phase 1) resolves the Phase 0 open questions that were verifiable
with a small real-data sample, records two new findings Phase 1's verification surfaced —
including §19.3's "CRITICAL FUZZY-MATCHING SAFETY RULE" finding, which Phase 2 closed for
single-event ingestion and Phase 3 extended to multi-event/season planning and execution, both
with real (not mocked) verification. Phase 4 exposed the resulting model through a backend
discovery API (§7's "no Event table" decision upheld — `event_id` is a computed field, never
persisted); Phase 5 built the frontend `Season → Event → Session` navigation this design review's
§11 always anticipated as a later, separately-designed step. Sections 1–18 are preserved as the
original Phase 0 record and are not rewritten. Implementation of the canonical model itself is
recorded in `docs/m12-implementation-plan.md`.
**Status (original Phase 0):** audit only — no implementation, no schema change, no migration, no
ingestion change. This document, together with `docs/m12-implementation-plan.md`, is the complete
Phase 0 deliverable. Nothing past Phase 0 begins until this document is reviewed.
**Baseline:** M11 complete and merged into `main` (`eb1f369`) — descriptive tyre/stint analytics,
`app/services/tyre_performance/`, both M11 endpoints, M10's `stints`/`pit_stops` PostgreSQL tables.
**Author's framing:** senior engineering design review, matching the M8/M10/M11 precedent — audit
first, design only what the audit justifies, no code.

---

## 1. Problem Statement

Through M11, PitWall has ingested and can meaningfully analyze exactly **one session**:
`2024_bahrain_grand_prix_race` — the only directory under `data/processed/`. Every architectural
choice made so far — the Parquet cache layout, the `session_id` scheme, the flat `GET /sessions`
listing, the frontend's session→driver→lap navigation, the M10 Postgres schema — was designed
against that one session and has never been exercised against a second one, let alone a second
season, a second event, or a non-Race session type.

The product requirement is a real hierarchy:

```
Season → Event → Session → Analysis
```

across every session type FastF1 can provide (Practice 1–3, Sprint Qualifying/Shootout, Sprint,
Qualifying, Race), across multiple seasons and circuits. Reaching that requires answering three
questions this document is scoped to, and only these three:

1. **Does PitWall's current identity model (`session_id`, the Parquet directory layout, the
   Postgres composite keys) survive contact with real, multi-season FastF1 data — or does it
   silently collide, misresolve, or assume facts that aren't true beyond the one session tested
   so far?**
2. **Is "session" already a session-type-generic concept in PitWall's schema and services, or is
   race-specific meaning baked in anywhere that would break or mislead on a Practice/Qualifying/
   Sprint session?**
3. **What is the smallest architectural change that lets ingestion grow from "one hand-typed
   session" to "one session, then an event, then a season, then a historical range" without a
   second ingestion system or a rewrite each time a new season's format changes?**

This document does not implement any of that. It is the audit that must exist before a design for
it can be trusted, per CLAUDE.md's "design before code" and this task's explicit Phase 0 scoping.

---

## 2. Current-State Audit

### 2.1 Pipeline

- **`pitwall_pipeline/models.py`**: `SessionType` is a 7-member `str` enum — `PRACTICE_1/2/3`,
  `QUALIFYING`, `SPRINT_QUALIFYING`, `SPRINT`, `RACE`. No `TESTING` member exists.
  `make_session_id(season, event_name, session_type)` returns
  `f"{season}_{slugify(event_name)}_{session_type.value}"` — **`round_number` is not part of the
  identifier**; identity rests entirely on `(season, slugified event_name, session_type)`.
- **`FastF1Provider._SESSION_TYPE_TO_FASTF1_IDENTIFIER`**: a static `dict[SessionType, str]`
  mapping PitWall's 7 types to FastF1 identifier strings (`FP1`, `FP2`, `FP3`, `Q`, `SQ`, `S`, `R`),
  fixed at import time, with no season/event-format awareness. **§3.3 shows this mapping is
  factually wrong for `SPRINT_QUALIFYING` across two of the three sprint-format eras FastF1 has
  used.**
- **`ingest.py`**: `ingest_session(season, event, session_type, ...)` — one call, one session, one
  `fastf1.get_session(...).load()`. The CLI (`--season`, `--event`, `--session`) requires all three
  as scalars; there is no event-level or season-level entrypoint, and no discovery step (nothing
  calls `fastf1.get_event_schedule()` anywhere in this codebase today — confirmed by a repo-wide
  grep, zero hits).
- **`cache_writer.py`**: `session_cache_dir()` writes to
  `{base_dir}/{season}/{slugify(event_name)}/{session_type.value}/` — exactly three path segments,
  matching `make_session_id`'s three identity components in the same order.
- **Postgres migrations** (`migrations/0001_create_stints.sql`, `0002_create_pit_stops.sql`):
  `session_id TEXT NOT NULL` is the only session-identifying column on either table — **there is no
  `season`, `event_name`, or `round_number` column in Postgres at all.** Every row's season/event
  membership is only recoverable by string-parsing `session_id`, never by an indexed query.
- **Idempotency**: re-running `ingest.py` for the same `(season, event, session_type)` overwrites
  Parquet files in place (directory is deterministic) and upserts Postgres rows on the natural key
  — already idempotent per-session, a real asset for scaling up (§9).

### 2.2 Backend

- **`ParquetRepository._iter_session_dirs`**: `self._base_dir.glob("*/*/*/session.parquet")` — a
  **hardcoded three-level glob**, directly coupled to `cache_writer.py`'s three-segment layout. Any
  future layout change (e.g. inserting a round-number or event-id segment) breaks this glob
  silently (it would just stop matching, not error).
- **`_find_session(session_id)`**: iterates *every* session directory, reads *every*
  `session.parquet`, and does a linear string match — there is no index, no season/event
  pre-filter. `list_sessions()` returns literally every ingested session, unfiltered, unpaginated.
- **No `/seasons` or `/events` route exists anywhere** — confirmed: every `APIRouter` in
  `backend/app/api/` is `prefix="/sessions"` (or unprefixed, for `/health`). There is no backend
  concept of "event" or "season" as a queryable resource today, only as fields on a flat `Session`.
- **`SessionType` is independently redefined** in `backend/app/models/telemetry.py`, byte-identical
  to the pipeline's, per ADR-0009's anti-corruption rule — already correctly duplicated, not
  imported; any taxonomy change must be made in both places, as every prior milestone's session-type
  vocabulary change already had to be.
- **`RaceContextRepository`** (M10/M11): both methods take `session_id` only — no season/event
  parameter exists or could be added without a schema change (§8).

### 2.3 Frontend

- **`selectionStore`** (Zustand, ADR-0007): `{ sessionId, driverId, lapId }` — no `seasonId` or
  `eventId` slice exists. Session-level identity is the finest-grained concept the store models.
- **`SessionListPage`** (the `/` route): fetches `GET /sessions` once, unfiltered, and does
  **client-side** season filtering/search over the full result set — there is no season- or
  event-scoped fetch anywhere in the frontend. This works today because there is exactly one
  session to filter over; it is untested at any real multi-season scale.
- **No event or season navigation page exists.** The route table (`App.tsx`) goes directly from
  `/` (a flat session list) to `/sessions/:sessionId` (`DriverSelectPage`) — there is no
  `/seasons/:season` or `/seasons/:season/events/:event` route, and no component that groups
  sessions by event.
- **Race-specific-looking links render unconditionally**: `DriverSelectPage` always shows "View
  session analytics" and "View tyre performance"; `LapSelectPage` always shows "View Strategy" and
  "View Stint Pace" — regardless of `session.session_type`. §5 shows this is **less broken than it
  looks** (stints/pit-stops/compound are genuinely present in non-Race sessions, verified §4), but
  it was never a deliberate decision — M10/M11 built and tested exclusively against a Race session,
  so this is untested-but-accidentally-plausible behavior, not verified-correct behavior.
- **`SESSION_TYPE_LABELS`** (`components/sessionTypeLabels.ts`) already has all 7 canonical labels,
  including `"Sprint Qualifying"` — a UI label that, per §3.3, is factually the *display name* for
  only one of the three historical sprint-quali eras, even though PitWall's internal `SessionType`
  vocabulary treats it as one stable concept across all of them.

### 2.4 What M10/M11 already got right for this milestone

Both prior storage/analytics milestones deliberately kept every read pattern **session-scoped**
(`list_laps(session_id, ...)`, `list_stints(session_id, ...)`) — nothing in the backend or frontend
assumes it is looking at "the only session," only "a session, identified by `session_id`." This
matters directly for M12: the hierarchy can be added as a **navigation and identity layer above**
the existing session-scoped reads, without rewriting `TelemetryRepository`, `RaceContextRepository`,
`session_analytics`, or `tyre_performance` — none of which need to know about seasons or events at
all. §12 makes this compatibility claim explicit.

---

## 3. Real FastF1 Coverage Findings

**Method, stated in full per this task's evidence requirement:** all findings below come from the
FastF1 version actually installed in this repository's `pipeline` workspace
(`fastf1==3.8.3`, confirmed via `uv run python -c "import fastf1; print(fastf1.__version__)"`), run
against real network calls where no local cache existed. Nothing below is inferred from FastF1's
documentation or changelog without direct code execution against it.

**What was fetched (kept minimal per this task's instructions):**
- `fastf1.get_event_schedule(season)` for seasons 2018, 2019, 2021, 2022, 2023, 2024, 2025 —
  schedule metadata only (one small HTTP request per season, no session data).
- `fastf1.get_session(...)`/`fastf1.get_event(...)` calls for identifier-resolution checks (§3.3) —
  these also only touch schedule-level data, not full session loads.
- Six `session.load(laps=True, telemetry=False, weather=False, messages=False)` calls — laps-only,
  no telemetry, no weather, no race-control messages — for: 2024 Bahrain FP1, 2024 Bahrain
  Qualifying, 2024 Chinese GP Sprint Qualifying, 2024 Chinese GP Sprint, 2018 Italian GP (Monza)
  Race, 2018 Bahrain Race.
- Net effect on `data/fastf1_cache/` (FastF1's own on-disk cache, gitignored, pre-existing in this
  repo): grew from 101MB to 116MB (+15MB) across all of the above. `data/processed/` (PitWall's own
  ingested output) was **not touched** — no `ingest.py` run occurred; this audit only exercised the
  FastF1 library directly, never PitWall's own pipeline.
- No telemetry-resolution data (the multi-hundred-thousand-row-per-session channel data M1/M5 use)
  was fetched for any session beyond the pre-existing 2024 Bahrain Race cache from before this
  audit. Telemetry-channel availability by session type (§3.6) is therefore **not independently
  re-verified here** and is labeled explicitly as such.

### 3.1 Season coverage and schedule shape

`fastf1.get_event_schedule(season)` returns one row per event with columns:
`RoundNumber, Country, Location, OfficialEventName, EventDate, EventName, EventFormat, Session1..5,
Session1..5Date, Session1..5DateUtc, F1ApiSupport`. Confirmed present and structurally identical
(same column set) for every season tested, 2018–2025 — this is a stable, lightweight discovery
surface (§3.4).

`F1ApiSupport` was `True` for every 2018 event checked — FastF1's own signal for whether its richer
API-backed loading path is available is not gated by season the way this audit initially expected;
2018 data loaded successfully for one event (Bahrain, §3.5) and failed for another (Monza, §3.5) for
an unrelated, session-specific reason. **No systematic "seasons before year X have no lap data"
boundary was found** in the seasons tested; FastF1's practical earliest-supported season is stated
in its own documentation as 2018 (timing-data granularity), which this audit did not attempt to
contradict or extend past — testing earlier seasons is out of this Phase 0's minimal-sample scope
and is flagged as unverified (§18).

### 3.2 `EventFormat` has changed shape three times — this is the central finding

| Season(s) | `EventFormat` value | Session1 | Session2 | Session3 | Session4 | Session5 |
|---|---|---|---|---|---|---|
| 2018–2020 | `conventional` | Practice 1 | Practice 2 | Practice 3 | Qualifying | Race |
| 2021–2022 | `sprint` | Practice 1 | **Qualifying** | Practice 2 | **Sprint** | Race |
| 2023 | `sprint_shootout` | Practice 1 | Qualifying | **Sprint Shootout** | Sprint | Race |
| 2024–2025 | `sprint_qualifying` | Practice 1 | **Sprint Qualifying** | Sprint | **Qualifying** | Race |
| all seasons | `testing` | Practice 1 | Practice 2 | Practice 3 | *(none)* | *(none)* |

(Verified directly for every season/format combination shown, §3 method above — not inferred.)

Three things this table proves that a static `SessionType → FastF1 identifier` map (the pipeline's
current `_SESSION_TYPE_TO_FASTF1_IDENTIFIER`) cannot represent:

1. **Session *slot order* changes.** In `conventional` and `sprint_qualifying` formats, `Qualifying`
   sets the Race grid. In `sprint`/`sprint_shootout` formats (2021–2023), `Qualifying` is
   `Session2` and sets the **Sprint's** grid, not the Race's (2021–2022) or is itself unrelated to
   a separate shootout that sets the Sprint grid (2023). "Qualifying" is not a fixed slot number or
   a fixed grid-setting role across eras — it is whatever FastF1's per-event schedule says it is
   that weekend.
2. **The "sprint qualifying" concept did not exist at all in 2021–2022.** Those weekends have
   exactly five sessions — FP1, Q, FP2, Sprint, Race — with nothing filling the slot PitWall's
   `SessionType.SPRINT_QUALIFYING` represents. There is no FastF1 session to ingest for that type
   in those two seasons; it is not a data-quality gap, it is a real absence.
3. **The display name for the same *conceptual* slot changed twice** in three years: "Sprint
   Shootout" (2023) → "Sprint Qualifying" (2024–2025) — genuinely different session names for what
   the product still wants to treat as one canonical taxonomy entry (§5).

### 3.3 The static FastF1-identifier mapping is empirically wrong, in a dangerous way

Testing `fastf1.get_session(season, event, identifier)` directly against real data (not inferred):

| Call | Result |
|---|---|
| `get_session(2021, "British", "SQ")` | **Resolves successfully to `s.name == "Sprint"`** — the identical session `get_session(2021, "British", "S")` also returns. |
| `get_session(2022, "Emilia Romagna", "SQ")` | Same: resolves to `s.name == "Sprint"`, identical to `"S"`. |
| `get_session(2023, "Azerbaijan", "SQ")` | **Raises `ValueError("Session type 'SQ' does not exist for this event")`.** |
| `get_session(2023, "Azerbaijan", "SS")` | Resolves correctly to `s.name == "Sprint Shootout"`. |
| `get_session(2024, "China", "SQ")` | Resolves correctly to `s.name == "Sprint Qualifying"`. |
| `get_session(2024, "China", "SS")` | Raises `ValueError` — 2024 has no session named "Sprint Shootout". |

**This is a real, verified defect-in-waiting, not a hypothetical:** if PitWall's current
`FastF1Provider` (unchanged since M0) were pointed at a 2021 or 2022 sprint weekend and asked to
ingest both `SessionType.SPRINT_QUALIFYING` and `SessionType.SPRINT`, it would silently fetch,
normalize, and store the **same Sprint race data twice** under two different `session_id`s (one
correctly labeled `..._sprint`, one incorrectly labeled `..._sprint_qualifying` and containing
Sprint-race laps mislabeled as a qualifying session) — no exception, no warning surfaced to
PitWall's own logs, because FastF1 itself doesn't error on `"SQ"` for those seasons; it just
resolves loosely to whatever session it can find. For 2023, the identical code path (`"SQ"`) would
instead crash with an unhandled `ValueError`, which — since `ingest.py` has no `try/except` around
`FastF1Provider.load_session()` today — would abort the whole ingestion run.

This single finding is the strongest evidence in this document for why a canonical session type
cannot be resolved via a fixed lookup table (§5, §9) and must instead be resolved from each event's
own schedule metadata (`EventFormat`, `SessionN` names) at discovery/ingestion time.

### 3.4 Metadata discovery without a full session load — confirmed

`fastf1.get_event_schedule(season)` and `fastf1.get_event(season, event)` both return before any
`.load()` call, using only FastF1's lightweight schedule data. `fastf1.get_session(...)` likewise
returns a `Session` object immediately; `session.name`, `session.date`, and `session.event` (the
full schedule row, including `EventFormat` and every `SessionN`/`SessionNDate` field) are populated
at this point. Accessing `session.laps` or `session.session_info` **before** `.load()` raises
`fastf1.exceptions.DataNotLoadedError` — confirmed directly, not assumed. This means: **event/session
discovery (Tier A in the implementation plan) is a genuinely separate, cheap operation from
ingesting a session's laps/telemetry (Tiers B+)** — the architecture can and should treat them as
different operations with different costs, not one bundled "ingest" call.

### 3.5 Session-load failure is a real, non-hypothetical condition

`fastf1.get_session(2018, "Monza", "R").load(laps=True, telemetry=False, ...)` reproducibly logs
`WARNING: Failed to load timing data!` and leaves `session.laps` inaccessible
(`DataNotLoadedError` on access, or `.load()` itself raising, observed both ways across repeated
runs against the now-warm cache — reproducible, not a network fluke). The *same* season's Bahrain
Race (`get_session(2018, "Bahrain", "R")`) loads cleanly with the full modern lap schema (998 rows,
every column PitWall's `normalize_laps`/`normalize_stints`/`normalize_pit_stops` depend on present).
**Conclusion: session-load failure is per-session, not per-season** — a multi-session ingestion
architecture must treat "this specific session failed to load" as an expected, individually
recoverable outcome (§10), not evidence the whole season/event needs different handling.

### 3.6 Lap-level channel availability across session types — verified for the fields PitWall's normalize.py reads

Six session-type samples (2024 Bahrain FP1/Q, 2024 China Sprint-Qualifying/Sprint, 2018 Bahrain/Monza
Race) were loaded laps-only and their `laps` DataFrame columns and null rates inspected directly:

| Field | FP1 (Practice) | Q (Qualifying) | Sprint Qualifying | Sprint | Race (2018) |
|---|---|---|---|---|---|
| `Compound` | present, 0 null | present, 0 null | present, 0 null | present, 0 null | present |
| `Stint` | present, 0 null | present, 0 null | present, 0 null | present, 0 null | present |
| `TyreLife` | present, 0 null | present, 0 null | present, 0 null | present, 0 null | present |
| `PitInTime`/`PitOutTime` | present, populated on real in/out laps | same | same | same | present |
| `Position` (per-lap) | present, **100% null** | present, **100% null** | present, **100% null** | present, populated | present |
| `results.Position`/classification | `NaN` (Practice has no official classification) | populated (quali order) | `NaN` (not Ergast-supported, see below) | populated (race-like classified order) | populated |

**This directly contradicts the implicit assumption behind M10/M11 only ever having been tested
against a Race session: `Compound`, `Stint`, `TyreLife`, and pit-lane in/out timing are not
race-specific data at all — they are populated identically in Practice and Qualifying.** Drivers
change tyres and enter/exit the pits during every session type; FastF1 reports it uniformly. What
*is* genuinely session-type-specific is **per-lap track `Position`** (only meaningful when cars are
racing wheel-to-wheel for classification purposes — null in Practice/Qualifying/Sprint-Qualifying,
populated in Sprint/Race) and **session classification semantics** (Qualifying's `results.Position`
reflects knockout-session order from `Q1`/`Q2`/`Q3`, not on-track finishing position; Practice has no
classification at all).

One conditional-availability gap surfaced directly in FastF1's own warnings during this audit:
`"Sprint Qualifying is not supported by Ergast! Limited results are calculated from timing data."`
— for the 2024 China Sprint Qualifying load, FastF1 fell back to computing `results` from raw timing
data rather than its usual Ergast-backed path, and a related warning
(`"Cannot calculate qualifying results: missing information about deleted laps... race control
messages"`) shows the `Deleted`-lap flag depends on race-control-message data this audit's
laps-only fetch deliberately didn't load — its 100%-null result across every sample here is
**unverified as a real absence** versus an artifact of this audit's minimal fetch, and is flagged as
such rather than asserted (§18).

Telemetry-channel availability (speed/throttle/brake/RPM/gear/DRS/x/y/z — the M1/M5 channels) was
**not independently re-verified per session type in this audit** (no `telemetry=True` load was run,
per the instruction to keep the sample minimal); FastF1's telemetry is sourced from the same car
sensor feed regardless of session type, so there is no a priori reason to expect it varies by
session type the way lap-level classification data does, but this is a reasoned inference, not a
verified finding, and is listed as an open item (§18).

### 3.7 Event identity: `round_number` is not unique within a season

`fastf1.get_event_schedule(2022, include_testing=True)` returns **two** rows with `RoundNumber == 0`
— "Pre-Season Track Session" and "Pre-Season Test" — both real events in the same season sharing the
same round number. `get_event_schedule(..., include_testing=False)` (verified as an actual parameter
this FastF1 version accepts) excludes both, and the minimum `RoundNumber` among the remaining rows
is `1`, confirmed unique per real championship round. **`(season, round_number)` is therefore not a
safe identity key in general** — it is safe only for non-testing events, and PitWall would need to
either exclude testing events from ingestion entirely (simplest) or use a different identity
component for them. `(season, slugified event_name)` — PitWall's current choice — does not collide
in either testing case tested here, since the two 2022 test events have different `EventName`
values; no case of two same-season events sharing an identical `EventName` was found in the seasons
sampled, but this is not exhaustively proven for all 2018–2025 events (§18).

---

## 4. Representative Session Matrix

Every row below reflects a real, directly-executed FastF1 call in this audit (§3's method) — no row
is inferred from documentation alone.

| Season | Event | Weekend format | Session requested | FastF1 resolves to | Verified |
|---|---|---|---|---|---|
| 2018 | Bahrain GP | conventional | `R` | Race, full modern lap schema (998 laps, all fields) | ✅ loaded laps |
| 2018 | Italian GP (Monza) | conventional | `R` | Race — **load fails** (`DataNotLoadedError`, reproducible) | ✅ verified failure, not a hypothetical |
| 2021 | British GP | sprint | `S` | Sprint | ✅ loaded laps (channel table §3.6 not run for this one; schedule/identifier only) |
| 2021 | British GP | sprint | `SQ` | **Same session as `S`** — no distinct sprint-qualifying session exists in this format | ✅ verified via identical `s.name` |
| 2022 | Emilia Romagna GP | sprint | `SQ` | Same aliasing as 2021 | ✅ verified |
| 2023 | Azerbaijan GP | sprint_shootout | `SS` | Sprint Shootout (distinct session) | ✅ verified |
| 2023 | Azerbaijan GP | sprint_shootout | `SQ` | **Raises `ValueError`** — no such identifier this season | ✅ verified failure |
| 2024 | Bahrain GP | conventional | `FP1` | Practice 1 — full lap/stint/compound/pit schema, `Position` null | ✅ loaded laps |
| 2024 | Bahrain GP | conventional | `Q` | Qualifying — same schema, classified `results.Position` | ✅ loaded laps |
| 2024 | Bahrain GP | conventional | `R` | Race (already locally ingested pre-M12, full telemetry) | ✅ pre-existing PitWall ingestion |
| 2024 | Chinese GP | sprint_qualifying | `SQ` | Sprint Qualifying (distinct session, real identifier this era) | ✅ loaded laps |
| 2024 | Chinese GP | sprint_qualifying | `S` | Sprint — `results.Position` populated, per-lap `Position` populated | ✅ loaded laps |
| 2022 | (season-wide) | testing (×2 events) | — | Two events sharing `RoundNumber == 0` | ✅ verified via schedule |

---

## 5. Canonical Session Taxonomy

**Decision: keep PitWall's existing 7-member `SessionType` enum as the canonical, stable,
persisted vocabulary — it is already era-independent by construction, since it names *roles*
(`sprint_qualifying`) not FastF1's *display strings* (`"Sprint Shootout"`). Nothing about §3's
findings argues for changing the enum's members.** What must change is how a `SessionType` is
**resolved** to a real FastF1 session for a given event, and how "this type doesn't exist for this
event" is represented — both currently absent.

- **`TESTING` is explicitly not added to the enum in this document.** Every one of §3's findings
  about testing events (round-number collision, three-session-only schedule, no Q/R) is a reason to
  treat testing as **out of scope for ingestion** (simplest resolution — exclude via
  `get_event_schedule(..., include_testing=False)`, which this FastF1 version supports, §3.7) rather
  than a reason to model it. If a future milestone wants testing-session data, that is a new,
  explicit decision with its own identity-model consequences (no round number, no Q/R structure),
  not a free extension of this taxonomy. Flagged, not designed (§16, §18).
- **Resolution must be discovered per-event, not looked up in a static dict.** The fix implied by
  §3.3/§3.6's findings: at ingestion time, resolve a requested `SessionType` against that specific
  event's actual `Session1..5` names (from `fastf1.get_event(season, event)`, already a cheap,
  pre-load call per §3.4) rather than trusting a fixed `SessionType → "SQ"/"S"/...` table. If the
  requested type's canonical *role* (e.g. "the sprint-qualifying-shaped session, whatever its
  display name is this era") isn't present in that event's schedule, that is a normal, expected
  "not applicable to this event" outcome — not an error, and not silently substituted with a
  different session (closing §3.3's defect). The exact mapping logic (e.g. matching
  `EventFormat` to a small, explicit per-era table of `SessionN` positions) is implementation detail
  for Phase 1/2 of the plan, not resolved here — this document only establishes that it must be
  **derived from the event's own schedule row**, never a static enum-keyed dict.
- **The three sprint-quali eras are one canonical `SPRINT_QUALIFYING` type, three real-world
  shapes.** PitWall's stored data (`session_type = "sprint_qualifying"`) stays stable across eras;
  the *fact* that 2021–2022 has no such session for a given event, 2023 calls it "Sprint Shootout",
  and 2024+ calls it "Sprint Qualifying" is provenance the resolution step consumes and discards —
  it does not need to be persisted per session, matching how PitWall already treats `SessionType` as
  more stable than FastF1's own display strings (`normalize_session`'s whole reason for existing).

---

## 6. Event/Session Identity Model

**Decision: `Session` identity stays `(season, event slug, session_type)` — `session_id` is not
restructured — but a new, explicit `Event` identity concept is introduced above it, distinct from
both `session_id` and `round_number`.**

- **Why not `round_number` as the event key:** §3.7 proved two same-season events can share
  `round_number == 0` (testing). Since §5 already excludes testing from ingestion, this collision
  is moot **for events PitWall will actually ingest** — every real championship round has a unique
  `round_number` within its season by definition (it's the literal calendar order). This document
  records the testing-collision finding because it is real evidence for *why* `round_number` alone
  is not intrinsically safe, not because it currently blocks anything.
- **Why `(season, event slug)` remains the safer general-purpose key over `(season, round_number)`
  even for real rounds:** round numbers can be reassigned mid-season (a cancelled/rescheduled event
  shifts every subsequent round's number) in ways `EventName` does not retroactively change for
  already-ingested data — this is a plausible risk based on real F1 history (2020's COVID-disrupted
  calendar, 2021's Australian GP cancellation) that this audit did not attempt to reproduce
  against FastF1 data (out of this Phase 0's minimal-sample scope) and is listed as unverified
  (§18), but is consistent with why PitWall's existing `session_id` scheme already chose the event
  name over the round number.
- **New `Event` identity**: `(season, event slug)` — the same two components `session_id` already
  encodes, promoted to their own addressable concept rather than only existing implicitly as a
  `session_id` prefix. This is additive: every existing `session_id` remains valid and
  self-describing; an `Event` is simply "the group of sessions sharing this `(season, event slug)`
  prefix," derivable from existing data without a new persisted field on `Session` itself, though
  §7/§8 note where a persisted, indexed version of this grouping earns its keep.
- **`round_number` stays on `Session` as a display/ordering field** (already is, per
  `Session.round_number: int`) — it is useful for chronological display within a season and is not
  being removed, only confirmed as unsuitable for *identity*.
- **No opaque/numeric event ID is invented.** FastF1 exposes none (confirmed — `get_event_schedule`'s
  column list has no ID-shaped field beyond `RoundNumber`, and `RoundNumber` is unsafe per above).
  Inventing a PitWall-only surrogate event ID was considered and rejected for this phase: it would
  need its own allocation/collision strategy for no read pattern that isn't already served by
  `(season, event slug)`, the same "don't build ahead of a real consumer" discipline ADR-0006
  already established for `TelemetryRepository`.

---

## 7. Filesystem/Data-Layout Implications

**Finding: `data/processed/{season}/{event_slug}/{session_type}/` does not need to change shape.**
It already encodes exactly the identity model §6 settles on — season, event, session type, in that
order, as directory segments. Nothing in this audit found a reason to add a fourth segment (e.g. a
round-number or event-id directory) or to restructure the three Parquet files' internal schemas.

What the audit *does* flag as insufficient, without prescribing the fix (Phase 1+ concern):

- **`ParquetRepository._iter_session_dirs`'s hardcoded `glob("*/*/*/session.parquet")`** is coupled
  to exactly three path segments by construction. It does not need to change for §6's identity
  model (which keeps three segments), but it is worth naming explicitly as the one piece of code
  that would need to change in lockstep if a future layout decision ever did add a segment — it is
  not independently discoverable from the directory structure, it is a hardcoded assumption.
- **No index exists — every session lookup is a full directory scan.** At one session, this is
  free. At a real multi-season scale (a full season is ~24 events × up to 5 sessions = up to ~120
  sessions; multiple seasons compounds linearly), `_find_session`'s linear scan-and-read-every-
  `session.parquet` becomes a real, measurable cost on every single-session request, not just
  `list_sessions()`. This is a **performance** finding, not a **correctness** finding — nothing
  about it produces wrong data, and `docs/backlog.md` already has a precedent entry for exactly
  this shape of "fine at V1's session count, not fine forever" cost
  (`ParquetRepository._find_session` re-globbing). Recorded here for Phase 3's awareness, not
  designed as a solution — an in-memory or on-disk index is a legitimate future answer but is not
  justified by this milestone's actual scope (a controlled multi-session *ingestion* verification,
  not a season-scale *read-performance* commitment, per the implementation plan's Phase 5 boundary).

---

## 8. PostgreSQL Implications

**Finding: the current schema is collision-safe (natural composite keys already prevent
cross-session collision by construction — `session_id` is part of every primary key), but it is
query-blind above the session level.**

- `stints`/`pit_stops` have **no `season`, `event_name`, or `round_number` column** — every
  season/event-scoped question ("every stint on SOFT tyres across the 2024 season," "every pit stop
  at this circuit across years") requires either parsing `session_id` strings in application code
  (fragile — `session_id`'s internal structure is explicitly *not* an API contract per
  `docs/api-model.md`'s "match on session_id, don't parse it" convention, extended here to Postgres)
  or a join against a `sessions` table that doesn't exist in Postgres at all (`Session` lives only
  in Parquet, per ADR-0011 — deliberately, since sessions/drivers/laps have no relational read
  pattern that justifies moving them).
- **This document does not resolve whether that gap needs fixing**, because M12's actual, current
  scope (per this task's explicit boundary) is ingesting and navigating multiple sessions — not
  cross-session aggregate analytics (that's a hypothetical future milestone, not this one).
  Recorded as a real, evidence-based architectural question for whoever designs that future
  milestone: either add denormalized `season`/`event_name` columns to `stints`/`pit_stops` now
  (cheap, additive, unused until something queries them) or defer the decision entirely until a
  concrete cross-session read pattern exists (ADR-0006's "interfaces grow when a second real
  implementation forces them to" principle, applied to schema instead of an interface). **This
  document takes no position between those two options** — flagged as an open question (§18), not
  a design decision, because nothing in this milestone's actual scope needs the answer yet.
- **No schema change is proposed by this document.** §6/§7 already showed the identity model
  doesn't require one; this section exists to record that Postgres's current shape is *adequate but
  not future-proof* for multi-season data, which is a materially different, weaker claim than "no
  changes are ever needed here."

---

## 9. Ingestion Architecture

**Current state:** `ingest_session(season, event, session_type)` is a single, hand-typed operation —
one FastF1 fetch, one Parquet write, one Postgres write, no discovery step before it, no loop above
it. This is not wrong for what it was built for (M1's "ingest exactly the one session M2 needs to
design against"); it was never intended to scale, and nothing about it was changed by M8–M11.

**What the audit confirms can layer on top without a second ingestion system:**

- §3.4 already proved metadata discovery (`get_event_schedule`, `get_event`) is a **separate,
  cheap** operation from a full session load — this is the architectural seam a `discover` step
  can occupy, sitting entirely above `ingest_session`, never modifying it.
- §5's session-type resolution (era-aware, schedule-driven) is naturally where "discover which
  sessions exist for this event, and what FastF1 identifier each currently needs" belongs — as a
  **new, small function** consulted by `ingest_session` before it calls
  `_SESSION_TYPE_TO_FASTF1_IDENTIFIER` (or replaces that static dict outright), not a parallel
  ingestion path.
- **`ingest_session`'s actual per-session logic does not need to change shape** to be called in a
  loop — it is already a pure "(season, event, session_type) → written cache directory" function
  with no hidden global state (confirmed by reading it in full, §2.1). An event-level "ingest every
  session this event actually has" or season-level "ingest every event this season has" driver is,
  structurally, a loop that calls the *same* `ingest_session` function once per discovered
  `(event, session_type)` pair — not a rewrite of what it does per call.
- **The one real gap for looping safely**: `ingest_session` has no per-call failure isolation today
  — a `FastF1Provider.load_session()` exception (§3.5's Monza case, or §3.3's `ValueError` for a
  mismatched identifier) propagates straight out of `ingest_session` uncaught. A single bad session
  in a 24-event, ~100-session season loop would currently abort the entire run. This is the
  concrete, evidence-based reason a loop cannot simply be bolted onto today's `ingest_session`
  unchanged — it needs a per-session try/except boundary at the call-site that loops it, matching
  the pattern `ingest_session` *already* uses internally for its own Postgres write (§2.1 — a narrow
  `except psycopg.Error`, logged, not swallowed, not fatal to the rest of the run).

This document does not design the loop, the CLI surface, or the failure-handling code — that is
Phase 2 of the implementation plan. It only establishes, with evidence, that the existing
single-session function is the right unit to build on, not something to replace.

---

## 10. Idempotency / Resume / Failure Model

Building directly on §2.1's and §9's findings, not proposing new mechanisms yet:

- **Idempotency already exists at the single-session level** and needs no change: Parquet
  overwrites the same deterministic directory; Postgres upserts on natural keys. Re-running
  ingestion for an already-ingested `(season, event, session_type)` is already safe today.
- **Resume, at a multi-session scale, is a natural consequence of that existing idempotency, not a
  new mechanism**: an event/season-level driver that re-runs and simply re-attempts every
  discovered session (skipping none) would, by construction, leave already-successful sessions
  unchanged (idempotent overwrite) and retry only what previously failed — **provided** each
  session's failure is isolated (§9's gap) rather than aborting the whole run. A separate
  "resume from where it left off" bookkeeping mechanism is very likely unnecessary given this — but
  this document does not commit to that conclusion as a final design, only as a reasoned
  implication of what already exists, to be confirmed once Phase 2 actually builds the loop.
- **Failure boundary, evidenced by §3.3 and §3.5**: two distinct real failure shapes were found —
  (a) a session that genuinely doesn't exist for this event/era (§3.3's `ValueError` for a
  mismatched sprint-quali identifier — an expected, "not applicable" outcome once §5's discovery
  step is in place, not an error at all) and (b) a session that should exist but fails to load for
  upstream data-quality reasons (§3.5's Monza case — a real failure, must be logged and skipped, not
  silently substituted or allowed to abort a larger run). These are different outcomes and the
  eventual implementation must be able to tell them apart, not collapse both into one generic
  "ingestion failed" bucket.
- **Retry/backoff**: PRD §4 already names FastF1 rate-limiting/upstream instability as a known,
  general risk; nothing in this audit found new evidence changing that risk's shape at
  multi-session scale beyond "there are now more opportunities to hit it." No specific retry policy
  is designed here — out of Phase 0's scope, and premature before Phase 2 establishes real
  multi-session run volume to design a policy against.

---

## 11. Frontend Navigation Implications

Per §2.3's audit, the frontend currently has exactly one navigational tier below "all sessions
ever" — `/sessions/:sessionId`. The minimum future navigation model the product requirement
implies:

```
Season → Event → Session → Driver / Analysis
```

This document does **not** design the routes, components, or data-fetching pattern for that — per
this task's explicit "no frontend implementation, no redesign" boundary, and because Phase 4 of the
implementation plan is exactly where that design belongs, sequenced after the backend surface it
would consume actually exists (the same M8→M9, M10→its own frontend note, M11-backend→
M11-frontend-note sequencing this project has used every time). What this audit does establish, as
inputs to that future design:

- **`selectionStore` would need a `seasonId`/`eventId` concept** (or the existing pattern of
  deriving them from route params without new store state, matching how `driverId`/`lapNumber`
  are already route params, not store fields beyond `sessionId` itself) — a real decision, not
  taken here.
- **`GET /sessions` cannot remain a single unfiltered fetch at real scale** — the frontend's
  season/event grouping will need either a season/event-scoped backend read pattern (a new,
  narrower endpoint) or continued client-side grouping over a larger unfiltered list; §7's
  "no index yet" finding is the backend-side mirror of this same scaling question. Not resolved
  here — a Phase 3 (backend API) decision informed by whatever Phase 2 (ingestion) actually produces
  at real scale.
- **The "unconditional strategy/tyre-performance links" finding (§2.3) does not need to be
  "fixed"** by this milestone — §3.6 shows the underlying data (compound, stints, pit timing) is
  genuinely present for Practice/Qualifying sessions too, so those links are not incorrect, only
  untested outside a Race session. Verifying they render sensibly (or with an honest empty state)
  against a real non-Race session is exactly the kind of check the implementation plan's Phase 5
  (controlled multi-session ingestion verification) exists for — a verification task, not a
  redesign.

---

## 12. Compatibility with M10/M11

**No change is required to any M10 or M11 code, model, endpoint, or service for this document's
recommendations to hold.** This is a direct consequence of §2.4: `RaceContextRepository`,
`app/services/tyre_performance/`, and every M10/M11 endpoint already operate purely in terms of
`session_id` (and, since M11, an optional `driver_id` filter) — none of them know or care whether
that `session_id` belongs to a season with one ingested session or five hundred, or whether its
`session_type` is `race` or `practice_1`. §3.6's finding that stint/compound/pit data is genuinely
present across session types means M11's descriptive analytics, specifically, are **more
session-generic than M11's own design review assumed** (M11 was scoped and tested exclusively
against a Race session, but nothing in its domain logic — `stint_join.py`, `boundary_laps.py`,
`compound_aggregation.py`, etc. — reads `session_type` at all, confirmed by inspection). This is a
finding worth recording precisely because it means M12 does not need to "generalize" M11's
analytics for multi-session-type support — they were already general, just never exercised outside
one session type.

---

## 13. What Can Be Generalized Safely

- **Metadata discovery** (`get_event_schedule`, `get_event`) — session-type-agnostic, season-
  agnostic, cheap (§3.4). Safe to build a discovery layer on top of this with no per-session-type
  branching beyond what §5's resolution step already needs.
- **The Parquet layout and its three-segment identity** (§7) — already generalizes; no schema
  change needed for the identity model this document settles on.
- **`Lap`/`Stint`/`PitStop`/`compound` normalization** (§3.6, §12) — genuinely session-type-generic
  at the data level; M10/M11's existing code already treats it this way and needs no change.
- **Ingestion's core per-session function** (§9) — already the right unit to loop over; the loop
  itself, not the function, is what's missing.
- **Idempotent overwrite/upsert behavior** (§10) — already correct at single-session granularity;
  generalizes to multi-session runs without new mechanism, only new failure isolation around it.

## 14. What Remains Session-Type-Specific

- **Per-lap track `Position`** (§3.6) — genuinely null outside Sprint/Race; any future feature
  reading it must treat Practice/Qualifying/Sprint-Qualifying as "not applicable," not "missing
  data to fix."
- **Session classification semantics** (§3.6) — Qualifying's classification comes from `Q1/Q2/Q3`
  knockout structure, not finishing position; Practice has no classification at all; Sprint/Race
  share race-like classified position. Any future "driver classification" feature needs
  session-type-aware interpretation, not a single generic "position" field read uniformly.
- **Session-slot role resolution itself** (§3.2, §3.3, §5) — which FastF1 identifier a canonical
  `SessionType` maps to for a given event is, by definition, session-type- and era-specific; this
  is precisely what §5 requires be resolved dynamically rather than generalized away.
- **Pit-stop *strategic* meaning** (as opposed to the raw pit-lane-timing *fact*, which is
  session-generic per §3.6) — "this pit stop was part of a race strategy" is a Race/Sprint framing;
  a pit-lane visit during Practice or Qualifying is a setup/tyre-preparation event, not a strategy
  decision in the same sense. Nothing in M10/M11's data model currently distinguishes this
  (`PitStop` has no session-type-aware field, nor should it — it's a raw fact, §12), but any future
  UI copy or analysis that narrates pit stops as "strategy" should not do so unconditionally across
  every session type. Flagged for whichever future milestone writes that copy, not resolved here.

---

## 15. Risks

| Risk | Evidence | Mitigation posture (not designed here) |
|---|---|---|
| A future contributor "fixes" `_SESSION_TYPE_TO_FASTF1_IDENTIFIER`'s `SQ`/`SS` confusion with another static dict keyed by season-range, which breaks again the next time FastF1/F1 changes the sprint format (a real, recurring event — three eras in five years). | §3.2, §3.3 | Resolution must read the event's own schedule (`EventFormat`, `SessionN` names) at ingestion time, never a hardcoded season-range table (§5, §9). |
| A season/event-level ingestion loop is built directly on top of `ingest_session` without adding per-session failure isolation, and one bad session (§3.5's real Monza case) aborts an entire season's ingestion run. | §3.5, §9, §10 | Named explicitly as Phase 2's first requirement in the implementation plan, not an afterthought. |
| Someone assumes M11's tyre/stint analytics need session-type-specific changes to "support" Practice/Qualifying, and spends effort generalizing code that was already general (§12). | §3.6, §12 | This document records the finding precisely so that effort isn't spent — verification (implementation plan Phase 5), not modification. |
| Testing events get ingested by accident because a season-level "ingest everything" driver doesn't explicitly exclude `EventFormat == "testing"`, producing round-number collisions (§3.7) or sessions with no Qualifying/Race to analyze. | §3.7 | §5 already recommends excluding testing via `get_event_schedule(..., include_testing=False)`, a real, confirmed parameter — Phase 2 must make this the default, not opt-out. |
| The Postgres schema's missing season/event columns (§8) get "fixed" preemptively as part of this milestone even though nothing in M12's actual scope needs a cross-session query yet — scope creep into a hypothetical future milestone's problem. | §8 | Explicitly called out as an open question, not a decision, specifically so it isn't quietly implemented (§18). |
| `ParquetRepository`'s linear directory scan (§7) becomes a real latency problem once real multi-season ingestion volume exists, and gets discovered in production rather than anticipated. | §7 | Recorded in this document and cross-referenced to `docs/backlog.md`'s existing precedent entry for the same shape of problem, so it's tracked, not silently deferred into invisibility. |

---

## 16. Non-Goals

Per this task's explicit scope boundary, restated here as the audit's own record of what it
deliberately did not attempt:

- No source code, migration, or dependency change (this document + its implementation-plan
  companion are the entire Phase 0 deliverable).
- No historical backfill or bulk download — §3's method section states exactly what was fetched
  (15MB of schedule/laps-only data across seven seasons and six sessions).
- No frontend redesign or implementation.
- No new ADR — §17 confirms none of this document's findings meet CLAUDE.md's ADR trigger
  (new dependency, new layer boundary, or reversal of a prior decision); everything recommended
  here is additive to the existing identity model and layering, not a reversal of it.
- No testing-event support design (§5) — explicitly excluded from ingestion scope, not designed.
- No resolution of the Postgres season/event-column question (§8) — recorded as open, not decided.
- No change to M10 or M11 behavior, contracts, or code (§12 — confirmed unnecessary, not merely
  deferred).
- No degradation modeling, weather, position/gap history, or any other M10/M11-adjacent deferred
  feature — unrelated to this milestone's actual scope and not reopened here.

---

## 17. Success Criteria (for Phase 0 specifically)

- Every claim in §3 traces to a directly-executed FastF1 call against the installed `fastf1==3.8.3`,
  not to documentation or inference — confirmed throughout this document by inline evidence.
- The representative session matrix (§4) covers a normal weekend, a sprint weekend across all three
  historical sprint-quali eras, a modern season, an older season, and Practice/Qualifying/Sprint/
  Race session types, per this task's explicit minimum requirements — confirmed present in §4.
- At least one concrete, previously-undiscovered defect risk in the *existing, already-merged* M0
  pipeline code is identified with reproducible evidence (§3.3's `SQ` aliasing) — not fabricated,
  not hypothetical.
- The identity model (§6) is derived from real collision evidence (§3.7), not assumed safe by
  default.
- No ADR was required, and this document explains why (§16) rather than silently declining to
  write one.
- `docs/m12-implementation-plan.md` exists as a companion phased plan that does not begin
  implementation, matching this document's own non-goals.

---

## 18. Open Questions

1. **Postgres season/event columns** (§8): add denormalized `season`/`event_name` columns to
   `stints`/`pit_stops` now (cheap, unused until needed) or defer until a real cross-session query
   exists? Not decided — no current read pattern needs it.
2. **Event-name uniqueness within a season, beyond the two testing-event cases checked** (§3.7,
   §6): not exhaustively verified across all 2018–2025 events. Low risk (real championship rounds
   have FIA-assigned distinct names by construction) but not proven here.
3. **Round-number stability across a season for already-ingested data** (§6): whether a
   mid-season cancellation/reschedule can retroactively change an already-ingested event's
   `round_number` in FastF1's schedule data was not tested against a real historical case (e.g.
   2021 Australian GP's cancellation) — flagged, not verified.
4. **`Deleted`-lap-flag availability** (§3.6): observed as 100% null across every sample in this
   audit, but FastF1's own warning suggests this requires race-control-message data this audit's
   laps-only fetch didn't load. Genuinely unknown whether it's populated with a fuller fetch —
   explicitly unverified, not asserted either way.
5. **Telemetry-channel availability by session type** (§3.6): reasoned as likely session-type-
   generic (same car sensors regardless of session) but not independently re-verified with a real
   `telemetry=True` load in this audit, per the instruction to keep the sample minimal.
6. **FastF1's actual earliest reliably-supported season**: this audit tested back to 2018 (per
   FastF1's own documented boundary) and found it functional (with one per-session failure, §3.5,
   unrelated to season age). Whether seasons before 2018 are worth ever supporting is a product
   question this document takes no position on.
7. **Whether the testing-event exclusion (§5) should be a hard ingestion-time filter or a
   configurable opt-in**: this document recommends "excluded by default," not "impossible to
   ingest" — the exact mechanism is Phase 2's decision, not fixed here.

---

## 19. Phase 1 Real-Data Verification (Part A addendum)

Executed at the start of M12 Phase 1, before any code was written, to resolve open questions §18
flagged as unverified. Same method discipline as §3: every claim below traces to a directly
executed `fastf1==3.8.3` call, not documentation. **What was fetched, in addition to §3's method
section:** two `messages=True` laps-only loads (2024 Bahrain Qualifying, 2024 Chinese GP Sprint);
five full session loads with `telemetry=True` restricted to one lap's telemetry each (2024 Bahrain
FP1/Qualifying, 2024 Chinese GP Sprint, 2018 Bahrain Race, 2018 Australian GP Race — the last two
specifically to chase down a reproducible failure, §19.2); one additional `include_testing=True`
schedule fetch per season for 2019/2020/2021/2022/2023/2024/2025 (schedule-level only); a handful
of `get_event()`/`get_session()` identifier-resolution calls (schedule-level only). Net effect on
`data/fastf1_cache/`: grew from 116MB (post-Phase-0) to 295MB — the increase is almost entirely the
five `telemetry=True` session loads, each one real session's full car/position channel data, not a
historical range. `data/processed/` (PitWall's own ingested output) remains untouched — confirmed
before and after this verification pass.

### 19.1 `Deleted`/`DeletedReason` — resolved, not a real absence

§3.6/§18 Q4 flagged this as unverified because a laps-only, `messages=False` fetch showed 100%
null. Re-run with `messages=True` (2024 Bahrain Qualifying, 2024 Chinese GP Sprint): `Deleted`
populates correctly — 2 deleted laps out of 267 (Qualifying), 3 of 378 (Sprint), each with a
real `DeletedReason` string (`"TRACK LIMITS AT TURN 7 LAP 9"`, etc.), and `session.race_control_messages`
itself returns real rows (14 and 19 respectively) with `Category`/`Flag`/`Scope` columns. **Confirmed:
this is a real, reliable signal, gated behind `messages=True` on `.load()` — not a data-quality gap.**
Any future consumer of lap-validity/deletion data must request race-control messages explicitly;
the M1-era default `.load()` call (no explicit `messages=` argument) already fetches them, so this
is a non-issue for anything using the pipeline's existing load pattern.

### 19.2 Telemetry availability — confirmed for modern sessions, a new real failure found for 2018

Single-lap telemetry (`lap.get_telemetry()`, all 11 channels PitWall's `normalize_telemetry`
depends on — `Distance, Time, Speed, Throttle, Brake, RPM, nGear, DRS, X, Y, Z`) was fetched and
inspected directly for:

| Case | Result |
|---|---|
| 2024 Bahrain FP1 (Practice) | ✅ all 11 channels present, 714 rows, 0 nulls on spot-checked columns |
| 2024 Bahrain Qualifying | ✅ all 11 channels present, 687 rows, 0 nulls |
| 2024 Chinese GP Sprint | ✅ all 11 channels present, 764 rows, 0 nulls |
| 2024 Bahrain Race | ✅ all 11 channels present, 703 rows, 0 nulls (already locally ingested pre-M12) |
| 2018 Bahrain Race | ❌ `KeyError('77')` on `.get_telemetry()` |

The 2018 failure was investigated, not dismissed as a fluke: retried against **8 different
drivers'** fastest laps in the same 2018 Bahrain Race session — **all 8 failed**, each with a
`KeyError` on that driver's own car number. A second, entirely different 2018 event (Australian GP
Race) was checked as a control — **also failed**, `KeyError('3')` for its fastest lap's driver.
**Both failures are reproducible against the now-warm local cache, not network flakes.**

**This is a new, real, material finding the design review's original §3.5/§3.6 did not have:**
lap-level data (`Compound`, `Stint`, `TyreLife`, `PitInTime`/`PitOutTime`, sector times) loads
correctly for 2018 sessions (§3.5 already confirmed this for Bahrain specifically — 998 laps, full
schema), but **per-lap telemetry access is currently broken for 2018 data in this installed FastF1
version, across at least two different events and eight different drivers.** This is a materially
different and more specific finding than §3's general "seasons before 2018 aren't attempted" or
§3.5's "session load can fail per-session" — it shows a *systematic*, *channel-specific* gap for a
season otherwise squarely in scope (2018 is within FastF1's own documented support window and loads
cleanly for laps/stints/compound). **Practical consequence: an older-season session can be
correctly discoverable, correctly identity-resolved, and correctly lap/stint-ingestable, while
still being unable to produce telemetry/track-map data** — the two capabilities are not
all-or-nothing per session, and any future ingestion or UI logic must not assume "session loaded
successfully" implies "telemetry is available for it." This is recorded as a finding, not a defect
to fix in this milestone — root-causing or working around a FastF1-internal 2018 telemetry-indexing
issue is out of M12's scope entirely (it is not even a PitWall code question), but the phenomenon
itself now belongs in this document because it directly affects what "older season" support can
honestly promise.

### 19.3 Identity stability — broadened sample confirms §3.7/§6, plus one new operational-safety finding

- **Event-name uniqueness within season**: re-checked across seven seasons (2019–2025, including
  testing events) — **zero duplicate `EventName` values found in any season**, extending §3.1's
  spot check. §18 Q2 is resolved for this range: no counter-example exists in 2018–2025.
- **`fastf1.get_event()` accepts the same identifier forms as `fastf1.get_session()`** (round
  number or event name) and resolves to the same event — confirmed directly
  (`get_event(2024, 1)` and `get_event(2024, "Bahrain")` both return `"Bahrain Grand Prix"`). This
  is the fact Phase 1's resolution step (§20 below) depends on: an event's real session names can
  be fetched once, independently of and before deciding which FastF1 identifier string to pass to
  `get_session()`.
- **Full display-name identifiers and short abbreviations are behaviorally equivalent** for every
  non-ambiguous session type tested (`"R"`/`"Race"`, `"FP1"`/`"Practice 1"`, `"Q"`/`"Qualifying"`
  all resolve to the identical session) — confirming that switching `FastF1Provider` from
  abbreviations to an event's own literal `SessionN` display-name string (§20's resolution
  approach) is behavior-preserving for every session type that was never ambiguous in the first
  place, and only changes behavior for the sprint-qualifying slot, where §3.3 already proved the
  abbreviation was unsafe.
- **Testing events cannot be reliably addressed by name at all** — `get_event(2022, "Pre-Season
  Track Session")` and `get_event(2022, "Pre-Season Test")` (the exact, real names from that
  season's own schedule) both silently resolve to an unrelated **real championship round**
  (`"British Grand Prix"` and `"United States Grand Prix"` respectively) via FastF1's loose
  name-matching, with only a `WARNING`-level log line (`"Correcting user input..."`) — no
  exception. `get_event(2022, 0)` (round number) fails loudly instead
  (`ValueError("Cannot get testing event by round number!")`) — a real, useful distinction: name
  lookup silently misresolves, round-number lookup for a testing event fails safely. This is
  further, stronger evidence for §5's "exclude testing from ingestion by default" decision — it
  is not just risky to ingest, testing events are not even safely *addressable* by the same lookup
  path real events use.
- **New finding: FastF1's fuzzy event-name matching can silently substitute a real, but
  entirely unrelated, event for a bad input — not just for testing-event names.** Deliberately
  malformed real-event names were tried: `get_event(2024, "Bahrein Grand Prix")` and
  `get_event(2024, "Baharain")` both correctly recovered `"Bahrain Grand Prix"` (reasonable typo
  tolerance), but `get_event(2024, "xyz nonsense event")` — a string with no real relationship to
  any event name — **silently resolved to `"Chinese Grand Prix"`**, logging only a `WARNING`, never
  raising. Because `FastF1Provider.load_session()` builds PitWall's `Session.event_name` from the
  *resolved* FastF1 event (`ff1_session.event["EventName"]`), not the caller's raw input string, the
  resulting `session_id` is still internally self-consistent (it correctly labels itself
  `..._chinese_grand_prix_...`, not a corrupted hybrid) — so this is not a data-corruption risk to
  already-written Parquet/Postgres rows. It is a real **operator-safety** risk for whatever
  eventually calls `ingest_session`/a discovery CLI with a free-text event argument: a typo could
  silently ingest a completely different, real Grand Prix with no error, only a log line easy to
  miss in a batch run. This is **not a Phase 1 concern** — Phase 1 introduces no new free-text event
  lookup path beyond what `ingest_session` already has today, and the canonical identity model
  itself (§6) is unaffected, since it identifies whatever event was *actually* resolved, correctly.
  It is recorded here as a concrete, evidence-based item for Phase 2 (discovery architecture) to
  design against — e.g., preferring round-number identifiers over free-text where available, or
  having a discovery step enumerate real event names for a human/caller to choose from rather than
  accept arbitrary free text. Flagged, not designed.

### 19.4 What this resolves from §18

Q1 (identity-stability sample size) and Q4 (`Deleted`-flag availability) are resolved outright by
§19.1/§19.3. Q5 (telemetry-channel availability by session type) is resolved for modern seasons
(confirmed present, all channels, across Practice/Qualifying/Sprint/Race) but **reopened in a more
specific, more concrete form for older seasons** by §19.2's new 2018 finding — not the vague
"wasn't checked" of the original Q5, but a precise, reproduced "checked, and it currently fails for
2018 telemetry specifically, even though 2018 lap data doesn't." Q2/Q3/Q6/Q7 are unchanged by this
pass — still open, for the reasons originally stated.
