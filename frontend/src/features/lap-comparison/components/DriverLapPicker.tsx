import { useEffect, useRef, useState } from "react";
import { listDrivers, listLaps, type Driver, type Lap } from "../../../api/client";
import { Card } from "../../../components/Card";
import { ErrorState } from "../../../components/ErrorState";
import styles from "./DriverLapPicker.module.css";

export interface DriverLapSelection {
  driverId: string;
  lapNumber: number;
}

interface DriverLapPickerProps {
  sessionId: string;
  /** Distinguishes this picker when two are shown side by side (M6), e.g. "Lap A". */
  label: string;
  onSelect: (selection: DriverLapSelection | null) => void;
  /**
   * Pre-selects this driver+lap once loaded, then fires onSelect -- used by
   * the lap-table "Compare Selected" entry point (Phase 9) to land on a
   * populated comparison instead of two empty dropdowns. Applied once per
   * mount; a later user change is never overridden back to it. Omitted by
   * every other caller, so default behavior is unchanged.
   */
  initialSelection?: DriverLapSelection;
}

/**
 * Driver-then-lap picker for the M6 comparison feature. Not an extraction
 * of DriverSelectPage/LapSelectPage (Phase 0 finding): those are routed
 * pages -- useParams, their own useEffect fetch, <Link>-based navigation
 * to a new route on selection -- with no controlled, prop-driven component
 * to lift out. This is a new component that reuses their data-fetching
 * calls (listDrivers, listLaps) and their lap-label text convention
 * ("Lap {n} -- {time}s (PB)"), but is a controlled <select> pair firing a
 * callback, not a navigating list, since selecting here must update local
 * comparison state rather than change the URL.
 */
export function DriverLapPicker({
  sessionId,
  label,
  onSelect,
  initialSelection,
}: DriverLapPickerProps) {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [laps, setLaps] = useState<Lap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(
    initialSelection?.driverId ?? null,
  );
  const [selectedLapNumber, setSelectedLapNumber] = useState<number | null>(null);
  const appliedInitialLap = useRef(false);

  useEffect(() => {
    listDrivers(sessionId)
      .then(setDrivers)
      .catch(() => setError(`Could not load drivers for ${label}.`));
  }, [sessionId, label]);

  useEffect(() => {
    if (!selectedDriverId) {
      setLaps(null);
      return;
    }
    listLaps(sessionId, selectedDriverId)
      .then(setLaps)
      .catch(() => setError(`Could not load laps for ${label}.`));
  }, [sessionId, selectedDriverId, label]);

  // Once the pre-selected driver's laps have loaded, complete the initial
  // selection and notify the parent -- mirrors handleLapChange, but driven
  // by data arriving rather than a user event. Guarded by a ref (not state)
  // so it fires exactly once and never re-applies after a user picks a
  // different lap for this same driver.
  useEffect(() => {
    if (
      appliedInitialLap.current ||
      !initialSelection ||
      selectedDriverId !== initialSelection.driverId ||
      !laps?.some((lap) => lap.lap_number === initialSelection.lapNumber)
    ) {
      return;
    }
    appliedInitialLap.current = true;
    setSelectedLapNumber(initialSelection.lapNumber);
    onSelect(initialSelection);
  }, [laps, initialSelection, selectedDriverId, onSelect]);

  function handleDriverChange(driverId: string) {
    setSelectedDriverId(driverId || null);
    setSelectedLapNumber(null);
    onSelect(null);
  }

  function handleLapChange(lapNumberValue: string) {
    const lapNumber = lapNumberValue ? Number(lapNumberValue) : null;
    setSelectedLapNumber(lapNumber);
    if (selectedDriverId && lapNumber !== null) {
      onSelect({ driverId: selectedDriverId, lapNumber });
    } else {
      onSelect(null);
    }
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
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Lap</span>
          <select
            className={styles.select}
            value={selectedLapNumber ?? ""}
            onChange={(event) => handleLapChange(event.target.value)}
            disabled={!selectedDriverId || laps === null}
          >
            <option value="">Select a lap</option>
            {laps?.map((lap) => (
              <option key={lap.lap_number} value={lap.lap_number}>
                Lap {lap.lap_number}
                {lap.lap_time_seconds !== null
                  ? ` — ${lap.lap_time_seconds.toFixed(3)}s`
                  : " — incomplete"}
                {lap.is_personal_best ? " (PB)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}
