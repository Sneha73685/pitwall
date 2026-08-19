# PitWall — M29 Design Review: Shared `DriverStrategySummary` Mapper

**Status:** Design review — implementation follows in Stage C.
**Baseline:** M28 complete (`b0d0e26f3dbb879941ff5229c03f30410a1039a6`), docs reconciled.

## 1. Baseline / Safety Confirmation

- `HEAD` = `origin/main` = `b0d0e26f3dbb879941ff5229c03f30410a1039a6`, re-verified at the start of this stage.
- `git status`: only the pre-existing `docs/m9-design-review.md` diff (`+1` blank line after the title) — untouched.
- `git diff --cached`: empty.
- `docs/m29-design-review.md` did not exist before this file was written.
- No source file, test, dependency, data, or other doc has been modified in producing this review — every finding below comes from read-only inspection (`grep`, `sed -n`, `cat`, plus a fresh `mypy`/`pytest` baseline run, neither of which writes anything).

## 2. Fresh Source Findings

All three current definitions were read byte-for-byte:

```python
# app/api/driver_trends.py:112 and app/api/tyre_performance.py:96 (identical)
def _to_driver_strategy_summary(result: DriverStrategySummaryResult) -> DriverStrategySummary:
    return DriverStrategySummary(
        driver_id=result.driver_id,
        stint_count=result.stint_count,
        compound_sequence=result.compound_sequence,
        stint_lengths=result.stint_lengths,
    )

# app/api/stints_compare.py:106 (same body, split signature across two lines)
def _to_driver_strategy_summary(
    result: DriverStrategySummaryResult,
) -> DriverStrategySummary:
    return DriverStrategySummary(
        driver_id=result.driver_id,
        stint_count=result.stint_count,
        compound_sequence=result.compound_sequence,
        stint_lengths=result.stint_lengths,
    )
```

- **Signature**: identical in all three — one positional parameter, `result: DriverStrategySummaryResult`, returning `DriverStrategySummary`. `stints_compare.py`'s copy only differs in line-wrapping, not content.
- **Two distinct types share one name** — this is the key fact the extraction has to get right:
  - `app.services.tyre_performance.strategy_summary.DriverStrategySummary` — a frozen `@dataclass` (service-layer result), always imported aliased as `DriverStrategySummaryResult` in all three files to disambiguate.
  - `app.models.tyre_performance.DriverStrategySummary` — a Pydantic `ApiModel` (API response shape), imported under its own name.
  - The function is, precisely, ADR-0009's anti-corruption mapping: service dataclass → API Pydantic model.
- **No call site relies on private-function semantics** — each call site just calls the function positionally with the result of `driver_strategy_summary(driver_id, stints)` (or, in `tyre_performance.py`, maps it over `result.driver_strategies`). Nothing depends on the function being module-private.
- **No test references the private helper directly** — `grep -rn "_to_driver_strategy_summary\|to_driver_strategy_summary" tests/` returned nothing. All three routes (`test_driver_trends_route.py`, `test_stints_compare_route.py`, `test_tyre_performance_route.py`) exercise this mapping only through the HTTP response body, which is exactly the right level of coverage for a boundary-mapping function and needs no new tests (§7).

## 3. Current Duplicated Implementation and Call Sites

| File | Def line | Call site(s) |
|---|---|---|
| `app/api/driver_trends.py` | 112 | line 131: `_to_driver_strategy_summary(driver_strategy_summary(driver_id, stints))` |
| `app/api/stints_compare.py` | 106 | line 97: `strategy=_to_driver_strategy_summary(driver_strategy_summary(driver_id, stints))` |
| `app/api/tyre_performance.py` | 96 | line 165: `[_to_driver_strategy_summary(s) for s in result.driver_strategies]` |

Each definition carries a comment explaining the duplication was deliberate (`driver_trends.py`: *"A third copy is a deliberate, disclosed choice (docs/m21-design-review.md §6.5)... extracting a shared helper would be an unrelated cleanup outside this milestone's approved scope"*; `stints_compare.py`: *"Mirrors app/api/tyre_performance.py's own... not imported from there since that module's version is a private, unexported helper"*). These comments are the ones going stale and being removed per Stage A's approved scope.

## 4. Shared-Module Placement Decision and Rationale

**Decision: `app/api/_mappers.py`** — a new, non-route module inside the existing `app/api/` package.

Rationale, grounded in fresh inspection rather than invention:

- **ADR-0009 explicitly places this kind of code at the API boundary**, not in services or utils: `app/api/__init__.py`'s own docstring states *"Every response returned from this package must be a PitWall-defined Pydantic model... never a repository- or provider-shaped object passed straight through"* — and `app/api/tyre_performance.py`'s module docstring says routes *"map the resulting plain dataclasses onto the Pydantic response models... the anti-corruption boundary (ADR-0009)"*. This mapping is API-boundary code by the project's own architectural decision, not incidentally-placed code that happens to live in three route files.
- **`app/utils/` was considered and rejected.** It exists (`app/utils/ids.py`, docstring *"Small, dependency-free backend utilities"*) and is a real precedent for small shared helpers, but its one existing member (`slugify`/`make_event_id`) is domain-independent string logic used by a *repository*, not a Pydantic-model-producing anti-corruption mapper used by *routes*. Moving ADR-0009 mapping code into `app/utils/` would relocate anti-corruption logic away from the API boundary ADR-0009 says it belongs at, which is a bigger architectural change than this milestone's approved scope ("no unrelated refactor," §9 of the Stage A/B brief).
- **No existing non-route file exists in `app/api/` yet**, and there is no import-scanning/auto-discovery of that directory (`main.py` registers each router by explicit `include_router` call, confirmed by inspection — no `pkgutil`/`importlib`/`glob` usage anywhere in `app/`), so adding one plain module there is safe and requires no change to `main.py`.
- **Leading underscore (`_mappers.py`)** matches the existing convention that a name prefixed with `_` signals "internal, not a public interface of this package" — consistent with how each of the three current functions is itself `_`-prefixed inside its own module. The module boundary now carries that signal instead of the function name (see §5).

## 5. Function Signature / Type Decision

- **New function name: `to_driver_strategy_summary`** (underscore dropped). Precedent: `app/utils/ids.py`'s `slugify`/`make_event_id` are plain, unprefixed names — in this codebase, a leading underscore marks "private to this specific module," and once the function is imported across modules by design, keeping the underscore would be misleading; the module (`_mappers.py`) is what signals "internal to `app.api`," not the function name.
- **Signature, unchanged in behavior and type**:
  ```python
  def to_driver_strategy_summary(
      result: DriverStrategySummaryResult,
  ) -> DriverStrategySummary:
  ```
  where, inside `_mappers.py`, `DriverStrategySummaryResult` is `app.services.tyre_performance.strategy_summary.DriverStrategySummary` imported under that same alias (preserving the existing disambiguation convention exactly, not inventing a new one), and `DriverStrategySummary` is `app.models.tyre_performance.DriverStrategySummary`.
- **Typed against the concrete existing dataclass**, not a protocol or structural type. A `Protocol` was considered and rejected: the dataclass already exists, is frozen, is the only producer (`driver_strategy_summary()`), and is not going to grow alternate implementations — introducing a `Protocol` here would be new architecture with no forcing requirement, which the Stage A/B brief explicitly rules out ("avoids introducing unnecessary architecture").
- Function body is copied verbatim (field-for-field), preserving response shape and behavior exactly.

## 6. Import / Dependency / Circular-Import Analysis

Traced import direction for everything the new module touches:

- `app.models.tyre_performance` imports only `app.models.telemetry` (for `ApiModel`) — nothing from `app.api` or `app.services`.
- `app.services.tyre_performance.strategy_summary` imports only `app.models.race_context` (for `Stint`) — nothing from `app.api` or `app.utils`.
- Therefore `app/api/_mappers.py` importing from `app.models.tyre_performance` and `app.services.tyre_performance.strategy_summary` is **one-directional** (`app.api` → `app.models`/`app.services`), matching every existing route file's own import direction exactly. No cycle is introduced.
- `app/api/_mappers.py` will **not** import `fastapi`, `APIRouter`, or anything route-specific — it is not itself a router module and is never passed to `include_router`, so it introduces no new HTTP surface and no change to `main.py`.

## 7. Test Implications

- `grep -rn "_to_driver_strategy_summary\|to_driver_strategy_summary" tests/` → no matches. No test imports the private helper directly.
- Existing coverage is sufficient: `test_driver_trends_route.py`, `test_stints_compare_route.py`, and `test_tyre_performance_route.py` already assert on the full JSON response shape for all three routes, which is exactly the contract this extraction must not change. A regression in the shared mapper would fail all three of these test files simultaneously.
- **No new test is being added.** Per the Stage A/B brief's own instruction not to add coverage the existing tests already prove, and per this project's standing convention (confirmed by `getParam`/`setOrDelete`'s M27 extraction, which also added no new tests beyond the existing consumers' coverage).

## 8. npm-Audit Backlog Correction Decision

**Deferred — not part of M29.** Stage A found `docs/backlog.md`'s npm-audit figures stale (documented 13/6-high/6-moderate/1-critical vs. current 11/4-high/6-moderate/1-critical, with `js-yaml`/`nanoid` newly appearing and the `eslint` cluster no longer appearing). Correcting that text is:

- A `docs/backlog.md` edit, entirely unrelated to the backend mapper extraction this milestone is scoped to.
- Explicitly out of the approved file scope (§9) — no docs file is in the Stage C allow-list.
- Exactly the kind of "already noticed, fold it in anyway" bundling `CLAUDE.md`'s scope discipline and this session's own established precedent (documentation reconciliation is its own periodic milestone type — M16, M20, M23, M28) both warn against.

This correction is a legitimate, small, future documentation-reconciliation item — it does not require or justify starting the dependency upgrade itself, and should be picked up the next time a docs-reconciliation milestone runs (or sooner, at the user's discretion), not folded into M29.

## 9. Exact Stage C File Scope

Stage C may create or modify **only**:

- **Create**: `backend/app/api/_mappers.py`
- **Modify**: `backend/app/api/driver_trends.py`
- **Modify**: `backend/app/api/stints_compare.py`
- **Modify**: `backend/app/api/tyre_performance.py`

No other file — no test file, no model file, no service file, no doc, no dependency manifest, no frontend file — is in scope. (Existing tests are expected to pass unmodified, per §7; if Stage C finds a genuine reason a test file needs touching, that is a deviation requiring the same justification standard as any other Stage A→B deviation, reported back before proceeding.)

## 10. Explicit Non-Goals

- Do **not** extract `_to_stint_pace` (2 copies, not independently repeated-evidence — see M29 Stage A §9/§10).
- Do **not** generalize or touch the comparison-route double-call pattern (`compare_pace_trends`/`compare_tyre_trends`).
- Do **not** begin the npm dependency upgrade or edit `docs/backlog.md` (§8).
- Do **not** perform any other backend cleanup encountered incidentally while editing these three files.
- Do **not** change the response JSON shape, field names, field order guarantees, or HTTP status behavior of any of the three routes.
- Do **not** add a `Protocol` or other new abstraction (§5).

## 11. Validation Strategy

Stage C must run, in order, before considering the milestone done:

1. `uv run pytest` (or equivalent venv-activated `pytest -q`) — full backend suite, expect **386 passed**, no change in count (no test added/removed).
2. `uv run mypy .` — `strict = true` is an established CI gate (`pyproject.toml` `[tool.mypy]`, run twice in `.github/workflows/ci.yml`); fresh baseline this session is clean (`Success: no issues found in 100 source files`) and must remain clean.
3. `ruff check .` — must remain clean (fresh baseline: `All checks passed!`).
4. `ruff format --check .` — must remain clean (fresh baseline: `100 files already formatted`).
5. `git diff --check` — generic whitespace/conflict-marker sanity check before staging.
6. No targeted new mapper-specific test is needed beyond the above (§7) — the three existing route tests already assert the exact response shape the mapper produces.

Frontend/browser validation is **not required**: this is a private, internal backend refactor with zero API contract change (§10), so nothing downstream of the typed API client is affected.

## 12. Behavioral-Equivalence / Safety Checks

Stage C must confirm, before considering the extraction complete:

- [ ] All three routes' response JSON is byte/structurally identical to current behavior (proven by the existing route tests passing unmodified).
- [ ] All three call sites (`driver_trends.py:131`, `stints_compare.py:97`, `tyre_performance.py:165`) import and use the single shared `to_driver_strategy_summary` from `app.api._mappers`.
- [ ] No `_to_driver_strategy_summary` definition remains anywhere in `app/api/`.
- [ ] `mypy --strict` reports no import-cycle or type error.
- [ ] No API/schema change — `docs/api-model.md` requires no edit (response shape unchanged).
- [ ] No unrelated refactor landed in any of the three touched files — diffs should show only: the new shared import replacing the old aliased-dataclass import, removal of the private function and its now-unused imports (`DriverStrategySummary`/`DriverStrategySummaryResult` per §Stale-import analysis below), and the call sites updated to call the shared function.

**Stale-import analysis (fresh finding, feeds directly into Stage C's diff):**

| File | Import to remove entirely | Import to narrow | Import to add |
|---|---|---|---|
| `driver_trends.py` | `from app.models.tyre_performance import DriverStrategySummary` (line 37, becomes fully unused); `from app.services.tyre_performance.strategy_summary import (DriverStrategySummary as DriverStrategySummaryResult,)` (lines 41-43) | — | `from app.api._mappers import to_driver_strategy_summary` |
| `stints_compare.py` | `from app.services.tyre_performance.strategy_summary import (DriverStrategySummary as DriverStrategySummaryResult,)` (lines 42-44) | `from app.models.tyre_performance import DriverStrategySummary, StintPace` → `from app.models.tyre_performance import StintPace` (`StintPace` still used by `_to_stint_pace`, kept) | `from app.api._mappers import to_driver_strategy_summary` |
| `tyre_performance.py` | `from app.services.tyre_performance.strategy_summary import (DriverStrategySummary as DriverStrategySummaryResult,)` (lines 60-62) | remove `DriverStrategySummary` from the multi-line `from app.models.tyre_performance import (...)` block (lines 28-37) — every other name in that block is still used elsewhere in the file | `from app.api._mappers import to_driver_strategy_summary` |

Verified by grepping every occurrence of both `DriverStrategySummary` and its `...Result` alias in all three files (§2) — in every file, both names' only remaining use was inside the function being deleted, so both imports become fully removable (or narrowable, for the one shared import line in `stints_compare.py`) with no other usage left behind. `ruff check` (unused-import rule) will catch it if this analysis is wrong, but it is included here as a fresh-inspection finding for Stage C rather than something Stage C needs to re-derive.

## 13. Deviations from Stage A

One clarification, not a scope deviation: Stage A's recommendation named the three files and the extraction goal but did not commit to a location. Fresh inspection in this stage determined the location should be **`app/api/_mappers.py`**, not `app/utils/`, specifically because ADR-0009 places anti-corruption mapping at the API boundary (§4) — `app/utils/` would have been the more "obvious" generic-utility location but is architecturally the wrong layer for this specific kind of code. This is a refinement of Stage A's approved scope, not a deviation from it: the file list Stage A proposed touching (`driver_trends.py`, `stints_compare.py`, `tyre_performance.py`) is unchanged; only the new module's exact path was undetermined at Stage A and is now resolved.

No other deviation from Stage A's approved scope.

---

**STOP — awaiting explicit approval before Stage C.**
