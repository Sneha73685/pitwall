# Backlog — Known Issues & Technical Debt

Code-level improvements identified during documentation/release audits but deliberately **not**
implemented at the time they were found — either because they're out of scope for the current
milestone, or because the audit that found them was documentation-only. Per `CLAUDE.md`'s scope
discipline: check `docs/success-metrics.md` and `docs/prd.md` §5 before pulling any of these into a
milestone; don't fold them into an unrelated PR just because they were "already noticed."

Items are removed once fixed, not marked done — this list should always reflect open debt only.

## Security / dependencies

- **`.github/workflows/ci.yml` doesn't declare a top-level `permissions:` block.** Found during the
  pre-M6 engineering audit (2026-08-01). The workflow only lints/type-checks/tests (no releases, no
  PR comments, no pushes), so it doesn't need the default `GITHUB_TOKEN` write access most repos
  grant implicitly. Low risk to add `permissions: contents: read`, but not applied directly during
  the audit since it can only be verified by an actual push/PR run, not locally.

## Testing quality

- **`backend/tests/test_health.py` (or its fixtures) trigger a `StarletteDeprecationWarning`**: using
  `httpx` with `starlette.testclient.TestClient` is deprecated upstream in favor of `httpx2`. Not
  failing yet, but will eventually break on an httpx/starlette upgrade.
- **`DriverSelectPage.test.tsx` and `LapSelectPage.test.tsx` don't test their empty-list states**
  ("No drivers found for this session." / "No laps found for this driver."). Found during the pre-M6
  engineering audit (2026-08-01). `SessionListPage.test.tsx` and every backend repository/API test
  already cover the equivalent empty-result case; these two pages are the odd ones out. Not written
  during the audit itself (audits don't add feature tests), but a natural pickup for whoever next
  touches either file.

## Backend / performance

- **`ParquetRepository.get_telemetry`'s per-call `to_dict("records")` + Pydantic (`TelemetrySample`)
  construction is now the dominant remaining cost on the full-grid `session_analytics` path.**
  Found during the M20 documentation-reconciliation audit (2026-08-19), confirmed with a fresh
  read-only benchmark against the real 2023 Bahrain GP race (20 drivers, 800,120 telemetry rows):
  a full-grid `/sessions/{id}/analytics/drivers` request (1,056 `get_telemetry` calls) took ~3.0s
  total, ~2.07ms/call once the M19 positional-index build itself is excluded — down from the
  pre-M17 baseline of 37.7s, but `session_analytics` remains the slowest page in the app by a wide
  margin over every other endpoint measured in the same audit (all sub-second). M17 (session
  index), M18 (per-session file caches), and M19 (telemetry driver/lap positional index) already
  eliminated the repeated-file-read and repeated-full-frame-filter costs that used to dominate this
  path — what's left is per-matched-row `.to_dict("records")` and Pydantic model construction,
  which none of those three milestones targeted (M19's own design review, §9/§11, explicitly
  scoped this out). Worth a vectorized-construction pass (e.g. building `TelemetrySample`s from
  columnar arrays instead of per-row dicts) if/when this page's load time becomes a priority again
  — not before, and not part of any milestone that found it.

## Docker / deployment

- **Backend and pipeline Dockerfiles use `python:3.12-slim`, while `.python-version` (both
  workspaces) and CI pin `3.10`.** Found during the pre-M6 engineering audit (2026-08-01). Both
  satisfy `requires-python = ">=3.10"` and every gate passes on both, so this isn't a correctness
  bug, just an untested-combination inconsistency — Docker is the one environment never exercised
  against the same Python minor version as local dev/CI. Worth aligning to `python:3.10-slim` before
  v1.0 so all three environments run the identical interpreter version.
- **No non-root `USER` in any of the three Dockerfiles.** Found during the pre-M6 engineering audit
  (2026-08-01). All three are explicitly labeled development images (source bind-mounted from the
  host for hot-reload), and adding a non-root user to a bind-mount-based dev image risks host/
  container UID mismatches breaking the mount — not a drop-in fix. Each Dockerfile's own header
  comment already defers "production packaging" to M7; a non-root user for any eventual production
  image belongs in that pass, not before.
