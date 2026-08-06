import type { Lap, Session } from "../../../api/client";
import { Card } from "../../../components/Card";
import { SESSION_TYPE_LABELS } from "../../../components/sessionTypeLabels";
import styles from "./TopSummaryPanel.module.css";

interface TopSummaryPanelProps {
  driver: string;
  session: Session;
  lap: Lap | null;
  /** The driver's full lap list -- used to compute delta-to-personal-best client-side. */
  laps: Lap[];
}

function formatTime(seconds: number | null): string {
  return seconds === null ? "—" : `${seconds.toFixed(3)}s`;
}

/**
 * Driver/lap/session context for the track-map workspace, sourced entirely
 * from already-existing API client calls (getSession, listLaps) -- no new
 * endpoints. Tire compound is intentionally omitted: it isn't in the
 * backend schema (docs/m9-design-review.md).
 */
export function TopSummaryPanel({ driver, session, lap, laps }: TopSummaryPanelProps) {
  const bestLapTime = laps
    .map((l) => l.lap_time_seconds)
    .filter((time): time is number => time !== null)
    .reduce((best, time) => (best === null || time < best ? time : best), null as number | null);

  const deltaToPersonalBest =
    lap?.lap_time_seconds !== null && lap?.lap_time_seconds !== undefined && bestLapTime !== null
      ? lap.lap_time_seconds - bestLapTime
      : null;

  return (
    <Card>
      <div className={styles.summary}>
        <div className={styles.field}>
          <span className={styles.label}>Driver</span>
          <span className={styles.value}>{driver}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Lap</span>
          <span className={styles.value}>{lap?.lap_number ?? "—"}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Lap Time</span>
          <span className={styles.value}>{formatTime(lap?.lap_time_seconds ?? null)}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>S1</span>
          <span className={styles.value}>{formatTime(lap?.sector_1_seconds ?? null)}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>S2</span>
          <span className={styles.value}>{formatTime(lap?.sector_2_seconds ?? null)}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>S3</span>
          <span className={styles.value}>{formatTime(lap?.sector_3_seconds ?? null)}</span>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Delta to PB</span>
          <span className={styles.value}>
            {deltaToPersonalBest === null
              ? "—"
              : `${deltaToPersonalBest >= 0 ? "+" : ""}${deltaToPersonalBest.toFixed(3)}s`}
          </span>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>Session</span>
          <span className={styles.value}>
            {session.event_name} — {SESSION_TYPE_LABELS[session.session_type]}
          </span>
        </div>
      </div>
    </Card>
  );
}
