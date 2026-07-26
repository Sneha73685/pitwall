# ADR-0003: React + TypeScript Over Svelte for the Frontend

**Status:** Accepted
**Date:** 2026-07-26

## Context

The frontend needs to support dense data visualization now, growing into richer synchronized interactivity (V2) later, and this project doubles as a portfolio piece evaluated by recruiters/interviewers.

## Decision

React + TypeScript.

## Consequences

**Positive:** the most widely recognized stack for hiring purposes; the deepest ecosystem of examples and libraries for data visualization and the kind of cross-component synchronization V2 needs; TypeScript enforces the same typing discipline as the backend's Pydantic models.

**Negative:** more boilerplate than Svelte, and marginally more runtime overhead per component.

## Alternatives Considered

- **Svelte/SvelteKit:** genuinely better performance-per-line-of-code and less boilerplate. Rejected specifically because of who evaluates this project — React is what most reviewers pattern-match on fastest, and the ecosystem of prior art for V2's synchronized-chart problem skews heavily React-first. This is a portfolio-context decision, not a claim that Svelte is technically worse.
