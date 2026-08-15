import { useEffect, useState } from "react";
import {
  listEventsForSeason,
  listSeasons,
  listSessionsForEvent,
  type EventSummary,
  type SeasonSummary,
  type Session,
} from "../../../api/client";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { SESSION_TYPE_LABELS } from "../../../components/sessionTypeLabels";
import { StatusChip } from "../../../components/StatusChip";
import styles from "./SessionPicker.module.css";

interface SessionPickerProps {
  /** Distinguishes this picker in its heading, e.g. "Session A". */
  label: string;
  onSelect: (sessionId: string) => void;
  onClose: () => void;
}

type Step =
  | { kind: "season" }
  | { kind: "event"; season: number }
  | { kind: "session"; season: number; eventId: string };

/**
 * Modal Season -> Event -> Session picker for M13 cross-session comparison
 * (docs/m13-design-review.md §7). Deliberately NOT a reuse of
 * SeasonListPage/EventListPage/SessionListForEventPage as components: all
 * three write to the global selectionStore as a side effect of mounting
 * (setSeason/setEvent), which is exactly the primary navigation state this
 * picker must never touch (§6 of that design) -- rendering them inside a
 * modal here would silently corrupt whatever season/event/session the rest
 * of the app currently has selected. Instead this calls the same three
 * client functions those pages already use (listSeasons/
 * listEventsForSeason/listSessionsForEvent) directly, exactly the way
 * DriverLapPicker already reuses listDrivers/listLaps without reusing
 * DriverSelectPage/LapSelectPage themselves (that component's own
 * docstring gives the identical reasoning).
 *
 * A plain overlay + Card, not a third-party dialog library -- this
 * project has never added a UI framework dependency (M0-M12), and a
 * three-step list picker doesn't need one. Not focus-trapped; acceptable
 * for a small portfolio project's first modal, consistent with this
 * codebase's existing minimalism.
 */
export function SessionPicker({ label, onSelect, onClose }: SessionPickerProps) {
  const [step, setStep] = useState<Step>({ kind: "season" });

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label={`Select ${label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h3 className={styles.dialogTitle}>Select {label}</h3>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>
        {step.kind === "season" && (
          <SeasonStep onSelect={(season) => setStep({ kind: "event", season })} />
        )}
        {step.kind === "event" && (
          <EventStep
            season={step.season}
            onSelect={(eventId) => setStep({ kind: "session", season: step.season, eventId })}
            onBack={() => setStep({ kind: "season" })}
          />
        )}
        {step.kind === "session" && (
          <SessionStep
            season={step.season}
            eventId={step.eventId}
            onSelect={onSelect}
            onBack={() => setStep({ kind: "event", season: step.season })}
          />
        )}
      </div>
    </div>
  );
}

function SeasonStep({ onSelect }: { onSelect: (season: number) => void }) {
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
    <ul className={styles.list}>
      {seasons.map((season) => (
        <li key={season.season}>
          <button
            type="button"
            className={styles.optionButton}
            onClick={() => onSelect(season.season)}
          >
            <Card>
              {season.season} — {season.event_count} {season.event_count === 1 ? "event" : "events"}
            </Card>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EventStep({
  season,
  onSelect,
  onBack,
}: {
  season: number;
  onSelect: (eventId: string) => void;
  onBack: () => void;
}) {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEventsForSeason(season)
      .then(setEvents)
      .catch(() => setError("Could not load events."));
  }, [season]);

  return (
    <div>
      <button type="button" className={styles.backButton} onClick={onBack}>
        ← Seasons
      </button>
      {error && <ErrorState>{error}</ErrorState>}
      {events === null && !error && <LoadingState>Loading events...</LoadingState>}
      {events !== null && events.length === 0 && (
        <EmptyState>No events ingested for {season} yet.</EmptyState>
      )}
      {events !== null && events.length > 0 && (
        <ul className={styles.list}>
          {events.map((event) => (
            <li key={event.event_id}>
              <button
                type="button"
                className={styles.optionButton}
                onClick={() => onSelect(event.event_id)}
              >
                <Card title={event.event_name}>
                  {event.location}, {event.country} — Round {event.round_number}
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionStep({
  season,
  eventId,
  onSelect,
  onBack,
}: {
  season: number;
  eventId: string;
  onSelect: (sessionId: string) => void;
  onBack: () => void;
}) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSessionsForEvent(season, eventId)
      .then(setSessions)
      .catch(() => setError("Could not load sessions."));
  }, [season, eventId]);

  return (
    <div>
      <button type="button" className={styles.backButton} onClick={onBack}>
        ← Events
      </button>
      {error && <ErrorState>{error}</ErrorState>}
      {sessions === null && !error && <LoadingState>Loading sessions...</LoadingState>}
      {sessions !== null && sessions.length === 0 && (
        <EmptyState>No sessions ingested for this event yet.</EmptyState>
      )}
      {sessions !== null && sessions.length > 0 && (
        <ul className={styles.list}>
          {sessions.map((session) => (
            <li key={session.session_id}>
              <button
                type="button"
                className={styles.optionButton}
                onClick={() => onSelect(session.session_id)}
              >
                <Card>
                  <StatusChip tone="neutral">
                    {SESSION_TYPE_LABELS[session.session_type]}
                  </StatusChip>
                  {!session.has_telemetry && (
                    <StatusChip tone="warning">no telemetry data</StatusChip>
                  )}
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
