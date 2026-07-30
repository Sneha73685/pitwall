# PitWall — Normalized Domain Model (M1)

Design note for M1 (ingestion pipeline), per `CLAUDE.md`'s "design before code" rule. Fills in the
`docs/data-model.md, TBD` reference left in the M0 scaffold
(`pipeline/pitwall_pipeline/providers/__init__.py`).

This defines the schema that sits at the "Normalization → internal schema" step in
`docs/architecture.md` §1: the shape `TelemetryProvider` implementations produce, and the shape
the (future, M2) `TelemetryRepository` reads back from Parquet. It is pipeline-internal — nothing
here is an API response model (ADR-0009 draws that line at the backend boundary, not here).

## Scope note

Only what V1 needs (PRD §2.1, `docs/success-metrics.md`): session/driver/lap identity, lap and
sector times, per-lap channel telemetry (speed/throttle/brake/RPM/gear/DRS) indexed by distance,
and track geometry for the map. Tire compound, stints, pit stops, weather, and position/gaps are
explicitly V3 (PRD §5) and are not modeled here, even though FastF1 exposes some of them on the
same objects (e.g. `Laps.Compound`) — pulling them in now would be scope creep against a later
milestone's data source (Jolpica-f1/Postgres), not a free extra field.

## Entities (`pitwall_pipeline/models.py`)

All are frozen Pydantic models (validation matters here: PRD §4 flags telemetry completeness as a
real risk, and Pydantic gives that validation for free at the normalization boundary; `pydantic` is
already a transitive dependency of `fastf1` and is now a direct one).

- **`SessionType`** (str enum) — `PRACTICE_1/2/3`, `QUALIFYING`, `SPRINT_QUALIFYING`, `SPRINT`,
  `RACE`. Normalizes FastF1's inconsistent session-name strings (`"Practice 1"`, `"Race"`, ...) to
  one stable vocabulary the rest of the system can rely on.
- **`Session`** — `session_id` (derived, e.g. `2023_monza_race`), `season`, `event_name`,
  `round_number`, `location`, `country`, `session_type`, `session_date` (UTC, optional — some
  historic/testing events lack it).
- **`Driver`** — `driver_id` (FastF1 3-letter `Abbreviation`, e.g. `VER`), `driver_number`,
  `full_name`, `team_name`.
- **`Lap`** — `session_id`, `driver_id`, `lap_number`, `lap_time_seconds` (`None` for an
  incomplete/invalid lap), `sector_1_seconds`, `sector_2_seconds`, `sector_3_seconds` (each
  `None`-able for the same reason), `is_personal_best`, `is_accurate` (FastF1's own
  telemetry-integrity flag — surfaced so a future consumer can choose to distrust a lap's
  telemetry rather than silently trusting noisy data).
- **`TelemetrySample`** — one row of channel data for one driver/lap, keyed by `session_id`,
  `driver_id`, `lap_number` plus: `distance_m` (the common alignment axis PRD §4 calls for),
  `time_seconds` (lap-relative), `speed_kph`, `throttle_pct`, `brake_active`, `rpm`, `gear`,
  `drs_active`, `x`, `y`, `z`. Denormalized (keys repeated per row) deliberately: this is a
  columnar cache, not a relational store (ADR-0004), and repeated string/int keys compress well in
  Parquet.
- **`TrackPoint`** — `session_id`, `distance_m`, `x`, `y`: the track geometry used by the M4 track
  map, derived (not fetched) from telemetry — see below.
- **`NormalizedSessionData`** — the bundle a `TelemetryProvider.load_session()` call returns:
  `session`, `drivers: list[Driver]`, `laps: list[Lap]`, `telemetry: list[TelemetrySample]`,
  `track_points: list[TrackPoint]`. One bundle = one fully ingested session.

## `TelemetryProvider` (`pitwall_pipeline/providers/base.py`, ADR-0005)

```python
class TelemetryProvider(ABC):
    @abstractmethod
    def load_session(self, season: int, event: str, session_type: SessionType) -> NormalizedSessionData: ...
```

One method, shaped around what the ingestion entrypoint actually does: fetch one session, get back
fully normalized data. This is intentionally coarse rather than split into
`get_drivers`/`get_laps`/`get_telemetry` — V1 ingests a whole session in one batch job (PRD's
"pulls from FastF1, normalizes, and caches sessions server-side"), and a per-entity interface would
be speculative generality with no second caller to justify it yet (ADR-0005's own "grows when a
second real implementation forces it" principle).

## Normalization (`pitwall_pipeline/normalize.py`)

Kept as pure functions separate from `FastF1Provider` itself (mirroring the distinct "Provider" vs.
"Normalization" boxes in `docs/architecture.md`'s data-flow diagram), so mapping logic is
unit-testable against hand-built FastF1-shaped DataFrames without needing a fake `Session` object:

- `normalize_session(...) -> Session`
- `normalize_drivers(...) -> list[Driver]`
- `normalize_laps(...) -> list[Lap]`
- `normalize_telemetry(...) -> list[TelemetrySample]`

`FastF1Provider` is the only thing that calls FastF1's live/cached API; it calls these functions to
convert what it gets back into the internal schema before returning.

## TrackPoint derivation (`pitwall_pipeline/track.py`)

Track geometry isn't a FastF1 field — it's derived from one reference lap's telemetry (the
session's overall fastest timed lap), projecting each sample to its `(distance_m, x, y)`. One
reference lap is sufficient for V1's static track map (M4); V2's cursor-follows-car reuses
per-lap `TelemetrySample.x/y` directly rather than `TrackPoint`, so this stays a simple projection,
not a curve-fitting or smoothing step.

## Parquet cache layout (`pitwall_pipeline/cache_writer.py`)

```
data/processed/{season}/{event_slug}/{session_type}/
    session.parquet     # 1 row
    drivers.parquet
    laps.parquet
    telemetry.parquet
    track.parquet
```

This is a cache format, not an API contract — the (future, M2) `ParquetRepository` behind
`TelemetryRepository` (ADR-0006) is free to read it however it needs to; nothing here is exposed
past that boundary (ADR-0009). Layout is deliberately simple (one directory per ingested session)
since M1 doesn't yet need cross-session queries.
