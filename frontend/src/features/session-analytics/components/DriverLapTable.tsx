import type { DriverLapMetrics } from "../../../api/client";

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
    return <p>No lap data available for this driver.</p>;
  }

  return (
    <table>
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
            <td>
              {lap.lap_number}
              {!lap.is_valid && (
                <span data-testid={`lap-excluded-${lap.lap_number}`}>
                  {" "}
                  ({lap.exclusion_reason ?? "excluded"})
                </span>
              )}
            </td>
            <td>{formatMs(lap.lap_time_ms)}</td>
            <td>{formatMs(lap.delta_to_theoretical_best_ms)}</td>
            <td>{formatMs(lap.delta_to_own_median_ms)}</td>
            <td>{lap.is_outlier ? "Yes" : "No"}</td>
            <td>{formatPct(lap.full_throttle_pct)}</td>
            <td>{lap.brake_event_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatMs(valueMs: number | null): string {
  return valueMs !== null ? `${valueMs.toFixed(0)}ms` : "—";
}

function formatPct(valuePct: number | null): string {
  return valuePct !== null ? `${valuePct.toFixed(1)}%` : "—";
}
