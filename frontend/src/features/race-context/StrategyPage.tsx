import { useParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { PitStopList } from "./components/PitStopList";
import { StintTimeline } from "./components/StintTimeline";
import { useRaceContext } from "./hooks/useRaceContext";
import styles from "./StrategyPage.module.css";

/**
 * /sessions/:sessionId/drivers/:driverId/strategy (M10): one driver's tyre
 * strategy for one session -- stint timeline (compound + lap range per
 * stint) and pit-stop list. Driver-scoped, not session-scoped, since
 * list_stints requires a driverId (docs/m10-implementation-plan.md Phase 5).
 */
export function StrategyPage() {
  const { sessionId, driverId } = useParams<{ sessionId: string; driverId: string }>();
  const { stints, pitStops, loading, error } = useRaceContext(sessionId, driverId);

  if (!sessionId || !driverId) {
    return null;
  }

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (loading) {
    return <LoadingState>Loading strategy...</LoadingState>;
  }

  return (
    <section className={styles.strategy}>
      <h2 className={styles.heading}>Strategy — {driverId}</h2>
      <Card title="Stint timeline">
        <StintTimeline stints={stints} />
      </Card>
      <PitStopList pitStops={pitStops} />
    </section>
  );
}
