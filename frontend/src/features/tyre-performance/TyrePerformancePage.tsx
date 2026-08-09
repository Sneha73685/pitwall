import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSession, type Session } from "../../api/client";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { CompoundDistributionChart } from "./components/CompoundDistributionChart";
import { CompoundLapTrendChart } from "./components/CompoundLapTrendChart";
import { CompoundUsageSummary } from "./components/CompoundUsageSummary";
import { DriverCompoundComparisonChart } from "./components/DriverCompoundComparisonChart";
import { PitLaneTimeSummary } from "./components/PitLaneTimeSummary";
import { StrategySummaryPanel } from "./components/StrategySummaryPanel";
import { useSessionPitStops } from "./hooks/useSessionPitStops";
import { useTyrePerformance } from "./hooks/useTyrePerformance";
import styles from "./TyrePerformancePage.module.css";

/**
 * /sessions/:sessionId/tyre-performance (M11 Phase 4): session-wide
 * descriptive tyre/stint performance dashboard. Mirrors
 * `SessionAnalyticsPage`'s exact composition (header, summary, responsive
 * chart row, detail sections) at the same route depth as
 * `/sessions/:sessionId/analytics` (docs/m11-frontend-design-note.md §5, §8).
 *
 * Not a leaderboard: every list/table/chart here is neutrally ordered
 * (compound taxonomy or driver_id), never by any pace statistic.
 */
export function TyrePerformancePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const { tyrePerformance, error: tyreError } = useTyrePerformance(sessionId);
  const { pitStops, error: pitStopsError } = useSessionPitStops(sessionId);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    getSession(sessionId)
      .then(setSession)
      .catch(() => setSessionError("Could not load session."));
  }, [sessionId]);

  if (!sessionId) {
    return null;
  }

  const error = sessionError ?? tyreError ?? pitStopsError;
  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (session === null || tyrePerformance === null) {
    return <LoadingState>Loading tyre performance...</LoadingState>;
  }

  return (
    <section className={styles.dashboard}>
      <Card>
        <h2 className={styles.heading}>
          {session.season} {session.event_name}
        </h2>
        <p className={styles.summary}>
          {session.location}, {session.country} &mdash; {session.session_type} &mdash; tyre &amp;
          stint performance (descriptive)
        </p>
      </Card>
      <Card title="Strategy Summary">
        <StrategySummaryPanel
          sessionId={sessionId}
          driverStrategies={tyrePerformance.driver_strategies}
        />
      </Card>
      <Card title="Compound Usage">
        <CompoundUsageSummary compoundUsage={tyrePerformance.compound_usage} />
      </Card>
      <div className={styles.chartRow}>
        <Card title="Lap Time by Compound">
          <CompoundDistributionChart compoundAggregates={tyrePerformance.compound_aggregates} />
        </Card>
        <Card title="Lap Time by Tyre Age">
          <CompoundLapTrendChart
            compoundLapIndexAggregates={tyrePerformance.compound_lap_index_aggregates}
          />
        </Card>
      </div>
      <Card title="Driver Comparison by Compound">
        <DriverCompoundComparisonChart
          rawLapTimesByCompound={tyrePerformance.raw_lap_times_by_compound}
        />
      </Card>
      <Card title="Pit Lane Time">
        <PitLaneTimeSummary pitStops={pitStops} />
      </Card>
    </section>
  );
}
