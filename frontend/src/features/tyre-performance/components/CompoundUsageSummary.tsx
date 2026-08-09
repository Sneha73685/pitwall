import type { CompoundUsageCount } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import { compoundColor } from "../../race-context/compoundColor";
import { sortByCompoundOrder } from "../compoundOrder";
import styles from "./CompoundUsageSummary.module.css";

interface CompoundUsageSummaryProps {
  compoundUsage: CompoundUsageCount[];
}

/**
 * Session-wide compound usage table (design note §8.3): rows ordered by
 * the fixed compound taxonomy (`compoundOrder.ts`), never by any of the
 * numeric columns -- this is not a "most-used compound" leaderboard.
 */
export function CompoundUsageSummary({ compoundUsage }: CompoundUsageSummaryProps) {
  if (compoundUsage.length === 0) {
    return <EmptyState>No compound data available for this session.</EmptyState>;
  }

  const ordered = sortByCompoundOrder(compoundUsage, (usage) => usage.compound);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Compound</th>
            <th>Stints</th>
            <th>Drivers</th>
            <th>Total laps</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((usage) => (
            <tr key={usage.compound} data-testid={`compound-usage-row-${usage.compound}`}>
              <td>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: compoundColor(usage.compound) }}
                  aria-hidden="true"
                />
                {usage.compound}
              </td>
              <td className={styles.mono}>{usage.stint_count}</td>
              <td className={styles.mono}>{usage.driver_count}</td>
              <td className={styles.mono}>{usage.total_laps}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
