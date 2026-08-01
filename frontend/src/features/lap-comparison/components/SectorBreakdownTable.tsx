import type { SectorDelta } from "../../../api/client";

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
    return <p>No sector data available for this comparison.</p>;
  }

  const bestSector = sectors.reduce((best, sector) =>
    Math.abs(sector.delta_ms) > Math.abs(best.delta_ms) ? sector : best,
  );

  return (
    <table>
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
            <td>{sector.sector}</td>
            <td>{Math.abs(sector.delta_ms).toFixed(0)}ms</td>
            <td>{sector.faster.toUpperCase()}</td>
            <td>{sector === bestSector && <span data-testid="best-sector-marker">Best</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
