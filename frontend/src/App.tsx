import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/client";
import { AppShell } from "./components/AppShell";
import { StatusChip } from "./components/StatusChip";
import { DriverPaceTrendComparisonPage } from "./features/driver-trends/DriverPaceTrendComparisonPage";
import { DriverSeasonPaceTrendPage } from "./features/driver-trends/DriverSeasonPaceTrendPage";
import { DriverSeasonTyreTrendPage } from "./features/driver-trends/DriverSeasonTyreTrendPage";
import { DriverTyreTrendComparisonPage } from "./features/driver-trends/DriverTyreTrendComparisonPage";
import { ComparisonPage } from "./features/lap-comparison/ComparisonPage";
import { StrategyPage } from "./features/race-context/StrategyPage";
import { SessionAnalyticsPage } from "./features/session-analytics/SessionAnalyticsPage";
import { DriverSelectPage } from "./features/session-select/DriverSelectPage";
import { EventListPage } from "./features/session-select/EventListPage";
import { LapSelectPage } from "./features/session-select/LapSelectPage";
import { SeasonListPage } from "./features/session-select/SeasonListPage";
import { SessionListForEventPage } from "./features/session-select/SessionListForEventPage";
import { StintComparisonPage } from "./features/stint-comparison/StintComparisonPage";
import { TrackMapPage } from "./features/track-map/TrackMapPage";
import { StintPacePage } from "./features/tyre-performance/StintPacePage";
import { TyrePerformancePage } from "./features/tyre-performance/TyrePerformancePage";
import { useSelectionStore } from "./state/selectionStore";
import styles from "./App.module.css";

type BackendStatus = "checking" | "online" | "offline";

/**
 * Routing for the session -> driver -> lap -> track map flow (ADR-0010),
 * plus the M6 comparison route, the M8 session-analytics route, and the
 * M10 strategy route. "/sessions/:sessionId/analytics" (plural, matching
 * every other route here) renders SessionAnalyticsPage, owning its own
 * state independently of driverId/lapNumber params.
 * "/sessions/:sessionId/drivers/:driverId/strategy" is driver-scoped, at
 * the same route depth as the track-map route, since stints are fetched
 * per driver (docs/m10-implementation-plan.md Phase 5).
 *
 * M13 (docs/m13-design-review.md §4/§6): ComparisonPage moves to the
 * standalone "/laps/compare" -- no longer nested under
 * "/sessions/:sessionId", since neither compared lap's session is
 * privileged once both are independently selectable. ComparisonPage reads
 * its session/driver/lap selections from query params and local state
 * instead of a route param.
 *
 * M11 Phase 4 adds "/sessions/:sessionId/tyre-performance" (session-wide,
 * same depth as "/analytics") and
 * "/sessions/:sessionId/drivers/:driverId/stint-pace" (driver-scoped, same
 * depth as "/strategy") -- descriptive tyre/stint analytics, following the
 * exact route-depth conventions already established by M8/M10
 * (docs/m11-frontend-design-note.md §5).
 *
 * M12 Phase 5 replaces the old flat, all-sessions root page with a real
 * Season -> Event -> Session hierarchy: "/" (seasons), "/seasons/:season"
 * (events), "/seasons/:season/events/:eventId" (sessions) -- all three
 * reflecting only what PitWall actually has locally ingested (M12 Phase 4's
 * discovery API), never fabricating a session that hasn't been ingested.
 * Everything from "/sessions/:sessionId" onward is unchanged
 * (docs/m12-frontend-design-note.md).
 *
 * M15 adds the standalone "/stints/compare" (docs/m15-design-review.md §4/§7)
 * -- top-level, not nested under "/sessions/:sessionId", mirroring
 * "/laps/compare"'s own M13 rationale: neither compared side is privileged.
 *
 * M17 adds the standalone "/drivers/:driverId/seasons/:season/pace-trend"
 * (docs/m17-design-review.md §7) -- top-level, since it's season-scoped,
 * not session-scoped; mirrors the same "doesn't fit the /sessions/:sessionId
 * nesting" reasoning M13/M15 already established for their own top-level
 * routes.
 *
 * M21 adds the sibling standalone "/drivers/:driverId/seasons/:season/tyre-trend"
 * (docs/m21-design-review.md §7) -- same top-level, season-scoped reasoning
 * as M17's pace-trend route.
 *
 * M25 adds "/drivers/pace-trend/compare" (docs/m25-design-review.md §6) --
 * two-driver cross-season pace-trend comparison, identical path string to
 * the backend route it calls (matching /laps/compare's and /stints/compare's
 * own frontend/backend path-identity precedent).
 *
 * M26 adds the sibling "/drivers/tyre-trend/compare" (docs/m26-design-
 * review.md §7) -- two-driver cross-season tyre-trend comparison, same
 * path-identity convention as M25's own route.
 */
function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const sessionId = useSelectionStore((state) => state.sessionId);

  useEffect(() => {
    getHealth()
      .then(() => setBackendStatus("online"))
      .catch(() => setBackendStatus("offline"));
  }, []);

  const statusTone =
    backendStatus === "online" ? "positive" : backendStatus === "offline" ? "error" : "neutral";

  return (
    <AppShell
      header={
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.wordmark}>
              <Link to="/">PitWall</Link>
            </h1>
            <p className={styles.tagline}>
              An unofficial, fan-made Formula 1 race engineering platform. Not affiliated with
              Formula 1, FOM, or any team.
            </p>
          </div>
          <div className={styles.headerStatus}>
            <p data-testid="backend-status" className={styles.statusLine}>
              Backend status: <StatusChip tone={statusTone}>{backendStatus}</StatusChip>
            </p>
            <p data-testid="selected-session" className={styles.statusLine}>
              Selected session: {sessionId ?? "none"}
            </p>
          </div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<SeasonListPage />} />
        <Route path="/seasons/:season" element={<EventListPage />} />
        <Route path="/seasons/:season/events/:eventId" element={<SessionListForEventPage />} />
        <Route path="/sessions/:sessionId" element={<DriverSelectPage />} />
        <Route path="/sessions/:sessionId/drivers/:driverId" element={<LapSelectPage />} />
        <Route
          path="/sessions/:sessionId/drivers/:driverId/laps/:lapNumber"
          element={<TrackMapPage />}
        />
        <Route path="/laps/compare" element={<ComparisonPage />} />
        <Route path="/stints/compare" element={<StintComparisonPage />} />
        <Route path="/sessions/:sessionId/analytics" element={<SessionAnalyticsPage />} />
        <Route path="/sessions/:sessionId/drivers/:driverId/strategy" element={<StrategyPage />} />
        <Route path="/sessions/:sessionId/tyre-performance" element={<TyrePerformancePage />} />
        <Route
          path="/sessions/:sessionId/drivers/:driverId/stint-pace"
          element={<StintPacePage />}
        />
        <Route
          path="/drivers/:driverId/seasons/:season/pace-trend"
          element={<DriverSeasonPaceTrendPage />}
        />
        <Route
          path="/drivers/:driverId/seasons/:season/tyre-trend"
          element={<DriverSeasonTyreTrendPage />}
        />
        <Route path="/drivers/pace-trend/compare" element={<DriverPaceTrendComparisonPage />} />
        <Route path="/drivers/tyre-trend/compare" element={<DriverTyreTrendComparisonPage />} />
      </Routes>
    </AppShell>
  );
}

export default App;
