import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSeasons, type SeasonSummary } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import styles from "./SeasonListPage.module.css";

/**
 * Root route ("/"): lists every season PitWall has at least one locally
 * ingested session for (M12 Phase 4's `GET /seasons`), linking to that
 * season's event list. Replaces the old flat, all-sessions
 * `SessionListPage` (M12 Phase 5) -- no hardcoded season/event/session
 * anywhere; every value rendered comes from the fetched response.
 */
export function SeasonListPage() {
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSeasons()
      .then(setSeasons)
      .catch(() => setError("Could not load seasons."));
  }, []);

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (seasons === null) {
    return <LoadingState>Loading seasons...</LoadingState>;
  }

  if (seasons.length === 0) {
    return <EmptyState>No seasons ingested yet.</EmptyState>;
  }

  return (
    <section>
      <h2 className={styles.heading}>Select a season</h2>
      <ul className={styles.grid}>
        {seasons.map((season) => (
          <li key={season.season}>
            <Link to={`/seasons/${season.season}`} className={styles.cardLink}>
              <Card title={season.season}>
                <div className={styles.cardBody}>
                  <p className={styles.eventCount}>
                    {season.event_count} {season.event_count === 1 ? "event" : "events"} ingested
                  </p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
