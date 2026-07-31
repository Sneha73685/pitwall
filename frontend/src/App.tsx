import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/client";
import { DriverSelectPage } from "./features/session-select/DriverSelectPage";
import { LapSelectPage } from "./features/session-select/LapSelectPage";
import { SessionListPage } from "./features/session-select/SessionListPage";
import { TrackMapPage } from "./features/track-map/TrackMapPage";
import { useSelectionStore } from "./state/selectionStore";

type BackendStatus = "checking" | "online" | "offline";

/**
 * Routing for the session -> driver -> lap -> track map flow (ADR-0010).
 * The final route renders both the track map (M4) and telemetry channel
 * charts (M5) via TrackMapPage; lap/sector comparison (M6) is the next
 * route this file doesn't yet anticipate the shape of.
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
      </Routes>
    </main>
  );
}

export default App;
