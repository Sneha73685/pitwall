# ADR-0009: Internal API Schema Boundary (Anti-Corruption Layer)

**Status:** Accepted
**Date:** 2026-07-26

## Context

PitWall now has two abstraction points — `TelemetryProvider` (ADR-0005) and `TelemetryRepository` (ADR-0006) — that keep FastF1 and Parquet swappable internally. Without an explicit rule, it would still be possible for provider- or storage-shaped data (FastF1 column names, pandas-specific structures, Parquet schema details) to leak through the API into the frontend, silently reintroducing the coupling those abstractions exist to prevent.

## Decision

The backend always transforms provider/repository data into PitWall's own Pydantic response models before returning it from any endpoint. The frontend's typed API client only ever consumes PitWall's schema — it has no knowledge of FastF1, OpenF1, Parquet, or any other source or storage detail. This is the concrete enforcement of the project's layering principle: each layer depends only on the layer directly below it.

## Consequences

**Positive:** changing data providers or storage implementations never requires a frontend change; the typed API contract is stable and can be versioned independently of internal implementation; the rule is simple enough to check in code review ("does this response model expose anything provider- or storage-specific?").

**Negative:** requires deliberate mapping/transform code at the API boundary (provider/repository shape → PitWall schema) that must be kept in sync as the internal schema evolves — accepted as the direct cost of the isolation this ADR guarantees.

## Alternatives Considered

- **Pass FastF1/pandas-shaped or Parquet-shaped data through to the frontend directly:** rejected — this is exactly the coupling ADR-0005 and ADR-0006 were introduced to avoid; doing it anyway at the API layer would make those abstractions cosmetic rather than real.
