import { Link } from "react-router-dom";
import type { DriverStrategySummary } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import { CompoundSequenceStrip } from "./CompoundSequenceStrip";
import styles from "./StrategySummaryPanel.module.css";

interface StrategySummaryPanelProps {
  sessionId: string;
  driverStrategies: DriverStrategySummary[];
}

/**
 * Session-wide strategy shape, one row per driver -- rows ordered by
 * `driver_id` alphabetically, the only neutral key `DriverStrategySummary`
 * carries (it has no `driver_number`), never by stint count or any pace
 * statistic (design note §8.1, §9.2). Each row links to that driver's
 * StintPacePage -- the session-wide -> driver-detail drill path
 * (design note §4, Flow A), implemented as real navigation rather than an
 * inline expand, matching `StrategyPage`'s existing precedent of being its
 * own page.
 */
export function StrategySummaryPanel({ sessionId, driverStrategies }: StrategySummaryPanelProps) {
  if (driverStrategies.length === 0) {
    return <EmptyState>No strategy data available for this session.</EmptyState>;
  }

  const orderedDrivers = [...driverStrategies].sort((a, b) =>
    a.driver_id.localeCompare(b.driver_id),
  );

  return (
    <ul className={styles.list} aria-label="Driver strategy summary">
      {orderedDrivers.map((driver) => (
        <li key={driver.driver_id} data-testid={`strategy-summary-row-${driver.driver_id}`}>
          <Link
            to={`/sessions/${sessionId}/drivers/${driver.driver_id}/stint-pace`}
            className={styles.row}
          >
            <span className={styles.driver}>{driver.driver_id}</span>
            <span className={styles.stintCount}>
              {driver.stint_count} stint{driver.stint_count === 1 ? "" : "s"}
            </span>
            <span className={styles.strip}>
              <CompoundSequenceStrip
                compoundSequence={driver.compound_sequence}
                stintLengths={driver.stint_lengths}
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
