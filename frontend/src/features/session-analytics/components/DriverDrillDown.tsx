import { useDriverLapMetrics } from "../hooks/useDriverLapMetrics";
import { DriverLapTable } from "./DriverLapTable";
import { LapTimeTrendChart } from "./LapTimeTrendChart";

interface DriverDrillDownProps {
  sessionId: string;
  driver: string;
}

/**
 * Single-driver drill-down panel (plan Phase 4 item 3, design doc §1.2
 * item 4 / §1.3): rendered when a row is selected in DriverSummaryTable.
 * Fetches lazily via useDriverLapMetrics -- no refetch when re-selecting a
 * driver already cached by that hook (Phase 3).
 */
export function DriverDrillDown({ sessionId, driver }: DriverDrillDownProps) {
  const { metrics, error } = useDriverLapMetrics(sessionId, driver);

  return (
    <section aria-label={`${driver} lap detail`}>
      <h3>{driver} — lap detail</h3>
      {error && <p role="alert">{error}</p>}
      {metrics === null && !error && <p>Loading {driver}&rsquo;s lap data...</p>}
      {metrics && (
        <>
          <LapTimeTrendChart laps={metrics.laps} />
          <DriverLapTable laps={metrics.laps} />
        </>
      )}
    </section>
  );
}
