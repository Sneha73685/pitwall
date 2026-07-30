# Backlog — Known Issues & Technical Debt

Code-level improvements identified during documentation/release audits but deliberately **not**
implemented at the time they were found — either because they're out of scope for the current
milestone, or because the audit that found them was documentation-only. Per `CLAUDE.md`'s scope
discipline: check `docs/success-metrics.md` and `docs/prd.md` §5 before pulling any of these into a
milestone; don't fold them into an unrelated PR just because they were "already noticed."

Items are removed once fixed, not marked done — this list should always reflect open debt only.

## Security / dependencies

- **`frontend/`: 13 known `npm audit` vulnerabilities (6 high, 6 moderate, 1 critical).** Found
  during the M1 release audit (2026-07-30); `react-router`/`react-router-dom` added during M3
  (2026-07-30). Breakdown:
  - `vitest`/`@vitest/mocker` (**critical**) — arbitrary file read/execute when the Vitest UI server
    is listening. Dev/test tooling only, not shipped to users, but should be resolved before
    inviting outside contributors to run the test suite locally.
  - `eslint`/`@eslint/config-array`/`@eslint/eslintrc`/`minimatch`/`brace-expansion` (**high**) —
    all transitive dev-tooling (lint chain), DoS-class issue in `brace-expansion`.
  - `vite` (**high**) — path traversal in optimized-deps `.map` handling; dev server only.
  - `echarts` (**moderate**) — XSS advisory. This one is a genuine **runtime** dependency (already
    installed ahead of its M5 usage), unlike the rest which are dev-only — worth prioritizing over
    the others for that reason.
  - `react-router`/`react-router-dom` (**moderate**) — open redirect via backslash in `<Link>`/
    `useNavigate` (CVE-2025-68470 bypass), and an arbitrary constructor injection in SSR hydration's
    `deserializeErrors()`. Also a genuine **runtime** dependency (added in M3). The SSR advisory
    doesn't apply here (PitWall is a client-rendered Vite SPA, no React Router SSR usage); the
    open-redirect surface is low today since every `<Link to=...>` target is built from our own API
    data (`session_id`/`driver_id`), not user-supplied URLs, but worth fixing alongside `echarts`
    rather than leaving indefinitely.
  - `esbuild`/`vite-node` (**moderate**) — dev server request-forwarding issue.
  - Fixing requires `npm audit fix --force`, which pulls breaking major-version bumps (ESLint 9→10,
    Vite 5→8, ECharts 5→6, React Router 6→7). Treat as a deliberate dependency-upgrade task (verify
    lint config, chart code, and routes still work after the bump), not a drive-by patch.

## Testing quality

- **`backend/tests/test_health.py` (or its fixtures) trigger a `StarletteDeprecationWarning`**: using
  `httpx` with `starlette.testclient.TestClient` is deprecated upstream in favor of `httpx2`. Not
  failing yet, but will eventually break on an httpx/starlette upgrade.

## Pipeline

- **`FastF1Provider._derive_track_points`** (`pipeline/pitwall_pipeline/providers/fastf1_provider.py`)
  returns a bare `list` with a `# type: ignore[type-arg]` rather than `list[TrackPoint]`. Passes
  mypy strict only via the ignore comment, not a complete annotation. Low priority — purely a typing
  completeness gap, no behavioral impact.
- **No retry/backoff on FastF1 telemetry fetch failures.** `FastF1Provider.load_session` currently
  catches a per-lap `get_telemetry()` failure, logs a warning, and skips that lap — which satisfies
  CLAUDE.md's "no bare except, log explicitly" rule, but PRD §4 flags upstream rate-limiting/
  instability as a known risk that a future pass should address with actual retry/backoff, not just
  skip-and-log.

## Pipeline / backend integration

- **`pipeline/pitwall_pipeline/ingest.py`'s default cache directories don't match the shared
  repo-root `data/` convention.** Found while designing M2's data-directory resolution
  (2026-07-30). `ingest.py`'s `DEFAULT_PROCESSED_DIR`/`DEFAULT_FASTF1_CACHE_DIR` resolve to
  `pipeline/data/...` (relative to the pipeline workspace), while `pipeline/pitwall_pipeline/smoke.py`
  (M0), `docker-compose.yml`'s volume mounts, and `.gitignore`'s `data/*` rule all assume the
  repo-root `data/` directory. Concretely: running `docker compose run --rm pipeline` with the
  ingest command and no explicit `--processed-dir`/`--fastf1-cache-dir` flags writes inside the
  container's ephemeral filesystem, not the mounted volume, so the backend (which reads from
  repo-root `data/processed/`, per `docs/api-model.md`) never sees the result. Fix: align
  `ingest.py`'s defaults with `smoke.py`'s repo-root-relative convention, or make the
  `docker-compose.yml` pipeline service pass those flags explicitly. Not fixed here since M1 is
  already tagged (`v0.1.0`) and this is unrelated to M2's scope.

## Local tooling / DX

- **`docker compose down` reports the frontend container exiting with a non-zero code.** The Vite
  dev server (`npm run dev`) is running fine, but receiving `SIGTERM` on shutdown makes `npm`
  itself report `command failed` / exit 1, even though nothing actually broke. Cosmetic (`docker
  compose ps -a` shows a red exit code where there's no real failure), but worth a fix — e.g.
  running `vite --host 0.0.0.0` directly instead of through `npm run dev` so the signal reaches Vite
  without npm's wrapper reporting a false failure.

## Documentation / process (non-code)

- No `CONTRIBUTING.md` yet. Reasonable for a solo-maintainer portfolio project at M1 (per
  `docs/prd.md` §1.3), but worth adding once the project is public and tagged, so an external
  contributor knows the branch/commit/ADR conventions already documented in `CLAUDE.md` without
  having to find that file themselves.
