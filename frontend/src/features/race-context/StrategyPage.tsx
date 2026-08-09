import { Link, useParams } from "react-router-dom";
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
 *
 * M11 Phase 4 adds a cross-link to "/stint-pace" -- the descriptive analysis
 * of these same raw facts, the same raw-facts-vs-analysis split this
 * codebase already draws between race-context/ and session-analytics/
 * (docs/m11-frontend-design-note.md §4 Flow C, §22).
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
      <div className={styles.headerRow}>
        <h2 className={styles.heading}>Strategy — {driverId}</h2>
        <Link
          to={`/sessions/${sessionId}/drivers/${driverId}/stint-pace`}
          className={styles.crossLink}
        >
          View Stint Pace
        </Link>
      </div>
      <Card title="Stint timeline">
        <StintTimeline stints={stints} />
      </Card>
      <PitStopList pitStops={pitStops} />
    </section>
  );
}
