# ADR-0002: FastAPI Over Node/Express for the Backend

**Status:** Accepted
**Date:** 2026-07-26

## Context

The ingestion pipeline must be Python, because FastF1 (our V1 data source) is a Python-only library. The backend API layer could still be written in a different language.

## Decision

The backend is FastAPI (Python).

## Consequences

**Positive:** ingestion and API share one language, so there's no serialization/process boundary between "the code that understands F1 data" and "the code that serves it"; Pydantic gives typed request/response validation matching the frontend's TypeScript discipline; automatic OpenAPI docs; async support ready for future streaming/live-data needs.

**Negative:** no Node/Express experience gained from this project — an acceptable trade-off since it isn't a stated project goal; Python's async ecosystem is somewhat less mature than Node's for certain concurrency patterns, not expected to matter at V1's scale.

## Alternatives Considered

- **Node/Express or Nest.js**, invoking the Python pipeline as a subprocess: rejected — forces a language boundary between ingestion and API with duplicated validation logic in two ecosystems, for no benefit at this scope.
