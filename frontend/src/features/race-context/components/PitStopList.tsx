import type { PitStop } from "../../../api/client";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import styles from "./PitStopList.module.css";

interface PitStopListProps {
  pitStops: PitStop[];
}

/**
 * A plain, unsorted table -- matching SectorBreakdownTable's existing
 * precedent. No sortable-table primitive exists in this codebase (M8
 * Phase 0, §0.2 Q5), and a handful of pit stops per driver needs no
 * sorting anyway (docs/m10-implementation-plan.md Phase 5).
 *
 * `pit_lane_time_seconds` measures pit-lane entry-to-exit time, not
 * stationary box time (docs/m10-design-review.md §3.1) -- labeled "Pit
 * lane time" here, not "Stop duration", to avoid implying otherwise.
 */
export function PitStopList({ pitStops }: PitStopListProps) {
  if (pitStops.length === 0) {
    return <EmptyState>No pit stops recorded for this driver.</EmptyState>;
  }

  return (
    <Card title="Pit stops">
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Stop</th>
              <th>Lap</th>
              <th>Pit lane time</th>
            </tr>
          </thead>
          <tbody>
            {pitStops.map((pitStop) => (
              <tr key={pitStop.stop_number} data-testid={`pit-stop-row-${pitStop.stop_number}`}>
                <td>{pitStop.stop_number}</td>
                <td className={styles.mono}>{pitStop.lap_number}</td>
                <td className={styles.mono}>
                  {pitStop.pit_lane_time_seconds !== null
                    ? `${pitStop.pit_lane_time_seconds.toFixed(3)}s`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
