import type { Session, SessionAnalyticsResponse } from "../../../api/client";
import { Card } from "../../../components/Card";
import styles from "./SessionAnalyticsHeader.module.css";

interface SessionAnalyticsHeaderProps {
  session: Session;
  analytics: SessionAnalyticsResponse;
}

/**
 * Session identity plus lap count (docs/m8-design-review.md §1.2 item 1:
 * "session name, circuit, session type, lap count"). No track-status
 * summary: no track-status data exists anywhere in the schema
 * (docs/m8-implementation-plan.md §0.2 Q3), so there's nothing to show
 * rather than fabricating it.
 *
 * `session.location` stands in for "circuit" -- there is no separate
 * circuit field, and this matches how SessionListPage/DriverSelectPage
 * already read the same Session model.
 *
 * `session_lap_count` comes from `analytics`, not `session`: the Session
 * model carries no lap-count field of its own (app/models/telemetry.py) --
 * it's derived server-side from the max lap number reached by anyone in
 * the session (app/api/session_analytics.py).
 */
export function SessionAnalyticsHeader({ session, analytics }: SessionAnalyticsHeaderProps) {
  return (
    <Card>
      <h2 className={styles.heading}>
        {session.season} {session.event_name}
      </h2>
      <p data-testid="session-analytics-summary" className={styles.summary}>
        {session.location}, {session.country} — {session.session_type} —{" "}
        {analytics.session_lap_count} laps
      </p>
    </Card>
  );
}
