# ADR-0011: Hybrid Parquet + PostgreSQL Storage for Race Strategy Data

**Status:** Accepted
**Date:** 2026-08-06

## Context

ADR-0004 chose Parquet for V1 and named the fork ahead of time: V1's read patterns are all
key-based columnar lookups, but "V3 will introduce genuinely relational data (stints, pit stops,
weather, position history joined against sessions/drivers)." ADR-0006 anticipated that fork
resolving as Postgres becoming a second `TelemetryRepository` implementation, effectively assuming
Postgres would take over where Parquet's relational limits were reached.

M10 (`docs/m10-design-review.md`) worked out the actual design for the first genuinely relational
data PitWall needs — tyre compound, stints, and pit stops — and found that assumption imprecise.
Compound is a scalar per-lap fact, identical in shape to `lap_time_seconds`; it needs no join and
gains nothing from a relational store. Stints and pit stops are the opposite: a stint is a *range*
of laps bounded by pit events, not a property of one row, which is exactly the kind of relationship
Parquet has no efficient way to express without reinventing joins in application code at every call
site. Telemetry, sessions, drivers, and laps still have no relational read pattern at all — nothing
about reaching this fork changes ADR-0004's reasoning for that data.

## Decision

Introduce PostgreSQL as a **second, independent** backing store alongside Parquet — not a
replacement for it. Which store a piece of data lives in is decided by its shape, not by which
milestone introduced it:

- **Parquet** keeps sessions, drivers, laps (now including a new nullable `compound` column),
  telemetry, and track geometry. ADR-0004 stands unchanged for all of this data;
  `TelemetryRepository`/`ParquetRepository` are not modified beyond that one additive column.
- **PostgreSQL** stores the two new genuinely relational entities: `stints` and `pit_stops`.
- A new interface, `RaceContextRepository`, is introduced for the Postgres-backed data, with
  `PostgresRaceContextRepository` as its sole implementation, injected via its own `Depends()`.
  `TelemetryRepository` is not extended to cover it.

This decision **supersedes the "Postgres becomes a second `TelemetryRepository` implementation"
framing** in ADR-0004 and ADR-0006, without amending either document's text — both remain correct
records of what was decided and why, at the time it was decided. This ADR records where that plan,
once actually designed, diverged from the original prediction and why.

## Alternatives Considered

- **Migrate all storage to Postgres, including telemetry.** Rejected: telemetry's only read
  pattern is a key-based lookup (`get_telemetry(session_id, driver_id, lap_number)`), which Parquet
  already serves well; moving it would multiply operational surface and force a rewrite of a
  working, fully-tested repository for no functional gain.
- **Keep stints/pit-stops in Parquet as additional files, reconstruct relationships in application
  code.** Rejected: every future strategy question ("which stint contains lap N," "pit stops within
  N laps of a safety car") would mean hand-rolled DataFrame-merging logic duplicated at each call
  site — precisely the class of problem a relational store exists to solve once, correctly.
- **Extend `TelemetryRepository` with stint/pit-stop methods instead of introducing a new
  interface.** Rejected: would force the interface, and its only realistic implementation, to
  straddle two unrelated storage engines — contradicting ADR-0006's own principle that an interface
  is shaped by its consumer's actual, coherent read patterns, not stretched to unify unrelated ones.
- **SQLite instead of PostgreSQL.** Not reopened here — ADR-0004 already rejected SQLite for this
  exact future relational need, and reaching that future doesn't change the reasoning.

## Consequences

**Positive:** Each store is used for what it's actually good at — no relational logic is
reconstructed in application code, and no columnar workload is forced through a row-store. Existing
V1/V2 code (`TelemetryRepository`, `ParquetRepository`, every endpoint through M9) is untouched
except one additive field, so this migration carries none of the regression risk a full storage
swap would. The two-interface split also keeps `RaceContextRepository` fakeable in route-level
tests without a real database, the same benefit ADR-0006 named for `TelemetryRepository`.

**Negative:** PitWall now operates two storage engines instead of one, a real increase in
operational surface (a database to provision, migrate, and back up) that ADR-0001's "simple ops"
framing for a modular monolith didn't anticipate needing this soon — accepted here as the cost
ADR-0004 already flagged as coming due. Referential integrity between the two stores is
convention-based, not enforced by the database (see Implementation Constraints), which is a real
correctness surface that ingestion, not a schema constraint, is responsible for protecting.

## Migration Strategy

No existing data moves — there is no prior Postgres store to migrate from. Rollout is additive and
ordered so the app remains fully working after every step:

1. **Infrastructure:** a `postgres` service in `docker-compose.yml` and CI, a `PITWALL_DATABASE_URL`
   env var, and versioned schema migrations.
2. **Pipeline write path:** stint/pit-stop normalization and a Postgres writer, run after the
   existing Parquet write. The Parquet write remains the critical path and is never blocked or
   rolled back by a Postgres write failure; failures are logged explicitly, never swallowed.
3. **Backend read path:** `RaceContextRepository`, its Postgres implementation, and the two new
   endpoints, plus the additive `compound` field on the existing `Lap` response.
4. **Backfill:** already-ingested sessions gain stint/pit-stop data by re-running ingestion, which
   is idempotent (see below) rather than a one-time destructive operation.

## Implementation Constraints

- **No cross-engine foreign keys.** `session_id`/`driver_id` in Postgres are plain `TEXT`, matching
  the identifier scheme Parquet already established. Referential integrity between "this session
  exists in Parquet" and "this session has rows in Postgres" is enforced by ingestion writing both
  in the same run, not by a database constraint — a session with no Postgres rows is valid (not yet
  migrated or ingested before this ADR), not corrupt.
- **Natural composite primary keys** (`session_id`, `driver_id`, `stint_number`/`stop_number`), not
  surrogate keys, so re-ingestion can upsert (`ON CONFLICT DO UPDATE`) instead of accumulating
  duplicates on every re-run.
- **No shared code between workspaces.** The pipeline and backend each add their own independent
  Postgres client dependency and own their own read/write path, with no shared package imported
  across the workspace boundary — consistent with ADR-0001's modular-monolith boundary and the
  existing precedent of each workspace independently depending on `pandas`/`pyarrow` for Parquet.
- **Weather and position/gap history are out of scope for this decision**, despite being named
  alongside stints/pit-stops in ADR-0004's original V3 description. They depend on source data not
  yet evaluated; nothing in this ADR's schema or interface blocks addressing them later as
  additional tables behind the same `RaceContextRepository` interface.
