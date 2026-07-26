# ADR-0008: Apache ECharts Over uPlot for Telemetry Charts

**Status:** Accepted
**Date:** 2026-07-26

## Context

Telemetry charts need distance-aligned line series in V1, synchronized cross-chart cursors and corner highlighting in V2, and annotated engineering-insight callouts in V4. uPlot and ECharts were compared directly on performance, linked interactions, annotations, zooming, and extensibility.

## Decision

Apache ECharts, using modular/tree-shaken component imports to control bundle size. (The track map remains a separate, hand-built D3 + SVG/canvas component in either case — it's a bespoke shape, not a standard chart type.)

## Consequences

**Positive:** `echarts.connect()` and `axisPointer.link` directly satisfy V2's synchronized-cursor requirement without custom canvas work; `markArea`, `markLine`, and `markPoint` directly satisfy V2's corner highlighting and V4's insight annotations, which would otherwise need to be hand-rolled on canvas; built-in `dataZoom` covers zooming.

**Negative:** larger bundle than uPlot even with modular imports; a lower raw-performance ceiling for extremely dense series — judged acceptable because a lap's telemetry (a few thousand samples across a handful of channels, a small number of overlaid laps) sits comfortably within ECharts' range and never approaches the scale where uPlot's edge would be felt.

## Alternatives Considered

- **uPlot:** originally recommended for its raw performance and small footprint. Reversed after weighing it against the project's actual roadmap: uPlot has no built-in annotation system, so V2's linking and V4's annotations would require significant custom canvas work (overlay drawing, coordinate math, hit-testing) to replicate what ECharts provides natively — a cost that outweighs its performance advantage at PitWall's real data volumes.
