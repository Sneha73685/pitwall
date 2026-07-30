import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listLaps, type Lap } from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";

/**
 * /sessions/:sessionId/drivers/:driverId: lists a driver's laps, linking to
 * the track map (M4) for the chosen one. selectionStore's lapId is set by
 * TrackMapPage, not here, mirroring how this page sets driverId and
 * DriverSelectPage sets sessionId -- each page owns its own route param.
 */
export function LapSelectPage() {
  const { sessionId, driverId } = useParams<{ sessionId: string; driverId: string }>();
  const setDriver = useSelectionStore((state) => state.setDriver);
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
        {laps.map((lap) => (
          <li key={lap.lap_number}>
            <Link to={`/sessions/${sessionId}/drivers/${driverId}/laps/${lap.lap_number}`}>
              Lap {lap.lap_number}
              {lap.lap_time_seconds !== null
                ? ` — ${lap.lap_time_seconds.toFixed(3)}s`
                : " — incomplete"}
              {lap.is_personal_best ? " (PB)" : ""}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
