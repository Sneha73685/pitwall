import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { listLaps, type Lap } from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";

/**
 * /sessions/:sessionId/drivers/:driverId: lists a driver's laps. Selecting
 * one records it in selectionStore -- there's no further route yet, since
 * the track map/telemetry views that would consume it are M4/M5 work.
 */
export function LapSelectPage() {
  const { sessionId, driverId } = useParams<{ sessionId: string; driverId: string }>();
  const setDriver = useSelectionStore((state) => state.setDriver);
  const setLap = useSelectionStore((state) => state.setLap);
  const selectedLapId = useSelectionStore((state) => state.lapId);
  const [laps, setLaps] = useState<Lap[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !driverId) {
      return;
    }
    setDriver(driverId);
    listLaps(sessionId, driverId)
      .then(setLaps)
      .catch(() => setError("Could not load laps."));
  }, [sessionId, driverId, setDriver]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (laps === null) {
    return <p>Loading laps...</p>;
  }

  if (laps.length === 0) {
    return <p>No laps found for this driver.</p>;
  }

  return (
    <section>
      <h2>Select a lap</h2>
      <ul>
        {laps.map((lap) => {
          const lapId = String(lap.lap_number);
          return (
            <li key={lapId}>
              <button
                type="button"
                aria-pressed={selectedLapId === lapId}
                onClick={() => setLap(lapId)}
              >
                Lap {lap.lap_number}
                {lap.lap_time_seconds !== null
                  ? ` — ${lap.lap_time_seconds.toFixed(3)}s`
                  : " — incomplete"}
                {lap.is_personal_best ? " (PB)" : ""}
              </button>
            </li>
          );
        })}
      </ul>
      {selectedLapId && <p data-testid="selected-lap">Selected lap: {selectedLapId}</p>}
    </section>
  );
}
