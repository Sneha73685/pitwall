import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/client";
import { AppShell } from "./components/AppShell";
import { StatusChip } from "./components/StatusChip";
import { ComparisonPage } from "./features/lap-comparison/ComparisonPage";
import { StrategyPage } from "./features/race-context/StrategyPage";
import { SessionAnalyticsPage } from "./features/session-analytics/SessionAnalyticsPage";
import { DriverSelectPage } from "./features/session-select/DriverSelectPage";
import { LapSelectPage } from "./features/session-select/LapSelectPage";
import { SessionListPage } from "./features/session-select/SessionListPage";
import { TrackMapPage } from "./features/track-map/TrackMapPage";
import { useSelectionStore } from "./state/selectionStore";
import styles from "./App.module.css";

type BackendStatus = "checking" | "online" | "offline";

/**
 * Routing for the session -> driver -> lap -> track map flow (ADR-0010),
 * plus the M6 comparison route, the M8 session-analytics route, and the
 * M10 strategy route. "/sessions/:sessionId/compare" and
 * "/sessions/:sessionId/analytics" (plural, matching every other route
 * here) render ComparisonPage and SessionAnalyticsPage respectively, each
 * owning its own state independently of driverId/lapNumber params.
 * "/sessions/:sessionId/drivers/:driverId/strategy" is driver-scoped, at
 * the same route depth as the track-map route, since stints are fetched
 * per driver (docs/m10-implementation-plan.md Phase 5).
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
        <Route path="/" element={<SessionListPage />} />
        <Route path="/sessions/:sessionId" element={<DriverSelectPage />} />
        <Route path="/sessions/:sessionId/drivers/:driverId" element={<LapSelectPage />} />
        <Route
          path="/sessions/:sessionId/drivers/:driverId/laps/:lapNumber"
          element={<TrackMapPage />}
        />
        <Route path="/sessions/:sessionId/compare" element={<ComparisonPage />} />
        <Route path="/sessions/:sessionId/analytics" element={<SessionAnalyticsPage />} />
        <Route path="/sessions/:sessionId/drivers/:driverId/strategy" element={<StrategyPage />} />
      </Routes>
    </AppShell>
  );
}

export default App;
