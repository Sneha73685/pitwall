import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listDrivers, type Driver } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { teamAccent } from "../../components/teamColor";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./DriverSelectPage.module.css";

/**
 * /sessions/:sessionId: lists a session's drivers, linking to its lap
 * selector. Also links to /sessions/:sessionId/analytics (M8) -- the
 * session-analytics entry point, same navigational tier as driver
 * selection rather than nested under it (docs/m8-design-review.md §1.1).
 */
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
    return <ErrorState>{error}</ErrorState>;
  }

  if (drivers === null) {
    return <LoadingState>Loading drivers...</LoadingState>;
  }

  if (drivers.length === 0) {
    return <EmptyState>No drivers found for this session.</EmptyState>;
  }

  return (
    <section>
      <div className={styles.headerRow}>
        <h2 className={styles.heading}>Select a driver</h2>
        <Link to={`/sessions/${sessionId}/analytics`} className={styles.analyticsLink}>
          View session analytics
        </Link>
      </div>
      <ul className={styles.grid}>
        {drivers.map((driver) => (
          <li key={driver.driver_id}>
            <Link
              to={`/sessions/${sessionId}/drivers/${driver.driver_id}`}
              className={styles.cardLink}
            >
              <Card accent={teamAccent(driver.team_name)}>
                <div className={styles.cardBody}>
                  <span className={styles.driverNumber}>#{driver.driver_number}</span>
                  <span className={styles.driverCode}>{driver.driver_id}</span>
                  <span className={styles.driverName}>
                    {driver.full_name} ({driver.team_name})
                  </span>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
