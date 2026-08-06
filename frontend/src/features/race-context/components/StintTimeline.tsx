import type { Stint } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import { compoundColor } from "../compoundColor";
import styles from "./StintTimeline.module.css";

interface StintTimelineProps {
  stints: Stint[];
}

/**
 * A plain CSS/flexbox proportional bar -- one segment per stint, width
 * proportional to the stint's lap count, colored by compound. Not an
 * ECharts series: a 2-6 segment bar has no need for a full charting
 * library's axis/tooltip/legend machinery, the same reasoning M8 used to
 * keep its driver summary table a plain table rather than an ECharts
 * concern (docs/m10-implementation-plan.md Phase 5).
 */
export function StintTimeline({ stints }: StintTimelineProps) {
  if (stints.length === 0) {
    return <EmptyState>No stint data available for this driver.</EmptyState>;
  }

  return (
    <div className={styles.timeline} role="list" aria-label="Stint timeline">
      {stints.map((stint) => {
        const lapCount = stint.end_lap - stint.start_lap + 1;
        return (
          <div
            key={stint.stint_number}
            role="listitem"
            data-testid={`stint-segment-${stint.stint_number}`}
            className={styles.segment}
            style={{ flexGrow: lapCount, backgroundColor: compoundColor(stint.compound) }}
            title={`Stint ${stint.stint_number}: ${stint.compound}, laps ${stint.start_lap}-${stint.end_lap}`}
          >
            <span className={styles.compound}>{stint.compound}</span>
            <span className={styles.laps}>
              L{stint.start_lap}–{stint.end_lap}
            </span>
          </div>
        );
      })}
    </div>
  );
}
