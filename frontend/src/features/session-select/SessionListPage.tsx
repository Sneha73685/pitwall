import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listSessions, type Session } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { StatusChip } from "../../components/StatusChip";
import styles from "./SessionListPage.module.css";

const SESSION_TYPE_LABELS: Record<Session["session_type"], string> = {
  practice_1: "Practice 1",
  practice_2: "Practice 2",
  practice_3: "Practice 3",
  qualifying: "Qualifying",
  sprint_qualifying: "Sprint Qualifying",
  sprint: "Sprint",
  race: "Race",
};

/** Root route: lists every ingested session, linking to its driver selector. */
export function SessionListPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("all");

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => setError("Could not load sessions."));
  }, []);

  const seasons = useMemo(
    () => [...new Set((sessions ?? []).map((session) => session.season))].sort((a, b) => b - a),
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    if (!sessions) {
      return [];
    }
    const term = searchTerm.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesSeason = seasonFilter === "all" || session.season === Number(seasonFilter);
      const matchesSearch =
        term.length === 0 ||
        session.event_name.toLowerCase().includes(term) ||
        session.location.toLowerCase().includes(term) ||
        session.country.toLowerCase().includes(term);
      return matchesSeason && matchesSearch;
    });
  }, [sessions, searchTerm, seasonFilter]);

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (sessions === null) {
    return <LoadingState>Loading sessions...</LoadingState>;
  }

  if (sessions.length === 0) {
    return <EmptyState>No sessions ingested yet.</EmptyState>;
  }

  return (
    <section>
      <h2 className={styles.heading}>Select a session</h2>
      <div className={styles.filters}>
        <input
          type="search"
          placeholder="Search by event, circuit, or country"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className={styles.search}
          aria-label="Search sessions"
        />
        <select
          value={seasonFilter}
          onChange={(event) => setSeasonFilter(event.target.value)}
          className={styles.seasonFilter}
          aria-label="Filter by season"
        >
          <option value="all">All seasons</option>
          {seasons.map((season) => (
            <option key={season} value={season}>
              {season}
            </option>
          ))}
        </select>
      </div>
      {filteredSessions.length === 0 ? (
        <EmptyState>No sessions match your search.</EmptyState>
      ) : (
        <ul className={styles.grid}>
          {filteredSessions.map((session) => (
            <li key={session.session_id}>
              <Link to={`/sessions/${session.session_id}`} className={styles.cardLink}>
                <Card
                  title={
                    <>
                      {session.season} {session.event_name}
                    </>
                  }
                >
                  <div className={styles.cardBody}>
                    <StatusChip tone="neutral">
                      {SESSION_TYPE_LABELS[session.session_type]}
                    </StatusChip>
                    <p className={styles.location}>
                      {session.location}, {session.country}
                    </p>
                    <p className={styles.round}>Round {session.round_number}</p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
