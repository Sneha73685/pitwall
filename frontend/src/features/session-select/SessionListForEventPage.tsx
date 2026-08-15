import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listSessionsForEvent, type Session } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SESSION_TYPE_LABELS } from "../../components/sessionTypeLabels";
import { StatusChip } from "../../components/StatusChip";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./SessionListForEventPage.module.css";

/**
 * /seasons/:season/events/:eventId: lists sessions PitWall actually has
 * locally ingested for one event (M12 Phase 4's
 * `GET /seasons/{season}/events/{event_id}/sessions`), already ordered by
 * real weekend chronology -- rendered in that order, no client-side
 * re-sort. Links to the existing, unchanged `/sessions/:sessionId` route.
 *
 * M14 (docs/m14-design-review.md §11): each card also gets a small
 * secondary "Compare" action linking to `/laps/compare?sessionA=<id>`,
 * identical to what `Sidebar`'s own link already produces, just reachable
 * one step earlier (before drilling into a specific driver). Reuses
 * `ComparisonPage`'s existing `sessionA` query-param contract unchanged.
 */
export function SessionListForEventPage() {
  const { season, eventId } = useParams<{ season: string; eventId: string }>();
  const setEvent = useSelectionStore((state) => state.setEvent);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!season || !eventId) {
      return;
    }
    setEvent(eventId);
    listSessionsForEvent(Number(season), eventId)
      .then(setSessions)
      .catch(() => setError("Could not load sessions."));
  }, [season, eventId, setEvent]);

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (sessions === null) {
    return <LoadingState>Loading sessions...</LoadingState>;
  }

  if (sessions.length === 0) {
    return <EmptyState>No sessions ingested for this event yet.</EmptyState>;
  }

  return (
    <section>
      <h2 className={styles.heading}>{sessions[0].event_name}: select a session</h2>
      <ul className={styles.list}>
        {sessions.map((session) => (
          <li key={session.session_id}>
            <Card>
              <div className={styles.cardRow}>
                <Link to={`/sessions/${session.session_id}`} className={styles.cardBody}>
                  <StatusChip tone="neutral">
                    {SESSION_TYPE_LABELS[session.session_type]}
                  </StatusChip>
                  <span className={styles.date}>
                    {session.session_date ? new Date(session.session_date).toLocaleString() : "—"}
                  </span>
                  {!session.has_telemetry && (
                    <StatusChip tone="warning">no telemetry data</StatusChip>
                  )}
                </Link>
                <Link
                  to={`/laps/compare?sessionA=${session.session_id}`}
                  className={styles.compareLink}
                >
                  Compare
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
