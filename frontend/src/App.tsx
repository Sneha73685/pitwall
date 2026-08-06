import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/client";
import { ComparisonPage } from "./features/lap-comparison/ComparisonPage";
import { SessionAnalyticsPage } from "./features/session-analytics/SessionAnalyticsPage";
import { DriverSelectPage } from "./features/session-select/DriverSelectPage";
import { LapSelectPage } from "./features/session-select/LapSelectPage";
import { SessionListPage } from "./features/session-select/SessionListPage";
import { TrackMapPage } from "./features/track-map/TrackMapPage";
import { useSelectionStore } from "./state/selectionStore";

type BackendStatus = "checking" | "online" | "offline";

/**
 * Routing for the session -> driver -> lap -> track map flow (ADR-0010),
 * plus the M6 comparison route and the M8 session-analytics route.
 * "/sessions/:sessionId/compare" and "/sessions/:sessionId/analytics"
 * (plural, matching every other route here) render ComparisonPage and
 * SessionAnalyticsPage respectively, each owning its own state
 * independently of driverId/lapNumber params.
 */
function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const sessionId = useSelectionStore((state) => state.sessionId);

  useEffect(() => {
    getHealth()
      .then(() => setBackendStatus("online"))
      .catch(() => setBackendStatus("offline"));
  }, []);

  return (
    <main>
      <header>
        <h1>
          <Link to="/">PitWall</Link>
        </h1>
        <p>
          An unofficial, fan-made Formula 1 race engineering platform. Not affiliated with Formula
          1, FOM, or any team.
        </p>
        <p data-testid="backend-status">Backend status: {backendStatus}</p>
        <p data-testid="selected-session">Selected session: {sessionId ?? "none"}</p>
      </header>
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
      </Routes>
    </main>
  );
}

export default App;
