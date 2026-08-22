import type { DriverLapMetrics, ExclusionReason } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import { StatusChip } from "../../../components/StatusChip";
import styles from "./DriverLapTable.module.css";

interface DriverLapTableProps {
  laps: DriverLapMetrics[];
}

// M46 (docs/m46-design-review.md): frontend-owned copy per ExclusionReason,
// mirroring the now-twice-proven local-map pattern (StintComparisonPage.tsx
// M15, ComparisonPage.tsx M45) rather than a new shared abstraction. Falls
// back to the raw value for a reason this map doesn't know about yet (a
// hypothetical future backend value ahead of this frontend's ExclusionReason
// type), so an unmapped value degrades to today's pre-M46 display instead of
// disappearing or rendering "undefined".
const EXCLUSION_REASON_LABELS: Record<ExclusionReason, string> = {
  yellow_flag: "Yellow Flag",
  track_limits: "Track Limits",
};

function exclusionLabel(reason: ExclusionReason | null): string {
  if (reason === null) {
    return "excluded";
  }
  return EXCLUSION_REASON_LABELS[reason] ?? reason;
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
                    ({exclusionLabel(lap.exclusion_reason)})
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
