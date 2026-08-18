import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSession, listDrivers, type Driver } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { teamAccent } from "../../components/teamColor";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./DriverSelectPage.module.css";

/**
 * /sessions/:sessionId: lists a session's drivers, linking to its lap
 * selector. Also links to /sessions/:sessionId/analytics (M8) and
 * /sessions/:sessionId/tyre-performance (M11 Phase 4) -- both session-wide
 * entry points, same navigational tier as driver selection rather than
 * nested under it (docs/m8-design-review.md §1.1,
 * docs/m11-frontend-design-note.md §4/§22).
 *
 * M17 adds one entry point per driver card: a "Pace Trend" link to
 * /drivers/:driverId/seasons/:season/pace-trend (docs/m17-design-review.md
 * §7) -- the single, minimal entry point that design approved, reusing
 * this page's already-fetched session context rather than adding a new
 * navigation surface. Fetches the session's own `season` (one additional
 * call this page didn't make before) since the trend route needs it.
 *
 * M21 adds a second, sibling entry point per driver card: a "Tyre Trend"
 * link to /drivers/:driverId/seasons/:season/tyre-trend
 * (docs/m21-design-review.md §7) -- reusing the same already-fetched
 * `season` value, no new API call.
 */
export function DriverSelectPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const setSession = useSelectionStore((state) => state.setSession);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    setSession(sessionId);
    listDrivers(sessionId)
      .then(setDrivers)
      .catch(() => setError("Could not load drivers."));
    getSession(sessionId)
      .then((session) => setSeason(session.season))
      .catch(() => {
        // Non-fatal: the driver list still works without a Pace Trend
        // link, so a failed season lookup doesn't block the page.
      });
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
        <div className={styles.headerLinks}>
          <Link to={`/sessions/${sessionId}/analytics`} className={styles.analyticsLink}>
            View session analytics
          </Link>
          <Link to={`/sessions/${sessionId}/tyre-performance`} className={styles.analyticsLink}>
            View tyre performance
          </Link>
        </div>
      </div>
      <ul className={styles.grid}>
        {drivers.map((driver) => (
          <li key={driver.driver_id}>
            <Card accent={teamAccent(driver.team_name)}>
              <div className={styles.cardRow}>
                <Link
                  to={`/sessions/${sessionId}/drivers/${driver.driver_id}`}
                  className={styles.cardBody}
                >
                  <span className={styles.driverNumber}>#{driver.driver_number}</span>
                  <span className={styles.driverCode}>{driver.driver_id}</span>
                  <span className={styles.driverName}>
                    {driver.full_name} ({driver.team_name})
                  </span>
                </Link>
                {season !== null && (
                  <Link
                    to={`/drivers/${driver.driver_id}/seasons/${season}/pace-trend?fromSession=${sessionId}`}
                    className={styles.trendLink}
                  >
                    Pace Trend
                  </Link>
                )}
                {season !== null && (
                  <Link
                    to={`/drivers/${driver.driver_id}/seasons/${season}/tyre-trend?fromSession=${sessionId}`}
                    className={styles.trendLink}
                  >
                    Tyre Trend
                  </Link>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
