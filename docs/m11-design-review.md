# PitWall — M11 Design Review: Tyre & Stint Performance Analytics (Descriptive)

**Status:** Design complete; implementation and documentation shipped matching this design without
modification — see `docs/m11-implementation-plan.md` (Phases 1–6, all complete) for the
phase-by-phase record. This document is preserved as the original design/audit record and is not
rewritten to reflect implementation detail. Phase 0 (audit) is complete; Phase 0.1 (design
resolution over the four open items Phase 0 left unresolved) is also complete; this document is
their combined output.
**Baseline:** M10 complete and merged (`docs/m10-design-review.md`, ADR-0011) — compound-per-lap,
stints, and pit stops exist in Parquet/PostgreSQL and are served by `RaceContextRepository`.
**Author's framing:** senior engineering design review, ready for team sign-off before build —
matching the M8/M10 precedent.

**Phase 0.1 update (this pass):** resolved the minimum-stint-length rule (§5.2 — no invented
constant; derived from in/out-lap exclusion plus the existing M8 consistency convention), the
`RaceContextRepository` API question (§6.1 — smaller change than originally sketched: an optional
parameter on the existing method, not a new one), the endpoint-boundary question (§6.3 — confirmed
two endpoints, directly modeled on an existing M8 precedent rather than decided fresh), and
reclassified/reframed the driver-vs-driver metric (§4.1 #18, §4.3) so it can't be read as a
normalized pace verdict. Superseded language from the original Phase 0 pass is replaced below, not
left alongside it, so this document reads as one coherent decision, not a diff.

---

## 0. Milestone-numbering note

M8's design review predicted its sequel — tyre/stint degradation modeling — would land as "M9." It
didn't: M9 shipped as the frontend restyle, and M10 shipped as the storage foundation (stints/pit
stops), explicitly deferring "any degradation curve, fuel-corrected pace model, or strategy
recommendation" as "future, currently-unscheduled work" (`docs/m10-design-review.md` §1.3, §11).

**M11 is that unscheduled work, picked up now — but scoped down from what M8/M10 anticipated.**
Both prior documents assumed the eventual sequel would be a *degradation model*. Phase 0 of this
document (§2–§4 below) audits whether PitWall's actual data supports that, and the answer is: not
responsibly, not yet (§4.2, §4.4). M11 is therefore the **descriptive** layer — raw and aggregated
tyre/stint facts, no fitted curves, no regression, no prediction — with the modeling question
explicitly re-deferred to a later, still-unnumbered milestone (§10).

---

## 1. Problem Statement

M10 gave PitWall the *facts* of tyre strategy: which compound, which stint boundaries, when each
pit stop happened. It deliberately stopped at storage and retrieval — "M10 provides the facts;
interpreting them is later, currently-unscheduled work" (M10 design review §1). Nobody has yet
asked, with real data in hand, two questions that have to be answered before any interpretation is
attempted:

1. **What does "interpreting them" responsibly even look like** — which descriptive statistics are
   actually defensible given what PitWall knows about a session, and which would be dressing up
   confounded or missing data as insight?
2. **Is a predictive/fitted tyre-degradation model in reach**, or does the current data model make
   that scientifically premature?

This document is a Phase 0 audit answering both, followed by a scoped M11 design that only builds
what the audit justifies.

### 1.1 User questions M11 should answer

- Which compound was each driver on, for how many laps, and in what order (strategy shape)?
- How did a driver's raw lap time trend across a stint — visually, not as a fitted number?
- How consistent was a driver's pace within one stint (spread, not trend)?
- How do stint lengths and lap-time levels compare across compounds *within this session*?
- How does pit-lane time compare across the field, and which stops were outliers?
- Which stints are too short or anomalous to read anything into (e.g. a 1-lap stint)?

### 1.2 User questions M11 explicitly does not answer (see §7, §9)

- "What is this tyre's degradation rate?" (a fitted slope/coefficient)
- "How much of that lap-time trend is tyre wear vs. fuel burn vs. track evolution?"
- "Would an undercut/overcut have worked?" (needs gap/position data PitWall doesn't have)
- "Was that lap slowed by traffic or a safety car?" (no such signal exists in the data model today)

---

## 2. Phase 0: What Was Inspected

**Documentation read in full:** `docs/prd.md`, `docs/success-metrics.md`, `docs/architecture.md`,
`docs/data-model.md`, `docs/api-model.md`, `docs/adr/0004`, `docs/adr/0006`, `docs/adr/0011`,
`docs/m10-design-review.md`, `docs/m10-implementation-plan.md`, `docs/m9-design-review.md` (to
correctly understand the M9 numbering, not resurrect it), `README.md`, `CLAUDE.md`.

**Code read in full:**
- Pipeline: `models.py`, `normalize.py`, `postgres_writer.py`, `providers/fastf1_provider.py`.
- Backend: `app/models/race_context.py`, `app/models/session_analytics.py`,
  `app/repositories/race_context.py`, `app/repositories/postgres_race_context_repository.py`,
  `app/api/race_context.py`, and the full `app/services/session_analytics/` package
  (`consistency.py`, `filtering.py`, `theoretical_best.py`, `driving_style.py`,
  `aggregation.py`) — the closest existing precedent for "descriptive, not predictive" domain logic
  and its established filtering/aggregation conventions.
- Frontend: `frontend/src/features/race-context/` (stint timeline, pit-stop list, compound-color
  mapping, hooks) and `frontend/src/features/session-analytics/` for UI/data-layer precedent.
- Existing tests: `pipeline/tests/test_normalize_stints.py`, `test_normalize_pit_stops.py`,
  `backend/tests/test_postgres_race_context_repository.py`, `test_race_context_route.py`, and the
  `session_analytics` test suite.

**Real data verified, not assumed from docs** (§3): the locally present 2024 Bahrain GP Race
dataset — Parquet (`laps`, `telemetry`, `drivers`, `session`, `track`) and PostgreSQL
(`stints`, `pit_stops`). PostgreSQL was empty at the start of this audit (no migrations, no
ingestion had been run locally, despite the Parquet cache existing) — the schema migrations were
applied and ingestion was re-run against the already-warm FastF1 cache (no network fetch needed,
same operation the README documents for backfill) specifically to get real relational data to audit
against, rather than trusting the design docs' description of it. See §3.2.

---

## 3. Real Data Verification

### 3.1 Parquet — `data/processed/2024/bahrain_grand_prix/race/`

| File | Rows | Columns | Notes |
|---|---|---|---|
| `session.parquet` | 1 | `session_id, season, event_name, round_number, location, country, session_type, session_date` | `2024_bahrain_grand_prix_race`, Race, `2024-03-02T15:00:00` |
| `drivers.parquet` | 20 | `session_id, driver_id, driver_number, full_name, team_name` | full 2024 grid, no duplicates |
| `laps.parquet` | 1129 | `session_id, driver_id, lap_number, lap_time_seconds, sector_1/2/3_seconds, is_personal_best, is_accurate, compound` | 20 drivers, laps 1–57, fully contiguous per driver, **0 duplicate `(driver_id, lap_number)` pairs** |
| `telemetry.parquet` | 840,934 | `..., distance_m, time_seconds, speed_kph, throttle_pct, brake_active, rpm, gear, drs_active, x, y, z` | every `(driver, lap)` pair in `laps.parquet` has matching telemetry and vice versa — 0 missing either direction |
| `track.parquet` | 703 | `session_id, distance_m, x, y` | no `z`; unrelated to stint analytics |

`laps.parquet` nulls: `lap_time_seconds` = 2, `sector_1_seconds` = 21, everything else including
`compound` = 0. **No column related to track status, weather, safety car, VSC, yellow flag, or
traffic exists anywhere in `laps.parquet`** — confirmed by a full column-name scan, not inferred
from documentation.

`compound` values this session: only `SOFT` and `HARD` — no `MEDIUM`/`INTERMEDIATE`/`WET`. This
looked suspicious enough to double-check rather than assume a normalization bug; it matches the
real 2024 Bahrain GP, where the top strategies were soft-hard-hard/soft-hard-soft and medium saw
negligible use. **Flagged, not fabricated-around**: any M11 compound-comparison metric will show
only two compounds for this dataset, which is a property of this session, not a data-quality defect
— but it means a "which compound is best" claim from this one session's data is not generalizable
(§4, §7).

### 3.2 PostgreSQL — `stints`, `pit_stops` (populated for this audit; was empty)

| Table | Rows (Bahrain session) | Schema |
|---|---|---|
| `stints` | 63 | `session_id, driver_id, stint_number, compound (NOT NULL), start_lap, end_lap, tyre_life_at_start (nullable)` |
| `pit_stops` | 43 | `session_id, driver_id, stop_number, lap_number, pit_lane_time_seconds (nullable)` |

Real facts, not documentation claims:

- `tyre_life_at_start`: 0 nulls in this dataset (nullable in schema; FastF1 can omit `TyreLife` for
  older seasons per `normalize.py`'s own docstring — not exercised by this one session).
- `pit_lane_time_seconds`: 0 nulls; range **23.886s–74.951s**, mean **26.6s**. The 74.951s value
  (`BOT`, stop 2, lap 30) is a genuine statistical outlier, not a data error — pit-lane time has
  real variance from on-track factors (traffic in the pit lane, a slow stop) that a naive "average
  pit stop = ~25s" statement would hide.
- `end_lap < start_lap`: 0 occurrences (no structurally invalid stints).
- **One single-lap stint**: `HUL`, stint 1, `SOFT`, lap 1 only, immediately followed by a pit stop
  on lap 1 itself. This is exactly the "formation-lap/early-incident spurious stint" risk M10's
  design review flagged in §7 as a Phase-0 investigation item for this milestone — it is now
  confirmed as a live, real case in the only dataset available, not a hypothetical. A stint this
  short has no lap-time trend to show and must be excluded from any pace-trend view (§5.2).

**FastF1 raw-fetch observation (from re-running ingestion, not from documentation):** the ingest
log shows FastF1 loading `track_status_data`, `weather_data`, and `race_control_messages` for this
session as part of its normal session load — these are fetched by the FastF1 client PitWall already
depends on, but **PitWall's normalization layer does not parse or store any of them**. This is an
important, precise distinction for §4 and §9: yellow-flag/weather data is not "unavailable from the
provider," it is "not yet extracted from a provider PitWall already uses." That changes how heavy a
lift it would be to add later (a normalization/schema change, not a new external dependency or ADR),
but it does not change that it does not exist in PitWall's data model **today**, and M11 must not
pretend otherwise.

---

## 4. Scientific / Engineering Validity Audit

Each candidate metric is classified:

- **A** — Directly computable from current data.
- **B** — Computable with filtering/normalization (joining existing tables/columns; no new data).
- **C** — Requires additional data PitWall does not currently ingest.
- **D** — Scientifically unreliable with current data, regardless of engineering effort.

### 4.1 Metric classification

| # | Metric | Class | Why |
|---|---|---|---|
| 1 | Compound per lap | **A** | Already a `laps.parquet` column, verified populated. |
| 2 | Stint boundaries & length (laps) | **A** | `stints.start_lap`/`end_lap`, directly. |
| 3 | Per-driver strategy shape (stint count + compound sequence, e.g. "2-stop, S-H-H") | **A** | Direct read of one driver's ordered `stints` rows. |
| 4 | Session-wide compound-usage distribution (all drivers) | **A**, blocked on one repo-interface gap | The data is there; `RaceContextRepository.list_stints` currently requires a `driver_id` (§6.1) — a real, small interface extension, not new data. |
| 5 | Pit-lane time distribution & per-stop comparison | **A** | `pit_stops.pit_lane_time_seconds`, already carrying its "not box time" caveat from M10 — M11 inherits, doesn't relitigate, that caveat. |
| 6 | Raw lap-time trace within a stint (lap time vs. lap-in-stint index) | **A/B** | Raw `lap_time_seconds` is A; labeling the x-axis "laps on this tyre" requires joining `laps` against `stints` (B — a join, not new data). |
| 7 | Exclude in-lap/out-lap from stint pace views | **B** | Derivable: pit-in lap = `pit_stops.lap_number`; out-lap = next stint's `start_lap`. No new data — a join across two existing tables. |
| 8 | Exclude anomalously short stints (e.g. `HUL`'s 1-lap stint) from trend views | **B** | Filtering rule, same precedent as M8's outlier/aggregate-stats filtering (`filtering.py`). |
| 9 | Stint-pace consistency (stdev of lap time within one stint) | **A** | Direct reuse of M8's `consistency_ms`/`consistency_cv` over a stint-scoped lap subset — no new logic shape needed, only a different input population. |
| 10 | Per-compound aggregate lap-time-by-tyre-life comparison (raw/binned, across all drivers on that compound) | **B** | Computable via #7+#8's filtering plus grouping by compound; must render as raw points/medians per lap-in-stint index, **never a fitted line** (§4.2). |
| 11 | "Tyre degradation rate" as a fitted slope/coefficient | **D** | Conflates tyre wear (time increases), fuel burn (time decreases as fuel load drops), and track evolution (time decreases as rubber goes down) — three effects with different, unmeasured, opposite-signed magnitudes (§4.2). Also directly excluded by this milestone's own non-goals. |
| 12 | Fuel-corrected pace | **D** | No fuel-load data exists anywhere in FastF1's fetch or PitWall's schema (verified in §3.1/§3.2 — no such field). Any correction requires an assumed burn-rate constant, which is modeling, not description. |
| 13 | Yellow-flag / safety-car / VSC-adjusted lap exclusion | **C** | FastF1 already fetches `track_status_data`/`race_control_messages` (§3.2) but PitWall does not normalize or store it. Real, scoped future pipeline work — not fabrication, not in M11. |
| 14 | Traffic / clean-air vs. dirty-air lap classification | **C/D** | No gap/interval/position-relative data is ingested anywhere (position/gap history was explicitly deferred at ADR-0011 and remains deferred). A defensible version needs new data; a fabricated proxy would be **D**. |
| 15 | Track evolution as an isolated effect | **D** | Not separable from fuel burn and tyre wear with current variables (same confound as #11). The raw session-wide median-lap-by-lap-number trend is observable (**B**) but must not be labeled as an isolated "track evolution" measurement. |
| 16 | Undercut/overcut "did it work" | **D** | Needs track-position/gap data at the pit window, which doesn't exist. A raw pace-around-the-pit-window comparison is a possible B-level building block, but the strategic-outcome claim is not defensible. |
| 17 | Pit-stop total time loss vs. green-flag pace | **C/D** | Requires a defensible "baseline green-flag pace" isolated from the same confounds as #11/#15. Not attempted in M11. |
| 18 | Raw per-driver lap-time-by-compound display, shown side-by-side within one session | **B**, heavily caveated | Reuses #10's joined per-lap/stint data, broken out per driver instead of pooled. Valid as "here is what each driver's laps on this compound looked like"; **not** valid as a normalized pace comparison or ranking — see §4.3 for exactly which confounds are and aren't controlled for. Renamed from "driver-vs-driver pace comparison" specifically so neither the API nor the UI can imply a verdict (§4.3, §7, §8). |
| 19 | Cross-session or cross-event compound/degradation comparison | **out of scope** | Only one session is locally ingested; more fundamentally, every prior milestone (M6, M8, M10 §11) draws its comparison boundary at one session — M11 does not reopen that. |

### 4.2 Why no fitted curve, slope, or regression — even as a "descriptive" statistic

A linear (or any) fit of lap time against tyre life would look like a single, clean number — exactly
the kind of thing a race engineer wants. It would also be wrong in a way that's invisible to the
person reading it: within one stint, lap time is simultaneously pulled *down* by fuel burn (car gets
lighter) and track evolution (grip increases), and pulled *up* by tyre wear — with no data available
to separate the three. A fitted slope reported as "tyre degradation" would silently net these
opposite-signed, unmeasured effects into one number and call it tyre wear. That is a description
dressed as a measurement, and it is exactly the kind of unreliable-with-current-data output §4
exists to catch. It is also explicitly listed among this milestone's non-goals — this section is the
audit's independent confirmation that the boundary is correct, not just an instruction being
followed.

M11's raw/aggregate visualizations (item #6, #10, #18) let a human look at the shape of the data and
draw their own conclusion, the same way M6's raw, uncorrected delta graph does for lap comparison —
that document's own words apply here without modification: *"make this explicit... so users don't
over-interpret"* (M6 §10, cited again by M10 §3.1 for pit-lane time). M11 follows that same
discipline for every stint-pace view it ships.

### 4.3 Raw cross-driver comparison vs. a pace conclusion (item #18)

The audit's original pass classified "driver-vs-driver pace-by-compound comparison" as B and moved
on. On closer inspection (this pass), "pace comparison" is the wrong name for what's actually
computable, because it invites exactly the reading M11 exists to avoid: that a raw lap-time
difference between two drivers on the same compound means one of them is faster *on that tyre*, as
an engineering conclusion. It doesn't, unless six things are true, and none of them are guaranteed
by the current data:

| Factor | Controlled for? | Why |
|---|---|---|
| Fuel load | **No** | Not ingested anywhere (§4.1 #12); two drivers on different strategies carry different fuel at the same lap number. |
| Track position / traffic | **No** | No gap/interval/position data exists (§4.1 #14); a driver stuck behind another car will show slower laps for a reason that has nothing to do with the tyre. |
| Track evolution | **Partially, only if laps are aligned by lap number** | Two drivers' laps at the *same absolute lap number* experience roughly the same track state; laps compared by lap-in-stint index instead (since pit strategies differ) can be at different points in the race and therefore different track evolution. |
| Tyre age | **Partially — the one dimension PitWall can actually align on** | `tyre_life_at_start` + lap-in-stint index (already used by #10) lets two drivers' laps be compared at the same point in their respective tyre's life, which is the one axis this data model was built to support. |
| Session conditions (temperature, wind, etc.) | **No** | Weather isn't ingested (§4.4); FastF1 fetches it but PitWall doesn't parse it, same gap as track status. |
| Driver / team / car differences | **No, and never will be from this data alone** | A faster driver or car shows a faster raw lap time on any compound, independent of tyre behavior. Nothing in PitWall's schema (or realistically any schema built on public timing data) separates this from a tyre effect. |

**What is valid to display:** raw lap times for two or more drivers on the same compound, laid out
side by side (e.g., as parallel point series against lap-in-stint index, reusing #10's axis choice
so at least the one controllable dimension — tyre age — is aligned). This is a factual record of
what each driver's laps looked like, exactly as raw as everything else in M11.

**What is not valid to conclude, state, or imply — in the API, the UI copy, or any derived field:**
that one driver was faster than another *on that compound*, that one *is better suited* to a
compound, or any statement with a causal or comparative-performance verb attached to the raw
numbers. §7 and §8 carry this constraint into the frontend and non-goals sections respectively.

### 4.4 Confirmed data gaps (not fabricated around)

| Gap | Status | Notes |
|---|---|---|
| Weather | Not ingested | FastF1 fetches it (§3.2); PitWall doesn't normalize it. Deferred at ADR-0011, still deferred. |
| Safety car / VSC / yellow flag | Not ingested | Same as above — `track_status_data`/`race_control_messages` fetched, not normalized. |
| Traffic / gap-to-car-ahead / position history | Not ingested at all | Deferred at ADR-0011, still deferred; no FastF1 channel for this is even being fetched today (unlike weather/track-status, which are fetched-but-unused). |
| Fuel load | Never ingested, not reliably available from FastF1 for this purpose | No column, no plan. |
| Tyre warm-up (out-lap-specific degradation) | Partially addressable | Out-laps are identifiable via stint-boundary join (§4.1 #7) and can be excluded from pace-trend stats, but a dedicated "warm-up characteristic" metric would need more than exclusion — not attempted in M11. |
| Red flags | Not ingested | Same as track-status; a red-flag restart can also produce a spurious short "stint," same as the `HUL` case in §3.2, but for a different underlying reason M11 cannot currently distinguish from an early pit stop. |

---

## 5. Proposed M11 Scope

### 5.1 In scope (descriptive only)

- Per-driver, per-stint raw lap-time views (item #6), with the stint join and in/out-lap exclusion
  (#7) applied — no separate short-stint pre-filter (§5.2 supersedes the earlier "3-lap minimum"
  proposal).
- Per-stint pace consistency (#9), reusing the M8 `consistency_ms`/`consistency_cv` shape and its
  existing `<2 laps → None` convention unmodified.
- Per-compound aggregate comparison within one session (#10), shown as grouped raw data
  (scatter/box, per lap-in-stint index or bucket) — no trend line, no coefficient.
- Session-wide compound-usage and strategy-shape summary (#3, #4).
- Pit-lane time distribution and comparison (#5), carrying forward M10's existing caveat verbatim.
- Raw per-driver lap-time-by-compound display, side by side, not a ranking (#18, §4.3).

### 5.2 Filtering rules (established, not new invention)

- **Lap validity**: reuse `is_accurate` exactly as `session_analytics/filtering.py` already does —
  no new validity signal exists to add.
- **In-lap/out-lap exclusion from pace-trend views**: a lap is an in-lap if it appears as
  `pit_stops.lap_number` for that driver/session; a lap is an out-lap if it equals some
  `stints.start_lap` for a stint after the first. Both are excluded from trend/consistency
  computations, included (flagged) in raw per-lap listings — mirroring `filter_valid_laps` vs.
  `filter_for_aggregate_stats`'s two-population pattern in M8.
- **Minimum stint length — resolved, replacing the original "3 laps" proposal (Open Questions,
  item 1, original pass):** there is no separate, invented stint-length constant. What a stint
  contributes to trend/consistency computation is simply *whatever laps remain after in/out-lap
  exclusion, above* — a consequence of the rule immediately above, not a new rule.

  Concretely, applying this to the real data (§3.2): `HUL`'s stint 1 is one lap (lap 1), and that
  same lap is also `HUL`'s pit-in lap (`pit_stops` has `(HUL, stop 1, lap 1)`) — so after in/out-lap
  exclusion, that stint has **zero** remaining laps, and is correctly excluded from every
  trend/consistency computation without any dedicated "is this stint too short" check. This is not
  a coincidence engineered to make the example work — it's what the in/out-lap rule does to any
  stint that's short enough to be mostly pit-adjacent laps, which is exactly the class of stint that
  shouldn't be read for a pace trend anyway.

  Two rules close the remaining gap, both reused from elsewhere rather than invented here:
  - **Consistency (stdev/CV)** is undefined below 2 remaining laps — this is M8's own
    `consistency_ms`/`consistency_cv` behavior (`len(...) < 2 → None`, `consistency.py`), applied
    unmodified to the post-exclusion population. It is not a new constant and does not claim 2 laps
    is enough for a statistically significant result — M8's own code comments already frame it as
    "a single point has no defined spread," a structural fact about variance, not a significance
    threshold, and M11 inherits that framing rather than restating it as something stronger.
  - **Raw pace-trace rendering** needs at least 2 points to draw a line at all — a geometric fact,
    not a statistical one. A stint with 0 or 1 remaining laps is still shown as whatever points it
    has (zero or one dot, per §5.1's "not deleted" rule), just not connected into a trace.

  **What this threshold means:** the minimum population size two specific computations (a spread
  statistic, a connected line) are structurally capable of producing at all.
  **What it does not mean:** that 2, or any other number of laps, is a statistically meaningful or
  sufficient sample to draw a tyre-behavior conclusion from — no such claim is made anywhere in M11
  (§4.2).
  **Applies:** strictly *after* in/out-lap filtering, never before — a stint's raw (pre-exclusion)
  lap count is irrelevant to eligibility; only what survives exclusion counts.
  **Below the threshold:** the stint's raw laps still appear in every non-aggregate view (strategy
  shape, compound usage, raw per-lap listing); only the two specific downstream computations named
  above return `None`/an unconnected point for that stint, exactly mirroring how M8 already handles
  a 0/1-valid-lap driver.
- **Yellow-flag exclusion**: `filtering.py`'s existing `_yellow_flag_reason` no-op stays a no-op.
  M11 does not add track-status data (§4.4); this is a documented gap, not silently ignored.

### 5.3 Aggregation rules

- Single-session scope only, per the established M6/M8/M10 comparison boundary (§4.1 #19) — no
  cross-session or cross-event aggregation in M11.
- Per-compound aggregates are computed **within** the session being viewed, never pooled across
  sessions (there's only one session locally ingested to validate against in any case, §3.2).
- Aggregates report raw/percentile/median summaries (matching M8's `statistics.pstdev`,
  `statistics.quantiles` precedent), never a fitted parameter (§4.2).

---

## 6. API Implications

### 6.1 `RaceContextRepository`: resolved — widen the existing method, don't add a new one

**Resolves Open Question 2 (original pass).** Two options were compared:

- **A. A new method**, e.g. `list_stints_for_session(session_id) -> list[Stint]`.
- **B. Widen the existing method**: `list_stints(session_id, driver_id: str | None = None)`,
  returning every driver's stints when `driver_id` is omitted.

**Decision: B.** `list_pit_stops(session_id, driver_id=None)` — on the exact same interface,
written in the exact same milestone — already has this precise shape: an optional `driver_id`
filter, defaulting to "every driver," with `PitStop` keeping `driver_id` in its API model
specifically *because* "the filter is optional and a response can span multiple drivers"
(`app/models/race_context.py`'s own docstring). Option B is B not because it's smaller for its own
sake, but because M11's actual second consumer (session-wide stint reads for #4/#10/#18) is
structurally identical to the read pattern `list_pit_stops` already serves — the same interface
already contains the answer once you look at its sibling method, so a new method name would be two
ways to say the same thing instead of one. Option A would also duplicate `list_stints`' query logic
(session/driver filter, ordering) in a second method for no behavioral difference. This is ADR-0006's
own principle applied literally — "shaped by their consumer's actual... read patterns" — and M11's
actual, non-hypothetical consumers need exactly the `list_pit_stops` shape, not a new one.

**Concrete change**, smaller than the original Phase 0 sketch: `list_stints(self, session_id: str,
driver_id: str | None = None) -> list[Stint]` on both the interface and
`PostgresRaceContextRepository`; add `driver_id: str` to the `Stint` API model (`app/models/
race_context.py`), mirroring `PitStop`'s existing field for the same reason. The existing
per-driver route (`GET /sessions/{session_id}/drivers/{driver_id}/stints`) is unaffected — it still
calls `list_stints(session_id, driver_id)` with `driver_id` set, and its response gains one
additive field. **This is the one place M11 touches an existing M10 contract** — the same class of
change M10 itself made once, for `compound` on `Lap` (M10 design review §5.3) — additive and
non-breaking, not a rename or retype.

This is smaller than a new method plus a new/duplicated response model, requires no new file, and
is exactly the kind of incremental interface growth ADR-0006 anticipated ("grows when a second real
read pattern forces it") — not a new interface, new store, or reversal of a decision. **No ADR is
required** (see §12).

### 6.2 New domain-logic layer, not new storage

M11's descriptive computations (joins, filtering, aggregation) are pure functions over data already
returned by `TelemetryRepository` and `RaceContextRepository` — the same shape as
`app/services/session_analytics/`, which computes over `TelemetryRepository` data alone. M11's
equivalent package (proposed `app/services/tyre_performance/` — named in the implementation plan)
is the first PitWall domain-logic package to read from **both** repositories at once, joining
`Lap`/`TelemetrySample` (Parquet) against `Stint`/`PitStop` (Postgres) in application code. This is
not a violation of ADR-0011's "no cross-engine foreign key" constraint — that constraint is about
the *database layer* (no FK from Postgres to a Parquet file); joining already-fetched, already-typed
Pydantic objects in a Python service function is exactly what every prior milestone's service layer
already does with data from one repository, just now sourced from two.

### 6.3 New endpoints: resolved — two, not one

**Resolves Open Question 3 (original pass).**

```
GET /sessions/{session_id}/drivers/{driver_id}/stint-pace   # per-driver, per-stint lap-time trace
GET /sessions/{session_id}/tyre-performance                 # session-wide, per-compound aggregate
```

**Decision: keep both, as two endpoints.** This isn't a fresh design choice — it's the same split
M8 already shipped and PitWall already has a test suite proving out:
`GET /sessions/{session_id}/analytics/drivers` (session-wide summary) and
`GET /sessions/{session_id}/analytics/drivers/{driver}/laps` (one driver's full per-lap detail).
Checked against the criteria that matter here:

- **Granularity is genuinely different.** `stint-pace` is one driver's lap-by-lap series (up to
  ~57 rows for a full race, §3.1); `tyre-performance` is a session-wide aggregate across ~20 drivers
  and 2+ compounds. These aren't two views of the same payload at different zoom levels — one is a
  detail record, one is a summary.
- **Over-fetching, both directions.** A session-wide dashboard view doesn't need any one driver's
  full per-lap series to render compound aggregates and strategy shapes; a driver detail view
  doesn't need the other 19 drivers' data. M9's design review already names this exact concern for
  a structurally identical case: pulling driver-scoped per-lap data into a session-wide response
  "would mean an N+1 fetch per driver" (M9 §Fields the UI can't show, item on braking events) — the
  same reasoning applies here without modification.
- **Frontend consumption matches the split.** §7 already proposes a session-wide dashboard-style
  view and a per-driver detail view as separate concerns; one endpoint per view is the natural fit,
  not a bundled response the frontend picks apart.
- **Testability.** Two focused endpoints mean two focused fixture sets (one driver's stints/laps;
  one session's full roster), matching exactly how `test_race_context_route.py` and
  `test_session_analytics_route.py` already separate their fixtures today. One combined endpoint
  would need every test to construct both shapes regardless of which behavior it's actually
  checking.
- **Route convention.** Both paths already follow the existing session-scoped,
  `driver_id`-path-or-absent convention (`/stints` vs. `/pit-stops`, `/analytics/drivers` vs.
  `/analytics/drivers/{driver}/laps`) — no new convention is introduced.

No criterion favored one endpoint; the "is it genuinely two things" test M8 already answered for
the structurally identical problem answers it here too.

### 6.4 Anti-corruption boundary unchanged

New Pydantic response models live in a new `app/models/tyre_performance.py` (or extend
`race_context.py` — implementation plan decides), independently defined per ADR-0009, same as every
prior milestone. No existing endpoint's contract changes.

---

## 7. Frontend Implications

- A new feature directory is proposed (`frontend/src/features/tyre-performance/`), separate from
  `race-context/` (which shows *raw* stint/pit-stop facts) the same way `session-analytics/` is
  separate from `lap-comparison/` despite both reading telemetry — M11 is *analysis* of race-context
  data, a different concern from *display* of it, consistent with the project's existing
  feature-boundary convention.
- Reuses `race-context/compoundColor.ts` for consistent compound coloring rather than reinventing
  it — the same procedurally-generated, non-livery color scheme M9 established.
- Charts follow M8's precedent: raw arrays sent to the frontend, chart-side quartile/scatter
  rendering via ECharts (ADR-0008) — no backend-computed five-number summary, no backend-fitted
  trend line, consistent with §4.2's "no fitted curve" boundary holding at the UI layer too.
- **The raw multi-driver comparison view (§4.3, item #18) must not be worded, sorted, or styled as
  a ranking.** Concretely: no "fastest on [compound]" label, no sort order that reads as a
  leaderboard, no color-coding by relative speed. Parallel raw point/line series per driver on a
  shared axis (lap-in-stint index, per §4.3's alignment reasoning), left for the user to read
  visually — the same posture as the raw delta graph M6 shipped, not a new one invented for M11.
- Frontend consumption is a follow-up design note once the API surface is real — same sequencing
  M8 → M9 and M10 §5's "frontend design note follows once this API surface exists" already used.
  This document does not finalize component-level design.

---

## 8. Explicit Non-Goals

Per the task's own boundary and confirmed correct by §4's audit:

- No machine-learning models, no predictive models.
- No fitted degradation curves, no regression models, no slope/coefficient reported as a
  measurement (§4.2).
- No tyre-life predictions.
- No strategy optimization or pit-stop recommendations.
- No fuel-corrected pace (§4.1 #12 — no fuel data exists).
- No safety-car/yellow-flag/weather-adjusted metrics (§4.1 #13, #14 — data not ingested).
- No cross-session or cross-event comparison (§4.1 #19).
- No undercut/overcut "did it work" verdicts (§4.1 #16).
- No driver ranking or "faster on this compound" claims derived from the raw multi-driver
  comparison view — raw side-by-side display only, never a normalized or causal conclusion
  (§4.1 #18, §4.3).

---

## 9. Relationship to M10

M11 adds no new store and no new repository interface — it is a **domain-logic and API layer on
top of M10's two existing repositories** (`TelemetryRepository`, `RaceContextRepository`), joined in
application code for the first time (§6.2). The one concrete change to M10's surface is the new
`RaceContextRepository` read pattern in §6.1 — additive, not a reversal, not a new store.

---

## 10. Relationship to Future Modelling Milestones

The predictive/fitted tyre-degradation work M8 and M10 both anticipated remains real, and remains
genuinely blocked on data PitWall doesn't have yet — not on engineering effort. Before that future
milestone can respectably attempt a degradation *model* (as opposed to this milestone's
*description*), at minimum:

- Track-status/safety-car/VSC data would need to be ingested (§4.4 — the FastF1 fetch already
  happens; the normalization work doesn't exist yet, so this is the more reachable of the gaps).
- A fuel-load proxy or correction approach would need to be sourced and validated — no current plan
  for this exists, and it may not be solvable from FastF1 data alone.
- Enough sessions would need to be ingested to fit anything with statistical honesty — one session
  is an audit dataset, not a training set.

This document does not schedule that milestone or assign it a number, matching M10's own posture
toward it ("unscheduled until a future milestone picks it up," M10 §1.3). M11 is explicitly not that
milestone.

---

## 11. Success Criteria

- A user can see, for a real session, each driver's raw lap-time trace within each stint, with
  in/out-laps flagged and trend-ineligible stints (those with fewer than 2 laps remaining after
  in/out-lap exclusion, §5.2) shown as unconnected points rather than a trace — not silently dropped
  from the underlying data, only from trend/consistency computation, matching M8's
  `is_valid`-vs-aggregate-eligible pattern.
- A user can compare compounds' raw pace and stint lengths within one session, without PitWall
  asserting a degradation rate, a fuel-corrected number, or any fitted trend.
- A user can view two or more drivers' raw laps on the same compound side by side, without any UI
  element implying one driver was faster *on that compound* (§4.3, §7, §8).
- Pit-lane time is shown with its inherited "not box time" caveat intact, not silently dropped in a
  new UI surface (M10 §3.1's discipline carried forward, not re-litigated).
- Every metric shipped in M11 traces to an **A** or **B** classification in §4.1; every **C**/**D**
  item is either absent from the UI or explicitly labeled as unavailable, never approximated.
- The `Stint` API model's additive `driver_id` field (§6.1) ships without changing any existing
  field's name, type, or meaning on the pre-existing `/stints` endpoint.
- Tests pass, types check, lint is clean; docs (`docs/architecture.md`, `docs/api-model.md`) are
  updated to reflect the new service package and endpoints, per CLAUDE.md's Definition of Done.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| A future contributor (or the author, weeks later) is tempted to add "just a simple trend line" to a stint-pace chart because it "looks better." | §4.2's confound argument is written down here specifically so that temptation has a documented rebuttal to check against, not just a rule to remember. |
| A future contributor adds a "fastest driver on [compound]" sort, badge, or highlight to the raw multi-driver comparison view (§4.3), because the raw data makes it easy to compute even though it isn't valid to claim. | §4.3's confound table and §8's explicit non-goal exist specifically so this has a documented rebuttal at review time, the same pattern as the trend-line risk above. |
| Only one session (Bahrain 2024 Race) is locally available to validate against, and it happens to have only two compounds in play — any M11 code path implicitly assuming 3+ compounds exist, or assuming every driver has 2+ stints, would pass local testing and break on a different real session. | Implementation plan's test fixtures must include a synthetic session with 3 compounds and a 1-stop driver, not rely solely on the real Bahrain data for coverage (mirroring M8/M10's existing "hand-built DataFrame" fixture pattern). |
| The single-lap `HUL` stint (or a similar case) is symptomatic of a class of FastF1 data-quality issue (red flags, formation laps, contact) M10 flagged as a real risk but didn't need to solve for pure storage/retrieval. | Resolved, not just mitigated: §5.2's in/out-lap exclusion rule handles this case as an emergent consequence of an already-justified rule, not a bespoke length cutoff — the stint's raw laps remain visible everywhere except trend/consistency computation (§5.2's "what it does not mean" / "below the threshold" bullets), so no user-visible fact is hidden. |
| `RaceContextRepository`'s widened method (§6.1) could be over-designed now in anticipation of needs beyond M11. | Resolved by the decision itself: §6.1 chose the smaller of the two options specifically because it mirrors an existing sibling method's shape rather than introducing a new one — there is no new surface to over-design. |

---

## Open Questions (remaining)

Open Questions 1–3 from the original Phase 0 pass are resolved above (§5.2, §6.1, §6.3
respectively) and are not repeated here. One item remains genuinely open:

1. **Whether the C-classified gaps (§4.1 #13, #14) are worth a small, separate, explicitly-scoped
   future milestone** (ingesting `track_status_data` alone, without weather or position data) given
   it's already being fetched by FastF1 — flagged here as a candidate for `docs/backlog.md`, not
   decided in this document.
