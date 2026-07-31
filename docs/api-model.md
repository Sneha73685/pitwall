# PitWall — Backend API Schema (M2)

Design note for M2 (backend API), per `CLAUDE.md`'s "design before code" rule. Companion to
`docs/data-model.md` (the pipeline's internal schema) — this document defines the *other* side of
the anti-corruption boundary (ADR-0009): the schema `TelemetryRepository` returns and the API
exposes. Nothing here is shared code with the pipeline; the backend workspace has no dependency on
`pitwall_pipeline` (separate `pyproject.toml`, no FastF1/matplotlib/scipy in this service).

## Scope note

M2 covered exactly what PRD §3 asked for: "FastAPI service reading the cache; endpoints for
sessions, drivers, laps, telemetry; OpenAPI docs; basic tests." Track-point data was deliberately
deferred at the time (no consumer until M4's track map); M4 (below) adds it now that one exists.

Two-lap comparison, sector-time comparison, and delta-graph computation (M6) are still out of scope
here — this API only reads and serves what M1 already wrote to Parquet, it doesn't compute anything
new.

## M4 addition: track points

`GET /sessions/{session_id}/track` returns `list[TrackPoint]` (`distance_m`, `x`, `y` — `session_id`
dropped per the usual URL-implied-field convention below), read from the session's `track.parquet`
via a new `list_track_points(session_id)` method on `TelemetryRepository`. Same 404 convention as
`/drivers`/`/laps`: 404 if the session doesn't exist, empty list (200) if the session exists but has
no track points (the pipeline's `_derive_track_points` returns `[]` when no fastest lap was found —
see `docs/data-model.md`). Points are returned sorted by `distance_m`, matching `/telemetry`'s
existing convention, so the frontend can build an SVG path directly without re-sorting.

This is genuinely a separate resource from `/telemetry` (track geometry is session-level, derived
once from a reference lap, not per-driver/per-lap), so it gets its own route module
(`app/api/track.py`) rather than living in `sessions.py` or `telemetry.py`, mirroring how
`telemetry.py` was already split out from `sessions.py` in M2 despite sharing the `/sessions`
prefix.

## Why the backend re-reads Parquet directly (not via the pipeline package)

`TelemetryRepository` (ADR-0006) is defined by the API's own read patterns, not by importing
`pitwall_pipeline`. The Parquet cache layout in `docs/data-model.md` is the contract between the two
workspaces — a file format, not a shared Python type — so the backend adds its own `pandas`/`pyarrow`
dependency (the same libraries the pipeline already uses to write the cache) and its own Pydantic
models, independent of the pipeline's `pitwall_pipeline.models` module. This keeps the backend's
dependency graph light (no FastF1, no matplotlib/scipy) and matches the modular-monolith principle
(ADR-0001): each workspace depends on the layer below it, never on a sibling workspace's internals.

## Data directory resolution

The backend reads from `{PITWALL_DATA_DIR}/processed/{season}/{event_slug}/{session_type}/*.parquet`
— the same layout `pipeline/pitwall_pipeline/cache_writer.py` writes (`docs/data-model.md`).
`PITWALL_DATA_DIR` (already declared in `docker-compose.yml` for the backend service, mounted from
the repo-root `data/` directory) defaults to `<repo_root>/data` for local non-Docker dev, matching
the convention `pipeline/pitwall_pipeline/smoke.py` established in M0 and that `docker-compose.yml`
and `.gitignore`'s `data/*` rule already assume.

## `TelemetryRepository` (`app/repositories/base.py`, ADR-0006)

```python
class TelemetryRepository(ABC):
    def list_sessions(self) -> list[Session]: ...
    def get_session(self, session_id: str) -> Session | None: ...
    def list_drivers(self, session_id: str) -> list[Driver]: ...
    def list_laps(self, session_id: str, driver_id: str | None = None) -> list[Lap]: ...
    def get_telemetry(self, session_id: str, driver_id: str, lap_number: int) -> list[TelemetrySample]: ...
```

Shaped directly around what the four M2 endpoints need — `list_laps`'s optional `driver_id` and
`get_telemetry`'s required `driver_id`/`lap_number` mirror the actual query patterns, not a generic
CRUD interface. `ParquetRepository` is the sole V1 implementation; nothing above this interface
(routes) knows it's Parquet-backed.

### Session lookup: match on `session_id`, don't parse it

`session_id` (e.g. `2023_monza_race`) is built by joining season/slug/session-type with
underscores, and `slugify()` itself also uses underscores as its separator (see
`pipeline/pitwall_pipeline/utils/ids.py`) — so a `session_id` string can't be unambiguously split
back into its three parts. `ParquetRepository` never tries: it walks `{base}/*/*/*/session.parquet`,
reads each session's stored `session_id` field, and matches against that. This also means the
backend needs no knowledge of the slugging rule at all — it only needs to know the fixed
three-level directory depth from `docs/data-model.md`.

## API response models (`app/models/telemetry.py`)

Pydantic models, independently defined from `pitwall_pipeline.models` (see above), but matching the
same fields for the subset M2 exposes:

- **`SessionType`** (str enum) — same vocabulary as the pipeline's (`practice_1/2/3`, `qualifying`,
  `sprint_qualifying`, `sprint`, `race`), redefined locally per the anti-corruption boundary.
- **`Session`** — `session_id`, `season`, `event_name`, `round_number`, `location`, `country`,
  `session_type`, `session_date`.
- **`Driver`** — `driver_id`, `driver_number`, `full_name`, `team_name`.
- **`Lap`** — `driver_id`, `lap_number`, `lap_time_seconds`, `sector_1_seconds`, `sector_2_seconds`,
  `sector_3_seconds`, `is_personal_best`, `is_accurate`.
- **`TelemetrySample`** — `distance_m`, `time_seconds`, `speed_kph`, `throttle_pct`, `brake_active`,
  `rpm`, `gear`, `drs_active`, `x`, `y`, `z`.
- **`TrackPoint`** (M4) — `distance_m`, `x`, `y`.

`session_id`/`driver_id`/`lap_number` are dropped from the nested `Lap`/`TelemetrySample`/
`TrackPoint` payloads where they're already implied by the URL path, to avoid repeating the same
value on every list item for no reason — a plain response-shaping choice, not an architectural one.

## Endpoints (`app/api/sessions.py`, `app/api/telemetry.py`, `app/api/track.py`)

| Method | Path | Returns | Not found behavior |
|---|---|---|---|
| GET | `/sessions` | `list[Session]` | — (empty list if cache is empty) |
| GET | `/sessions/{session_id}` | `Session` | 404 if no matching session |
| GET | `/sessions/{session_id}/drivers` | `list[Driver]` | 404 if session doesn't exist |
| GET | `/sessions/{session_id}/laps?driver_id=` | `list[Lap]` | 404 if session doesn't exist; empty list if `driver_id` filter matches nothing |
| GET | `/sessions/{session_id}/telemetry?driver_id=&lap_number=` | `list[TelemetrySample]` | 404 if session/driver/lap combination has no samples |
| GET | `/sessions/{session_id}/track` (M4) | `list[TrackPoint]` | 404 if session doesn't exist; empty list if no track points were derived |

`driver_id` and `lap_number` are both required query parameters on `/telemetry` — fetching a whole
session's telemetry in one response isn't a V1 read pattern (PRD's success criteria and
`docs/success-metrics.md` both describe "a lap's" traces, not a session's).

OpenAPI/Swagger docs are FastAPI's built-in `/docs` and `/openapi.json` (auto-generated from these
route/response-model definitions) — no separate hand-maintained API reference is written, since that
would just drift from the one FastAPI already generates correctly.

## Testing approach

Fixture-based, no network/FastF1, matching the pipeline's M1 pattern: a test helper writes a small,
synthetic Parquet cache (via `pandas`/`pyarrow`, same as `cache_writer.py` does for real) to a
`tmp_path`, `ParquetRepository` is pointed at it directly for repository-level tests, and FastAPI's
`app.dependency_overrides` swaps in that same repository for endpoint-level tests via `TestClient`.
