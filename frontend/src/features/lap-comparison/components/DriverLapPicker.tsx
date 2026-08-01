import { useEffect, useState } from "react";
import { listDrivers, listLaps, type Driver, type Lap } from "../../../api/client";

export interface DriverLapSelection {
  driverId: string;
  lapNumber: number;
}

interface DriverLapPickerProps {
  sessionId: string;
  /** Distinguishes this picker when two are shown side by side (M6), e.g. "Lap A". */
  label: string;
  onSelect: (selection: DriverLapSelection | null) => void;
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
export function DriverLapPicker({ sessionId, label, onSelect }: DriverLapPickerProps) {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [laps, setLaps] = useState<Lap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedLapNumber, setSelectedLapNumber] = useState<number | null>(null);

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
    <section>
      <h3>{label}</h3>
      {error && <p role="alert">{error}</p>}
      <label>
        Driver
        <select
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
      <label>
        Lap
        <select
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
    </section>
  );
}
