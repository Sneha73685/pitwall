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
 *
 * M34 adds classification info per driver card -- classified position,
 * grid position, status, and points, straight from the already-fetched
 * `listDrivers` response (docs/m34-design-review.md §8; no new API call).
 * All four are `null` for session types FastF1 doesn't populate them for
 * (e.g. Practice) and for any session ingested before M34 -- both cases
 * simply omit the classification row entirely, falling back to exactly
 * this page's pre-M34 rendering. The list is already in classification
 * order once populated (the backend preserves FastF1's own
 * finishing-position-sorted row order end to end), so no client-side sort
 * is added here.
 *
 * M42 adds qualifying segment times (Q1/Q2/Q3) to the same row, straight
 * from the already-fetched `listDrivers` response (docs/m42-design-review.md;
 * no new API call). Each segment is independently `null` -- for Race/
 * Sprint/Practice sessions (Q1/Q2/Q3 never apply there), for a driver
 * eliminated before reaching a given segment (e.g. Q2/Q3 for a
 * Q1-eliminated driver), and for any session ingested before M42 -- and
 * is omitted independently: a missing segment never renders a placeholder,
 * and never hides a segment that IS present.
 */
function formatClassifiedPosition(value: string): string {
  return /^\d+$/.test(value) ? `P${value}` : value;
}

function formatSegmentTime(seconds: number): string {
  // Mirrors the existing raw-milliseconds display convention already used
  // for lap times elsewhere in this app (DriverLapTable.tsx,
  // DriverSummaryTable.tsx both format as `${ms.toFixed(0)}ms`) -- no
  // mm:ss.sss clock-style formatter exists anywhere in this codebase to
  // reuse, so this follows the same established shape rather than
  // inventing a new one (docs/m42-design-review.md §19).
  return `${(seconds * 1000).toFixed(0)}ms`;
}

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
                  {(driver.classified_position ||
                    driver.grid_position != null ||
                    driver.status ||
                    (driver.points ?? 0) > 0 ||
                    driver.q1_seconds != null) && (
                    <span className={styles.classificationRow}>
                      {driver.classified_position && (
                        <span className={styles.positionBadge}>
                          {formatClassifiedPosition(driver.classified_position)}
                        </span>
                      )}
                      {driver.grid_position != null && (
                        <span className={styles.gridPosition}>Started P{driver.grid_position}</span>
                      )}
                      {driver.status && <span className={styles.status}>{driver.status}</span>}
                      {driver.points != null && driver.points > 0 && (
                        <span className={styles.points}>{driver.points} pts</span>
                      )}
                      {driver.q1_seconds != null && (
                        <span className={styles.qualifyingTime}>
                          Q1 {formatSegmentTime(driver.q1_seconds)}
                        </span>
                      )}
                      {driver.q2_seconds != null && (
                        <span className={styles.qualifyingTime}>
                          Q2 {formatSegmentTime(driver.q2_seconds)}
                        </span>
                      )}
                      {driver.q3_seconds != null && (
                        <span className={styles.qualifyingTime}>
                          Q3 {formatSegmentTime(driver.q3_seconds)}
                        </span>
                      )}
                    </span>
                  )}
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
