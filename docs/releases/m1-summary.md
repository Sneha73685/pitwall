# M1 Release Summary — Ingestion Pipeline

**Status:** Complete
**Dates:** 2026-07-27 – 2026-07-30
**Milestone definition:** `docs/prd.md` §3

## Milestone goals

Per the roadmap in `docs/prd.md` §3, M1's scope was:

> FastF1 fetch + normalize for one session end-to-end, write to Parquet cache, tests against recorded fixtures.

Concretely, that meant standing up the pipeline workspace's core path — fetch one session from FastF1,
convert it to PitWall's own normalized schema, derive track geometry, and persist all of it to a
Parquet cache — with nothing downstream (the future M2 backend) depending on FastF1's shapes directly.

## What was built

- A normalized, provider-independent domain model (`Session`, `Driver`, `Lap`, `TelemetrySample`,
  `TrackPoint`, `NormalizedSessionData`) shared by every stage of the pipeline.
- A `TelemetryProvider` interface, with `FastF1Provider` as its sole V1 implementation — the only
  module allowed to call FastF1's API directly.
- A normalization layer that maps FastF1's pandas-shaped data (session results, laps, telemetry)
  onto the internal schema, handling unit conversion (position deci-metres → metres), DRS status
  decoding, and missing/incomplete lap data.
- Track geometry derivation, projecting one reference lap (the session's fastest) down to
  `(distance_m, x, y)` points for the future static track map (M4).
- A Parquet cache writer, persisting one ingested session to
  `data/processed/{season}/{event_slug}/{session_type}/*.parquet`.
- A CLI ingestion entrypoint (`python -m pitwall_pipeline.ingest --season ... --event ... --session ...`)
  tying fetch → normalize → cache into one command.
- A fixture-based test suite covering normalization, track derivation, cache writing, and the
  provider's own orchestration logic — entirely mocked, no network access.

## Architectural decisions

No new ADRs were required for M1. The two decisions ingestion depends on — provider abstraction and
Parquet-first storage — were already recorded ahead of implementation:

- **ADR-0005** (TelemetryProvider abstraction) — `FastF1Provider` is built directly against this
  interface, confirming the abstraction as specified.
- **ADR-0004** (Parquet over SQLite/Postgres for V1 storage) — the cache writer implements the
  layout this ADR anticipated.

The concrete schema and cache layout are documented as a design note in `docs/data-model.md`,
written before implementation per `CLAUDE.md`'s "design before code" rule.

## New modules

| Module | Purpose |
|---|---|
| `pitwall_pipeline/models.py` | Normalized domain model (Pydantic, frozen, `extra="forbid"`) |
| `pitwall_pipeline/providers/base.py` | `TelemetryProvider` abstract interface |
| `pitwall_pipeline/providers/fastf1_provider.py` | `FastF1Provider` — sole V1 provider implementation |
| `pitwall_pipeline/normalize.py` | Pure mapping functions: FastF1-shaped DataFrames → domain model |
| `pitwall_pipeline/track.py` | Track geometry derivation from reference-lap telemetry |
| `pitwall_pipeline/cache_writer.py` | Parquet cache writer |
| `pitwall_pipeline/ingest.py` | CLI entrypoint: fetch → normalize → cache |
| `pitwall_pipeline/utils/ids.py` | Shared slug generation for session IDs and cache paths |

## Public APIs

None. M1 is entirely internal to the pipeline workspace — there is no FastAPI service, no HTTP
endpoint, and no schema exposed past the pipeline's own boundary yet. The Parquet cache layout in
`docs/data-model.md` is a cache format for the (future, M2) `ParquetRepository` to read, not a
public contract (ADR-0009 draws the public API boundary at the backend, not here).

## Testing performed

19 tests across 6 files, all fixture-based and fully mocked — no test touches the network or a real
FastF1 session:

- `test_normalize.py` — session/driver/lap/telemetry mapping, unit conversion, DRS thresholding,
  missing-data handling.
- `test_track.py` — track point projection, empty-input handling.
- `test_cache_writer.py` — on-disk layout matches `docs/data-model.md`, round-trip read/write,
  empty-telemetry edge case.
- `test_fastf1_provider.py` — end-to-end orchestration against faked FastF1 `Laps`/`Lap` objects,
  including a simulated per-lap telemetry fetch failure and a no-laps session.
- `test_ids.py` — slug generation.
- `test_smoke.py` — carried over from M0.

## Verification results

All four of CLAUDE.md's Definition of Done checks pass:

| Check | Result |
|---|---|
| `ruff format --check` | Pass — 20 files already formatted |
| `ruff check` | Pass — no lint findings |
| `mypy` (strict) | Pass — no issues across 20 source files |
| `pytest` | Pass — 19/19 |
| `docker build` (pipeline, backend, frontend) | Pass — all three images build cleanly |

## Known limitations

- Telemetry fetch failures are skipped per-lap with a logged warning rather than retried — FastF1's
  upstream instability (PRD §4) is caught, but there's no retry/backoff yet.
- Only one reference lap (the session's fastest) is used for track geometry; this is sufficient for
  V1's static track map but isn't revisited if that lap has anomalous telemetry.
- Ingestion is single-session, single-process — no batch/multi-session run, parallelism, or
  incremental re-ingestion.

## Technical debt

- `FastF1Provider._derive_track_points` returns `list` with a `# type: ignore[type-arg]` rather than
  a fully-parameterized return type — passes mypy strict via the ignore, not a complete annotation.
- No standalone milestone design-note file was written before implementation started; `docs/data-model.md`
  filled that role but wasn't labeled as one until this release pass.

## Next milestone

**M2 — Backend API** (`docs/prd.md` §3): a FastAPI service reading the Parquet cache written by M1,
exposing typed endpoints for sessions, drivers, laps, and telemetry, with OpenAPI docs and its own
test suite. M2 is the first milestone where the anti-corruption layer (ADR-0009) and the
`TelemetryRepository` interface (ADR-0006) get a real implementation.
