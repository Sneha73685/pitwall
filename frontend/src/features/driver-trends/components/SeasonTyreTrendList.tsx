import type { SeasonTyreTrendPoint } from "../../../api/client";
import { CompoundSequenceStrip } from "../../tyre-performance/components/CompoundSequenceStrip";
import styles from "./SeasonTyreTrendList.module.css";

interface SeasonTyreTrendListProps {
  points: SeasonTyreTrendPoint[];
}

/**
 * One row per season point, in the exact chronological order the API
 * already returns (never re-sorted here) -- the structural mirror of
 * `tyre-performance/components/StrategySummaryPanel.tsx` (one row per
 * driver, session-wide), with sessions in place of drivers
 * (docs/m21-design-review.md §7). Label format (`R{round_number}
 * {event_name}`) matches `seasonPaceTrendChartOptions.ts`'s existing
 * convention. `CompoundSequenceStrip` is reused unchanged, fed directly
 * from `point.strategy.compound_sequence`/`stint_lengths` -- no data
 * transformation beyond passing those two fields through.
 */
export function SeasonTyreTrendList({ points }: SeasonTyreTrendListProps) {
  return (
    <ul className={styles.list} aria-label="Season tyre/stint-strategy trend">
      {points.map((point) => (
        <li key={point.session_id} data-testid={`tyre-trend-row-${point.session_id}`}>
          <div className={styles.row}>
            <span className={styles.round}>
              R{point.round_number} {point.event_name}
            </span>
            <span className={styles.stintCount}>
              {point.strategy.stint_count} stint{point.strategy.stint_count === 1 ? "" : "s"}
            </span>
            <span className={styles.strip}>
              <CompoundSequenceStrip
                compoundSequence={point.strategy.compound_sequence}
                stintLengths={point.strategy.stint_lengths}
              />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
