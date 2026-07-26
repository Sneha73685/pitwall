# ADR-0006: TelemetryRepository Abstraction in the Backend

**Status:** Accepted
**Date:** 2026-07-26

## Context

V1 stores processed telemetry as Parquet (ADR-0004). V3 will migrate to Postgres for relational race data. The backend's route handlers should not need to change when that migration happens.

## Decision

Define a `TelemetryRepository` interface in the backend, injected into route handlers via FastAPI's dependency system (`Depends()`). `ParquetRepository` is the sole V1 implementation.

## Consequences

**Positive:** the V3 storage migration becomes an implementation swap behind a stable interface, not a rewrite of API routes; the same interface makes it straightforward to inject a fake/in-memory repository in backend unit tests, avoiding the need for real Parquet fixtures in every test.

**Negative:** the interface is defined by V1's actual read patterns and will need to grow when V3 introduces genuinely relational queries (e.g., joining stints against pit stops) that a key-based lookup interface doesn't express — that extension is expected, not a sign the original interface was wrong.

## Alternatives Considered

- **Read Parquet files directly in route handlers:** rejected — couples API routes to a specific storage format and makes handlers difficult to unit test without real files on disk.
