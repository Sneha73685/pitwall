import { useEffect, useState } from "react";
import { getHealth } from "./api/client";
import { useSelectionStore } from "./state/selectionStore";

type BackendStatus = "checking" | "online" | "offline";

/**
 * M0 placeholder shell. No real telemetry UI yet (that starts in M3+) --
 * this exists to prove the frontend builds, talks to the backend's
 * typed API, and that Zustand/ECharts/D3 are wired into the toolchain
 * without config surprises later.
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
      <h1>PitWall</h1>
      <p>
        An unofficial, fan-made Formula 1 race engineering platform. Not affiliated with Formula 1,
        FOM, or any team.
      </p>
      <p data-testid="backend-status">Backend status: {backendStatus}</p>
      <p data-testid="selected-session">Selected session: {sessionId ?? "none"}</p>
    </main>
  );
}

export default App;
