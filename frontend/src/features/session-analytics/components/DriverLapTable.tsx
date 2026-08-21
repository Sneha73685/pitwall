import type { DriverLapMetrics } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import { StatusChip } from "../../../components/StatusChip";
import styles from "./DriverLapTable.module.css";

interface DriverLapTableProps {
  laps: DriverLapMetrics[];
}

/**
 * Lap-by-lap drill-down table (plan Phase 4 item 3, design doc §1.2 item
 * 4): lap time, delta to own theoretical best, delta to own median,
 * outlier flag, full-throttle %, brake event count. Excluded laps (e.g.
 * an inaccurate lap, or -- once track-status data exists, see plan Q3 --
 * a yellow-flag lap) are still listed, flagged inline rather than dropped,
 * per design doc §10's disclosure-not-exclusion stance for this table.
 */
export function DriverLapTable({ laps }: DriverLapTableProps) {
  if (laps.length === 0) {
    return <EmptyState>No lap data available for this driver.</EmptyState>;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Lap</th>
            <th>Lap time</th>
            <th>Delta to theoretical best</th>
            <th>Delta to median</th>
            <th>Outlier</th>
            <th>Full throttle %</th>
            <th>Brake events</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => (
            <tr key={lap.lap_number} data-testid={`lap-row-${lap.lap_number}`}>
              <td className={styles.mono}>
                {lap.lap_number}
                {(!lap.is_valid || lap.exclusion_reason !== null) && (
                  <span
                    data-testid={`lap-excluded-${lap.lap_number}`}
                    className={styles.excludedTag}
                  >
                    {" "}
                    ({lap.exclusion_reason ?? "excluded"})
                  </span>
                )}
              </td>
              <td className={styles.mono}>{formatMs(lap.lap_time_ms)}</td>
              <td className={styles.mono}>{formatMs(lap.delta_to_theoretical_best_ms)}</td>
              <td className={styles.mono}>{formatMs(lap.delta_to_own_median_ms)}</td>
              <td>{lap.is_outlier && <StatusChip tone="warning">Yes</StatusChip>}</td>
              <td className={styles.mono}>{formatPct(lap.full_throttle_pct)}</td>
              <td className={styles.mono}>{lap.brake_event_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMs(valueMs: number | null): string {
  return valueMs !== null ? `${valueMs.toFixed(0)}ms` : "—";
}

function formatPct(valuePct: number | null): string {
  return valuePct !== null ? `${valuePct.toFixed(1)}%` : "—";
}
