import { compoundColor } from "../../race-context/compoundColor";
import styles from "./CompoundSequenceStrip.module.css";

interface CompoundSequenceStripProps {
  compoundSequence: string[];
  stintLengths: number[];
}

/**
 * A compact proportional strip -- one segment per stint, width proportional
 * to stint length, colored by compound. Visually a close sibling of
 * `StintTimeline`, but not the same component: `DriverStrategySummary`
 * carries `compound_sequence`/`stint_lengths` (plain arrays), not `Stint[]`
 * with lap ranges, so there is no shared prop shape to reuse directly
 * (design note §8.2, §12).
 */
export function CompoundSequenceStrip({
  compoundSequence,
  stintLengths,
}: CompoundSequenceStripProps) {
  if (compoundSequence.length === 0) {
    return null;
  }

  return (
    <div className={styles.strip} role="list" aria-label="Compound sequence">
      {compoundSequence.map((compound, index) => {
        const length = stintLengths[index] ?? 1;
        return (
          <div
            key={index}
            role="listitem"
            data-testid={`compound-sequence-segment-${index + 1}`}
            className={styles.segment}
            style={{ flexGrow: length, backgroundColor: compoundColor(compound) }}
            title={`Stint ${index + 1}: ${compound}, ${length} lap${length === 1 ? "" : "s"}`}
          >
            <span className={styles.compound}>{compound}</span>
          </div>
        );
      })}
    </div>
  );
}
