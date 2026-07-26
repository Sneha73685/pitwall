# ADR-0004: Parquet Over SQLite/Postgres for V1 Storage

**Status:** Accepted
**Date:** 2026-07-26

## Context

Telemetry is columnar time-series data. V1 only needs to read pre-processed sessions; V3 will introduce genuinely relational data (stints, pit stops, weather, position history joined against sessions/drivers).

## Decision

Parquet files are the V1 implementation behind the `TelemetryRepository` interface (see ADR-0006).

## Consequences

**Positive:** compact, fast columnar reads that load cleanly into pandas or straight to JSON; no database server to deploy or operate; a natural fit for time-series telemetry specifically.

**Negative:** no relational joins — fine for V1's read patterns, but this means V3's stint/pit-stop/weather data genuinely needs a different backing store. That migration is planned and explicit, not a gap discovered later: it happens behind the `TelemetryRepository` interface without touching the API contract or frontend.

## Alternatives Considered

- **SQLite:** simpler single-file relational model, viable for V1, but offers no real advantage over Parquet for V1's actual query patterns (read a session/driver/lap's telemetry). Not worth the switch now, and it will need to be swapped out again in V3 for the same relational reasons Parquet would.
- **Postgres:** the right long-term store once V3's relational needs are real. Rejected for V1 — running and operating a database server is overhead this stage doesn't need yet.
