import { useState } from "react";
import type { DriverSummary } from "../../../api/client";

/**
 * The first sortable table in the app (plan §0.2 Q5) -- no existing table
 * primitive to build on, so this is a one-off `<table>` with local sort
 * state, not an extraction of anything.
 */
const MIN_VALID_LAPS_FOR_RANKING = 2;

type SortableColumn =
  | "driver"
  | "valid_lap_count"
  | "best_lap_ms"
  | "theoretical_best_lap_ms"
  | "theoretical_best_delta_ms"
  | "median_lap_ms"
  | "consistency_ms"
  | "full_throttle_pct"
  | "outlier_lap_count";

type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortableColumn; label: string }[] = [
  { key: "driver", label: "Driver" },
  { key: "valid_lap_count", label: "Valid laps" },
  { key: "best_lap_ms", label: "Best lap" },
  { key: "theoretical_best_lap_ms", label: "Theoretical best" },
  { key: "theoretical_best_delta_ms", label: "Delta" },
  { key: "median_lap_ms", label: "Median" },
  { key: "consistency_ms", label: "Consistency" },
  { key: "full_throttle_pct", label: "Full throttle %" },
  { key: "outlier_lap_count", label: "Outliers" },
];

interface DriverSummaryTableProps {
  drivers: DriverSummary[];
  selectedDriver: string | null;
  onSelectDriver: (driver: string) => void;
}

/**
 * Sortable driver summary table (plan Phase 4 item 1, design doc §1.2
 * item 2). Row selection drives the drill-down panel (design doc §1.3:
 * "no route change, no refetch") -- `onSelectDriver` is the only side
 * effect a click has here; fetching is `DriverDrillDown`'s job.
 *
 * Ranking-ineligible rows (B1/B4: `valid_lap_count < MIN_VALID_LAPS_FOR_RANKING`)
 * are shown, not hidden, with a `data-ranking-eligible` attribute plus an
 * inline "(insufficient laps)" label next to the driver code -- the only
 * visual-distinction mechanism available given this app has no CSS/styling
 * layer anywhere yet (every other feature is plain semantic HTML).
 */
export function DriverSummaryTable({
  drivers,
  selectedDriver,
  onSelectDriver,
}: DriverSummaryTableProps) {
  const [sortColumn, setSortColumn] = useState<SortableColumn>("theoretical_best_lap_ms");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  function handleSort(column: SortableColumn) {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const sortedDrivers = [...drivers].sort((a, b) =>
    compareValues(a[sortColumn], b[sortColumn], sortDirection),
  );

  return (
    <table>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th key={column.key}>
              <button type="button" onClick={() => handleSort(column.key)}>
                {column.label}
                {sortColumn === column.key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedDrivers.map((driver) => {
          const rankingEligible = driver.valid_lap_count >= MIN_VALID_LAPS_FOR_RANKING;
          return (
            <tr
              key={driver.driver}
              data-testid={`driver-row-${driver.driver}`}
              data-ranking-eligible={rankingEligible}
              aria-selected={driver.driver === selectedDriver}
            >
              <td>
                <button type="button" onClick={() => onSelectDriver(driver.driver)}>
                  {driver.driver}
                </button>
                {!rankingEligible && (
                  <span data-testid={`ranking-ineligible-${driver.driver}`}>
                    {" "}
                    (insufficient laps)
                  </span>
                )}
              </td>
              <td>{driver.valid_lap_count}</td>
              <td>{formatMs(driver.best_lap_ms)}</td>
              <td>{formatMs(driver.theoretical_best_lap_ms)}</td>
              <td>{formatMs(driver.theoretical_best_delta_ms)}</td>
              <td>{formatMs(driver.median_lap_ms)}</td>
              <td>{formatMsPrecise(driver.consistency_ms)}</td>
              <td>{formatPct(driver.full_throttle_pct)}</td>
              <td>{driver.outlier_lap_count}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
  direction: SortDirection,
): number {
  // Null (undefined-metric) fields always sort last, regardless of
  // direction -- a 0-valid-lap driver's `null` consistency shouldn't
  // masquerade as "smallest" on an ascending sort.
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  const result =
    typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
  return direction === "asc" ? result : -result;
}

function formatMs(valueMs: number | null): string {
  return valueMs !== null ? `${valueMs.toFixed(0)}ms` : "—";
}

function formatMsPrecise(valueMs: number | null): string {
  return valueMs !== null ? `${valueMs.toFixed(1)}ms` : "—";
}

function formatPct(valuePct: number | null): string {
  return valuePct !== null ? `${valuePct.toFixed(1)}%` : "—";
}
