# PitWall — M10 Implementation Plan: Hybrid Parquet + PostgreSQL Storage for Race Strategy Data

**Status:** Phase 3 complete — ready for Phase 4
**Baseline:** v0.7.0 (M0–M9 complete)
**Source documents:** `docs/m10-design-review.md` (design), `docs/adr/0011-hybrid-storage-architecture.md` (accepted)

This plan follows M8's structure (`docs/m8-implementation-plan.md`): a Phase 0 audit that checks the
source design documents against the actual repository and records every correction *before* any
code is written, followed by build phases in dependency order (infra → pipeline write path →
backend read path → API → frontend → release). Nothing in Phase 1+ starts until Phase 0's table is
complete, the same gating M8 used.

No code is written or modified by this document. It is the plan that Phases 1–6 will later execute.

---

## Phase 0 — Repository Audit and Implementation Corrections

### 0.0 Purpose

Verify every file path, naming convention, and technical assumption `docs/m10-design-review.md` and
`docs/adr/0011-hybrid-storage-architecture.md` made, against the actual v0.7.0 codebase. Both source
documents were written by reasoning about the architecture in the abstract; some of their file-layout
and API-shape details don't match what M0–M9 actually shipped, in exactly the way M8's own Phase 0
found and corrected against its design doc. Record corrections here, not by silently deviating during
coding and not by re-editing the design review or the ADR.

### 0.1 Corrections against `docs/m10-design-review.md`

| # | Design review says | Actual repo state (confirmed by inspection) | Correction |
|---|---|---|---|
| C1 | §5.1: routes are `GET /api/v1/sessions/{session_id}/drivers/{driver_id}/stints` and `GET /api/v1/sessions/{session_id}/pit-stops` | No `/api/v1` or any version prefix exists anywhere in this API. `app/main.py` mounts every router (`health`, `sessions`, `telemetry`, `track`, `laps_compare`, `session_analytics`) at the app root with only each router's own resource-scoped `prefix` (e.g. `prefix="/sessions"`). `frontend/src/api/client.ts`'s `API_BASE_URL` points straight at the FastAPI root. (M8's own Phase 0, §0.4a, independently caught and documented this identical error.) | Routes are `GET /sessions/{session_id}/drivers/{driver_id}/stints` and `GET /sessions/{session_id}/pit-stops` — no version prefix. |
| C2 | §8: new backend tests live at `backend/tests/repositories/test_postgres_race_context_repository.py` and `backend/tests/api/test_race_context_route.py` | `backend/tests/` is entirely flat — confirmed by directory listing: `test_parquet_repository.py`, `test_sessions_api.py`, `test_track_api.py`, `test_laps_compare_route.py`, `test_session_analytics_route.py`, `test_session_analytics_aggregation.py`, etc. Zero subdirectories exist. | `backend/tests/test_postgres_race_context_repository.py` and `backend/tests/test_race_context_route.py`, flat, matching every existing test file. |
| C3 | (not addressed) route/test file naming suffix | Historical drift: `test_sessions_api.py`/`test_telemetry_api.py`/`test_track_api.py` use `_api`; the two most recent route test files (M6, M8) — `test_laps_compare_route.py`, `test_session_analytics_route.py` — use `_route`. | Follow the most recent precedent: `test_race_context_route.py`. |
| C4 | §8: pipeline tests at flat `pipeline/tests/test_normalize_stints.py`, `test_normalize_pit_stops.py`, `test_postgres_writer.py` | Confirmed correct as written — matches the actual flat layout (`pipeline/tests/test_normalize.py`, `test_cache_writer.py`, `test_fastf1_provider.py`, no subdirectories). | No correction needed. |
| C5 | (not addressed) how new routes/models/repositories get registered | `app/main.py` hand-lists every route module in one `from app.api import ...` line plus one `app.include_router(...)` call each. `app/models/__init__.py` and `app/repositories/__init__.py` both hand-enumerate every exported class in `__all__`. Nothing is auto-discovered; nothing fails loudly if an entry is skipped — the module still imports fine via its own path, it just breaks the established convention silently. | Phase 4 must add `race_context` to `main.py`'s import + include_router list. Phase 1/3/4 must add `Stint`, `PitStop`, `RaceContextRepository`, `PostgresRaceContextRepository` to the two `__init__.py` `__all__` lists as each is introduced. |
| C6 | §5.4: `RaceContextRepository` is injected "parallel to... `TelemetryRepository`'s existing `get_repository()` provider in `app/dependencies.py`" | The actual function is named `get_telemetry_repository()`, not `get_repository()`, and lives in one flat `app/dependencies.py` file — no per-feature dependency modules exist. | Add `get_race_context_repository()` to the same `app/dependencies.py` file, matching the one-function-per-repository, one-shared-file convention exactly. |
| C7 | §9/§6: CI gains a `postgres:` service in the backend/pipeline jobs | `.github/workflows/ci.yml` today has three path-filtered jobs (`backend`, `pipeline`, `frontend`) with **no `services:` block anywhere** — this is the first milestone requiring one. | Add an identical `postgres:` service block (pinned image tag, `pg_isready`-based healthcheck) to the `backend` and `pipeline` job definitions only — never `frontend`, which touches neither database. |
| C8 | Recommends `psycopg[binary]`, doesn't name tooling | Both `backend/pyproject.toml` and `pipeline/pyproject.toml` are managed by `uv` (CI installs via `astral-sh/setup-uv`, runs `uv sync --all-groups`). No `pip`/`poetry`/`requirements.txt` exists anywhere. | Add dependencies with `uv add <package>` inside each workspace directory (updates `pyproject.toml` and `uv.lock` together). Never hand-edit the dependency list without regenerating the lock file. |
| C9 | §3.1/§4: assumes FastF1's `Laps` DataFrame exposes `Stint`, `Compound`, `TyreLife`, `PitInTime`, `PitOutTime` columns | Confirmed by grep: **zero** references to any of these five field names exist anywhere in `pipeline/`, `backend/`, or their tests today. `pipeline/tests/fixtures.py::build_laps_df()` — the hand-built DataFrame every `normalize_laps` test runs against — reproduces FastF1's real column names only for what M1 needed (`Driver`, `LapNumber`, `LapTime`, `Sector1Time/2/3`, `IsPersonalBest`, `IsAccurate`). Nothing in this repository has ever verified the five tyre/pit column names, dtypes, or null-representations against the FastF1 version actually pinned here (`fastf1>=3.4`). | **Unresolved, not resolved.** Unlike M8's Q2/Q3 (answered by inspecting data already in-repo), this needs a real FastF1 session load or the pinned version's official column reference — neither is available while writing this plan. This becomes a hard **entry criterion for Phase 2** (§2.0 below), not a Phase-0-closed answer. |
| C10 | §8 implies both `cache_writer.py` and `parquet_repository.py` need edits for the new `compound` column | `pipeline/pitwall_pipeline/cache_writer.py::_to_dataframe` derives its column set generically from `model_cls.model_fields.keys()` / `record.model_dump()` — it needs **no code change** once `compound` is added to `pitwall_pipeline.models.Lap`. Only `backend/app/repositories/parquet_repository.py::_lap_from_row`, which maps the backend's independently-defined `Lap` model field-by-field by hand (per ADR-0009), needs an actual edit. | Reflect this asymmetry in Phase 2/4's task list — one file changes, the other doesn't, despite both nominally being "the Parquet layer." |
| C11 | §8: pipeline writer/migrations live under a `pitwall_pipeline/writers/` subpackage (`writers/cache_writer.py`, `writers/postgres_writer.py`) | `pipeline/pitwall_pipeline/` is flat at the module level — confirmed: `cache_writer.py`, `ingest.py`, `models.py`, `normalize.py`, `smoke.py`, `track.py` all sit directly under `pitwall_pipeline/`. Two subpackages exist (`utils/`, for `ids.py`; `providers/`, for `base.py`/`fastf1_provider.py`, per ADR-0005) — neither is a `writers/`-style grouping, and neither implies one. No `writers/` directory exists anywhere in the tree. | `cache_writer.py` stays exactly where it is (unmoved). The new writer is `pipeline/pitwall_pipeline/postgres_writer.py`, flat, alongside it — introducing a subpackage to hold one relocated file and one new file would be unjustified structural churn for a module tree that has stayed flat through nine milestones of growth. `migrations/` (holding `.sql` text, not Python modules) is a legitimate new directory since it isn't part of the flat-Python-module convention. |
| C12 | §11: frontend design is explicitly deferred ("a follow-up design note once this API surface ships") | This implementation plan is required (by its own brief) to specify a concrete Phase 5. | Phase 5 below makes the minimal, convention-following frontend decisions the design review deferred, directly in this plan — the same way M8's Phase 0 resolved open items its own source design left unsettled, rather than blocking on a second design document. |

### 0.1a Verification log

Each of C1–C12 was independently re-verified against the current repository state (branch
`m10-storage-architecture`, backend/pipeline/frontend as they exist today) before Phase 1 was
declared ready to start:

- **C1** — confirmed by reading `backend/app/main.py` and grepping every `APIRouter(...)` call in
  `backend/app/api/`: every router mounts with only its own resource-scoped `prefix` (`/sessions`, or
  none for `health`); no `/api/v1` or `/v1` string exists anywhere in `backend/app/` or
  `frontend/src/api/`.
- **C2/C3** — confirmed by listing `backend/tests/`: no subdirectories exist; the file-name suffix
  split (`_api` on the three oldest route tests, `_route` on the two most recent) is exactly as
  described.
- **C4** — confirmed by listing `pipeline/tests/`: flat, no subdirectories, matches the design
  review's own (correct) assumption.
- **C5** — confirmed by reading `backend/app/models/__init__.py` and `backend/app/repositories/__init__.py`
  in full: both hand-enumerate every export in `__all__`; no auto-discovery mechanism exists.
- **C6** — confirmed by reading `backend/app/dependencies.py` in full and confirming no other
  dependency-provider module exists anywhere under `backend/app/`.
- **C7** — confirmed: `grep -n "services:" .github/workflows/ci.yml` matches nothing; the full
  workflow file has three jobs, none with a `services:` block.
- **C8** — confirmed: no `requirements*.txt`, `poetry.lock`, or `Pipfile*` exists anywhere in the
  repository; `backend/uv.lock` and `pipeline/uv.lock` exist and `ci.yml` installs/runs exclusively
  via `uv`.
- **C9** — confirmed: a case-insensitive grep for `stint`, `compound`, `tyrelife`, `pitintime`, and
  `pitouttime` across `pipeline/`, `backend/`, and `frontend/src/` returns zero hits in any source or
  test file — every hit is in a markdown design/planning document (`docs/*.md`) or a single frontend
  comment explaining that compound is *not* shown (`TopSummaryPanel.tsx`). The finding stands
  unresolved, exactly as recorded: this is a Phase 2 entry criterion, not something Phase 0 can close.
- **C10** — confirmed by reading both files in full: `cache_writer.py::_to_dataframe` builds its
  DataFrame from `model_cls.model_fields.keys()`/`record.model_dump()` (generic, no per-field code);
  `parquet_repository.py::_lap_from_row` builds a `Lap` from named `row[...]` lookups by hand
  (non-generic). The asymmetry is exactly as described.
- **C11** — confirmed by listing `pipeline/pitwall_pipeline/` at one level deep: refined during this
  verification pass — see the corrected table cell above (a second pre-existing subpackage,
  `providers/`, exists alongside `utils/`; this doesn't change the correction's guidance, only a
  supporting detail's precision).
- **C12** — confirmed by grepping `docs/m10-design-review.md`: §1.3/§6 (rollout ordering) states
  "Frontend consumption is explicitly out of scope for this document"; §11 lists "Frontend
  consumption of stint/pit-stop data" as a "follow-up design note once this API surface ships." Both
  citations are accurate.

No correction was found to be substantively wrong. One (C11) had an imprecise supporting detail,
corrected above rather than left standing.

### 0.2 ADR status check

ADR-0011 is already **Accepted** (per its own header). CLAUDE.md's Definition of Done requires the
ADR to exist and be merged before implementation starts for a new dependency/layer boundary — it
already is. No action item; recorded here as a satisfied entry criterion for Phase 1.

### 0.3 Exit criteria

All of C1–C12 above are recorded in this document. Nothing in Phase 1 begins until this table exists
and has been read by whoever picks up Phase 1 — matching M8's "Phase 1 is unblocked" gating language.

---

## Phase 1 — PostgreSQL Foundation

Scope: infrastructure only. No stint/pit-stop row is ever written or read by application code in
this phase. By the end of Phase 1, a fresh `docker compose up` produces a reachable, empty, migrated
Postgres instance, and the Python-level contract for reading it (`RaceContextRepository`) exists and
type-checks — but has no concrete implementation yet.

**Entry criteria:** Phase 0 complete (§0.3).

### Database schema

The two tables specified in ADR-0011 §Data Model / design review §3.2 — `stints` and `pit_stops` —
with natural composite primary keys (`session_id`, `driver_id`, `stint_number`/`stop_number`), no
cross-engine foreign keys, and plain `TEXT` identifiers matching Parquet's existing `session_id`/
`driver_id` string scheme (ADR-0011, Implementation Constraints). No other tables. No `sessions`/
`drivers` tables are created in Postgres — those remain Parquet-only, referenced by string, never
joined across engines (ADR-0011 §Implementation Constraints).

### Migration tooling

Plain versioned `.sql` files, not Alembic — per the design review's explicit recommendation (§9) and
ADR-0011's minimal-dependency framing:

- `pipeline/pitwall_pipeline/migrations/0001_create_stints.sql`
- `pipeline/pitwall_pipeline/migrations/0002_create_pit_stops.sql`
- `pipeline/pitwall_pipeline/migrate.py` — a small CLI (`python -m pitwall_pipeline.migrate`,
  mirroring `ingest.py`'s existing `python -m pitwall_pipeline.ingest` invocation style) that applies
  any `migrations/*.sql` file not yet recorded in a bookkeeping table (`schema_migrations(filename,
  applied_at)`), in filename order, each inside its own transaction.

This is the same "grows when forced" posture ADR-0006 already applies to interfaces — two tables and
one bookkeeping table don't justify Alembic's autogenerate/reflection machinery; revisit only if the
schema outgrows a handful of tables with no cross-table constraints.

### Docker / dev setup

- `docker-compose.yml` gains a `postgres` service (pinned image tag, a named volume for local
  persistence across restarts, health-checked) that `backend` and `pipeline` both depend on.
- `.github/workflows/ci.yml` gains an identical `postgres:` service block on the `backend` and
  `pipeline` jobs only (C7) — a pinned image, `pg_isready` healthcheck with retries so test steps
  don't race container startup, and the same connection URL shape local dev uses.

### Configuration

- `backend/app/config.py`'s `Settings` gains `database_url: str`, read from a new
  `PITWALL_DATABASE_URL` env var — same one-field-per-external-dependency pattern `PITWALL_DATA_DIR`
  already established, defaulting to the local-dev Postgres URL matching the new docker-compose
  service for non-Docker local dev.
- `pipeline/pitwall_pipeline/db.py` (new) reads the same `PITWALL_DATABASE_URL` for the pipeline's
  own connection — no shared config module between workspaces (ADR-0011: each workspace owns its own
  dependency graph, mirroring the existing independent `pandas`/`pyarrow` duplication).
- README's "Quick start"/"Docker" sections document the new env var and the one-time migration step
  (tracked fully in Phase 6's documentation pass, not written here).

### Repository interfaces

- `backend/app/models/race_context.py` (new) — `Stint`, `PitStop` Pydantic models (field lists per
  design review §3.1/§4), independently defined from any pipeline type per ADR-0009. Created here,
  not in Phase 4, because `RaceContextRepository`'s method signatures need a concrete return type to
  type-check under `mypy --strict` — the same reason `TelemetryRepository`'s interface and
  `app/models/telemetry.py` were designed together in M2. Phase 4 does not redefine these classes; it
  only wires them into route `response_model`s and `app/models/__init__.py`'s `__all__` (C5).
- `backend/app/repositories/race_context.py` (new) — the abstract interface:

  ```python
  class RaceContextRepository(ABC):
      @abstractmethod
      def list_stints(self, session_id: str, driver_id: str) -> list[Stint]: ...

      @abstractmethod
      def list_pit_stops(self, session_id: str, driver_id: str | None = None) -> list[PitStop]: ...
  ```

  A **separate** interface from `TelemetryRepository`, not an extension of it — this is ADR-0011's
  central decision (§Decision, §Alternatives Considered) and is not reopened here. `TelemetryRepository`
  itself is not touched in this phase.
- `backend/app/db.py` (new) — a pooled connection helper (`psycopg_pool`) for the backend's
  long-running-service usage pattern, distinct from the pipeline's single-connection `db.py` (ADR-0011
  §Implementation Constraints: different client patterns for different usage shapes, deliberately).

### Files expected to be added

```
pipeline/pitwall_pipeline/migrations/0001_create_stints.sql
pipeline/pitwall_pipeline/migrations/0002_create_pit_stops.sql
pipeline/pitwall_pipeline/migrate.py
pipeline/pitwall_pipeline/db.py
pipeline/tests/test_migrate.py

backend/app/models/race_context.py
backend/app/repositories/race_context.py
backend/app/db.py
```

### Files expected to change

```
docker-compose.yml              # + postgres service
.github/workflows/ci.yml        # + postgres service block on backend + pipeline jobs
pipeline/pyproject.toml         # + psycopg[binary]  (uv add)
backend/pyproject.toml          # + psycopg[binary,pool]  (uv add)
backend/app/config.py           # + database_url setting
backend/app/repositories/__init__.py   # + RaceContextRepository in __all__
```

### Implementation order

1. `docker-compose.yml` + local Postgres service, confirm `docker compose up` brings it up healthy.
2. Migration SQL files + `migrate.py`, confirm manual `python -m pitwall_pipeline.migrate` run against
   the local service creates both tables correctly.
3. `.github/workflows/ci.yml` service block, confirm a CI run reaches a healthy Postgres before tests.
4. `pipeline/pitwall_pipeline/db.py`, `backend/app/db.py`, `backend/app/config.py` changes.
5. `backend/app/models/race_context.py`, then `backend/app/repositories/race_context.py` (models
   before interface, since the interface's type hints depend on them).

### Testing required

- `pipeline/tests/test_migrate.py` against the real CI Postgres service: migrations apply cleanly
  from empty; running `migrate.py` a second time is a no-op (no error, no duplicate application);
  resulting schema has the expected tables/columns/primary keys.
- A trivial connectivity smoke test for both `pipeline/pitwall_pipeline/db.py` and `backend/app/db.py`
  against the same service.
- `mypy --strict` passes on `race_context.py` (interface) and `race_context.py` (models) with no
  concrete implementation yet to satisfy the ABC.

### Explicitly out of scope for Phase 1

Any stint/pit-stop row ever being written or read; any concrete `RaceContextRepository`
implementation; any route or dependency-injection wiring (`get_race_context_repository()` doesn't
exist as a usable provider yet — that's Phase 3); Alembic or any other migration framework; any
frontend change.

### Risks

- **Local dev friction**: contributors now need Postgres running and migrated before anything M10
  works — mitigated by `docker compose up` starting it automatically and a clearly documented
  one-time `migrate` step (Phase 6 doc pass).
- **CI flakiness from container startup races** — mitigated by a `pg_isready`-based healthcheck with
  retries, a standard GitHub Actions pattern, not a novel one.
- **Schema churn risk**: since Phase 2 hasn't yet confirmed the real FastF1 column shapes (C9), the
  `stints`/`pit_stops` DDL from the design review could need a column added or retyped once Phase 2's
  investigation completes. Accepted — migrations are versioned specifically so a corrective
  `0003_...sql` is cheap if needed, not a schema rewrite.

### Exit criteria

`docker compose up` brings up a healthy, empty Postgres instance; `python -m pitwall_pipeline.migrate`
applies both migrations cleanly and idempotently against it, locally and in CI; CI's `backend` and
`pipeline` jobs both have a working Postgres service with green tests; `RaceContextRepository` and its
models exist and pass `mypy --strict` with zero concrete implementations; `TelemetryRepository` and
every existing route are untouched and every pre-existing test still passes unmodified.

---

## Phase 2 — Pipeline Integration

**Entry criteria:** Phase 1 exit criteria met, **and** C9 is resolved — before any code in this phase
is written, confirm against a real `fastf1.get_session(...).load()` call (or the pinned FastF1
version's official column reference) that `Laps` exposes `Stint` (int), `Compound` (str), `TyreLife`
(numeric), `PitInTime`/`PitOutTime` (Timedelta/NaT) under exactly those names, and record the
confirmed dtypes and null-representation as an addendum to this document before proceeding. This plan
cannot resolve C9 itself — that requires either network access to fetch a real session or consulting
FastF1's documentation for the exact pinned version, neither available while only writing a plan.

### 2.0 C9 Resolution — verified against real FastF1 data

**Method:** loaded a real, already-cached session — 2024 Bahrain Grand Prix, Race
(`data/fastf1_cache/2024/2024-03-02_Bahrain_Grand_Prix`, already present in this repository from a
prior manual ingestion run; no fresh network fetch was needed, though network access to
`api.github.com` was independently confirmed available as a fallback) — via
`fastf1.get_session(2024, "Bahrain", "R").load()`, using `fastf1==3.8.3` (satisfies the pinned
`fastf1>=3.4` in `pipeline/pyproject.toml`), and inspected `session.laps` directly (1129 rows, 20
drivers, 31 columns). This is real production data, not a synthetic fixture or documentation lookup.

**Findings:**

| Field | Exists | pandas dtype | Nulls (this session) | Notes |
|---|---|---|---|---|
| `Stint` | Yes | `float64` | 0 / 1129 | **Not `int`** — like `LapNumber` (already `float64` in this same DataFrame and already cast via `int(row["LapNumber"])` in `normalize_laps`), pandas upcasts to `float64` because the column can contain `NaN`. Values observed are whole numbers (`1.0`, `2.0`, `3.0`) and restart at `1` per driver (confirmed for 3 drivers: VER, PER, SAI). Must still be treated as nullable in normalization — 0 nulls in this clean race session doesn't rule out a null `Stint` on a data-quality-flagged lap in another session (design review §7). |
| `Compound` | Yes | `object` (str) | 0 / 1129 | Values observed: `SOFT`, `HARD` (uppercase). Matches the plan's `str` assumption exactly. |
| `TyreLife` | Yes | `float64` | 0 / 1129 | Whole-number values (`4.0`, `5.0`, ...). Matches the plan's "(numeric)" assumption. |
| `PitInTime` | Yes | `timedelta64[ns]` | 1086 / 1129 (null except on a car's in-lap) | Matches the plan's "(Timedelta/NaT)" assumption. |
| `PitOutTime` | Yes | `timedelta64[ns]` | 1086 / 1129 (null except on a car's out-lap) | Matches the plan's "(Timedelta/NaT)" assumption. |

All five fields exist under exactly the names assumed. **No blocker.** Every field the design review's
schema depends on is real and present — C9 is resolved, not merely deferred.

**Genuine correction to the design review's stated derivation (§3.1):** the design review states
`pit_lane_time_seconds` is "derived from FastF1's `PitOutTime - PitInTime`," which reads as a
single-row subtraction. **Verified false against real data.** `PitInTime` and `PitOutTime` never
coexist on the same row: `PitInTime` is populated on the "in lap" (the last lap of the stint that is
ending), and `PitOutTime` is populated on the very next lap for the same driver (the "out lap", the
first lap of the next stint) — confirmed by inspecting one driver's (VER) full 57-lap sequence: lap 17
has `PitInTime = 0 days 01:27:30.291` with `PitOutTime` null; lap 18 has `PitOutTime =
0 days 01:27:55.379` with `PitInTime` null (difference: 25.09s, a plausible real pit-lane transit
time); the identical pattern recurs at lap 37 → 38. A single-row `PitOutTime - PitInTime` is **always**
`NaT - NaT` or one side null — it can never produce a value as the design review's prose describes.

This does not make the field impossible to compute, and does not require any schema change — the
`pit_stops` table (Phase 1) is unaffected. It changes only how `normalize_pit_stops()` must be
implemented: `pit_lane_time_seconds` is computed by joining each in-lap to the immediately following
lap (`LapNumber + 1`) for the same driver and subtracting that lap's `PitOutTime` from the in-lap's
`PitInTime`, falling back to `None` (not fabricated) when no matching out-lap exists — e.g. a driver
retires while in the pits, or pits on the session's final lap. Implemented and tested below.

### Writing relational race-context data

`pipeline/pitwall_pipeline/postgres_writer.py` (new) — `write_stints(conn, stints)` and
`write_pit_stops(conn, pit_stops)`, using `pipeline/pitwall_pipeline/db.py`'s connection, plain SQL
(`psycopg`, no ORM). Called from `ingest.py` after `write_session_cache(...)` — Parquet is written
first, unchanged, exactly as today; the Postgres write is a second, additive step (ADR-0011 §Migration
Strategy).

### Idempotent upserts

Both writers use `INSERT ... ON CONFLICT (session_id, driver_id, stint_number|stop_number) DO UPDATE`
against the natural composite keys from Phase 1's schema — re-running ingestion for an
already-ingested session must not duplicate rows. This is the single highest-value test in this phase
(design review §9's "equivalent of M8's sign-convention fuzz test") and is covered explicitly below.

### Failure handling

`ingest.py`'s call to the two writers is wrapped in a narrow `try/except` around the specific
exception class `psycopg` raises for connection/query failures — never a bare `except:` (CLAUDE.md).
A caught failure is logged at `WARNING` or higher with the session id and re-raised nowhere: the
Parquet write that already succeeded is not rolled back, and ingestion for that session is considered
complete for every V1/V2 purpose (ADR-0011 §Migration Strategy — Postgres write failure never blocks
or reverts the Parquet write).

### Keeping Parquet as the source of telemetry

No change to `telemetry.parquet`, `track.parquet`, `session.parquet`, or `drivers.parquet` and no
change to how any of them are written. `laps.parquet` gains exactly one new nullable column
(`compound`) via the existing generic `_to_dataframe` path in `cache_writer.py` — which, per C10,
needs no code change at all, since it already derives columns from whatever fields
`pitwall_pipeline.models.Lap` has. `TelemetryRepository`/`ParquetRepository`'s telemetry-serving
methods are not touched in this phase (that's a backend-side, Phase 4 concern for the `compound`
field only; telemetry itself is never touched anywhere in M10).

### Files expected to be added

```
pipeline/pitwall_pipeline/postgres_writer.py
pipeline/tests/test_normalize_stints.py
pipeline/tests/test_normalize_pit_stops.py
pipeline/tests/test_postgres_writer.py
```

### Files expected to change

```
pipeline/pitwall_pipeline/models.py                  # + Stint, PitStop; Lap + compound;
                                                       #   NormalizedSessionData + stints/pit_stops fields
pipeline/pitwall_pipeline/normalize.py               # + normalize_stints(), normalize_pit_stops();
                                                       #   normalize_laps() + compound extraction
pipeline/pitwall_pipeline/providers/fastf1_provider.py  # load_session() calls the two new normalize
                                                       #   functions against the already-fetched
                                                       #   ff1_session.laps — no new FastF1 call
pipeline/pitwall_pipeline/ingest.py                   # + postgres_writer calls after write_session_cache,
                                                       #   narrow try/except per Failure handling above
pipeline/tests/fixtures.py                            # build_laps_df() + Stint/Compound/TyreLife/
                                                       #   PitInTime/PitOutTime columns (post C9)
pipeline/tests/test_fastf1_provider.py                # + assertions that stints/pit_stops flow through
                                                       #   load_session()'s returned bundle
```

### Implementation order

1. Resolve C9 (entry criterion) and record the confirmed column shapes here.
2. `models.py`: `Stint`, `PitStop`, `Lap.compound`, `NormalizedSessionData` fields.
3. `normalize.py`: `normalize_stints()`, `normalize_pit_stops()`, `normalize_laps()` compound
   extraction — pure functions, unit-tested against hand-built DataFrames, no DB involved yet.
4. `fastf1_provider.py`: wire the two new normalize calls into `load_session()`.
5. `postgres_writer.py` + `db.py` (from Phase 1) — upsert logic, idempotency test.
6. `ingest.py`: call the writer after the existing Parquet write, with the narrow failure handling.

### Testing required

- `test_normalize_stints.py` / `test_normalize_pit_stops.py`: hand-built FastF1-shaped DataFrames in,
  asserted `Stint`/`PitStop` lists out — same pattern as the existing `test_normalize.py`. Includes a
  defensive case for a single-lap "stint" caused by a red flag/formation-lap restart (design review
  §7 risk) — normalization must not crash on it, even if perfectly correct semantic handling is a
  documented limitation rather than solved here.
- `test_postgres_writer.py` against the real CI Postgres service: write once, assert rows; write the
  identical input a second time, assert row count is unchanged (idempotency — the highest-value test
  in this phase).
- `test_fastf1_provider.py` extended: `load_session()`'s returned `NormalizedSessionData` includes
  non-empty `stints`/`pit_stops` for the fixture session.

### Explicitly out of scope for Phase 2

Any backend or frontend code; any real backfill run against already-ingested sessions in a live
deployment (an operational task tracked for after Phase 6, design review §4.3 — not part of this
phase's file or test scope); weather/position data (never in scope, ADR-0011 §1.2 of the design
review); any change to how telemetry is normalized, written, or read.

### Risks

- **C9 turns out wrong** (a column is named or shaped differently than assumed) — mitigated by
  resolving it as a hard entry criterion before any normalize code is written, not discovering it
  mid-implementation.
- **FastF1 data quality for these specific fields** (design review §7): formation laps/red flags
  producing spurious stints, null `PitInTime`/`PitOutTime` for a stop FastF1 didn't cleanly detect —
  covered by the defensive normalization test above; not fully solved, flagged as a known limitation
  in Phase 6's documentation.

### Exit criteria

Running ingestion against a fixture-equivalent session writes correct rows to both Parquet (laps gain
`compound`, otherwise unchanged) and Postgres (stints/pit-stops, upserted); re-running ingestion twice
produces no duplicate Postgres rows; a simulated Postgres write failure does not prevent or roll back
the Parquet write and is logged, not swallowed; all pipeline tests green, `mypy --strict` and `ruff`
clean.

---

## Phase 3 — Backend Repository Layer

**Entry criteria:** Phase 1's `RaceContextRepository` interface and models exist and type-check;
Phase 2 has produced real rows in a Postgres instance (via its own tests or a manual ingestion run) to
validate reads against.

### RaceContextRepository

The interface itself was already defined in Phase 1 (§Repository interfaces above) — this phase adds
its sole concrete implementation. No interface change is expected here; if reading real data reveals
the interface's two methods are insufficient, that's a Phase 3 finding to record, not a silent
mid-phase interface rewrite.

### PostgreSQL implementation

`backend/app/repositories/postgres_race_context_repository.py` (new) —
`PostgresRaceContextRepository(RaceContextRepository)`, using `backend/app/db.py`'s pooled connection
(Phase 1), plain SQL via `psycopg` (no ORM, per C8/ADR-0011). `list_stints` and `list_pit_stops` are
direct, single-table reads keyed on the natural composite key columns from Phase 1's schema — no join
back to Parquet, no join between `stints` and `pit_stops` (each is read independently; the API layer,
not the repository, is the only place that might ever compose both for one response, and M10 has no
endpoint that needs to).

### Dependency injection

`backend/app/dependencies.py` gains `get_race_context_repository()`, following `get_telemetry_repository()`'s
exact existing shape (reads settings via `get_settings()`, constructs and returns the concrete
implementation) — added to the same file, not a new one (C6).

### Repository tests

`backend/tests/test_postgres_race_context_repository.py` (new), against the real CI Postgres service,
seeded via direct SQL inserts in the test itself — **not** via the pipeline package, since the backend
has no dependency on `pitwall_pipeline` (per `docs/api-model.md`'s explicit workspace-independence
rule, already established for Parquet and carried forward here for Postgres).

### Files expected to be added

```
backend/app/repositories/postgres_race_context_repository.py
backend/tests/test_postgres_race_context_repository.py
```

### Files expected to change

```
backend/app/dependencies.py            # + get_race_context_repository()
backend/app/repositories/__init__.py   # + PostgresRaceContextRepository in __all__
```

### Implementation order

1. `postgres_race_context_repository.py` — `list_stints` first (single required `driver_id`, simpler
   query), then `list_pit_stops` (optional `driver_id` filter).
2. Repository tests against real Postgres, seeded per test.
3. `dependencies.py` addition.

### Testing required

Repository-level tests against real Postgres covering: a driver with multiple stints; a driver with
zero stints and zero pit-stops (not an error — ADR-0011 §Implementation Constraints, "absence is data,
not failure"); `list_pit_stops` with and without the `driver_id` filter; a session_id that exists in
no table (empty list, not an exception — the repository itself doesn't know whether a session "exists"
in the Parquet sense, that check belongs to the route layer in Phase 4, exactly as
`TelemetryRepository.list_drivers`/`list_laps` already delegate 404 handling to their callers rather
than to themselves).

### Explicitly out of scope for Phase 3

Any route, endpoint, or FastAPI wiring beyond the dependency provider function itself; any Pydantic
model change (finalized in Phase 1); any frontend code; any change to `TelemetryRepository` or
`ParquetRepository`.

### Risks

Query performance is not a real risk at this data volume (design review §10 — tens of rows per
session), so no risk entry for it. The main risk is **schema/interface mismatch surfacing late** if
Phase 2's real data has a shape Phase 1's schema didn't anticipate — mitigated by seeding this phase's
tests from Phase 2's actual normalized output shape, not from hand-invented row shapes that might
silently diverge from what ingestion really produces.

### Exit criteria

`PostgresRaceContextRepository` passes every repository test against the real CI Postgres service;
`get_race_context_repository()` is a valid, importable FastAPI dependency with the correct return
type, though not yet used by any route; `mypy --strict` passes on both new files; every Phase 1/2 test
still passes unmodified.

---

## Phase 4 — API Layer

**Entry criteria:** Phase 3's `PostgresRaceContextRepository` passes its repository tests.

### Pydantic models

`Stint` and `PitStop` (`backend/app/models/race_context.py`) were created in Phase 1 so the repository
interface could type-check. This phase's job is to confirm they're the right *response* shape (not
just a valid repository return type) — cross-check field names/nullability against what the frontend
(Phase 5) will actually need to render, and wire them into `app/models/__init__.py`'s `__all__` (C5).
No new model classes are expected here; if the route layer reveals a genuine gap, that's a documented
Phase 4 finding, not a silent Phase 1 redo.

### FastAPI routes

`backend/app/api/race_context.py` (new), following `laps_compare.py`'s existing shape:

```
GET /sessions/{session_id}/drivers/{driver_id}/stints
GET /sessions/{session_id}/pit-stops?driver_id=
```

Both check `repository.get_session(session_id) is None` via the *existing* `TelemetryRepository`
dependency (reused, not duplicated — `RaceContextRepository` has no concept of "does this session
exist," that's Parquet's/`TelemetryRepository`'s job) for the 404 case; an existing session with no
strategy rows yet returns `200` with an empty list (ADR-0011 §Implementation Constraints — absence
isn't an error), matching `/laps?driver_id=` and `/analytics/drivers` precedent exactly.

### OpenAPI

No hand-maintained API reference — FastAPI's auto-generated `/docs`/`/openapi.json` covers it, per
`docs/api-model.md`'s established convention ("that would just drift from the one FastAPI already
generates correctly"). This phase's only OpenAPI-related task is confirming (manually, via `/docs`,
and via a test asserting `/openapi.json` contains the two new paths) that the routes and the
additive `compound` field on `Lap` render with correct types and descriptions — not writing new docs.

### Integration tests

`backend/tests/test_race_context_route.py` (new), via `TestClient` + `app.dependency_overrides`,
using a **fake in-memory** `RaceContextRepository` — no real Postgres at this layer, matching
`test_laps_compare_route.py`/`test_session_analytics_route.py`'s existing precedent of overriding
`TelemetryRepository` with a fixture, not a live backing store. The fake lives alongside
`backend/tests/fixtures.py`'s existing role as shared test data, exercising exactly the benefit
ADR-0006 named for repository interfaces from the start.

### Files expected to be added

```
backend/app/api/race_context.py
backend/tests/test_race_context_route.py
```

### Files expected to change

```
backend/app/main.py                     # + race_context import + app.include_router(...)
backend/app/models/telemetry.py         # Lap + compound: str | None = None
backend/app/models/__init__.py          # + Stint, PitStop in __all__
backend/app/repositories/parquet_repository.py   # _lap_from_row + compound mapping (C10)
backend/tests/fixtures.py               # synthetic laps.parquet fixture + compound column
backend/tests/test_parquet_repository.py   # + compound round-trip assertion
backend/tests/test_sessions_api.py         # + compound assertion on GET /laps
```

### Implementation order

1. `parquet_repository.py` + `telemetry.py` `compound` changes and their existing-test updates first
   (small, additive, independently testable, no dependency on the new routes).
2. `race_context.py` route module.
3. `main.py` registration.
4. `test_race_context_route.py` with the fake repository.

### Testing required

Route-level tests for both new endpoints: 200 with data; 200 empty list for an existing session with
no strategy rows (not 404); 404 for a nonexistent session; `list_pit_stops` with and without
`driver_id`. Full existing backend regression suite re-run to confirm the additive `compound` field
doesn't break any pre-existing `/laps` assertion (old fixture rows without a `compound` column must
deserialize to `None`, not raise). `/openapi.json` inspected for the two new paths and the `compound`
field.

### Explicitly out of scope for Phase 4

Frontend consumption of either endpoint; any caching layer (design review §10 — not justified at this
data volume); any POST/write endpoint (this API is read-only end to end, matching every existing
route); any change to `/telemetry`, `/track`, `/laps/compare`, or `/analytics/*`.

### Risks

The one place this phase touches an existing, already-shipped contract (`Lap.compound`) is the one
place a mistake could regress V1/V2 behavior — mitigated by running the *entire* backend suite, not
just the new tests, before calling this phase done (explicitly listed in the exit criteria below, not
left implicit).

### Exit criteria

Both new endpoints return correct data against real fixture-backed Postgres data (via the fake
repository for route tests, per above); the existing `/laps` endpoint's contract is unchanged except
the additive `compound` field, and the **full** backend regression suite is green, not just the new
tests; OpenAPI docs render both new routes and the `compound` field correctly at `/docs`.

---

## Phase 5 — Frontend

**Entry criteria:** Phase 4's two endpoints are live against a real backend/dev environment (ideally
`docker compose up` with a real ingested-and-backfilled session, not fixture JSON alone), so the UI is
built against real stint/pit-stop shapes rather than hypothetical ones.

`docs/m10-design-review.md` §11 explicitly deferred frontend design to "a follow-up design note once
this API surface ships" (Phase 0 finding C12). This plan makes that follow-up design's decisions here,
directly, rather than blocking Phase 5 on a separate document — the same move M8's own Phase 0 made
for several items its source design doc left open.

**Design decisions (resolving C12):**

- **Route:** `/sessions/:sessionId/drivers/:driverId/strategy` — driver-scoped, since `list_stints`
  requires a `driverId`; same route depth as the existing `.../laps/:lapNumber` route; plural
  `/sessions` preserved per every existing route's convention (`App.tsx`'s own docstring already
  states this rule for `/compare` and `/analytics`).
- **Feature folder:** `frontend/src/features/race-context/` — matches the backend's
  `RaceContextRepository` naming, symmetric with the existing `session-analytics`/`session_analytics`
  and `lap-comparison`/`lap_comparison` pairs. The URL segment (`/strategy`) is a short, human label
  like the existing `/compare` and `/analytics` segments — precedent already establishes that the
  route segment need not equal the feature folder name.
- **Data fetching:** one combined hook, `useRaceContext(sessionId, driverId)`, fetching stints and
  pit-stops together and returning one `{ stints, pitStops, loading, error }` shape — matching
  `useLapComparison`'s existing precedent of one hook per page-level concern, not two hooks with two
  independent loading states for what is, on this page, a single logical view. Plain
  `useEffect`+`useState`, no caching — this codebase has no server-state/caching library anywhere
  (confirmed in M8 Phase 0, §0.4c), and nothing about this page's access pattern justifies introducing
  one now.
- **Stint visualization:** a plain CSS/flexbox proportional bar (`StintTimeline.tsx`) — segment width
  proportional to stint lap-range, colored by compound. Not a new ECharts series: a 2–6 segment bar
  has no need for a full charting library's axis/tooltip/legend machinery, the same reasoning M8 used
  to keep its driver summary table a plain table rather than an ECharts concern (M8 design §9).
- **Compound colors:** `compoundColor.ts` — fixed constants for the five standard Pirelli/FIA
  dry/wet compound colors (soft/medium/hard/intermediate/wet). This is *not* the same category of
  trademark risk CLAUDE.md flags for team liveries: tyre-compound color-coding is a standardized,
  functional motorsport convention used by FastF1 itself and every public F1 tool, not team-specific
  broadcast branding — unlike M9's `teamColor.ts`, which deliberately hashes team colors procedurally
  *because* real liveries are trademarked. Worth stating explicitly so a future review doesn't
  conflate the two. Includes a fallback for any compound string the app doesn't recognize (real data
  can report values this mapping wasn't written against) — must render distinctly, not crash.
- **Pit stops:** a plain, unsorted `<table>` (`PitStopList.tsx`), matching `SectorBreakdownTable.tsx`'s
  existing precedent — no sortable-table primitive exists in this codebase (M8 Phase 0, §0.2 Q5), and
  a handful of pit stops per driver needs no sorting anyway.
- **Entry point:** a "Strategy" link added to the existing `LapSelectPage.tsx` (already driver-scoped,
  where the M6 "Compare Selected" entry point already lives), not the session-scoped
  `DriverSelectPage`/`SessionListPage`.
- **Compound on the existing lap list:** `LapSelectPage.tsx`'s existing per-lap `<li>` row gains an
  inline compound chip (reusing `compoundColor.ts`) — the same additive, non-disruptive change M9 used
  when it added `StatusChip`s to existing rows there.

### Typed API client

`frontend/src/api/client.ts` gains `Stint`, `PitStop` interfaces, `getStints(sessionId, driverId)`,
`getPitStops(sessionId, driverId?)`, and `compound: string | null` on the existing `Lap` interface —
added to the single existing client file, not a new per-feature `api/` module, per the explicit
precedent M8 recorded for its own analytics endpoints ("sitting alongside `compareLaps`", not a
separate file).

### Hooks

`frontend/src/features/race-context/hooks/useRaceContext.ts` — combined fetch, per Data fetching
above.

### Components

`StrategyPage.tsx`, `StintTimeline.tsx`, `PitStopList.tsx`, `compoundColor.ts` — per the design
decisions above.

### Routing

One new route in `frontend/src/App.tsx`; one new link in `LapSelectPage.tsx`.

### Visualizations

`StintTimeline`'s proportional bar and the compound chip in `LapSelectPage` — no ECharts involvement
in this phase (see Stint visualization above).

### Files expected to be added

```
frontend/src/features/race-context/StrategyPage.tsx
frontend/src/features/race-context/StrategyPage.module.css
frontend/src/features/race-context/components/StintTimeline.tsx
frontend/src/features/race-context/components/StintTimeline.module.css
frontend/src/features/race-context/components/StintTimeline.test.tsx
frontend/src/features/race-context/components/PitStopList.tsx
frontend/src/features/race-context/components/PitStopList.module.css
frontend/src/features/race-context/components/PitStopList.test.tsx
frontend/src/features/race-context/hooks/useRaceContext.ts
frontend/src/features/race-context/hooks/useRaceContext.test.ts
frontend/src/features/race-context/compoundColor.ts
frontend/src/features/race-context/compoundColor.test.ts
```

### Files expected to change

```
frontend/src/api/client.ts                                  # + Stint, PitStop, getStints, getPitStops,
                                                              #   Lap.compound
frontend/src/App.tsx                                         # + /sessions/:sessionId/drivers/:driverId/strategy
frontend/src/features/session-select/LapSelectPage.tsx       # + Strategy link, + compound chip per lap
frontend/src/features/session-select/LapSelectPage.module.css
frontend/src/features/session-select/LapSelectPage.test.tsx  # extended for the above
```

### Implementation order

1. `client.ts` additions (types + fetch functions) — no UI depends on anything else yet.
2. `compoundColor.ts` (pure function, independently testable).
3. `useRaceContext.ts`.
4. `StintTimeline.tsx`, `PitStopList.tsx`, `StrategyPage.tsx` composing them.
5. `App.tsx` route + `LapSelectPage.tsx` entry point and compound chip, last — this is the one place
   an existing, already-tested page is touched, so it's sequenced after everything it depends on is
   proven to work in isolation.

### Testing required

`useRaceContext`: mock fetch, assert both calls fire, combined loading/error state. `StintTimeline`:
fixture stints in, assert proportional widths and correct compound colors. `PitStopList`: fixture pit
stops, plus the "no pit stops for this driver" empty state. `compoundColor`: one assertion per known
compound, plus an explicit unknown-compound-string fallback assertion (must not throw). `LapSelectPage.test.tsx`:
extended for the new link and the compound chip, without breaking its existing comparison-selection
assertions.

### Explicitly out of scope for Phase 5

Any degradation/trend overlay on the stint timeline; a session-wide (all-drivers) pit-stop view (only
this endpoint's `driver_id`-filtered form is used); any change to `TrackMapPage`, `ComparisonPage`, or
`SessionAnalyticsPage` beyond the one new link on `LapSelectPage`; any new shared/generic table or
chart primitive (this phase reuses existing plain-table and plain-CSS patterns, it doesn't generalize
them).

### Risks

Building against real dev data (entry criterion) rather than hand-invented fixture shapes is the main
mitigation against this phase discovering, late, that Phase 1–4's schema doesn't actually serve a
sensible UI — if it does, that's a finding for this phase to record and possibly loop back to Phase 3,
not something to route around in the frontend.

### Exit criteria

Full flow — select session → driver → "Strategy" link → stint timeline + pit-stop list render against
a real backend session with strategy data — works end to end; a session with no strategy data (either
pre-M10 or FastF1 didn't report it for that session) shows a clear empty state, not an error or blank
page; full frontend regression suite green (`npm run lint`, `npm run typecheck`, `npm run test`),
including every pre-existing `LapSelectPage` assertion.

---

## Phase 6 — Testing and Release

**Entry criteria:** Phases 1–5 have each independently met their own exit criteria.

### Backend

Full regression suite (`uv run pytest` in `backend/`) green, including every pre-existing M0–M9 test
file plus every Phase 3/4 addition; `mypy --strict`, `ruff check`, `ruff format --check` clean.
Specifically confirm `test_laps_compare_route.py` and `test_session_analytics_route.py` pass
unmodified — this is the concrete, testable proof of ADR-0011's central claim that
`TelemetryRepository` was never touched.

### Frontend

Full regression suite (`npm run test`) green including Phase 5 additions; `eslint`, `prettier --check`,
`tsc -b --noEmit` clean.

### Pipeline

Full regression suite (`uv run pytest` in `pipeline/`) green including Phase 2 additions and the
migration idempotency test from Phase 1; `mypy --strict`, `ruff` clean.

### Regression tests

Not new tests — confirmation that nothing else broke: `test_parquet_repository.py`/`test_sessions_api.py`'s
pre-existing lap assertions still pass with `compound` present (deserializes to `None` for old fixture
rows, no `KeyError`); every M6/M8 backend and frontend test still passes unmodified; CI's new
`postgres:` service block doesn't destabilize the `frontend` job (it shouldn't touch it) and the
`backend`/`pipeline` jobs' new Postgres dependency is watched across the first several real CI runs,
not just local Docker runs, for startup-race flakiness.

### Documentation updates

- `docs/architecture.md` — tech-stack table gains a PostgreSQL row (ADR-0011); the data-flow diagram
  gains the second store and the `RaceContextRepository` box.
- `docs/data-model.md` — a short new section documenting `Stint`/`PitStop` and the `compound` field,
  matching its existing per-entity documentation style.
- `docs/api-model.md` — the two new endpoints and the `compound` addition to `/laps`, in the existing
  endpoint-table format.
- `README.md` — "Quick start"/"Docker" gain `PITWALL_DATABASE_URL` and the one-time migration step;
  "Current capabilities" gains stint/pit-stop viewing; "Technology stack" gains PostgreSQL.
- `CHANGELOG.md` — a new `## M10 — Hybrid Parquet + PostgreSQL Storage — <date>` entry in the existing
  per-milestone format. Per Phase 0's C11 finding, this does **not** attempt to backfill the missing
  M6–M9 entries or correct the stale "Unreleased: M6"/"tags begin at v1.0.0" text already sitting in
  this file — that's pre-existing documentation debt unrelated to M10's own work, and fixing it here
  would be exactly the kind of unrelated cleanup CLAUDE.md's scope discipline warns against bundling
  into a milestone PR.
- `docs/backlog.md` — record here, not fix inline, if Phase 1's CI Postgres service surfaces new
  flakiness, or if the pre-existing Docker base-image/`.python-version` mismatch (already tracked)
  becomes newly relevant because of a Postgres client library requirement.

### Release checklist

1. All three workspaces' CI jobs green on the milestone branch.
2. ADR-0011 confirmed merged before this phase's PR merges (already true — Accepted).
3. Documentation updates above complete.
4. Backfill (design review §4.3) run once against every already-ingested session in the target
   deployment, logged, and spot-checked — an operational step, not an automated test, but a
   Definition-of-Done gate before M10 is considered "done" anywhere beyond CI fixtures.
5. Version tag cut (next in sequence after `v0.7.0`) once 1–4 are all true.

---

## Explicit non-goals for this implementation (carried forward from the design review and this task's own constraints)

No weather data, no live/real-time timing, no fuel-load modeling, no tyre-degradation or other
predictive metric, no strategy optimization/recommendation, and no migration of telemetry or lap data
off Parquet — Parquet remains the source of truth for all of it, unchanged, through every phase of
this plan. PostgreSQL stores only the two relational entities ADR-0011 defines (`stints`, `pit_stops`)
plus the `compound` field's presence is on the Parquet side, not Postgres. Any PR that introduces one
of the above should be flagged in review as out of M10's scope, not folded in because the storage
layer was already being touched.
