# ADR-0005: TelemetryProvider Abstraction in the Pipeline Layer

**Status:** Accepted
**Date:** 2026-07-26

## Context

V1's ingestion pipeline only needs FastF1. Plausible future sources exist with real motivation, not just hypothetically: OpenF1 (live-session data), imported telemetry files, or simulator data.

## Decision

Introduce a `TelemetryProvider` interface in the pipeline layer, shaped around PitWall's own normalized internal schema rather than FastF1's API surface. `FastF1Provider` is the sole V1 implementation. This lives entirely in the pipeline layer — the backend and frontend never reference it.

## Consequences

**Positive:** adding a future source (OpenF1, file import) becomes a new implementation of an existing interface rather than a change that ripples through ingestion logic; FastF1-specific quirks (column names, units, pandas-shaped returns) stay contained to one adapter.

**Negative:** a small amount of indirection for what is, today, a single implementation; the interface's exact shape will likely need revision once a genuine second provider is built, since we can't fully anticipate its constraints yet — this is accepted as a reasonable cost of keeping the boundary in place from the start.

## Alternatives Considered

- **Call FastF1 directly from ingestion scripts:** rejected — would require touching ingestion logic (and potentially the normalization step) directly if a second source is ever added, rather than isolating that change to one new adapter.
