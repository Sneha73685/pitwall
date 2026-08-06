import type { SectorDelta } from "../../../api/client";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { StatusChip } from "../../../components/StatusChip";
import styles from "./SectorBreakdownTable.module.css";

interface SectorBreakdownTableProps {
  sectors: SectorDelta[];
}

/**
 * Per-sector delta table (docs/m6-design-review.md §1.2). "Best sector"
 * is the one with the largest absolute delta -- the most decisive swing
 * point, not a value judgment about which driver is "winning" overall.
 */
export function SectorBreakdownTable({ sectors }: SectorBreakdownTableProps) {
  if (sectors.length === 0) {
    return <EmptyState>No sector data available for this comparison.</EmptyState>;
  }

  const bestSector = sectors.reduce((best, sector) =>
    Math.abs(sector.delta_ms) > Math.abs(best.delta_ms) ? sector : best,
  );

  return (
    <Card title="Sector breakdown">
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Sector</th>
              <th>Delta</th>
              <th>Faster</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sectors.map((sector) => (
              <tr key={sector.sector} data-testid={`sector-row-${sector.sector}`}>
                <td>S{sector.sector}</td>
                <td className={styles.mono}>{Math.abs(sector.delta_ms).toFixed(0)}ms</td>
                <td>{sector.faster.toUpperCase()}</td>
                <td>
                  {sector === bestSector && (
                    <span data-testid="best-sector-marker">
                      <StatusChip tone="positive">Best</StatusChip>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
