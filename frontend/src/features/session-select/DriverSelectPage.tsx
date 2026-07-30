import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listDrivers, type Driver } from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";

/** /sessions/:sessionId: lists a session's drivers, linking to its lap selector. */
export function DriverSelectPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const setSession = useSelectionStore((state) => state.setSession);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    setSession(sessionId);
    listDrivers(sessionId)
      .then(setDrivers)
      .catch(() => setError("Could not load drivers."));
  }, [sessionId, setSession]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (drivers === null) {
    return <p>Loading drivers...</p>;
  }

  if (drivers.length === 0) {
    return <p>No drivers found for this session.</p>;
  }

  return (
    <section>
      <h2>Select a driver</h2>
      <ul>
        {drivers.map((driver) => (
          <li key={driver.driver_id}>
            <Link to={`/sessions/${sessionId}/drivers/${driver.driver_id}`}>
              {driver.full_name} ({driver.team_name})
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
