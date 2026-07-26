# ADR-0007: Zustand Over React Context for Frontend State

**Status:** Accepted
**Date:** 2026-07-26

## Context

V1 has cross-component selection state (session, driver, lap). V2 adds shared, higher-frequency state (hover position, telemetry cursor, selected corner) that many components — including expensive canvas-rendered charts — must read without re-rendering unnecessarily.

## Decision

Adopt Zustand from the start, organized as small stores by concern: a `selectionStore` now (session/driver/lap), with a `cursorStore` to be added in V2 without modifying the first.

## Consequences

**Positive:** Zustand's selector-based subscriptions (`useStore(s => s.selectedLap)`) mean components only re-render when the specific slice they read changes — important as soon as V1's chart components exist, not just once V2's cursor state arrives; less setup boilerplate than Context providers; no migration cost later, since there is no "start simple, upgrade when needed" version of this decision that actually saves work.

**Negative:** one additional dependency, though minimal in size (~1KB) and API surface.

## Alternatives Considered

- **React Context, deferring Zustand to V2:** this was the original recommendation, revised after discussion. Rejected because Context's default behavior re-renders every consumer on any value change (mitigated only by manually splitting into multiple contexts, which is more work than adopting Zustand outright), and because migrating Context to Zustand later has no architectural payoff — it's pure busywork confined to the state layer, unlike the provider/repository decisions where sequencing genuinely matters.
