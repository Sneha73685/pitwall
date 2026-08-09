import type { StintPaceLap } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import styles from "./StintPaceLapTable.module.css";

interface StintPaceLapTableProps {
  laps: StintPaceLap[];
}

function flagLabel(lap: StintPaceLap): string | null {
  if (lap.is_in_lap) {
    return "in-lap";
  }
  if (lap.is_out_lap) {
    return "out-lap";
  }
  if (!lap.is_valid) {
    return "invalid";
  }
  if (!lap.is_trend_eligible) {
    return "excluded";
  }
  return null;
}

function formatLapTime(seconds: number | null): string {
  return seconds !== null ? `${seconds.toFixed(3)}s` : "—";
}

/**
 * Per-lap raw table -- the accessible data fallback for DriverStintPaceChart
 * (design note §7.3, §18): every point the chart plots has a corresponding
 * row here. Styled like DriverLapTable's existing "excluded laps flagged
 * inline, never dropped" convention, extended with the stint/lap-in-stint
 * index and an explicit trend-eligibility column so this table alone
 * conveys everything the chart's tooltip does, in text.
 */
export function StintPaceLapTable({ laps }: StintPaceLapTableProps) {
  if (laps.length === 0) {
    return <EmptyState>No lap data available for this driver.</EmptyState>;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Lap</th>
            <th>Stint</th>
            <th>Lap in stint</th>
            <th>Compound</th>
            <th>Lap time</th>
            <th>Trend eligible</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => {
            const flag = flagLabel(lap);
            return (
              <tr key={lap.lap_number} data-testid={`stint-pace-lap-row-${lap.lap_number}`}>
                <td className={styles.mono}>
                  {lap.lap_number}
                  {flag && (
                    <span
                      data-testid={`stint-pace-lap-flag-${lap.lap_number}`}
                      className={styles.excludedTag}
                    >
                      {" "}
                      ({flag})
                    </span>
                  )}
                </td>
                <td className={styles.mono}>{lap.stint_number ?? "—"}</td>
                <td className={styles.mono}>{lap.lap_in_stint_index ?? "—"}</td>
                <td>{lap.compound ?? "—"}</td>
                <td className={styles.mono}>{formatLapTime(lap.lap_time_seconds)}</td>
                <td>{lap.is_trend_eligible ? "Yes" : "No"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
