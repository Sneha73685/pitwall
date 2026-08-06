import { Card } from "../../../components/Card";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { useDriverLapMetrics } from "../hooks/useDriverLapMetrics";
import { DriverLapTable } from "./DriverLapTable";
import { LapTimeTrendChart } from "./LapTimeTrendChart";
import styles from "./DriverDrillDown.module.css";

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
    <section aria-label={`${driver} lap detail`} className={styles.drillDown}>
      <Card title={`${driver} — Lap Detail`}>
        {error && <ErrorState>{error}</ErrorState>}
        {metrics === null && !error && (
          <LoadingState>Loading {driver}&rsquo;s lap data...</LoadingState>
        )}
        {metrics && (
          <div className={styles.content}>
            <LapTimeTrendChart laps={metrics.laps} />
            <DriverLapTable laps={metrics.laps} />
          </div>
        )}
      </Card>
    </section>
  );
}
