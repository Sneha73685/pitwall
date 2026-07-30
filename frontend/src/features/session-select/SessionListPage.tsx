import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSessions, type Session } from "../../api/client";

/** Root route: lists every ingested session, linking to its driver selector. */
export function SessionListPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => setError("Could not load sessions."));
  }, []);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (sessions === null) {
    return <p>Loading sessions...</p>;
  }

  if (sessions.length === 0) {
    return <p>No sessions ingested yet.</p>;
  }

  return (
    <section>
      <h2>Select a session</h2>
      <ul>
        {sessions.map((session) => (
          <li key={session.session_id}>
            <Link to={`/sessions/${session.session_id}`}>
              {session.season} {session.event_name} &mdash; {session.session_type}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
