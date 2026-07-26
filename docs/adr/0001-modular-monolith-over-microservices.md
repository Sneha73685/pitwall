# ADR-0001: Modular Monolith Over Microservices for V1

**Status:** Accepted
**Date:** 2026-07-26

## Context

PitWall has three logical concerns: an offline data-ingestion pipeline, a backend API, and a frontend. These could be built and deployed as independent services from day one.

## Decision

V1 is a modular monolith: one backend service (FastAPI) reads from a shared processed-data cache; ingestion runs as a separate offline/scheduled process, not a network service the backend calls. No service-to-service network boundary exists in V1.

## Consequences

**Positive:** one codebase and one deployment to reason about; no inter-service network calls, retries, or versioning to manage; matches the project's actual scale (a portfolio demo with read-only endpoints over pre-computed data).

**Negative:** if ingestion later needs independent scaling or scheduling (e.g., automatically ingesting every new race weekend on a timer, independent of API traffic), splitting it into its own service becomes a deliberate future migration rather than something already in place.

## Alternatives Considered

- **Full microservices** (separate ingestion service, API service, gateway): rejected — the operational overhead (three deployments, inter-service contracts, network failure modes) has no corresponding benefit at V1's scope.
- **Serverless functions per endpoint:** rejected — cold-start latency and added infrastructure complexity are disproportionate to a handful of read endpoints over a local/object-storage cache.
