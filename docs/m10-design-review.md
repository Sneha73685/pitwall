# PitWall — M10 Design Review: Hybrid Parquet + PostgreSQL Storage for Race Strategy Data

**Status:** Design only — no implementation
**Baseline:** v0.7.0 (M0–M7 V1 release, M8 session analytics, M9 UI redesign — all merged)
**Author's framing:** senior engineering design review, ready for team sign-off before build

---

## 0. Problem Statement

Through M9, every ingested fact PitWall knows about a session — session/driver identity, lap and
sector times, per-sample telemetry, track geometry — is columnar, single-session-scoped, and lives
in Parquet (ADR-0004). That has been the right call for everything built so far: nothing through M9
needed a join.

Tyre strategy breaks that assumption for the first time. "Which compound was on the car for lap 32"
is a scalar fact, no different in shape from `lap_time_seconds`. But "how long did each stint last,
which laps does it span, and when did the pit stops that bound it happen" is inherently relational —
a stint is a range of laps bounded by pit-stop events, and a pit-stop table is meaningless without
being joined against the lap/stint timeline around it. Parquet's whole value proposition is fast
columnar reads of independent rows; it has no efficient way to express "give me the stint that
contains lap 32" without either scanning and reconstructing that logic in application code on every
read, or denormalizing it so heavily that the on-disk shape stops matching what the data actually is.

This is exactly the fork ADR-0004 called out two years of milestones ago: *"V3 will introduce
genuinely relational data (stints, pit stops, weather, position history joined against
sessions/drivers)... that migration is planned and explicit, not a gap discovered later."* M10 is
that migration — scoped down to the part of V3 that's actually needed now (see §1).

**What M10 is not:** a tyre-degradation model, a strategy recommender, or any predictive layer.
Exactly like M8 drew a hard line at "descriptive, not predictive," M10 draws one at "storage and
retrieval of race-strategy facts, not analysis of them." Consistency/theoretical-best-style
degradation modeling over stint data is real future work this milestone deliberately sets up for,
not work it does itself.

---

## 1. Scope

### 1.1 In scope

- Tyre compound per lap.
- Stints: contiguous runs of laps a driver spends on one tyre set, with boundaries and compound.
- Pit stops: when a driver entered/exited the pits, and which stop number it was.
- A second backing store (PostgreSQL) and a second repository interface to read the above.
- The pipeline write path that populates it during ingestion.

### 1.2 Deliberately out of scope (and why bundling it here would be wrong)

`docs/prd.md` §5 and `docs/success-metrics.md`'s V3 entry describe a single bundled milestone:
*"tire strategy, stints, pit stops, weather, position history, gaps... sourced from relational race
data... backed by Postgres."* This document intentionally **splits that bundle**. Weather and
position/gap history are deferred past M10:

- They come from a different, not-yet-integrated source (Jolpica-f1 and/or weather feeds — FastF1's
  weather channel exists but hasn't been evaluated for this project). Pulling in a second new data
  source in the same milestone as a new storage engine is two architectural changes at once, which
  makes either one harder to review and roll back independently if something's wrong.
- Nothing in this document's schema or repository design is blocked by deferring them — `stints` and
  `pit_stops` don't join against weather or position data, so adding those later is strictly
  additive (new tables behind the same `RaceContextRepository` interface, §3.4), not a rework.

Per CLAUDE.md's scope discipline: if a feature isn't in the current milestone's entry, it's not in
scope no matter how tempting it is to add "while already touching Postgres." Weather/position become
their own future milestone once their source data is actually evaluated.

**Also explicitly out of scope:** any degradation curve, fuel-corrected pace model, or strategy
recommendation. M10 provides the facts; interpreting them is later, currently-unscheduled work (see
§1.3).

### 1.3 Milestone-numbering note

The M8 design review predicted its sequel — tyre/stint degradation modeling — would land as "M9."
That didn't happen: M9 shipped as the frontend restyle (`docs/m9-design-review.md`) once it became
clear the unstyled UI was the more urgent gap. This document is **M10**, and it only covers the
storage foundation, not the degradation modeling M8 anticipated. That modeling work is now
unscheduled and unnumbered until a future milestone picks it up — flagged here so nobody goes
looking for "M9's tyre modeling" and gets confused by the gap, the same way M8's implementation plan
documented its own renumbering when M7↔M8 shifted.

---

## 2. The Core Architectural Decision: Hybrid, Not a Full Migration

ADR-0004 and ADR-0006 both describe V3 as "Postgres becomes a second implementation" of
`TelemetryRepository`, phrased in a way that reads as *replacing* Parquet. Having now reached the
point of actually designing it: **that framing was slightly wrong, and this document deliberately
corrects it rather than implementing a stale plan literally.**

### 2.1 Why not migrate everything to Postgres

Telemetry is the overwhelming majority of PitWall's data volume (thousands of samples per lap, six
channels, every lap of every driver) and none of it needs a join — every existing read pattern
(`get_telemetry(session_id, driver_id, lap_number)`) is a key-based lookup, exactly what Parquet is
good at. Moving it to Postgres would mean: a much larger database to operate, row-store overhead for
what is fundamentally a columnar analytical workload, and a rewrite of `ParquetRepository` and every
telemetry-reading test — all to gain relational capability that telemetry never asked for. ADR-0004's
original "Positive" column (compact columnar reads, no relational joins needed) is still entirely
true for telemetry; only stints/pit-stops changed the picture.

### 2.2 Why not keep everything in Parquet

The opposite temptation — model `stints.parquet` and `pit_stops.parquet` as two more files next to
`laps.parquet`, and reconstruct "which stint contains lap 32" in Python at read time — was
considered and rejected. It would work, but every future strategy question (how many one-stop vs.
two-stop drivers, average stint length by compound, pit stops within N laps of a safety car) turns
into hand-rolled DataFrame-merging logic duplicated across every place that needs it, which is
precisely the kind of relational query Postgres exists to make simple and correct once instead of
reinvented per call site. This was the reason ADR-0004 named Postgres as the eventual answer in the
first place; nothing about implementing it now argues against that reasoning.

### 2.3 The resolution: split by data shape, not by milestone label

| Data | Store | Why |
|---|---|---|
| `compound` per lap | **Parquet** (`laps.parquet`, new column) | A scalar fact about an existing row, identical in shape to `lap_time_seconds`. No join. Adding a nullable column to an existing Parquet schema is a low-risk, purely additive change — not a reason to touch the storage architecture. |
| Stints (boundaries, compound, tyre age) | **Postgres** (new `stints` table) | Genuinely relational: a stint is a *range* of laps bounded by pit events, not a property of one row. |
| Pit stops | **Postgres** (new `pit_stops` table) | Same reasoning — a pit stop is an event that delimits stints and is naturally queried in relation to them (join stints ↔ pit_stops on session+driver+stop ordering). |

This is the central decision this document asks the team to sign off on: **hybrid means "the right
store for each data shape," not "Postgres replaces Parquet."** Telemetry, sessions, drivers, and laps
(including the new `compound` column) stay exactly where ADR-0004 put them. Only the genuinely
relational stint/pit-stop data is new, and only it goes to Postgres.

### 2.4 One repository interface, or two?

ADR-0006 anticipated Postgres becoming a second `TelemetryRepository` implementation. Given §2.3,
that's not what happens: `ParquetRepository` remains the **sole** `TelemetryRepository`
implementation, unchanged in its method set (compound rides along inside the existing `Lap` model,
§4.1 — no new method needed). Stints and pit stops get a **new, separate interface**:

```python
class RaceContextRepository(ABC):
    def list_stints(self, session_id: str, driver_id: str) -> list[Stint]: ...
    def list_pit_stops(self, session_id: str, driver_id: str | None = None) -> list[PitStop]: ...
```

Justification, applying ADR-0006's own stated principle ("interfaces are shaped by their consumer,
not their current implementation," ADR-0005/0006): `TelemetryRepository`'s read patterns are all
"one session/driver/lap's worth of columnar data." `RaceContextRepository`'s read patterns are
relational lookups against a database with actual query capability. Bolting stint/pit-stop methods
onto `TelemetryRepository` would force every future `TelemetryRepository` implementation (there is
only ever going to be `ParquetRepository`, realistically) to also know about Postgres, which is
exactly the kind of interface bloat ADR-0006's "grows when a second real implementation forces it"
principle warns against. Two narrow interfaces, each with one implementation and one clear backing
store, is simpler than one wide interface pretending to unify two unrelated storage engines.

**This is a reversal of what ADR-0004/ADR-0006 literally say** ("Postgres becomes a second
implementation" → in fact, a new interface, and `TelemetryRepository` is never touched). Per
CLAUDE.md's Definition of Done, a reversal of a prior decision needs an ADR before merge — see
§12/Open Questions. This document is that reversal's design rationale; the ADR (proposed as
ADR-0011) codifies it formally.

---

## 3. Data Model

### 3.1 Pipeline-side additions

`pitwall_pipeline/models.py`:

- **`Lap`** gains `compound: str | None = None` — normalized from FastF1's `Laps.Compound` (already
  present on the same DataFrame `normalize_laps` already reads; no new FastF1 call). `None` where
  FastF1 doesn't report it (older seasons, some session types) — same nullability convention already
  used for `lap_time_seconds`/sector times.
- **`Stint`** (new) — `session_id`, `driver_id`, `stint_number`, `compound`, `start_lap`, `end_lap`,
  `tyre_life_at_start` (laps already on that tyre set when the stint began, from FastF1's `TyreLife`
  — included because it's intrinsic to describing a stint honestly: "fresh" vs. "scrubbed" tyres at
  stint start is part of what a stint *is*, not a bonus metric bolted on for future modeling).
- **`PitStop`** (new) — `session_id`, `driver_id`, `stop_number`, `lap_number`,
  `pit_lane_time_seconds: float | None` — derived from FastF1's `PitOutTime - PitInTime`. **Caveat
  that must travel with this field wherever it's surfaced:** this measures pit-lane entry-to-exit
  time, not stationary box time — it includes driving through the pit lane at reduced speed, not
  just the tyre change itself. Mislabeling it as "pit stop duration" in a UI would be the same class
  of mistake M6's design review flagged for its raw, uncorrected delta ("make this explicit... so
  users don't over-interpret," M6 §10) — same discipline applies here.
- Both new models derive from `normalize_stints()`/`normalize_pit_stops()` as pure functions over
  FastF1's `Laps` DataFrame (`Stint`, `Compound`, `TyreLife`, `PitInTime`, `PitOutTime` columns),
  mirroring the existing `normalize_laps()`/`normalize_telemetry()` pattern in
  `pitwall_pipeline/normalize.py` — unit-testable against hand-built DataFrames, no FastF1Provider
  changes beyond passing the same `Laps` frame it already has.

### 3.2 PostgreSQL schema (conceptual)

```sql
CREATE TABLE stints (
    session_id          TEXT    NOT NULL,
    driver_id           TEXT    NOT NULL,
    stint_number        INT     NOT NULL,
    compound            TEXT    NOT NULL,
    start_lap           INT     NOT NULL,
    end_lap             INT     NOT NULL,
    tyre_life_at_start  INT,
    PRIMARY KEY (session_id, driver_id, stint_number)
);

CREATE TABLE pit_stops (
    session_id             TEXT    NOT NULL,
    driver_id              TEXT    NOT NULL,
    stop_number            INT     NOT NULL,
    lap_number             INT     NOT NULL,
    pit_lane_time_seconds  FLOAT,
    PRIMARY KEY (session_id, driver_id, stop_number)
);
```

Composite natural keys (`session_id`, `driver_id`, `stint_number`/`stop_number`), not a surrogate
`BIGSERIAL`, because ingestion needs to **upsert** (§5.2) — re-running ingestion for an
already-ingested session must overwrite, not duplicate, and a natural key makes that an `ON CONFLICT
DO UPDATE` instead of a delete-then-reinsert dance.

### 3.3 Identity across two stores: no cross-engine foreign key

`session_id`/`driver_id` in these tables are plain `TEXT`, matching the exact string identifiers
Parquet already established (`docs/data-model.md`'s `session_id` scheme, `pipeline/utils/ids.py`'s
slug format) — there is no database-enforced foreign key from Postgres back to a Parquet file, since
Postgres has no way to reference a file on disk. Referential integrity between "this session_id
exists in Parquet" and "this session_id has rows in Postgres" is a **convention**, enforced by
ingestion writing both in the same run (§5), not by a constraint. This mirrors the existing
`api-model.md` convention of matching on the `session_id` string rather than parsing or joining it
structurally — nothing new is invented here, the same identity scheme is just being asked to bridge
two storage engines instead of one.

A session that exists in Parquet with no matching Postgres rows is not an error — it means the
session was ingested before M10, or FastF1 didn't report stint/pit data for it (§7). Same "absence is
data, not failure" posture M8 took for a zero-valid-lap driver (§10 of that doc).

---

## 4. Ingestion / Write Path

```
┌──────────────┐     load_session()      ┌───────────────────┐
│  FastF1       │ ───────────────────▶   │  FastF1Provider     │
│  (Laps df:    │                        │  (unchanged          │
│  Stint,       │                        │   interface)         │
│  Compound,    │                        └─────────┬───────────┘
│  TyreLife,    │                                  │ NormalizedSessionData
│  PitIn/OutTime)│                                  ▼
└──────────────┘                     ┌───────────────────────────┐
                                      │ normalize_laps()  → Lap    │ (compound added)
                                      │ normalize_stints() → Stint │ (new)
                                      │ normalize_pit_stops()      │ (new)
                                      │              → PitStop     │
                                      └──────────┬────────────────┘
                                                 │
                          ┌──────────────────────┴───────────────────────┐
                          ▼                                              ▼
              ┌───────────────────────┐                     ┌─────────────────────────┐
              │ cache_writer.py        │                     │ postgres_writer.py (new) │
              │ (Parquet, unchanged    │                     │ upserts stints/pit_stops  │
              │  path + compound col)  │                     │ keyed on natural key      │
              └───────────────────────┘                     └─────────────────────────┘
```

### 4.1 Where the Postgres write happens

The pipeline, not the backend, owns writing stint/pit-stop data — same division of labor as Parquet
(pipeline writes the cache, backend only ever reads it). `pitwall_pipeline` gains its own Postgres
client dependency (`psycopg[binary]`, see §9) and its own tiny writer module
(`pitwall_pipeline/writers/postgres_writer.py`), independent of the backend's eventual Postgres
reader — this duplication is deliberate and already precedented: `docs/api-model.md` explicitly
chose independent `pandas`/`pyarrow` dependencies in pipeline and backend over a shared import,
specifically to keep each workspace's dependency graph scoped to what it needs (ADR-0001's modular
monolith principle). The same reasoning applies to Postgres: no shared `pitwall_db` package imported
by both workspaces, two small independent clients instead.

### 4.2 Failure handling & idempotency

Parquet write happens first, exactly as it does today — this is the path every existing V1/V2
feature depends on, and its blast radius must not grow. The Postgres write is a second, additive
step: if it fails, ingestion logs the failure explicitly (CLAUDE.md: "no bare `except:`... caught and
logged explicitly, not swallowed") and the session is still fully usable for every existing feature
— it simply has no strategy data yet, the same as a pre-M10 session. Ingestion does not roll back the
Parquet write if the Postgres write fails; the two stores are not written inside a single
distributed transaction (no two-phase commit across a filesystem and a database — that complexity has
no justification at this milestone's scale).

Re-running ingestion for an already-ingested session — a normal, already-supported operation (both
paths already overwrite Parquet files) — must also be safe against Postgres: the natural-key `ON
CONFLICT DO UPDATE` upsert (§3.2) makes re-ingestion idempotent instead of accumulating duplicate
stints.

### 4.3 Backfill for already-ingested sessions

No data migration in the traditional sense is needed — there's no existing Postgres data to move.
"Backfill" here means re-running ingestion for every session already in the Parquet cache, which
populates their stint/pit-stop rows without re-fetching from FastF1 if the raw FastF1 cache
(FastF1's own on-disk cache, separate from PitWall's Parquet output) is still warm; a cold FastF1
cache means a real re-fetch, subject to the same rate-limit/upstream-instability risk PRD §4 already
names. This is an operational task to run once after M10 ships, not new pipeline logic.

---

## 5. API Implications

### 5.1 New endpoints

```
GET /api/v1/sessions/{session_id}/drivers/{driver_id}/stints
GET /api/v1/sessions/{session_id}/pit-stops?driver_id=
```

Following existing conventions exactly: session-scoped path, optional `driver_id` filter on the
list-everything endpoint (matching `/laps?driver_id=`), 404 if the session doesn't exist, empty list
(200) if the session exists but has no stint/pit-stop data (§3.3 — absence isn't an error).

### 5.2 New Pydantic models — anti-corruption boundary maintained

`backend/app/models/race_context.py` (new file, alongside `telemetry.py`/`lap_comparison.py`/
`session_analytics.py`): `Stint`, `PitStop` — independently defined from
`pitwall_pipeline.models.Stint`/`PitStop`, same rule ADR-0009 and `api-model.md` already apply to
every other model pair (the backend never imports the pipeline's types). These models are what
`RaceContextRepository` returns *and* what the route serializes — same single-model-layer pattern
`TelemetryRepository`'s existing methods already use (no separate internal-domain-object → API-model
mapping step; the repository's return type already is the API contract, since neither store's native
row shape leaks past the repository).

### 5.3 Existing endpoint change: `compound` on `Lap`

`GET /sessions/{session_id}/laps` gains one new nullable field on the existing `Lap` response model
— additive, non-breaking (existing consumers ignore fields they don't read; nothing is renamed or
removed). This is the one place M10 touches an existing V1/V2 contract, and it satisfies
`docs/success-metrics.md`'s V3 criterion directly: *"the `TelemetryRepository` interface absorbs this
change without altering the public contract shape of existing V1/V2 endpoints"* — the shape is
extended, not altered; no existing field changes meaning or type.

### 5.4 Dependency injection

`RaceContextRepository` is injected via its own `Depends()`, parallel to but independent of
`TelemetryRepository`'s existing `get_repository()` provider in `app/dependencies.py` — a route that
needs both (none do, in M10) would declare both dependencies rather than one interface trying to
serve both purposes.

---

## 6. Migration Strategy (rollout ordering)

1. **Infra first:** add a `postgres` service to `docker-compose.yml`, a `PITWALL_DATABASE_URL`
   env var (naming parallel to the existing `PITWALL_DATA_DIR`), and the schema migration mechanism
   (§9 — plain versioned SQL files + a small runner script, not Alembic, per this project's
   established minimal-dependency posture — M9's CSS Modules-over-Tailwind decision is the same
   instinct applied here). CI's `ci.yml` gains a `postgres` service block for the backend/pipeline
   test jobs, path-filtered the same way the workflow already is per `docs/architecture.md` §4.
2. **Pipeline write path:** `Stint`/`PitStop` models, `normalize_stints()`/`normalize_pit_stops()`,
   `postgres_writer.py`, `compound` added to `normalize_laps()` and `cache_writer.py`'s
   `laps.parquet` schema.
3. **Backend read path:** `RaceContextRepository` interface, `PostgresRaceContextRepository`
   implementation, new Pydantic models, two new routes, `compound` added to the existing `Lap`
   response model and `ParquetRepository._lap_from_row`.
4. **Backfill** already-ingested sessions (§4.3).
5. **Frontend** consumption is explicitly out of scope for this document — like M9 did for
   presentation concerns after M8's API existed, a frontend design note follows once this API
   surface is real, not speculatively designed against here.

This ordering means the app is in a fully working, deployable state after every step — no step
requires a later step to avoid breaking something already shipped, which matters given this is a
solo-maintainer project where "half-migrated" states can sit for a while between work sessions.

### Deployment note (flagged, not resolved here)

`docs/architecture.md` §6 already flags the processed-data cache's production location as an open
deployment detail. M10 adds a second one: the public demo deployment (Vercel/Fly.io-class host) needs
an actual Postgres instance now, not just disk/object storage — either a managed add-on (Fly Postgres,
Neon, Supabase, etc.) or a self-hosted container. This is a deployment configuration decision, not an
architectural fork worth an ADR of its own, but — same as §6's existing flag — it needs to be settled
explicitly before M10 ships to production, not left implicit.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Parquet/Postgres drift** — a session's Parquet data and Postgres rows fall out of sync (e.g. Parquet re-ingested but Postgres write failed and nobody noticed). | Ingestion logs Postgres write failures explicitly and loudly (not swallowed, per CLAUDE.md); §4.3's backfill step is re-runnable/idempotent so drift is always fixable by re-running ingestion, not a one-way corruption. |
| **FastF1 data quality for Stint/PitInTime/PitOutTime specifically** — PRD §4 already names general telemetry completeness gaps as a known risk; stint/pit data has its own failure modes (formation laps and red-flag restarts can appear as spurious extra "stints," `PitInTime`/`PitOutTime` can be null for a stop FastF1 didn't cleanly detect). | Normalize defensively: a stint with a null boundary or an implausible single-lap "stint" caused by a red flag is a data-quality edge case to validate against in `normalize_stints()` tests (§10), not something the schema needs to prevent structurally. Flagged as a Phase-0 investigation item for the eventual implementation plan, same as M8 flagged its brake-channel-shape assumption before committing to a threshold constant. |
| **Operational complexity** — a real database server to provision, back up, and keep running is a genuine increase in operational surface for a solo-maintainer project, working against ADR-0001's "simple ops" framing. | Accepted cost — ADR-0004 already accepted this tradeoff explicitly for V3 ("the right long-term store once V3's relational needs are real"); M10 is that point being reached, not a new decision. |
| **Local dev friction** — contributors now need Postgres running and migrated before ingestion works, where before it was zero-config (Parquet needs no server). | `docker compose up` starts Postgres automatically (§6); document the one-time `migrate` step clearly in the README/CONTRIBUTING update this milestone's Definition of Done requires. |
| **Two independent connection-handling stories** — the pipeline (batch job, one connection) and backend (long-running service, needs pooling) have different Postgres client needs. | Pipeline uses a plain single connection (`psycopg`); backend uses a small connection pool (`psycopg_pool`) — different, deliberately, rather than forcing one client pattern to fit both usage shapes. |

---

## 8. File Structure

```
pipeline/
  pitwall_pipeline/
    models.py                    # + Stint, PitStop; Lap + compound
    normalize.py                 # + normalize_stints(), normalize_pit_stops()
    writers/
      cache_writer.py            # existing, + compound column
      postgres_writer.py         # new
    migrations/
      001_create_stints.sql      # new
      002_create_pit_stops.sql   # new
  tests/
    test_normalize_stints.py
    test_normalize_pit_stops.py
    test_postgres_writer.py      # against a real test Postgres (§9)

backend/
  app/
    api/
      race_context.py            # new route module: stints, pit-stops
      sessions.py                # + compound on the existing /laps response, no route change
    models/
      race_context.py            # new: Stint, PitStop response models
      telemetry.py                # Lap + compound field
    repositories/
      race_context.py             # new: RaceContextRepository interface
      postgres_race_context_repository.py   # new: sole implementation
      parquet_repository.py       # + compound in _lap_from_row
    dependencies.py               # + get_race_context_repository()
  tests/
    repositories/
      test_postgres_race_context_repository.py   # against real test Postgres
    api/
      test_race_context_route.py                 # dependency-override fake, no real DB needed
```

Mirrors the existing `app/api/`, `app/models/`, `app/repositories/` flat-per-resource convention
already established by `telemetry.py`/`track.py`/`session_analytics.py` (not the nested `routes/`
subfolder M8's *design* doc originally sketched — the actual M8 implementation kept routes flat, and
this document follows what was actually built, not what an earlier design doc guessed).

---

## 9. Test Strategy

**Pipeline normalization (no DB needed):** `test_normalize_stints.py`/`test_normalize_pit_stops.py`
follow the exact pattern `normalize.py`'s existing tests already use — hand-built FastF1-shaped
DataFrames in, asserted `Stint`/`PitStop` objects out. Includes the red-flag/formation-lap edge cases
flagged in §7.

**Postgres-touching code (real DB required):** unlike Parquet, a synthetic `tmp_path` fixture can't
stand in for Postgres's actual constraint/upsert behavior. `postgres_writer.py` and
`PostgresRaceContextRepository` are tested against a **real Postgres instance** — a `postgres:`
service in both the local dev `docker-compose.yml` and `.github/workflows/ci.yml` (this is a genuine
new CI requirement this milestone introduces, not present for any workspace today). Recommend
`psycopg[binary]` (not an ORM) for both pipeline and backend clients, and plain versioned `.sql`
migration files applied by a small script rather than adopting Alembic — matching this project's
demonstrated preference (M9) for the smallest tool that covers the need, revisited if the schema ever
grows past a couple of tables with no cross-table constraints.

**Route-level tests avoid the real DB** the same way existing route tests avoid real Parquet files:
`app.dependency_overrides` swaps in a fake in-memory `RaceContextRepository` implementation for
`test_race_context_route.py` — this is precisely the benefit ADR-0006 named for repository interfaces
("straightforward to inject a fake/in-memory repository in backend unit tests"), now paying off for a
second backing store exactly as originally intended.

**Idempotency test:** run the same `postgres_writer.py` upsert twice against identical input, assert
row count doesn't double — this is this milestone's equivalent of M8's sign-convention fuzz test
(§11 of that doc): the one property where a subtle bug produces a plausible-looking but wrong result
(silently duplicated stints) rather than an obvious crash.

---

## 10. Performance Considerations

- **Stint/pit-stop payloads are tiny** (a handful of rows per driver per session) — no pagination or
  capping concerns, same order of magnitude as M8's driver-summary payload (§12 of that doc).
- **Postgres query cost is negligible at this scale** — two small tables, natural-key lookups, no
  need for a caching layer at M10's data volume. If a caching argument becomes relevant later, it
  should be evaluated against real measured load the way M8's §12 explicitly did for its own cache
  recommendation — not pre-built here speculatively.
- **Ingestion cost increase is small**: one additional DB round-trip per session per driver during
  the write phase, dominated by the same FastF1 fetch latency PRD §4 already identifies as the
  pipeline's actual bottleneck, not by the new Postgres write.

---

## 11. Explicitly Out of Scope for M10

- **Weather and position/gap history** (§1.2) — deferred to a future milestone once their source data
  is evaluated; not blocked by anything in this design.
- **Tyre degradation modeling, fuel-load correction, or any fitted/predictive strategy metric** — this
  document provides the facts (compound, stint boundaries, pit-stop timing); modeling them is
  future, currently-unscheduled work (§1.3).
- **Frontend consumption of stint/pit-stop data** — a follow-up design note once this API surface
  ships, same sequencing M8 → M9 already used.
- **Cross-session or cross-event strategy comparison** — single-session scoped, consistent with every
  prior milestone's comparison boundary (M6, M8).
- **A unified/abstracted "storage layer" hiding Parquet vs. Postgres behind one facade** — explicitly
  rejected in §2.4; two narrow interfaces, not one wide one pretending the two stores are
  interchangeable.
- **Migrating telemetry, sessions, drivers, or laps off Parquet** — never in scope; §2.1 explains why
  at length.

---

## 12. Success Criteria

Adapting `docs/success-metrics.md`'s V3 entry to M10's actual (split) scope:

- A user can see tyre compound per lap, and stint/pit-stop timing for a race session, sourced from
  Postgres via `RaceContextRepository`.
- Every existing V1/V2 endpoint's response contract is unchanged except the additive `compound` field
  on `Lap` — no existing field renamed, retyped, or removed.
- `TelemetryRepository`/`ParquetRepository` are untouched beyond the `compound` column; the new
  relational data is served entirely through a new, separate `RaceContextRepository` /
  `PostgresRaceContextRepository` pair.
- CI runs backend and pipeline tests against a real Postgres service; route-level tests still run
  without one (fake repository injection, §9).
- **ADR-0011** (hybrid Parquet+Postgres storage, superseding the "Postgres replaces Parquet"
  framing in ADR-0004/ADR-0006) is written and merged *before* implementation starts — per CLAUDE.md's
  Definition of Done, this is a new dependency and a new layer boundary, and this design review's
  §2 is exactly the rationale that ADR needs to capture.
- Already-ingested sessions are successfully backfilled (§4.3) with no Parquet data loss or
  corruption.
- Tests pass, types check (`mypy --strict` on both new modules), lint is clean, docs
  (`docs/architecture.md`'s tech-stack table and data-flow diagram, `docs/data-model.md`) are updated
  to reflect the second store — matching CLAUDE.md's Definition of Done exactly as every prior
  milestone has.

---

## Open Questions for Team Review

1. **DB client library**: confirm `psycopg[binary]` (v3) over `psycopg2` or an ORM (SQLAlchemy) —
   this document recommends the plain driver, consistent with the project's minimal-dependency
   posture, but it's worth an explicit sign-off before it's load-bearing in two workspaces.
2. **Migration tooling**: plain versioned `.sql` files + a small runner script (recommended, §9) vs.
   Alembic. Revisit if the schema grows past `stints`/`pit_stops` with no cross-table constraints —
   worth confirming the team agrees "grows when forced" applies here too, not just to the
   application-layer interfaces ADR-0006 originally said it about.
3. **`tyre_life_at_start` on `Stint`** (§3.1): included as intrinsic to describing a stint honestly.
   Confirm the team agrees this isn't scope creep toward degradation modeling — it's a fact about the
   stint's starting condition, not a derived/fitted metric.
4. **Production Postgres hosting** (§6, deployment note): managed add-on vs. self-hosted container —
   genuinely unresolved by this document, needs a decision before M10 ships to the public demo.
5. **Backfill execution**: is re-running the full ingestion CLI per already-ingested session
   (§4.3) acceptable operationally (depends on how many sessions are currently cached and whether
   FastF1's own cache is still warm for all of them), or does it need a narrower "strategy-only"
   re-ingestion path that skips re-writing unchanged Parquet data? Worth checking against the actual
   current session count before committing to an approach in the implementation plan.
6. **ADR-0011 authorship**: confirm this design review's §2 is sufficient rationale to promote
   directly into ADR-0011's Context/Decision/Consequences format, or whether the team wants a
   separate ADR-drafting pass before implementation begins.
