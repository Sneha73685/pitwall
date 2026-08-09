import { Link, useParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { StintTimeline } from "../race-context/components/StintTimeline";
import { DriverStintPaceChart } from "./components/DriverStintPaceChart";
import { StintConsistencyTable } from "./components/StintConsistencyTable";
import { StintPaceLapTable } from "./components/StintPaceLapTable";
import { useDriverStintPace } from "./hooks/useDriverStintPace";
import styles from "./StintPacePage.module.css";

/**
 * /sessions/:sessionId/drivers/:driverId/stint-pace (M11 Phase 4): one
 * driver's descriptive stint-pace view -- strategy shape, raw lap-time
 * trace segmented by stint, per-stint consistency, and the full per-lap
 * raw table. Driver-scoped, at the same route depth as the existing
 * `/strategy` route (docs/m11-frontend-design-note.md §5, §7).
 *
 * `StintTimeline` is reused unmodified: `StintPace` (this page's stint
 * shape) is a structural superset of `Stint` (start_lap/end_lap/compound/
 * stint_number), so no new "strategy shape" component is needed here.
 */
export function StintPacePage() {
  const { sessionId, driverId } = useParams<{ sessionId: string; driverId: string }>();
  const { stintPace, loading, error } = useDriverStintPace(sessionId, driverId);

  if (!sessionId || !driverId) {
    return null;
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (loading || stintPace === null) {
    return <LoadingState>Loading stint pace...</LoadingState>;
  }

  return (
    <section className={styles.page}>
      <div className={styles.headerRow}>
        <h2 className={styles.heading}>Stint Pace — {driverId}</h2>
        <Link
          to={`/sessions/${sessionId}/drivers/${driverId}/strategy`}
          className={styles.crossLink}
        >
          View Strategy
        </Link>
      </div>
      <Card title="Strategy">
        <StintTimeline stints={stintPace.stints} />
      </Card>
      <Card title="Lap Pace">
        <DriverStintPaceChart laps={stintPace.laps} stints={stintPace.stints} />
      </Card>
      <Card title="Stint Detail">
        <StintConsistencyTable stints={stintPace.stints} />
      </Card>
      <Card title="Lap Detail">
        <StintPaceLapTable laps={stintPace.laps} />
      </Card>
    </section>
  );
}
