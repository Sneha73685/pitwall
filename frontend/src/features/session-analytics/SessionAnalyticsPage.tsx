import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSession, type Session } from "../../api/client";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { DriverDrillDown } from "./components/DriverDrillDown";
import { DriverRankingChart } from "./components/DriverRankingChart";
import { DriverSummaryTable } from "./components/DriverSummaryTable";
import { PaceDistributionChart } from "./components/PaceDistributionChart";
import { SessionAnalyticsHeader } from "./components/SessionAnalyticsHeader";
import { useSessionAnalytics } from "./hooks/useSessionAnalytics";
import styles from "./SessionAnalyticsPage.module.css";

/**
 * /sessions/:sessionId/analytics (M8): session-wide driver performance
 * summary. Plural "sessions", matching every other route in this app
 * (docs/m8-implementation-plan.md §0.4b) -- ComparisonPage's own docstring
 * makes the same correction against the M6 design doc's original singular
 * proposal.
 *
 * Phase 4: header, sortable DriverSummaryTable, PaceDistributionChart, and
 * a DriverDrillDown panel that appears on row selection (design doc §1.2,
 * §1.3) -- no route change, no refetch on selection, matching §1.3's "row
 * click drives the drill-down panel" instruction. Selection is local
 * component state, not lifted into a store: design doc §4 explicitly
 * scopes this milestone's client/UI state to the analytics feature itself,
 * with no cross-cutting need comparable to M6's cursor-sync state.
 *
 * Fetches the session's identity (name/circuit/type) separately from its
 * analytics payload (session_lap_count, drivers, warnings) -- the two are
 * different resources (`GET /sessions/{id}` vs.
 * `GET /sessions/{id}/analytics/drivers`), matching how DriverSelectPage
 * and LapSelectPage each fetch only what their own route needs.
 *
 * M9 adds DriverRankingChart -- fed by the same `analytics.drivers` array
 * already passed to PaceDistributionChart, zero new fetches.
 */
export function SessionAnalyticsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const { analytics, error: analyticsError } = useSessionAnalytics(sessionId);

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

  const error = sessionError ?? analyticsError;
  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (session === null || analytics === null) {
    return <LoadingState>Loading session analytics...</LoadingState>;
  }

  return (
    <section className={styles.dashboard}>
      <SessionAnalyticsHeader session={session} analytics={analytics} />
      {analytics.warnings.length > 0 && (
        <Card title="Warnings">
          <ul aria-label="Session analytics warnings" className={styles.warnings}>
            {analytics.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.driver}`}>
                {warning.driver}: {warning.detail ?? warning.code}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Driver Summary">
        <DriverSummaryTable
          drivers={analytics.drivers}
          selectedDriver={selectedDriver}
          onSelectDriver={setSelectedDriver}
        />
      </Card>
      <div className={styles.chartRow}>
        <Card title="Pace Distribution">
          <PaceDistributionChart drivers={analytics.drivers} />
        </Card>
        <Card title="Driver Ranking">
          <DriverRankingChart drivers={analytics.drivers} />
        </Card>
      </div>
      {selectedDriver && <DriverDrillDown sessionId={sessionId} driver={selectedDriver} />}
    </section>
  );
}
