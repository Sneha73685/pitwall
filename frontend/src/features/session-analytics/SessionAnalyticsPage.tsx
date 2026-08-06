import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSession, type Session } from "../../api/client";
import { SessionAnalyticsHeader } from "./components/SessionAnalyticsHeader";
import { useSessionAnalytics } from "./hooks/useSessionAnalytics";

/**
 * /sessions/:sessionId/analytics (M8): session-wide driver performance
 * summary. Plural "sessions", matching every other route in this app
 * (docs/m8-implementation-plan.md §0.4b) -- ComparisonPage's own docstring
 * makes the same correction against the M6 design doc's original singular
 * proposal.
 *
 * Phase 3 shell only: header plus an unstyled, unsortable driver table --
 * no drill-down, no charts. DriverSummaryTable (sortable), the drill-down
 * panel, and the charts are Phase 4.
 *
 * MIN_VALID_LAPS_FOR_RANKING (§0.4) is computed here per row (a
 * `data-ranking-eligible` attribute, no visual treatment) since this page
 * owns the only table until DriverSummaryTable exists -- Phase 4 item 1
 * ("visually distinguishes ranking-ineligible rows without hiding them")
 * is what actually styles it; Phase 3's job is only to compute the flag
 * in the page/table layer, not in a hook (§0.4).
 *
 * Fetches the session's identity (name/circuit/type) separately from its
 * analytics payload (session_lap_count, drivers, warnings) -- the two are
 * different resources (`GET /sessions/{id}` vs.
 * `GET /sessions/{id}/analytics/drivers`), matching how DriverSelectPage
 * and LapSelectPage each fetch only what their own route needs.
 */
const MIN_VALID_LAPS_FOR_RANKING = 2;

export function SessionAnalyticsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
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
    return <p role="alert">{error}</p>;
  }

  if (session === null || analytics === null) {
    return <p>Loading session analytics...</p>;
  }

  return (
    <section>
      <SessionAnalyticsHeader session={session} analytics={analytics} />
      <table>
        <thead>
          <tr>
            <th>Driver</th>
            <th>Valid laps</th>
            <th>Best lap</th>
            <th>Theoretical best</th>
            <th>Delta</th>
            <th>Median</th>
            <th>Consistency</th>
            <th>Full throttle %</th>
            <th>Outliers</th>
          </tr>
        </thead>
        <tbody>
          {analytics.drivers.map((driver) => (
            <tr
              key={driver.driver}
              data-testid={`driver-row-${driver.driver}`}
              data-ranking-eligible={driver.valid_lap_count >= MIN_VALID_LAPS_FOR_RANKING}
            >
              <td>{driver.driver}</td>
              <td>{driver.valid_lap_count}</td>
              <td>{formatMs(driver.best_lap_ms)}</td>
              <td>{formatMs(driver.theoretical_best_lap_ms)}</td>
              <td>{formatMs(driver.theoretical_best_delta_ms)}</td>
              <td>{formatMs(driver.median_lap_ms)}</td>
              <td>{formatMsSuffix(driver.consistency_ms)}</td>
              <td>{formatPct(driver.full_throttle_pct)}</td>
              <td>{driver.outlier_lap_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {analytics.warnings.length > 0 && (
        <ul aria-label="Session analytics warnings">
          {analytics.warnings.map((warning) => (
            <li key={`${warning.code}-${warning.driver}`}>
              {warning.driver}: {warning.detail ?? warning.code}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatMs(valueMs: number | null): string {
  return valueMs !== null ? `${valueMs.toFixed(0)}ms` : "—";
}

function formatMsSuffix(valueMs: number | null): string {
  return valueMs !== null ? `${valueMs.toFixed(1)}ms` : "—";
}

function formatPct(valuePct: number | null): string {
  return valuePct !== null ? `${valuePct.toFixed(1)}%` : "—";
}
