import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/client";
import { DriverSelectPage } from "./features/session-select/DriverSelectPage";
import { LapSelectPage } from "./features/session-select/LapSelectPage";
import { SessionListPage } from "./features/session-select/SessionListPage";
import { useSelectionStore } from "./state/selectionStore";

type BackendStatus = "checking" | "online" | "offline";

/**
 * M3 shell: routing for the session -> driver -> lap selection flow
 * (ADR-0010). Track map/telemetry charts/comparison views arrive in
 * M4+ as further routes -- nothing here anticipates their shape.
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
      </Routes>
    </main>
  );
}

export default App;
