import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listLaps, type Lap } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { StatusChip } from "../../components/StatusChip";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./LapSelectPage.module.css";

function formatSector(seconds: number | null): string {
  return seconds === null ? "—" : seconds.toFixed(3);
}

/**
 * /sessions/:sessionId/drivers/:driverId: lists a driver's laps, linking to
 * the track map (M4) for the chosen one. selectionStore's lapId is set by
 * TrackMapPage, not here, mirroring how this page sets driverId and
 * DriverSelectPage sets sessionId -- each page owns its own route param.
 *
 * M6 Phase 9 adds a lap-comparison entry point alongside the existing
 * per-lap links (docs/m6-design-review.md §1.1 path 1): checking exactly
 * two laps reveals "Compare Selected", which navigates to
 * ComparisonPage with driverA/lapA/driverB/lapB query params. Since this
 * table is scoped to one driver, both compared laps share driverId --
 * cross-driver comparison stays available via the dedicated /compare
 * route's pickers (§1.1 path 2), which this page doesn't replace.
 */
export function LapSelectPage() {
  const { sessionId, driverId } = useParams<{ sessionId: string; driverId: string }>();
  const navigate = useNavigate();
  const setDriver = useSelectionStore((state) => state.setDriver);
  const [laps, setLaps] = useState<Lap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);

  useEffect(() => {
    if (!sessionId || !driverId) {
      return;
    }
    setDriver(driverId);
    listLaps(sessionId, driverId)
      .then(setLaps)
      .catch(() => setError("Could not load laps."));
  }, [sessionId, driverId, setDriver]);

  function toggleCompareSelection(lapNumber: number) {
    setSelectedForCompare((current) => {
      if (current.includes(lapNumber)) {
        return current.filter((selected) => selected !== lapNumber);
      }
      if (current.length >= 2) {
        return current;
      }
      return [...current, lapNumber];
    });
  }

  function handleCompareSelected() {
    if (!sessionId || !driverId || selectedForCompare.length !== 2) {
      return;
    }
    const [lapA, lapB] = selectedForCompare;
    navigate(
      `/sessions/${sessionId}/compare?driverA=${driverId}&lapA=${lapA}&driverB=${driverId}&lapB=${lapB}`,
    );
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (laps === null) {
    return <LoadingState>Loading laps...</LoadingState>;
  }

  if (laps.length === 0) {
    return <EmptyState>No laps found for this driver.</EmptyState>;
  }

  return (
    <section>
      <h2 className={styles.heading}>Select a lap</h2>
      <ul className={styles.list}>
        {laps.map((lap) => (
          <li key={lap.lap_number} className={styles.row}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={selectedForCompare.includes(lap.lap_number)}
                onChange={() => toggleCompareSelection(lap.lap_number)}
                disabled={
                  !selectedForCompare.includes(lap.lap_number) && selectedForCompare.length >= 2
                }
                aria-label={`Select lap ${lap.lap_number} for comparison`}
              />
            </label>
            <Link
              to={`/sessions/${sessionId}/drivers/${driverId}/laps/${lap.lap_number}`}
              className={styles.lapLink}
            >
              Lap {lap.lap_number}
              {lap.lap_time_seconds !== null
                ? ` — ${lap.lap_time_seconds.toFixed(3)}s`
                : " — incomplete"}
              {lap.is_personal_best ? " (PB)" : ""}
            </Link>
            {lap.is_personal_best && <StatusChip tone="positive">PB</StatusChip>}
            <span className={styles.sectors}>
              S1 {formatSector(lap.sector_1_seconds)} · S2 {formatSector(lap.sector_2_seconds)} · S3{" "}
              {formatSector(lap.sector_3_seconds)}
            </span>
          </li>
        ))}
      </ul>
      {selectedForCompare.length === 2 && (
        <button type="button" onClick={handleCompareSelected} className={styles.compareButton}>
          Compare Selected
        </button>
      )}
    </section>
  );
}
