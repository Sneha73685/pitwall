# PitWall — M30 Design Review: Frontend Dependency / Security Remediation

**Status:** Design review — implementation follows in Stage C.
**Baseline:** M29 complete (`dfa9525b384ce6409daf5fc34126c79c997096ec`), shared strategy mapper shipped.

## 1. Baseline / Safety

- `HEAD` = `origin/main` = `dfa9525b384ce6409daf5fc34126c79c997096ec`, verified both directions.
- `git status --short --branch`: only the known pre-existing `docs/m9-design-review.md` diff.
- `git diff --cached --stat`: empty.
- `docs/m30-design-review.md` did not exist before this file was written.
- No `package.json`, `package-lock.json`, config, source, or test file has been modified. Every command run in this stage was read-only: `npm audit` / `npm audit fix --dry-run` (dry-run explicitly does not write), `npm view` (registry metadata queries only), `grep`/`cat`, and two `WebSearch`/`WebFetch` calls for public migration-guide/changelog text (no repo interaction).

## 2. Exact Current Dependency State

From `frontend/package.json` (declared) and `frontend/package-lock.json` (installed, resolved):

| Package | Declared range | Installed |
|---|---|---|
| react | `^18.3.0` | (unaffected — not in audit output) |
| react-dom | `^18.3.0` | (unaffected — not in audit output) |
| react-router-dom | `^6.30.4` | 6.30.4 |
| react-router (transitive, via react-router-dom) | — | 6.30.4 |
| @remix-run/router (transitive, via react-router-dom) | — | 1.23.3 |
| vite | `^5.4.0` | 5.4.21 |
| vitest | `^2.0.0` | 2.1.9 |
| @vitest/mocker (transitive, via vitest) | — | 2.1.9 |
| vite-node (transitive, via vitest) | — | 2.1.9 |
| esbuild (transitive, via vite) | — | 0.21.5 |
| @vitejs/plugin-react | `^4.3.0` | 4.3.0 |
| echarts | `^5.5.0` | 5.6.0 |
| eslint | `^9.9.0` | 9.39.5 |
| @eslint/js | `^9.9.0` | (installed, unaffected) |
| js-yaml (transitive) | — | 4.3.0 |
| nanoid (transitive) | — | 3.3.16 |
| brace-expansion (transitive, multiple copies in the tree) | — | 5.0.8 / 1.1.16 |

Node/npm: local `node --version` = v26.5.1, `npm --version` = 11.17.0. No `engines` field in `frontend/package.json`. CI (`.github/workflows/ci.yml:123`) and `frontend/Dockerfile` both pin **Node 22**.

## 3. Vulnerability → Remediation Table

Fresh `npm audit --json` (11 total: 4 high, 6 moderate, 1 critical) cross-referenced against `npm audit fix --dry-run` (read-only) and direct `npm view` queries of the advisory ranges:

| Package | Severity | Direct/transitive | Installed | Fix requires |
|---|---|---|---|---|
| react-router-dom | moderate | direct | 6.30.4 | **6.30.6 — patch, no major bump** |
| react-router | moderate | transitive | 6.30.4 | 6.30.6 — follows react-router-dom |
| @remix-run/router | (bundled fix) | transitive | 1.23.3 | 1.23.4 — follows react-router-dom |
| js-yaml | high | transitive | 4.3.0 | **4.3.1 — patch, no major bump** |
| nanoid | high | transitive | 3.3.16 | **3.3.18 — patch, no major bump** |
| brace-expansion | high | transitive (3 copies) | 5.0.8 / 1.1.16 | **5.0.9 / 1.1.18 — patch, no major bump** |
| echarts | moderate | direct | 5.6.0 | **6.1.0 — major bump required; fix range is `<6.1.0`, no 5.x patch exists** |
| vite | high | direct | 5.4.21 | **≥6.4.3 — major bump required** (3 vite-specific advisories, see below) |
| esbuild | moderate | transitive (via vite) | 0.21.5 | resolved automatically once vite ≥6.2.0 (bundles esbuild `^0.25.0`, which fixes GHSA-67mh-4wv8-2f99) |
| vite-node | moderate | transitive (via vitest) | 2.1.9 | resolved automatically once vitest ≥3.x (which requires vite ≥6) |
| @vitest/mocker | moderate | transitive (via vitest) | 2.1.9 | resolved automatically once vitest ≥3.x |
| vitest | **critical** | direct | 2.1.9 | **≥3.2.7 — major bump required, forced by vite's own major bump (see §5)** |
| eslint / @eslint/* | — | — | 9.39.5 | **no vulnerability currently reported at all — no change required** |

**Correction to Stage A's inherited assumption (from `docs/backlog.md`)**: ESLint is not implicated in the current audit in any way — `grep`-level inspection of the fresh JSON confirms zero `eslint`/`@eslint/*`/`minimatch` entries. The backlog's "ESLint 9→10" line was accurate at some earlier point but is stale now; **ESLint is out of scope for M30** (see §6, §15).

**Critical vulnerability (`vitest`, CVE via `@vitest/mocker`/`vite`/`vite-node` chain)**: arbitrary file read/execute when the Vitest UI server is listening — dev/test tooling only, never shipped to users, but real for anyone running the test suite locally with the UI server open. Eliminating it **does** require a major bump (vitest 2→3, forced by the vite major bump below) — there is no way to patch it within vitest 2.x, since `vitest@2.1.9` pins `vite: ^5.0.0` and vite 5.x has no fix for its own advisories (§ below). **"npm audit clean" without any major bump is not achievable** — but it needs only two coordinated majors (vite 5→6, vitest 2→3), not the four Stage A tentatively named, and not the "vite 8 / vitest 4" jump `npm audit fix --force`'s automatic resolver proposes (it picks the newest major that resolves, not the nearest one — see §5).

## 4. React Router Migration Analysis

Fresh grep of every `react-router-dom` import across `frontend/src` (excluding tests): only classic declarative-mode APIs are used — `BrowserRouter` (`main.tsx`), `Routes`/`Route`/`Link` (`App.tsx`), `NavLink` (`Sidebar.tsx`), `useParams`, `useSearchParams`, `useNavigate`, `useLocation`, `useNavigationType`. **No `createBrowserRouter`, no data router, no `loader`/`action` API anywhere** (a `loader:`/`action:` grep hit inside `useEChartsInstance.ts`/`useCursorSync.ts` is an unrelated ECharts event-payload field name, not React Router).

- The moderate vulnerability (`GHSA-wrjc-x8rr-h8h6`, open redirect via backslash in `<Link>`/`useNavigate`) is fixed in **6.30.6**, a pure patch release — confirmed via the project's own changelog (fetched fresh): *"Fix double slash normalization for `useNavigate` colon urls"*, with one documented caveat only relevant to apps that call `navigate()` with **external** URLs. PitWall does not: every `Link to=...`/`useNavigate(...)` target in this codebase is built from the app's own API data (`session_id`/`driver_id`/`season`), never a user-supplied or external URL (confirmed by the same reasoning already on record in `docs/backlog.md`'s existing write-up of this CVE).
- **React Router 7 is not required to eliminate this vulnerability.** No source change is needed at all — this is a lockfile-level patch bump within the existing `^6.30.4` semver range already declared in `package.json` (6.30.6 already satisfies `^6.30.4`).
- Since no v6→v7 move is happening, the compatibility-mode/data-router questions in the brief are moot for this milestone; noted for the record only: a future v7 migration would be a real, non-trivial redesign (v7's default mode assumes a data router), not a drop-in bump — should it ever become necessary for an unrelated reason, it deserves its own milestone.

## 5. Vite / Vitest Migration Analysis

**Why a major bump is unavoidable**: `vite`'s own advisory set includes three vite-specific CVEs, not just the inherited `esbuild` one — fetched fresh from the audit JSON's `via` array:

| Advisory | Severity | Vulnerable range |
|---|---|---|
| GHSA-4w7w-66w2-5vf9 — path traversal in optimized-deps `.map` handling | moderate | `<=6.4.1` |
| GHSA-v6wh-96g9-6wx3 — `launch-editor` NTLMv2 hash disclosure (Windows-only) | moderate | `<=6.4.2` |
| GHSA-fx2h-pf6j-xcff — `server.fs.deny` bypass on Windows alternate paths | high | `<=6.4.2` |
| (inherited) GHSA-67mh-4wv8-2f99 — esbuild dev-server request forwarding | moderate | esbuild `<=0.24.2` |

The **currently installed 5.4.21 is the latest 5.x release and is still inside every one of these vulnerable ranges** — there is no 5.x patch that fixes any of them. Two of the three vite-specific CVEs are Windows-only (irrelevant to this project's macOS/Linux dev and CI environment, but npm audit reports them regardless of host OS); the high-severity `server.fs.deny` bypass is also Windows-scoped per its advisory title. Real-world exposure for this project's actual environment is lower than the raw severity count suggests, but the fix is free (no functional behavior change), so there's no reason to accept the risk.

**Minimal fix target: `vite@6.4.3`** (latest stable 6.x), not `vite@8.2.1`. Verified via `npm view vite@<version> dependencies.esbuild` across the 5.x/6.x/7.x lines: vite 6.2.0+ already bundles `esbuild ^0.25.0` (fixed), and 6.4.3 is past all three vite-specific advisory ranges. `npm audit fix --force`'s automatic suggestion of 8.2.1 is not the nearest fix — it's simply the newest major npm's resolver found compatible with a full-force upgrade of the whole tree; the actual nearest fixed major is 6.

**Why vitest must move too, and why 3.x (not 4.x)**: `vitest@2.1.9` declares `"vite": "^5.0.0"` as a hard dependency — it **cannot** resolve to vite 6 at all while pinned to vitest 2.x, which is why bumping vite alone is impossible without also bumping vitest. Checked each vitest major's own `vite` dependency range directly:
- `vitest@3.0.0`: `vite: ^5.0.0 || ^6.0.0`
- `vitest@3.2.7` (latest stable 3.x): `vite: ^5.0.0 || ^6.0.0 || ^7.0.0-0`
- `vitest@4.1.11`: `vite: ^6.0.0 || ^7.0.0 || ^8.0.0` (drops 5.x support entirely)

**Minimal fix target: `vitest@3.2.7`**, not `vitest@4.1.11`. Vitest 3.x is fully compatible with vite 6.4.3 and requires no vite 8 jump. `@vitest/mocker` and `@vitest/runner`/`@vitest/spy`/`@vitest/utils`/`@vitest/expect`/`@vitest/snapshot` all move in lockstep with vitest's own version (confirmed via `npm view vitest@3.2.7 dependencies` — all pinned to `3.2.7`); `vite-node` moves alongside at `3.2.4` (vitest's own dependency pin, not an exact version match but resolved automatically as a transitive dependency, not declared directly in `package.json`).

**`@vitejs/plugin-react` must move too**, but only within its 4.x line: the installed `4.3.0` declares `peerDependencies.vite: "^4.2.0 || ^5.0.0"` — incompatible with vite 6. Checked each 4.x patch/minor directly: **`@vitejs/plugin-react@4.4.0`** is the first version whose peer range includes `^6.0.0`; **`4.7.0`** (latest stable 4.x) extends that to `^7.0.0` too. This is a **minor** version bump (4.3.0 → 4.7.0), not a major one — no plugin-react API change expected.

**Config/breaking-change review** (`frontend/vite.config.ts`, read in full): a minimal config — `plugins: [react()]`, a dev-server port, and the `test` block (`environment: "jsdom"`, `globals: true`, `setupFiles`). Vite 6's documented breaking changes (checked against the official migration notes via `WebSearch`): dropped Node 21 support (irrelevant — CI/Docker both pin Node 22), a new opt-in Environment API (not used here), changed default `resolve.conditions` (not set in this config, so the new defaults apply cleanly — no existing explicit value to conflict with), Module Runner API rename (not used here), and a library-mode CSS filename change (PitWall's frontend is an app build, not a library — not applicable). **No breaking Vite 6 change identified as touching this specific config.**

## 6. ESLint Migration Analysis

No change proposed. `eslint@9.39.5` and every `@eslint/*` package currently installed are absent from the fresh vulnerability list entirely (§3). `docs/backlog.md`'s original "ESLint 9→10" line was written when the `eslint`/`@eslint/config-array`/`@eslint/eslintrc`/`minimatch` cluster was still vulnerable (per the backlog's own historical write-up); that cluster has since been resolved by transitive updates already present in the current lockfile (independently confirmed as far back as M29's audit, re-confirmed here). `frontend/eslint.config.js` (read in full) is already flat-config format — no format migration would even be needed if ESLint 10 were ever pursued later, but there is no security reason to do so now.

## 7. ECharts Migration Analysis

**Required**: `echarts@5.6.0` → `echarts@6.1.0` (the exact minimum fixed version — the advisory range is `<6.1.0`, and 6.1.0 is also the latest stable 6.x release, so there is no "how far to go" question here).

Usage audit (fresh grep, 21 files touch `echarts` across `frontend/src`, excluding tests): PitWall exclusively uses the **modular `echarts/core` import pattern** — `import * as echarts from "echarts/core"`, explicit `echarts.use([...])` chart/component/renderer registration (`LineChart`, `BarChart`, `BoxplotChart`, `ScatterChart` from `echarts/charts`; `GridComponent`, `TooltipComponent`, `LegendComponent` etc. from `echarts/components`; `CanvasRenderer` from `echarts/renderers`), never the full bundled `echarts` package or its legacy global API. This is the pattern ECharts itself documents as the forward-compatible, tree-shaken usage style.

Per the official v6 upgrade guide (checked via `WebSearch`): *"In most cases, developers do not need to do anything extra for this upgrade... echarts has always tried to keep the API stable and backward compatible."* The two changes actually called out are **default-value changes**, not API removals: the default legend position moves to the bottom of the canvas, and an anti-overflow/anti-overlap layout mechanism is now on by default for Cartesian axes (can shift axis label position slightly if a chart's labels previously overflowed). PitWall's own `*ChartOptions.ts` builder files (e.g. `deltaChartOptions.ts`, `driverRankingChartOptions.ts`, `lapTimeTrendChartOptions.ts`) already construct explicit `grid`/`legend`/axis option objects per chart rather than relying on library defaults (confirmed by the existing option-builder unit tests in `frontend/src/features/*/components/*ChartOptions.test.ts`, which assert on the exact option shape each builder returns) — this substantially limits the default-value-change risk, but each chart surface should still get a visual check in Stage C, not just a unit-test pass, since a snapshot-style option test can't catch a rendering/legend-position regression.

**Chart surfaces requiring visual verification in Stage C**: track-map telemetry channels (`TelemetryCharts.tsx`), lap-comparison delta chart (`DeltaChart.tsx`), session-analytics driver ranking + pace distribution (`DriverRankingChart.tsx`, `PaceDistributionChart.tsx`), tyre-performance stint pace / compound distribution / compound lap trend / driver compound comparison (four chart components), and the season pace-trend chart (`SeasonPaceTrendChart.tsx`) — every one of the 21 files found in the usage grep.

## 8. Dependency Graph / Package-Manager Strategy

**Chosen strategy: C — staged, sequential groups within a single Stage C pass**, not a single blind `--force`, not four independent milestones. Three groups, ordered from zero-risk to highest-risk:

1. **Transitive/patch-only fixes** — `react-router-dom`/`react-router`/`@remix-run/router` (6.30.4→6.30.6), `js-yaml` (4.3.0→4.3.1), `nanoid` (3.3.16→3.3.18), `brace-expansion` (→5.0.9/1.1.18). None of these need a `package.json` range change (`react-router-dom`'s declared `^6.30.4` already permits 6.30.6; the rest are transitive, not declared directly at all) — this group is achievable with plain `npm audit fix` (**no `--force`**), confirmed via the read-only `--dry-run` in §2's investigation.
2. **Vite/Vitest/plugin-react coordinated bump** — `vite` (^5.4.0→^6.4.3), `vitest` (^2.0.0→^3.2.7), `@vitejs/plugin-react` (^4.3.0→^4.7.0). These three cannot be separated: vitest's own `vite` dependency range is what forces the vite version, and plugin-react's peer range is what makes the resulting vite version installable at all. This must land as one coordinated `package.json` edit, validated together.
3. **ECharts bump** — `echarts` (^5.5.0→^6.1.0). Fully independent of groups 1–2 (no shared dependency), can be validated in isolation (chart rendering only), and reverted independently if it alone causes a problem.

Explicit answers to the brief's specific questions:
- **Is plain `npm audit fix` (no `--force`) sufficient?** Only for group 1. It is *not* sufficient for the vite/vitest/echarts vulnerabilities — confirmed directly: the dry-run's own remaining-vulnerability report after the auto-applied fixes still lists `echarts`, `esbuild`, `vite`, `vite-node`, `@vitest/mocker`, `vitest`, all flagged `fix available via npm audit fix --force`.
- **Are selective direct upgrades sufficient (vs. blanket `--force`)?** Yes — precisely the point of this section. `--force`'s own resolver over-shoots to vite 8/vitest 4/echarts 6.1.0 (echarts happens to match; vite/vitest don't) purely because it re-resolves the whole tree to its newest mutually-compatible major set, not the nearest fix. Declaring the three specific target versions directly in `package.json` (rather than running `--force` and accepting whatever it picks) achieves the same security outcome with two majors instead of four candidate majors, and Node/CI compatibility, ECharts option-builder tests, and React Router usage all specifically checked against those three chosen targets rather than whatever a blind `--force` run would have landed on.
- **Are overrides/resolutions appropriate?** No — none are needed. Every fix path above is a normal, first-class version bump of a package that is either declared directly in `package.json` or resolves cleanly as an ordinary transitive dependency once its parent is bumped. An override would only be justified if a vulnerable transitive package couldn't be reached by bumping its direct parent, which isn't the case here.

## 9. Node / CI / Build Environment

- `frontend/package.json` has no `engines` field.
- CI (`.github/workflows/ci.yml:123`) and `frontend/Dockerfile` (`FROM node:22-slim`) both already pin **Node 22**.
- Vite 6's Node requirement (checked via `WebSearch` against the official announcement): Node 18, 20, or 22+, with Node 21 explicitly dropped. **Node 22 is fully supported — no Node version change of any kind is required or implied by this milestone.**
- Vitest 3.x has no stricter Node requirement than Vite 6 already implies.
- **No Node/CI/Docker file needs to change.** This is a pure `npm`-level dependency change.

## 10. Runtime vs. Dev-Tooling Risk

| Change | Classification | Risk |
|---|---|---|
| `react-router-dom`/`react-router`/`@remix-run/router` 6.30.4→6.30.6 | Runtime (navigation) | Very low — patch-only, no API change, confirmed via upstream changelog |
| `echarts` 5.6.0→6.1.0 | Runtime (charting) | Low-moderate — default-value changes only per official guide, needs visual verification across 21 chart-touching files (§7) |
| `vite` 5.4.21→6.4.3 | Build tooling (dev server + production bundling) | Moderate — config reviewed and clean (§5), but this is the single largest surface change in the milestone |
| `@vitejs/plugin-react` 4.3.0→4.7.0 | Build tooling | Low — minor version, peer-range-only reason for bumping |
| `vitest`/`@vitest/mocker`/`vite-node` 2.1.9→3.2.7 | Test tooling | Low-moderate — forced by the vite bump, not by choice; existing 549-test suite is the direct regression net |
| `js-yaml`/`nanoid`/`brace-expansion` | Transitive-only | Negligible — no direct usage anywhere in PitWall's own code |
| `eslint`/`@eslint/*` | — | **No change** |

**A phased strategy is safer and is what §8 already proposes.** The two genuinely runtime-risk items (React Router, ECharts) are also the two lowest-technical-risk changes (a patch bump and a default-values-only major, respectively) — the highest technical risk (Vite major bump) is confined to build/test tooling, where the existing 386+549 automated tests plus a production build provide strong, fast, automated signal before anything reaches a browser.

## 11. Validation Plan (for Stage C)

Minimum required, run after **each** of the three groups in §8 lands (not just once at the end), then once more altogether:

1. `npm audit` — after group 1: expect the vite/vitest/echarts-chain vulnerabilities only (7 of 11) to remain; after groups 2+3: expect **0**.
2. `npx vitest run` — full existing suite, expect **549 passed** (no test added/removed by this milestone).
3. `npx tsc --noEmit` — must stay clean.
4. `npx eslint .` — must stay clean (no ESLint version change, so this is a pure regression check).
5. `npm run build` (`tsc -b && vite build`) — **not currently run in CI at all** (confirmed: no `npm run build`/`vite build` step exists anywhere in `.github/workflows/ci.yml`); Stage C must run it manually since it's the most direct signal for a Vite-major-bump regression that unit tests can't see (bundling, `resolve.conditions` defaults, asset handling).
6. Backend regression: **not needed** — this milestone touches zero backend files and zero API contracts; §5/§7's findings confirm no server-side implication.
7. Browser smoke tests (manual, dev server): app boot (`/`), one full navigation path through Seasons→Events→Sessions→Driver→Lap, one chart-heavy page (session analytics — exercises `BarChart`/`BoxplotChart`), one comparison page (`/laps/compare` — exercises `useSearchParams` + the delta chart's `LineChart`/`CanvasRenderer`), one telemetry/track-map page (exercises cursor-sync's `echarts/core` `Payload` typing, the one place `echarts/core` types are consumed outside a chart component itself, per `useCursorSync.ts`/`useEChartsInstance.ts`).
8. No new automated test is needed for the React Router bump (pure patch, no behavior change in scope). If Stage C's chart visual check reveals an actual legend/axis-position regression under ECharts 6's new defaults, a targeted assertion in the relevant `*ChartOptions.test.ts` may be warranted — but only reactively, not preemptively.

## 12. Backlog Reconciliation Decision

**Option B — update `docs/backlog.md` only once the security debt is actually resolved, and only in Stage C (after implementation + validation succeed), not now.** Rationale: the backlog entry currently describes a task; once M30 ships, that task is either fully done (all 11 resolved) or partially done (if Stage B's scope is later narrowed further) — writing the correction now, before any code has changed, would be describing work that hasn't happened yet, and Stage B is explicitly told not to perform any edit. This also deliberately stays a single-item correction, not an M28-style full documentation reconciliation pass (README's "Current milestone" line and `docs/prd.md` §3a still don't mention M28/M29 either, per M30 Stage A §2 — that gap is real but explicitly out of scope for this dependency-focused milestone and belongs to a future dedicated reconciliation pass).

## 13. Milestone Scope

**Definitely required:**
- `frontend/package.json` — version bumps for `react-router-dom`, `vite`, `vitest`, `@vitejs/plugin-react`, `echarts`
- `frontend/package-lock.json` — regenerated lockfile (all direct + transitive changes in §3/§8)
- `docs/backlog.md` — one-item correction (§12), applied only after the upgrade is verified working, not before

**Conditionally required, depending on Stage C's actual verification results:**
- Any `*ChartOptions.ts`/chart component file, *only if* the ECharts 6 default-value changes (§7) produce a visible regression that needs an explicit option override to restore prior behavior — not expected, but the file set (21 files, listed in §7) is the bound if it happens.
- `frontend/vite.config.ts`, *only if* Stage C's production build surfaces a `resolve.conditions`-default-related issue — not expected per §5's config review, but named as the one Vite-6-specific config risk.

**Explicitly forbidden / out of scope:**
- `frontend/eslint.config.js` or any `eslint`/`@eslint/*` package version (§6 — no vulnerability, no reason to touch)
- Any React Router **source** file — the fix is a lockfile-only patch bump, zero source changes (§4)
- Any backend, pipeline, or data/schema file — this is a pure frontend dependency change with zero API-contract implication (verified in §5/§11)
- `README.md`, `CHANGELOG.md`, `docs/prd.md` §3a — the separate, already-identified M28/M29 documentation gap stays out of this milestone (§12)
- `.github/workflows/ci.yml`, any `Dockerfile` — no Node-version change is required (§9)
- No `overrides`/`resolutions` block in `package.json` (§8 — none needed)

No unexpected backend/data/pipeline/schema contract dependency was discovered during this audit — nothing to stop and report on that front.

## 14. Risk / Rollback Plan

- **Highest-risk migration**: the Vite 5→6 bump (forces the Vitest 2→3 bump alongside it). It's the largest surface change and the one place a config-level or build-level regression could hide from unit tests.
- **Likely failure modes**: (a) a production build (`vite build`) failure or altered output the test suite can't see — mitigated by making `npm run build` a mandatory Stage C gate even though CI doesn't currently run it; (b) an ECharts 6 default-value change producing a visibly different chart — mitigated by the explicit per-surface visual check list in §11; (c) an unexpected peer-dependency conflict during `npm install` after the `package.json` edit — mitigated by having already confirmed every peer range directly via `npm view` in this stage, before proposing the targets.
- **Staged internally, not atomically**: implement and validate the three groups from §8 in sequence within Stage C (patch-only fixes → vite/vitest/plugin-react → echarts), each with its own `npm audit`/test/build check, so a failure is immediately attributable to one group rather than requiring a bisection across an all-at-once change. Per the user's own instruction, this does **not** mean separate git commits during Stage C unless explicitly approved later — it means separate validation checkpoints within the same working session before anything is staged.
- **When a proposed upgrade should be judged too risky for M30**: if, after landing group 2 (vite/vitest/plugin-react), `npm run build` fails or the full test suite regresses in a way not resolvable by a config-only fix (i.e. would require touching application source beyond what §13's "conditionally required" list anticipates) — that is the signal to stop, report the specific failure, and ask whether to scope group 2 down (e.g. stay on vite 6 patch releases only, revisit vitest separately) rather than silently expanding the file scope to fix it.
- **Rollback strategy**: since Stage C's baseline before any change is the current, clean `HEAD == origin/main` with nothing staged, a failed validation at any stage rolls back with `git checkout -- frontend/package.json frontend/package-lock.json` (and any conditionally-touched file) plus `npm install` to restore `node_modules` to the pre-upgrade lockfile state — no commit will have been made yet, so no `git revert`/history rewrite is ever needed for a Stage-C-internal failure.

## 15. Explicit Non-Goals

- No ESLint version change (§6).
- No React Router major-version migration (§4).
- No Vite 7 or Vite 8 adoption — 6.4.3 is the target (§5).
- No Vitest 4 adoption — 3.2.7 is the target (§5).
- No `overrides`/`resolutions` in `package.json` (§8).
- No Node/CI/Docker version change (§9).
- No backend, pipeline, or data/schema change.
- No M28-style full documentation reconciliation (§12) — only the one backlog line this milestone directly resolves.
- No new automated test added preemptively (§11) — only if Stage C's own verification surfaces a real regression worth asserting on.

## 16. Final Recommendation

Proceed with the **narrowed** scope this stage discovered, not Stage A's four-major assumption:

- **Group 1 (patch-only, near-zero risk)**: `react-router-dom` → 6.30.6, plus the transitive `js-yaml`/`nanoid`/`brace-expansion` fixes — via plain `npm audit fix` (no `--force`).
- **Group 2 (coordinated major, moderate risk, confined to build/test tooling)**: `vite` → 6.4.3, `vitest` → 3.2.7, `@vitejs/plugin-react` → 4.7.0.
- **Group 3 (isolated major, low-moderate runtime risk)**: `echarts` → 6.1.0.

Expected security outcome: **0 remaining `npm audit` findings** (down from 11: 4 high, 6 moderate, 1 critical — including full resolution of the one critical, `vitest`). No ESLint change, no React Router major, no Vite 8/Vitest 4 over-shoot.

## 17. Deviations from Stage A

Stage A's recommendation named "known major-version migration areas" of ESLint 9→10, Vite 5→8, ECharts 5→6, React Router 6→7 — inherited from `docs/backlog.md`'s original (now stale) framing, and Stage A explicitly flagged this as needing fresh verification before Stage C. Fresh evidence in this stage **narrows that to two required majors** (Vite 5→6, Vitest 2→3, paired) plus one already-required major (ECharts 5→6), and **eliminates two of Stage A's four assumed majors entirely**:
- **ESLint 9→10: dropped.** No vulnerability currently implicates any ESLint package (§3, §6).
- **React Router 6→7: dropped.** The vulnerability is fixed by a patch release within v6; no major migration is needed or justified (§4).
- **Vite 5→8: narrowed to Vite 5→6.** The true minimal fixed version is 6.4.3, not 8.2.1 — npm's `--force` resolver over-shoots to the newest mutually-compatible major rather than the nearest fix (§5).
- **Vitest (not named directly by Stage A, but implied by the Vite bump): narrowed to 2→3, not 2→4.**
- ECharts 5→6 is unchanged from Stage A's assumption — confirmed genuinely required, no smaller fix exists (§3, §7).

This is a significant, evidence-based reduction in blast radius from what Stage A tentatively scoped — exactly the outcome Stage B was commissioned to determine.

---

**STOP — awaiting explicit approval before Stage C.**
