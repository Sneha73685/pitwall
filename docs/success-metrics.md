# PitWall — Success Metrics by Version

Purpose: define what "done and successful" means for each version before we build it, so scope decisions have a concrete document to check against instead of a feeling. Expands PRD §1.6.

## V1 — Telemetry Viewer

Success looks like:
- A user picks a real season/event/session (2018+), a driver, and a lap, and sees an accurate track map plus speed/throttle/brake/RPM/gear/DRS traces for that lap.
- Two laps (or two drivers) can be compared side by side, with a sector time table and a cumulative delta graph.
- Load time is dominated by network/render, not by live data fetching, because ingestion is pre-computed rather than done at request time.
- The codebase has typed contracts front-to-back, passes CI (lint, type-check, tests), and every architectural decision has a corresponding ADR.
- The app is deployed and publicly reachable at a URL.

Explicitly not required for V1: hover-driven synchronization, cursor-follows-car, corner highlighting, tire/stint/pit-stop data, weather, position history, or any AI/analysis layer. A PR adding any of these is out of scope for V1 regardless of how small it looks.

## V2 — Interactive Engineering Dashboard

Success looks like:
- Hovering any telemetry chart moves a synchronized cursor across all other charts for the same lap(s), via ECharts' `connect`/`axisPointer` linking (ADR-0008).
- The car marker on the track map moves to match the hovered point.
- Corners can be highlighted (via `markArea`) with the corresponding chart region highlighting in sync.
- The delta graph updates live as the cursor moves, not just as a static end-of-lap number.

Explicitly not required for V2: tire strategy, stints, pit stops, weather, or any generated explanation of *why* a gain happened — V2 makes the data feel alive, it doesn't yet interpret it.

## V3 — Race Analysis

Success looks like:
- Stint and pit-stop data is visualized across a full race, sourced from relational race data (Jolpica-f1 and/or FastF1 session results) backed by Postgres, per the planned migration in ADR-0004.
- Weather and position/gap history are viewable alongside lap data.
- The `TelemetryRepository` interface absorbs this change without altering the public contract shape of existing V1/V2 endpoints.

Explicitly not required for V3: any automated interpretation of *why* a strategy worked or didn't — that's V4.

## V4 — Engineering Insights

Success looks like:
- For a specific corner/lap comparison, the system states a concrete, data-backed explanation of where and why time was gained or lost (later braking, higher apex speed, earlier throttle) — not just a chart showing the same numbers a user has to interpret themselves.
- Insight generation is deterministic, rule-based analysis over the existing telemetry model — not yet a language model.

Explicitly not required for V4: natural-language input or output — a user still interacts through the UI, not by typing a question.

## V5 — AI Engineer

Success looks like:
- A user can ask a natural-language question ("compare Russell's qualifying lap with Antonelli", "where was time gained in Turn 9") and get an answer grounded in V1-V4's actual data and insight layers — not a hallucinated one.
- Any prediction (tire degradation, strategy recommendation) is clearly presented as a model output with its stated basis, not as established fact.

Explicitly not required: replacing V1-V4's UI — V5 augments the existing deterministic views, it doesn't replace them.
