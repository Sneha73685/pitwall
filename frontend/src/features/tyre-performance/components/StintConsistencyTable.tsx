import type { StintPace } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import { compoundColor } from "../../race-context/compoundColor";
import styles from "./StintConsistencyTable.module.css";

interface StintConsistencyTableProps {
  stints: StintPace[];
}

/**
 * Same threshold `stint_consistency.py`/`consistency.py` already use for
 * "a single point has no defined spread" (docs/m11-design-review.md §5.2) --
 * not a new constant, and not a claim that 2 laps is a statistically
 * sufficient sample (design note §7.2, §14).
 */
const MIN_ELIGIBLE_LAPS_FOR_CONSISTENCY = 2;

function formatMsPrecise(valueMs: number | null): string {
  return valueMs !== null ? `${valueMs.toFixed(1)}ms` : "—";
}

function formatCv(value: number | null): string {
  return value !== null ? value.toFixed(4) : "—";
}

/**
 * Per-stint consistency figures (design note §7.2, §14): plain table, rows
 * in stint_number order -- never sortable, and never by any of the numeric
 * columns, unlike DriverSummaryTable's sortable columns (a deliberate
 * omission: sortability here would invite reading this as a leaderboard,
 * which consistency_ms/consistency_cv are explicitly not).
 * `consistency_ms`/`consistency_cv` are the spread of a driver's lap times
 * within one stint, after excluding in-laps, out-laps, and invalid laps --
 * not a performance score, and not defined for a stint with fewer than two
 * remaining laps.
 */
export function StintConsistencyTable({ stints }: StintConsistencyTableProps) {
  if (stints.length === 0) {
    return <EmptyState>No stint data available for this driver.</EmptyState>;
  }

  const orderedStints = [...stints].sort((a, b) => a.stint_number - b.stint_number);

  return (
    <div className={styles.tableWrapper}>
      <p className={styles.caption}>
        Consistency is the spread of a driver&rsquo;s lap times within one stint, after excluding
        in-laps, out-laps, and invalid laps &mdash; not a performance score, and not defined for a
        stint with fewer than two remaining eligible laps.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Stint</th>
            <th>Compound</th>
            <th>Laps</th>
            <th>Tyre life at start</th>
            <th>Eligible laps</th>
            <th>Consistency (ms)</th>
            <th>Consistency (CV)</th>
          </tr>
        </thead>
        <tbody>
          {orderedStints.map((stint) => {
            const insufficientLaps = stint.eligible_lap_count < MIN_ELIGIBLE_LAPS_FOR_CONSISTENCY;
            return (
              <tr
                key={stint.stint_number}
                data-testid={`stint-consistency-row-${stint.stint_number}`}
              >
                <td className={styles.mono}>{stint.stint_number}</td>
                <td>
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: compoundColor(stint.compound) }}
                    aria-hidden="true"
                  />
                  {stint.compound}
                </td>
                <td className={styles.mono}>
                  L{stint.start_lap}–{stint.end_lap}
                </td>
                <td className={styles.mono}>{stint.tyre_life_at_start ?? "—"}</td>
                <td className={styles.mono}>
                  {stint.eligible_lap_count}
                  {insufficientLaps && (
                    <span
                      data-testid={`stint-insufficient-laps-${stint.stint_number}`}
                      className={styles.insufficient}
                    >
                      {" "}
                      (insufficient laps)
                    </span>
                  )}
                </td>
                <td className={styles.mono}>{formatMsPrecise(stint.consistency_ms)}</td>
                <td className={styles.mono}>{formatCv(stint.consistency_cv)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
