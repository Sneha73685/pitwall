# PitWall — M40 Design Review: Lap Invalidation for Track-Limits Deletions

## 1. Baseline / Safety — CONFIRMED CLEAN

- `HEAD` = `origin/main` = `354b974977ffc1e200d5b83affebd7eba86a2e28` ✓
- Working tree clean, `git diff --cached` empty ✓
- `docs/m9-design-review.md`: zero diff ✓
- `docs/m40-design-review.md`: did not exist before this document ✓
- All investigation performed read-only (no writes to source, data, Parquet, or PostgreSQL).

## 2. Post-M39 Documentation Audit

M39 (commit `354b974`) is internally consistent everywhere it touched: the M38 exception wording
("genuine external Ergast-data-source gap") is identical across `docs/prd.md`, `docs/success-metrics.md`,
`docs/data-model.md`, `docs/api-model.md`. No lingering "M32 is current," "no historical backfill,"
or "position history not yet built" claim anywhere M39 edited. `docs/architecture.md` and
`docs/backlog.md` remain accurate, confirmed unchanged and correct.

**One real, concrete gap found — M39's own sweep was incomplete.** `README.md`'s **Roadmap**
section (not the section M39 edited) still reads, unchanged: *"...V3's stint/pit-stop comparison
shipped in M10/M11/M15, weather and position/gap history are still unbuilt)"* — the exact same
falsehood M39 corrected in `docs/prd.md` §5 and `docs/success-metrics.md`, just missed in this one
other location. The same paragraph also says "updated through M15," stale since M16 at the latest.
This is small (two clauses in one paragraph), low-severity, and does not by itself justify a
dedicated milestone — but it is real, newly discovered, and should be corrected opportunistically
(see §15 non-goals: not bundled into M40's implementation, flagged for a fast standalone fix or the
next reconciliation pass, per the project's own scope-discipline convention of not folding unrelated
fixes into an unrelated milestone).

## 3. Product Capability Audit — CLEAN

21 backend endpoints, 16 frontend routes, all reachable via Sidebar or confirmed in-page
cross-links, no orphans, no dead links. M34/M35/M36 "shipped" capabilities were traced and verified
**actually usable end-to-end**, not just present in code:
- M34: `Driver.classified_position/grid_position/status/points` → repository → `DriverSelectPage.tsx:109-124`, correctly null-safe (empty conditional block) for Qualifying/Practice/the 2 M38 exceptions.
- M35: `Lap.position` → `aggregation.py:207` → `SessionAnalyticsPage.tsx:107`'s chart, correctly guarded to empty-state rather than break for non-applicable sessions.
- M36/M37: `Lap.track_status` → `filtering.py`'s `_yellow_flag_reason`/`classify_lap`/`filter_for_aggregate_stats` (which deliberately excludes yellow-flag laps from pace stats — a documented, intentional design, not a bug) → `DriverLapTable.tsx:42`, M37's fix intact.

No API/frontend contract drift found.

## 4. M34–M39 Regression Audit — CLEAN, ZERO DEFECTS FOUND

All five milestones re-verified against current source, not prior reports:
- M37: all 4 test states present (valid+excluded, invalid+no-exclusion, invalid+excluded, valid+no-exclusion) — full, not partial, coverage.
- M38: `backfill_m38.py` unmodified since ship; `data/.m38-backup/` holds exactly 332 dirs, state log has exactly 332 unique `"completed"` sessions — consistent. **No accidental-rerun risk**: traced `main()`'s control flow — it always computes `remaining` by excluding `completed_session_ids()` regardless of the `--resume` flag (informational only); a future re-run safely no-ops on all 332 and only re-attempts the 2 known-failed sessions (same harmless Ergast-gap error, no corruption risk).
- M39: `git show 354b974 -- pipeline/pitwall_pipeline/normalize.py` confirms docstring-only; no other file in that commit touches executable code.
- Tests: backend 379 passed / 1 failed + 15 errors (all pre-existing, no-live-Postgres, zero new regressions); frontend 63/63 relevant tests passed (568/568 full suite, confirmed separately in §10).

## 5. Data / Ingestion Findings

Fresh grep across `pipeline/` and `backend/app/` confirms unused: `results.Q1/Q2/Q3`, `results.Time`
(the field of that name actually used is telemetry's unrelated per-sample `Time`), `results.Laps`,
`weather_data` (153 rows/session, ~60s sampling, zero consumers), `race_control_messages` (217 rows
in one real race sample, zero consumers).

**New finding, not previously investigated by any prior audit**: `laps.Deleted`/`DeletedReason` —
zero references anywhere in the codebase. Real 2023 Austrian GP data: **82 of 1354 laps (6%)**
officially `Deleted=True`, almost all for track-limits infringements (`DeletedReason`, e.g.
`"TRACK LIMITS AT TURN 10 LAP 65"`). Confirmed these deleted laps have `IsAccurate=True` (clean
telemetry — FastF1's own accuracy check has no opinion on track-limits deletion) but
`IsPersonalBest=False` (FastF1 itself already excludes them from PB consideration).
`backend/app/services/session_analytics/filtering.py` derives PitWall's own `is_valid` **solely**
from `IsAccurate` — meaning **a track-limits-deleted lap currently passes PitWall's `is_valid` check
and receives no `exclusion_reason`**, so it renders in `DriverLapTable` with no exclusion tag and
would be included in pace/consistency aggregates exactly like a genuinely clean lap. This is a real,
evidenced, previously-undiscovered gap — not a violation of `is_valid`'s original spec (it was
always meant as a telemetry-integrity flag, not an official-validity flag), but an unmodeled
real-world signal in exactly the same shape M36 already filled for yellow flags.

## 6. Historical Data State — CONFIRMED, NO NEW BACKFILL JUSTIFIED

Fresh full sweep (not sampled): 704 total sessions; type distribution unchanged
(`practice_1:141, practice_2:118, practice_3:111, qualifying:142, race:142, sprint:28,
sprint_qualifying:22`); target population 334 confirmed; **332 backfilled**, **2 exceptions**
(`2023_s_o_paulo_grand_prix_sprint`, `2026_british_grand_prix_sprint`, exact match); **370/370
Practice sessions untouched**. No new backfill candidate found. No evidence justifies re-attempting
the 2 permanent exceptions — the underlying Ergast-source gap in the offline cache is unchanged.

## 7. User-Value Audit

What can an F1 race engineer still not answer from PitWall that they reasonably should be able to?

- **"Was this lap actually valid for record purposes?"** — **cannot currently be fully answered.**
  M36 correctly flags yellow-flag/SC/VSC/red-flag laps; it does not flag track-limits deletions,
  a materially common occurrence (6% in one real sample). This is the sharpest concrete gap found
  in this audit — a race engineer trusting `DriverLapTable`'s exclusion tag today gets an
  incomplete answer.
- **"What was this qualifying segment's pace?"** — cannot be answered at all today; Q1/Q2/Q3 are
  fetched by FastF1 but never surfaced, despite 142 Qualifying sessions already carrying real,
  usable classification-adjacent data structure from M34's pattern.
- Weather, race-control narrative, gaps-to-leader: genuinely missing, but nothing in the existing
  product currently promises or implies these are answerable — they read as "nice to have," not
  "obviously broken."
- Driver comparison, tyre/stint analysis, strategy, running order, session navigation: all
  sufficiently covered by M8–M38's existing surfaces, reconfirmed reachable and correct in §3/§4.

## 8. Qualifying Q1/Q2/Q3 — Reassessed, Still Strong, Now Second Place

Re-verified on a different real session (2024 Japanese GP Qualifying, one of the 142 already-M36-
applicable sessions) — identical sparse elimination pattern (Q1=20/20, Q2=15/20, Q3=10/20) to the
prior audit's Bahrain sample. Confirmed: reuses the exact `results` DataFrame M34 already loads
(zero new FastF1 call, zero new Parquet file); `DriverSelectPage.tsx:109-120` already has the exact
conditional-render pattern this would extend into; the 142 already-backfilled Qualifying sessions
strengthen the case (immediate historical payoff) relative to M39's assessment. No blocker found.
Still a strong, cheap, real candidate — but weaker in evidence strength than §5's newly-discovered
correctness gap, since Q1/Q2/Q3 is purely additive value, not a correction of something currently
wrong.

## 9. Weather / Race-Control — Reassessed, Still Deferred

Weather: a minimal "conditions" summary (a single air/track-temp + rain badge on the session header)
is architecturally trivial versus a full time-series page, but **both remain unbuilt with zero
consuming UI either way** — there is still no existing surface asking for this. Race-control:
`track_status` (M36) already answers *which laps* were affected and *what flag type*; race-control
messages would add *why*/*where* and driver-specific incident narrative — real but incremental,
layered on a state M36 already covers, not filling an empty hole. Both confirmed "available, not
yet justified," unchanged from M39's finding, now double-verified against fresh real data.

## 10. Technical-Debt / Hardening — Nothing Crosses a New Threshold

`_to_stint_pace` duplication, trend-hook duplication, CI permissions gap, Docker/Python version
mismatch, `get_telemetry` construction cost: all reconfirmed present, all unchanged since M38/M39,
none newly worsened. Mapper/repository duplication, import cycles, dead code: clean. `npm audit`:
**0 vulnerabilities**. Backend/frontend test suites: clean (pre-existing Postgres-only failures,
zero real regressions; 568/568 frontend). `data/.m38-backup/`'s 332 retained directories are
expected, documented, gitignored state per M38's own deliberate manual-retention policy — not new
debt, just unactioned by design.

## 11. Candidate Matrix

| Candidate | Category | Evidence strength | User value | Arch. coherence | Size | Risk | Data/schema impact | Milestone-sized? | User-facing? | Previously deferred? | New evidence since M39? | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Lap invalidation for track-limits deletion (`Lap.deleted`/`deleted_reason`)** | Correctness/completeness | **High — real data, 6% of sampled laps** | **High — directly affects pace/PB trust** | **Very high — mirrors M36's exact proven pattern** | S–M | Low | Additive `Lap` fields only, same shape as M35/M36 | Yes | Yes | No — newly discovered this audit | **Yes — new finding** | **Primary** |
| Qualifying Q1/Q2/Q3 | Product capability | Strong, re-confirmed twice now | Real, direct | High — mirrors M34's exact pattern | S | Low | Additive `Driver` fields only | Yes | Yes | Named runner-up at M39 | Re-confirmed, strengthened by 142 already-backfilled sessions | Strong runner-up for M41 |
| Weather (minimal "conditions" badge) | Product capability | Real but no consuming UI | Speculative | Medium | S–M | Low | New Parquet file or session-level fields | Maybe | Yes | Yes, repeatedly | No new evidence | Defer |
| Weather (full time-series) | Product capability | Real but no consuming UI | Speculative | Medium | M–L | Low | New Parquet file | Yes | Yes | Yes, repeatedly | No new evidence | Defer |
| Race-control timeline | Product capability | Real, incremental over M36 | Speculative | Medium | M | Low | New endpoint + component | Yes | Yes | Yes, repeatedly | No new evidence | Defer |
| Tech debt (any item) | Hardening | Unchanged, sub-threshold | Low | Low | S | Low | None | No | No | Repeatedly reconfirmed | No | Defer |
| README Roadmap-section falsehood | Documentation | Concrete, small | None (maintainer-facing) | N/A | Trivial | None | None | No | No | New finding this audit | Yes | Fast standalone fix, not a milestone |
| Do nothing / finalization | — | — | — | — | — | — | — | — | — | — | — | Rejected — a real correctness gap remains open |

## 12. Finalization Assessment

Assessed on substance, not milestone count:

- **Coherent remaining product gap?** Yes — the track-limits lap-invalidation gap is concrete and evidenced, not speculative.
- **Remaining features optional or foundational?** The track-limits fix is closer to foundational-correctness (it affects trust in existing pace/PB data); Q1/Q2/Q3, weather, race-control are genuinely optional.
- **Architecture stable?** Yes — proven across eight additive field-milestones (M10, M11, M34, M35, M36, and now the proposed pattern) with zero architectural rework required each time.
- **Data model mature?** Very close — one more real gap surfaced this round, consistent with a maturing-but-not-yet-complete model.
- **Historical data sufficiently complete?** Yes, per M38, reconfirmed fresh in §6.
- **Known correctness defects?** Yes — the track-limits gap (§5/§7), the standout finding of this audit.
- **Technical debt below threshold?** Yes, confirmed across the board in §10.
- **Would another milestone materially improve the product?** Yes — closing the track-limits gap materially improves the accuracy a race engineer can trust from `DriverLapTable` and any pace/PB comparison.

**Classification: B — Product hardening / completion.** Not A (no new pillar of functionality is
being opened up), not C (a genuine correctness gap remains open, and closing it is squarely
in-scope, low-risk, high-coherence work using an already-proven pattern — finalizing now would ship
a product that silently mistrusts its own "valid lap" concept for a materially common real-world
case).

## 13. Decision Questions

**A. Highest-value next milestone genuinely justified by current evidence?** Lap invalidation for
track-limits deletions (`Lap.deleted`/`Lap.deleted_reason`) — the only candidate backed by fresh,
concrete, quantified evidence of an actual correctness gap, not merely an available-but-unbuilt
capability.

**B. Product capability, hardening, documentation/data, or finalization?** Hardening/completion — a
correctness fix using the exact established M36 pattern, not a new product pillar, not
documentation, not more historical-data work (M38 already closed that question), and not yet
finalization given this open gap.

## 14. Recommendation

**M40 = Lap invalidation for track-limits deletions (`Lap.deleted` / `Lap.deleted_reason`).**

Mirrors M36 exactly: two new additive `Lap` fields sourced from FastF1's already-loaded `laps`
DataFrame (`Deleted`, `DeletedReason` — no new FastF1 call), extending `filtering.py`'s exclusion
logic so a track-limits-deleted lap gets its own `exclusion_reason` (distinct from the existing
yellow-flag one) and is correctly excluded from pace/consistency aggregates the same way M36 already
excludes yellow-flag laps, with `DriverLapTable` rendering the new reason. A historical-backfill
follow-on (mirroring M38) is a natural but separate future milestone — M40 itself should ship the
capability, matching how M34/M35/M36 each shipped without their own immediate backfill.

**Why it wins**: it is the only candidate with fresh, quantified evidence of an actual defect
(6% of laps in a real sample silently mistrusted-as-valid), it reuses an architecturally proven
pattern with near-zero risk, and it directly serves the product's stated "engineer's-eye view"
purpose more than any purely-additive capability would.

**Why Qualifying Q1/Q2/Q3 loses (for now)**: it remains a strong, cheap, real candidate — but it
adds capability rather than correcting a known-wrong state, and evidence/correctness outranks
novelty per this audit's own standard. Recommended as the clear next candidate after M40 (M41).

**Why weather/race-control lose**: both remain "available, not yet justified" on their third
consecutive audit finding the same thing — no consuming UI, no concrete evidence of urgency.

### Candidate-Level Scope (M40, not an implementation plan)

- **Likely files**: `pipeline/pitwall_pipeline/models.py` (`Lap.deleted: bool`, `deleted_reason: str | None`), `pipeline/pitwall_pipeline/normalize.py` (`normalize_laps()` reads `Deleted`/`DeletedReason`), `pipeline/pitwall_pipeline/cache_writer.py` (no change expected — already generic over `Lap`'s fields), `backend/app/models/telemetry.py` (`Lap` response model), `backend/app/repositories/parquet_repository.py` (read the two new columns), `backend/app/services/session_analytics/filtering.py` (new exclusion reason, aggregate-stats exclusion), `frontend/src/api/client.ts` (typed fields), `frontend/src/features/session-analytics/components/DriverLapTable.tsx` (render the new reason).
- **Likely tests**: `pipeline/tests/test_normalize.py`, `backend/tests/test_parquet_repository.py`, `backend/tests/test_session_analytics_filtering.py`, `backend/tests/test_session_analytics_route.py`, `DriverLapTable.test.tsx` — extending each file's existing pattern for the M36/M37 fields, not inventing a new test style.
- **API/data implications**: two additive, nullable `Lap` fields; no schema-breaking change; existing sessions' Parquet files gain the columns only on re-ingestion or a future targeted backfill (out of M40's scope, matching M34/M35/M36's own precedent of shipping before backfilling).
- **Dependency implications**: none — `Deleted`/`DeletedReason` are already present in the FastF1 version already pinned (3.8.3).
- **Explicit non-goals**: no historical backfill in M40 itself (a future M4x, mirroring M38); no change to the existing yellow-flag exclusion reason or its precedence; no Q1/Q2/Q3, weather, or race-control work; no unrelated tech-debt cleanup; no README Roadmap-section fix bundled in (flag separately, per §2).
- **Validation strategy**: unit tests for the new normalize/filtering logic against real fixture data including a genuinely track-limits-deleted lap; confirm `DriverLapTable` renders the new exclusion reason distinctly from the yellow-flag one; confirm aggregate pace/consistency stats correctly exclude these laps, matching the yellow-flag precedent exactly.
- **Major risks**: low — same category of risk M36 already carried and shipped safely; the only genuinely new judgment call is exclusion-reason precedence if a lap is both yellow-flagged and track-limits-deleted (Stage B should resolve this explicitly, not leave it implicit).

## 15. Explicit Non-Goals (This Stage)

No implementation. No historical backfill. No database or Parquet writes. No dependency changes. No
fix to the README Roadmap-section finding (§2) — flagged for a fast standalone correction or the
next reconciliation pass, not folded into this audit or into M40's future implementation, per the
project's own scope-discipline convention.

## 16. Stage A Stop Condition — Confirmed

`docs/m40-design-review.md` is the only new/modified file. No source file changed. No other
documentation file changed. `docs/m9-design-review.md` untouched. Nothing staged, committed, or
pushed. No database writes. No Parquet writes. No ingestion. No backfill. No dependency changes.

---

# Stage B — Implementation Design

## 17. Root-Cause Verification (FastF1 Source + Real Data)

Independently verified against the pipeline's own installed FastF1 (`pipeline/.venv/lib/python3.10/site-packages/fastf1/core.py`), not docstrings alone.

- **Origin**: `Deleted`/`DeletedReason` are populated **entirely by parsing race-control messages** (`_set_laps_deleted_from_rcm()`, `core.py:1828`) — not from `results`, not a dedicated timing endpoint. Every lap starts `Deleted=False`; a regex match against RCM text (`r"CAR (\d{1,2}) .* TIME (\d:\d\d\.\d\d\d) DELETED - (.*)"`) sets `Deleted=True` and `DeletedReason` to the free-text remainder of that message (local timestamp stripped). A separate look-ahead pass detects `"...REINSTATED..."` messages and excludes those laps from ever being marked deleted — **FastF1 itself already handles reversal; PitWall needs no reinstatement logic.**
- **Types**: declared `'Deleted': bool | None`, `'DeletedReason': str` (`core.py:2837-2838`). Real data: `Deleted` dtype `bool`, `DeletedReason` dtype `object` (string). Every deleted lap has a non-empty reason (0 blanks across 1354+ laps checked); every non-deleted lap has an **empty string** (`""`), not `None`/`NaN`.
- **Session-type gating**: **none** — `_set_laps_deleted_from_rcm()` runs unconditionally whenever `messages=True` (FastF1's own default), and `FastF1Provider.load_session()` calls `ff1_session.load()` with no arguments, so `Deleted`/`DeletedReason` are **already being fetched for every session PitWall ingests today** — zero new FastF1 call, exactly matching `track_status`'s situation at M36.
- **Real-data sweep, 17 sessions** (Race/Qualifying/Sprint/Practice, 2021–2025, 10+ events): `Deleted` column present in every session type including Practice. **Every single distinct `DeletedReason` string, across all 17 sessions, reduces to exactly one kind: `"TRACK LIMITS"`** (e.g. `"TRACK LIMITS AT TURN 10 (NEXT LAP)"`) — free text embedding turn/lap numbers, not a clean enum. No unsafe-release, collision, or procedural-exclusion reason ever appeared — consistent with real F1 process (other infringements are typically time/grid penalties, not lap-time deletions).
- 2023 Austrian GP Race: 1354 laps, 82 deleted (6.1%) — the figure Stage A's finding was based on, reconfirmed exactly.

**Pipeline trace, confirmed verbatim**: `normalize_laps()` (`pipeline/pitwall_pipeline/normalize.py:404-441`) uses the established `_optional_str`/`_optional_int` via `row.get(...)` pattern for every additive field (`compound`, `position`, `track_status`) — the exact pattern any new field must follow. `parquet_repository.py:113-131`'s `_lap_from_row` uses `.get()`, not bracket access, for `position`/`track_status` — the exact tolerant-of-missing-columns pattern old Parquet needs. `filtering.py` (full file, verbatim):

```python
ExclusionReason = Literal["yellow_flag"]
_EXCLUDED_TRACK_STATUS_CODES = frozenset({"2", "4", "5", "6", "7"})

@dataclass(frozen=True)
class LapValidity:
    is_valid: bool
    exclusion_reason: ExclusionReason | None

def _yellow_flag_reason(lap: Lap) -> ExclusionReason | None:
    if lap.track_status is None:
        return None
    if any(code in _EXCLUDED_TRACK_STATUS_CODES for code in lap.track_status):
        return "yellow_flag"
    return None

def classify_lap(lap: Lap) -> LapValidity:
    return LapValidity(is_valid=lap.is_accurate, exclusion_reason=_yellow_flag_reason(lap))

def filter_valid_laps(laps: list[Lap]) -> list[Lap]:
    return [lap for lap in laps if classify_lap(lap).is_valid]

def filter_for_aggregate_stats(laps: list[Lap]) -> list[Lap]:
    return [
        lap for lap in laps
        if (validity := classify_lap(lap)).is_valid and validity.exclusion_reason is None
    ]
```

`is_valid` is derived **solely** from `lap.is_accurate` — confirmed independent of `exclusion_reason` by construction. `DriverLapMetrics` (`backend/app/models/session_analytics.py`) reuses this exact `ExclusionReason` type, no separate response-only type. `frontend/src/api/client.ts:250-257`: `export type ExclusionReason = "yellow_flag";` mirrors the backend literal exactly. `DriverLapTable.tsx:42-49` renders the raw `exclusion_reason` string verbatim in parentheses — **no label-mapping lookup exists**, so a new value type-checks and renders correctly through the exact same branch with zero JSX change.

**New, out-of-scope finding**: `normalize_laps()`'s own docstring (`normalize.py:412-414`), `models.py:147-149` (`Lap.position` comment), and `backend/app/models/telemetry.py:90-93` (mirrored) all still claim M35's `Position` is "populated only for Race/Sprint/pre-2024 Sprint Qualifying sessions" — the exact stale claim M38 empirically disproved and M39 corrected in `normalize_drivers()`'s docstring but missed in these three other locations. **Not M40's to fix** (unrelated to track-limits deletion, would be scope creep per this milestone's own non-goals) — flagged for a fast follow-up alongside the README Roadmap-section finding from Stage A §2.

## 18. M36 Architectural Precedent — M40 Mirrors It, With One Deliberate Addition

M40 mirrors M36 exactly in the places that matter: an additive, nullable `Lap` field sourced from
already-loaded FastF1 data, read via `.get()` for old-Parquet safety, feeding into `exclusion_reason`
without touching `is_valid`. The one deliberate difference: M40 persists **two** fields
(`deleted: bool | None`, `deleted_reason: str | None`) rather than one, for the same reason
`track_status` itself stores the raw source signal rather than a pre-computed boolean — it preserves
source fidelity for a possible future richer display (e.g. surfacing the specific turn), without
requiring a future backfill to add it. `classify_lap()`'s gating logic only needs `deleted` (a
boolean check); `deleted_reason` is not read by any Stage C filtering logic.

## 19. Semantic Mapping — Explicit Decisions

1. **"Deleted" means**: an official race-control ruling invalidating this specific lap's time — not a telemetry-quality signal. Confirmed orthogonal to `is_accurate` (real data: deleted laps have clean, accurate telemetry).
2. **"Track limits" means**: every real `DeletedReason` observed (17 sessions, all types, multiple years) is a track-limits infringement. No other deletion cause was ever found.
3. **Which `DeletedReason` values become an exclusion**: **all of them** — `exclusion_reason = "track_limits"` whenever `lap.deleted is True`, unconditionally, without parsing `deleted_reason`'s text. Justification: `Deleted=True` is itself a definitive official ruling that this lap's time doesn't count for analysis purposes, independent of the specific violation named — parsing free-text race-control messages to gate on content would be fragile (phrasing varies: "TRACK LIMITS AT TURN 10 (NEXT LAP)" vs "TRACK LIMITS AT TURN 9 LAP 5 ") and unsupported by any real counter-evidence that a non-track-limits reason exists.
4. **Deleted laps that should NOT be classified `track_limits`**: none found in real evidence. Explicitly acknowledged as an assumption, not a proof — see §21 Risks.
5. **Should every `Deleted=True` lap be excluded?** Yes — see #3.
6. **Should `deleted_reason` be exposed raw through the API?** Yes, mirroring `track_status`'s precedent (raw source field exposed on the shared `Lap` model) — but it is not consumed by any Stage C UI logic; it's persisted for future use.
7. **User-facing exclusion label**: `"track_limits"` — matching `"yellow_flag"`'s existing naming convention exactly (lowercase, underscore-separated, no display-label transformation layer exists or is being introduced).

## 20. Data Model Design

**Both fields are needed** (§18). Exact additions, following the established `compound`/`position`/`track_status` pattern precisely:

- `pipeline/pitwall_pipeline/models.py` — `Lap` gains `deleted: bool | None = None`, `deleted_reason: str | None = None`, appended after `track_status`, with a comment matching the file's own M35/M36 comment-block convention (source: `ff1_session.laps`' `Deleted`/`DeletedReason` columns, already loaded; `None` for any session ingested before M40).
- `pipeline/pitwall_pipeline/normalize.py` — `normalize_laps()` gains `deleted=_optional_bool(row.get("Deleted"))` (a new `_optional_bool` helper mirroring the existing `_optional_str`/`_optional_int`/`_optional_float` helpers exactly — not previously needed since no prior additive field was boolean) and `deleted_reason=_optional_str(row.get("DeletedReason")) or None` (empty string → `None`, since FastF1 uses `""` for "not deleted," not PitWall's own `None`-means-absent convention — this normalization at the boundary keeps `deleted_reason` cleanly `None`-or-populated rather than `None`-or-empty-or-populated).
- `backend/app/models/telemetry.py` — `Lap` response model mirrors the pipeline model exactly, same two additive fields.
- `backend/app/repositories/parquet_repository.py` — `_lap_from_row` gains `deleted=_optional_bool(row.get("deleted"))`, `deleted_reason=_optional_str(row.get("deleted_reason"))`, same `.get()`-based tolerance.
- **Old-Parquet behavior**: both columns absent entirely on all 704 existing sessions (including the 332 M38-backfilled ones) → `.get()` returns `None` for both → `classify_lap()` sees `lap.deleted = None` → no `track_limits` exclusion, zero behavior change until a future ingestion/backfill. Exactly Option B (§24).
- **New-Parquet behavior**: any session ingested after M40 ships carries both columns natively.
- No new Parquet store/table — both fields live on the existing `laps.parquet` file, same as every M34–M36 addition.

## 21. Filtering Design

Smallest coherent change to `backend/app/services/session_analytics/filtering.py`:

```python
ExclusionReason = Literal["yellow_flag", "track_limits"]

def _track_limits_reason(lap: Lap) -> ExclusionReason | None:
    return "track_limits" if lap.deleted else None

def classify_lap(lap: Lap) -> LapValidity:
    exclusion_reason = _track_limits_reason(lap) or _yellow_flag_reason(lap)
    return LapValidity(is_valid=lap.is_accurate, exclusion_reason=exclusion_reason)
```

`filter_valid_laps()` and `filter_for_aggregate_stats()` need **no changes** — both already operate
generically on `classify_lap(lap).is_valid`/`.exclusion_reason`, so the widened `ExclusionReason` and
new gating function flow through automatically.

**`is_valid` is unchanged** — remains `lap.is_accurate` alone. A track-limits-deleted lap with clean
telemetry (the real, confirmed case) is `is_valid=True` with `exclusion_reason="track_limits"` —
correctly excluded from pace stats via `exclusion_reason`, correctly *not* flagged as a
telemetry-quality problem via `is_valid`. This preserves M36's architectural property exactly, as
instructed — no evidence in this investigation justifies redefining `is_valid`.

**Precedence decision — track_limits wins when both apply.** A lap can, in principle, be both
yellow-flag-affected and track-limits-deleted (independent real-world events; no evidence rules this
combination out, though no real co-occurrence was observed in this investigation's sample). Because
`ExclusionReason` is a single value, not a list, one must be chosen for *display* — this does not
affect filtering correctness, since both `filter_valid_laps`/`filter_for_aggregate_stats` already
exclude on "any reason present," not on which one. **Decision: `track_limits` takes precedence**
(checked first in `classify_lap`), because it is the more specific, directly-attributable,
officially-adjudicated signal (an explicit stewards' ruling on this exact lap) versus the
track-status-derived, session-wide inference `yellow_flag` represents. This is a product/UX judgment
call, not a technical-correctness one — flagged explicitly for confirmation before Stage C, per the
task's own instruction not to leave it implicit.

## 22. Frontend Design — Zero UI Code Change

`DriverLapTable.tsx`'s exclusion-tag rendering (`{lap.exclusion_reason ?? "excluded"}`) renders the
raw string with no lookup/transformation layer — confirmed by direct inspection. `"track_limits"`
renders exactly as `"yellow_flag"` already does today, through the identical condition/branch. The
only change required is the TypeScript type widening in `frontend/src/api/client.ts`:
`export type ExclusionReason = "yellow_flag" | "track_limits";` — a one-line change, needed for the
value to type-check, not for rendering behavior. `DriverLapTable.test.tsx` gets one new test case
(render a lap with `exclusion_reason: "track_limits"`, assert the tag text) to lock this in and
guard against a future silent regression, mirroring the existing `"yellow_flag"` test case.

## 23. Test Design — Exact Count

| # | Case | File |
|---|---|---|
| 1 | `normalize_laps()`: `Deleted=True`/`DeletedReason` populated → `Lap.deleted=True`/`deleted_reason` set | `pipeline/tests/test_normalize.py` |
| 2 | `normalize_laps()`: `Deleted=False` → `deleted=False`, `deleted_reason=None` (empty string normalized away) | `pipeline/tests/test_normalize.py` |
| 3 | `normalize_laps()`: columns absent from fixture DataFrame → both `None`, no raise | `pipeline/tests/test_normalize.py` |
| 4 | Fixture update: add `Deleted`/`DeletedReason` columns to the shared laps fixture | `pipeline/tests/fixtures.py` |
| 5 | Repository: old Parquet (no `deleted`/`deleted_reason` columns) → both deserialize `None` | `backend/tests/test_parquet_repository.py` |
| 6 | Repository: new Parquet with `deleted=True` → round-trips correctly | `backend/tests/test_parquet_repository.py` |
| 7 | `classify_lap()`: `deleted=True`, no yellow flag → `exclusion_reason="track_limits"`, `is_valid` unaffected | `backend/tests/test_session_analytics_filtering.py` |
| 8 | `classify_lap()`: `deleted=True` **and** yellow-flag `track_status` → `exclusion_reason="track_limits"` (precedence, §21) | `backend/tests/test_session_analytics_filtering.py` |
| 9 | `classify_lap()`: `deleted=False`, yellow-flag `track_status` → `exclusion_reason="yellow_flag"` unchanged (regression lock) | `backend/tests/test_session_analytics_filtering.py` |
| 10 | `classify_lap()`: `deleted=True`, `is_accurate=True` → `is_valid=True` (independence proof) | `backend/tests/test_session_analytics_filtering.py` |
| 11 | `filter_for_aggregate_stats()`: excludes a `track_limits` lap | `backend/tests/test_session_analytics_filtering.py` |
| 12 | `filter_valid_laps()`: does **not** exclude a `track_limits` lap (is_valid independence, aggregate-vs-valid distinction preserved) | `backend/tests/test_session_analytics_filtering.py` |
| 13 | API route: a session with a `track_limits` lap returns `exclusion_reason: "track_limits"` in `DriverLapMetrics` | `backend/tests/test_session_analytics_route.py` |
| 14 | `DriverLapTable`: renders `"(track_limits)"` for a lap with that `exclusion_reason` | `frontend/.../DriverLapTable.test.tsx` |

**14 new/modified test cases across 6 files.** No test is proposed for a combination ruled out by
real FastF1 semantics (e.g. `deleted_reason` populated while `deleted=False` — never observed, and
`normalize_laps()`'s own mapping makes it structurally impossible to produce).

## 24. Historical Backfill — Option B, No Change to `backfill_m38.py`

**No backfill in M40.** All 704 existing sessions (including the 332 M38-backfilled ones) will show
`deleted=None`/`deleted_reason=None` until re-ingested — exactly Option B, the strong default named
in the task. `backfill_m38.py` needs **no code change**: it calls the current `normalize_laps()`
pipeline via `FastF1Provider.load_session()` at whatever point in time it's invoked, so if it were
ever re-run after M40 ships, the new fields would be populated as a natural side effect of the
existing, unmodified code path — no genuine correctness issue was found that would require touching
it. A future milestone backfilling `Lap.deleted`/`deleted_reason` across the historical corpus,
mirroring M38's mechanism, is a plausible later candidate — explicitly not part of M40.

## 25. API Contract

One shared `Lap` model, two additive nullable fields, no new endpoint, no new route — route count
unchanged (still 21). Matches M36's precedent exactly: `deleted`/`deleted_reason` join `track_status`
on the same response model already returned by `GET /sessions/{id}/laps` and the session-analytics
routes.

## 26. Exact Stage C File List

**Definitely modified:**
- `pipeline/pitwall_pipeline/models.py`
- `pipeline/pitwall_pipeline/normalize.py`
- `pipeline/tests/fixtures.py`
- `pipeline/tests/test_normalize.py`
- `backend/app/models/telemetry.py`
- `backend/app/repositories/parquet_repository.py`
- `backend/app/services/session_analytics/filtering.py`
- `backend/tests/test_parquet_repository.py`
- `backend/tests/test_session_analytics_filtering.py`
- `backend/tests/test_session_analytics_route.py`
- `frontend/src/api/client.ts`
- `frontend/src/features/session-analytics/components/DriverLapTable.test.tsx`
- `docs/data-model.md`
- `docs/api-model.md`

**Conditionally modified (verify at Stage C, expected no-op):**
- `backend/app/models/session_analytics.py` — expected untouched, since `DriverLapMetrics` reuses `ExclusionReason` from `filtering.py` directly (confirmed by this investigation); only touch if Stage C finds a local redefinition.
- `frontend/src/features/session-analytics/components/DriverLapTable.tsx` — expected untouched (§22); only touch if Stage C finds the zero-JSX-change assumption wrong.

**Explicitly untouched:**
- `pipeline/pitwall_pipeline/backfill_m38.py`, `cache_writer.py`, `fastf1_provider.py`, `ingest.py`, `ingest_event.py`, `ingest_plan.py`
- `README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`, `docs/backlog.md`, `docs/architecture.md` — M40 is not a reconciliation milestone (§27)
- `docs/m9-design-review.md` and every other `m*-design-review.md`
- The 3 newly-found stale M35-applicability docstring instances (§17) and the README Roadmap-section finding (Stage A §2) — real, but unrelated to this milestone
- All ADRs, `data/`, PostgreSQL, dependencies

## 27. Documentation Impact — Minimal, No Reconciliation Pass

Only `docs/data-model.md` and `docs/api-model.md` need updating, mirroring the exact M35/M36 addition
pattern already used for `position`/`track_status` in those files' `Lap` bullet. `README.md`,
`CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`, and `docs/backlog.md` should remain
untouched by M40 itself — matching the established precedent that M34/M35/M36/M37/M38 never touched
these files directly; they were reconciled later, in bulk, by M39. M40 must not become another
documentation-reconciliation pass.

## 28. Validation Plan

- Pipeline: `pytest pipeline/tests/test_normalize.py` (new cases from §23), full `pytest` run for regressions.
- Backend: `pytest backend/tests/test_parquet_repository.py backend/tests/test_session_analytics_filtering.py backend/tests/test_session_analytics_route.py`, full `pytest` run for regressions.
- Frontend: `npx vitest run` for `DriverLapTable.test.tsx` plus full suite for regressions.
- Static: `ruff format --check`, `ruff check`, `mypy` (pipeline + backend); `tsc`, `eslint`, `prettier --check` (frontend); `git diff --check`.
- Targeted semantic verification: re-confirm `Deleted`/`DeletedReason` real values against a live cached session read-only (as this Stage B already did); confirm a real deleted lap reaches `exclusion_reason="track_limits"` through the full pipeline; confirm the yellow-flag-only and both-conditions cases produce the documented precedence; confirm `filter_for_aggregate_stats` excludes a `track_limits` lap from a real aggregate calculation.
- No live ingestion, no real Parquet writes, no PostgreSQL writes, no backfill — Stage C validates entirely against fixtures and read-only real-data inspection, matching M34–M37's own precedent (M38 was the only milestone in this family to touch real data, and only because backfilling was its explicit purpose).

## 29. Risks

- **`DeletedReason` semantic ambiguity**: the "always track_limits" mapping (§19.3) is empirically strong (17/17 sessions) but not a logical guarantee from FastF1's own free-text design — a future FastF1/F1-process change could introduce a different reason. Mitigated by persisting the raw `deleted_reason` text regardless, so a future correction wouldn't need a new backfill, only a re-classification pass.
- **Precedence judgment call** (§21): track_limits-over-yellow_flag is a product decision, not derived from evidence of which is "more correct" — flagged explicitly for sign-off before Stage C implements it.
- **Accidental `is_valid`/`exclusion_reason` conflation**: mitigated by construction — `classify_lap()`'s `is_valid` line is untouched, and test #10 (§23) directly proves independence.
- **Backward compatibility with M38's mixed corpus**: explicitly handled — `.get()`-based tolerance means the 332 backfilled and 372 non-backfilled sessions alike simply show `deleted=None` until a future re-ingestion, no crash, no silent wrong data.
- **Frontend label handling**: none — no label-mapping layer exists to get out of sync (§22).
- **FastF1 version behavior**: pinned at `3.8.3`, unchanged; no dependency change proposed.
- **Accidentally excluding legitimate laps**: the "exclude on `Deleted=True` alone" decision (§19.3) is the main correctness surface — mitigated by the 100%-consistent real evidence and by `deleted_reason` being preserved for audit if a false positive is ever found.
- **API contract expansion**: two additive nullable fields only, matching every prior milestone's expansion shape — no breaking change.

## 30. Acceptance Criteria (Stage C)

- Track-limits-deleted laps are correctly identified from FastF1 data (`Deleted=True` → `exclusion_reason="track_limits"`).
- Laps are analytically excluded through the existing `exclusion_reason` mechanism — no parallel filtering path.
- `is_valid` remains derived solely from `is_accurate`, proven by an explicit independence test.
- Existing yellow-flag exclusion behavior is unchanged (explicit regression test).
- Old Parquet (all 704 current sessions) remains readable, deserializing the two new fields as `None`.
- No historical backfill occurs in M40.
- No new endpoint or Parquet store is introduced.
- `DriverLapTable` displays `"track_limits"` correctly with no unnecessary UI change.
- All 14 tests in §23 pass; no test covers an evidence-contradicted combination.
- No unrelated technical debt, documentation reconciliation, or the 3 stale-docstring instances (§17) are bundled into this milestone.

## 31. Deviations from Stage A

None material. Stage A's candidate-level scope (§14 of the Stage A section above) is confirmed
accurate in every particular by this investigation — the only refinements are: (1) two fields
(`deleted` + `deleted_reason`) rather than an unstated count, now justified explicitly (§18); (2) the
exact precedence decision (§21), which Stage A correctly flagged as needing resolution rather than
prejudging; (3) an exact, closed test count (14, §23) rather than an open-ended "extend existing
patterns."

## 32. Stage B Stop Condition — Confirmed

`docs/m40-design-review.md` is the only modified file (this Stage B content appended to Stage A's).
No source file changed. No data file changed. No database writes. No ingestion/backfill. Nothing
staged, committed, or pushed. `docs/m9-design-review.md` untouched.

---

# Stage C — Implementation

Implemented exactly as designed in §17–§30, with one confirmed deviation (§34).

## 33. What Was Built

Two additive, nullable `Lap` fields (`deleted: bool | None`, `deleted_reason: str | None`) sourced
from FastF1's `Deleted`/`DeletedReason` columns — no new FastF1 call, no new Parquet file, no new
endpoint. `ExclusionReason` widened to `Literal["yellow_flag", "track_limits"]` in both
`filtering.py` (internal) and `session_analytics.py` (API-boundary, per §34). `classify_lap()` now
resolves `_track_limits_reason(lap) or _yellow_flag_reason(lap)` — `"track_limits"` wins when both
apply, `is_valid` unchanged (`lap.is_accurate` alone). `filter_valid_laps()`/`filter_for_aggregate_stats()`
required zero changes — both already operate generically on `classify_lap()`'s result.
`DriverLapTable.tsx` required zero change, confirmed by direct inspection before implementing.

## 34. Deviation from Stage B

**`backend/app/models/session_analytics.py` required a real code change**, contrary to Stage B §26's
"expected no-op" classification for this conditionally-modified file. Stage B's root-cause
investigation stated `DriverLapMetrics` "reuses `ExclusionReason` from `filtering.py` directly, no
separate response-only type" — direct inspection during Stage C found this was imprecise:
`session_analytics.py` independently **redefines** `ExclusionReason = Literal["yellow_flag"]` at its
own module level (line 18), per this file's own documented ADR-0009 anti-corruption-boundary rule
(API response models are never imported from the internal domain-service layer). This is not scope
creep — it is a necessary, foreseeable consequence of the exact designed change (the API response
model must accept `"track_limits"` or Pydantic/the type system would reject it), simply
misclassified by Stage B's investigation as a no-op. Widened to
`Literal["yellow_flag", "track_limits"]`, docstring updated to note it's kept in sync with
`filtering.py` by hand, not by import, matching the module's own stated boundary rule. No other file
outside Stage B's exact list required a change.

## 35. Exact Files Changed

**Source** (7): `pipeline/pitwall_pipeline/models.py`, `pipeline/pitwall_pipeline/normalize.py`,
`backend/app/models/telemetry.py`, `backend/app/models/session_analytics.py` (§34 deviation),
`backend/app/repositories/parquet_repository.py`, `backend/app/services/session_analytics/filtering.py`,
`frontend/src/api/client.ts`.

**Tests** (6): `pipeline/tests/fixtures.py`, `pipeline/tests/test_normalize.py`,
`backend/tests/test_parquet_repository.py`, `backend/tests/test_session_analytics_filtering.py`,
`backend/tests/test_session_analytics_route.py`,
`frontend/src/features/session-analytics/components/DriverLapTable.test.tsx`.

**Docs** (3): `docs/data-model.md`, `docs/api-model.md`, `docs/m40-design-review.md` (this file).

**Confirmed untouched**: `DriverLapTable.tsx` (zero JSX/logic change needed), `backfill_m38.py`,
`cache_writer.py`, `fastf1_provider.py`, `ingest.py`, `ingest_event.py`, `ingest_plan.py`,
`README.md`, `CHANGELOG.md`, `docs/prd.md`, `docs/success-metrics.md`, `docs/backlog.md`,
`docs/architecture.md`, `docs/m9-design-review.md`, all ADRs, `data/`, PostgreSQL, dependencies.

## 36. Test Results

12 new test cases (2 fewer than §23's estimate of 14 — the actual implementation needed no separate
test for `filter_valid_laps()` not excluding a track-limits lap beyond the one combined test already
covering it, and one other case naturally merged into an existing assertion): 2 pipeline
(`test_normalize.py`), 9 backend (2 `test_parquet_repository.py`, 6
`test_session_analytics_filtering.py`, 1 `test_session_analytics_route.py`), 1 frontend
(`DriverLapTable.test.tsx`) — all passing. Full-suite regression counts:

- **Pipeline**: 168 passed, 15 errors (all pre-existing, no-live-Postgres — unchanged category from before this milestone).
- **Backend**: 388 passed (exactly +9 over the pre-M40 baseline of 379, matching the 9 new backend test cases), 1 failed + 15 errors (all pre-existing, no-live-Postgres/`psycopg`-connection issues — unchanged category, confirmed unrelated to any file this milestone touched).
- **Frontend**: 569 passed across 86 files (exactly +1 over the pre-M40 baseline of 568).

## 37. Static Validation

`ruff format --check`, `ruff check`, `mypy` (pipeline + backend, both zero issues across every file,
not just the changed ones); `tsc -b --noEmit`, `eslint .` (full frontend), `prettier --check`
(changed files) — all clean. `git diff --check` clean.

## 38. Targeted Semantic Verification (§7 of the Stage C task)

Run directly against real `classify_lap()`, not only via the test suite:

| Case | Input | `is_valid` | `exclusion_reason` | Result |
|---|---|---|---|---|
| A | `deleted=False`, `track_status="1"` (clear) | `True` | `None` | ✓ |
| B | `deleted=True`, `track_status="1"` (clear) | `True` | `"track_limits"` | ✓ |
| C | `deleted=False`, `track_status="2"` (yellow) | `True` | `"yellow_flag"` | ✓ |
| D | `deleted=True`, `track_status="2"` (yellow) | `True` | `"track_limits"` | ✓ |
| E | `deleted=True`, `deleted_reason="SOMETHING UNEXPECTED ENTIRELY"` | — | `"track_limits"` | ✓ (proves no text-gating/fabrication — classification is on `deleted` alone) |
| F | `deleted=None`, `track_status=None` (old Parquet) | `True` | `None` | ✓ (also proven end-to-end via `test_list_laps_missing_deleted_columns_deserializes_to_none`, a real Parquet round-trip) |

All 6 cases passed exactly as designed.

## 39. Documentation Changes

`docs/data-model.md` and `docs/api-model.md`: `Lap` bullets extended with `deleted`/`deleted_reason`,
mirroring the exact `position`/`track_status` pattern already established for M35/M36, including the
precedence and `is_valid`-independence notes. `README.md`, `CHANGELOG.md`, `docs/prd.md`,
`docs/success-metrics.md`, `docs/backlog.md`, `docs/architecture.md` deliberately untouched — M40 is
not a reconciliation milestone, matching M34–M38's own precedent.

## 40. Stage C Stop Condition — Confirmed

No historical backfill occurred. No ingestion, database write, or real Parquet write occurred —
`backend/tests/test_parquet_repository.py`'s new cases write only to `tmp_path` fixtures; the
targeted semantic verification in §38 used in-memory `Lap` objects only. `backfill_m38.py` and every
file under `data/` are confirmed untouched (§35). `docs/m9-design-review.md` untouched. Nothing
staged, committed, or pushed.
