import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listEventsForSeason, type EventSummary } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { SESSION_TYPE_LABELS } from "../../components/sessionTypeLabels";
import { StatusChip } from "../../components/StatusChip";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./EventListPage.module.css";

/**
 * /seasons/:season: lists events PitWall actually has at least one locally
 * ingested session for, within one season (M12 Phase 4's
 * `GET /seasons/{season}/events`) -- never an event FastF1's upstream
 * schedule merely knows about. Links to that event's session list.
 */
export function EventListPage() {
  const { season } = useParams<{ season: string }>();
  const setSeason = useSelectionStore((state) => state.setSeason);
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!season) {
      return;
    }
    const seasonNumber = Number(season);
    setSeason(seasonNumber);
    listEventsForSeason(seasonNumber)
      .then(setEvents)
      .catch(() => setError("Could not load events."));
  }, [season, setSeason]);

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (events === null) {
    return <LoadingState>Loading events...</LoadingState>;
  }

  if (events.length === 0) {
    return <EmptyState>No events ingested for {season} yet.</EmptyState>;
  }

  return (
    <section>
      <h2 className={styles.heading}>{season}: select an event</h2>
      <ul className={styles.grid}>
        {events.map((event) => (
          <li key={event.event_id}>
            <Link to={`/seasons/${season}/events/${event.event_id}`} className={styles.cardLink}>
              <Card title={event.event_name}>
                <div className={styles.cardBody}>
                  <p className={styles.location}>
                    {event.location}, {event.country}
                  </p>
                  <p className={styles.round}>Round {event.round_number}</p>
                  <div className={styles.sessionTypes}>
                    {event.session_types.map((sessionType) => (
                      <StatusChip key={sessionType} tone="neutral">
                        {SESSION_TYPE_LABELS[sessionType]}
                      </StatusChip>
                    ))}
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
