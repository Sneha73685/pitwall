import type { PitStop } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import styles from "./PitLaneTimeSummary.module.css";

interface PitLaneTimeSummaryProps {
  pitStops: PitStop[];
}

function formatSeconds(value: number): string {
  return `${value.toFixed(3)}s`;
}

/**
 * Descriptive statistics only (count/min/median/max) -- matching M8/M10's
 * "pstdev/quantiles, never a fitted parameter" convention. Real observations
 * are never removed for being extreme: the 2024 Bahrain GP's genuine
 * 74.951s pit-lane time is a real value, not an error, and must remain
 * visible here (docs/m11-design-review.md §3.2, design note §8.7, §10).
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Session-wide pit-lane time, all drivers (design note §8.7): a compact
 * descriptive stat row plus a plain table sorted by lap number
 * (chronological, neutral) -- never by duration. Reuses `PitStopList`'s
 * exact "Pit lane time," not "stop duration," labeling and its inherited
 * caveat: this measures pit-lane entry-to-exit time, not stationary box
 * time (docs/m10-design-review.md §3.1), carried forward here, not dropped.
 */
export function PitLaneTimeSummary({ pitStops }: PitLaneTimeSummaryProps) {
  if (pitStops.length === 0) {
    return <EmptyState>No pit stops recorded for this session.</EmptyState>;
  }

  const durations = pitStops
    .map((stop) => stop.pit_lane_time_seconds)
    .filter((value): value is number => value !== null);

  const orderedStops = [...pitStops].sort((a, b) => a.lap_number - b.lap_number);

  return (
    <div className={styles.wrapper}>
      <p className={styles.caption}>
        Pit lane time is pit-lane entry-to-exit time, not stationary box (tyre-change) time.
      </p>
      {durations.length > 0 && (
        <dl className={styles.stats} data-testid="pit-lane-time-stats">
          <div className={styles.stat}>
            <dt>Stops</dt>
            <dd className={styles.mono}>{pitStops.length}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Min</dt>
            <dd className={styles.mono}>{formatSeconds(Math.min(...durations))}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Median</dt>
            <dd className={styles.mono}>{formatSeconds(median(durations))}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Max</dt>
            <dd className={styles.mono}>{formatSeconds(Math.max(...durations))}</dd>
          </div>
        </dl>
      )}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Driver</th>
              <th>Stop</th>
              <th>Lap</th>
              <th>Pit lane time</th>
            </tr>
          </thead>
          <tbody>
            {orderedStops.map((stop) => (
              <tr
                key={`${stop.driver_id}-${stop.stop_number}`}
                data-testid={`pit-lane-row-${stop.driver_id}-${stop.stop_number}`}
              >
                <td>{stop.driver_id}</td>
                <td className={styles.mono}>{stop.stop_number}</td>
                <td className={styles.mono}>{stop.lap_number}</td>
                <td className={styles.mono}>
                  {stop.pit_lane_time_seconds !== null
                    ? formatSeconds(stop.pit_lane_time_seconds)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
