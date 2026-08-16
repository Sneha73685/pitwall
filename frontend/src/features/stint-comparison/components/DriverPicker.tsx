import { useEffect, useState } from "react";
import { listDrivers, type Driver } from "../../../api/client";
import { Card } from "../../../components/Card";
import { ErrorState } from "../../../components/ErrorState";
import styles from "./DriverPicker.module.css";

interface DriverPickerProps {
  sessionId: string;
  /** Distinguishes this picker when two are shown side by side, e.g. "Driver A". */
  label: string;
  onSelect: (driverId: string | null) => void;
  /**
   * Pre-selects this driver once the roster has loaded, then fires
   * onSelect -- used by StrategyPage's "Compare Strategy" entry point to
   * land on a populated comparison instead of an empty dropdown. Applied
   * once per mount; a later user change is never overridden back to it.
   * Mirrors DriverLapPicker's identical `initialSelection` contract.
   */
  initialDriverId?: string;
}

/**
 * Driver-only picker for the M15 stint/tyre-strategy comparison
 * (docs/m15-design-review.md §6): a new, small sibling to
 * `lap-comparison/components/DriverLapPicker.tsx`, dropping its entire lap
 * half -- this comparison is session+driver-scoped, not lap-scoped (design
 * §8), so there is no second `<select>` here. Reuses `listDrivers` exactly
 * as `DriverLapPicker` does; is a controlled `<select>` firing a callback,
 * not a navigating list, matching that same precedent.
 */
export function DriverPicker({ sessionId, label, onSelect, initialDriverId }: DriverPickerProps) {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(initialDriverId ?? null);

  useEffect(() => {
    listDrivers(sessionId)
      .then(setDrivers)
      .catch(() => setError(`Could not load drivers for ${label}.`));
  }, [sessionId, label]);

  // Once the roster has loaded, complete the pre-selection and notify the
  // parent -- mirrors DriverLapPicker's own initial-selection effect,
  // simplified since there's no lap half to wait on here.
  useEffect(() => {
    if (
      !initialDriverId ||
      !drivers?.some((driver) => driver.driver_id === initialDriverId) ||
      selectedDriverId !== initialDriverId
    ) {
      return;
    }
    onSelect(initialDriverId);
    // onSelect intentionally excluded: firing once when the pre-selected
    // driver's data arrives is the goal, not re-firing on a caller-supplied
    // callback identity change -- same contract DriverLapPicker's own
    // initial-selection effect uses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, initialDriverId, selectedDriverId]);

  function handleDriverChange(driverId: string) {
    const nextDriverId = driverId || null;
    setSelectedDriverId(nextDriverId);
    onSelect(nextDriverId);
  }

  return (
    <Card title={label}>
      {error && <ErrorState>{error}</ErrorState>}
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Driver</span>
          <select
            className={styles.select}
            value={selectedDriverId ?? ""}
            onChange={(event) => handleDriverChange(event.target.value)}
            disabled={drivers === null}
          >
            <option value="">Select a driver</option>
            {drivers?.map((driver) => (
              <option key={driver.driver_id} value={driver.driver_id}>
                {driver.full_name} ({driver.team_name})
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}
