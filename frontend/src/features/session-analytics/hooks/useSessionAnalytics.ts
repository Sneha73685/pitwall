import { useEffect, useState } from "react";
import { getSessionAnalytics, type SessionAnalyticsResponse } from "../../../api/client";

interface UseSessionAnalyticsResult {
  analytics: SessionAnalyticsResponse | null;
  error: string | null;
}

/**
 * Fetches the session-wide driver summary payload via plain
 * useEffect+useState -- the same pattern every existing page in this app
 * already uses (no server-state library exists anywhere in the frontend;
 * confirmed in M6 Phase 0, reconfirmed for M8 in
 * docs/m8-implementation-plan.md §0.4c).
 *
 * No caching here, unlike useDriverLapMetrics: there is only ever one
 * sessionId in play per SessionAnalyticsPage instance (React Router
 * unmounts/remounts the page on a session change), so there's nothing to
 * cache across repeated selections the way per-driver drill-down needs.
 */
export function useSessionAnalytics(sessionId: string | undefined): UseSessionAnalyticsResult {
  const [analytics, setAnalytics] = useState<SessionAnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    setAnalytics(null);
    setError(null);
    getSessionAnalytics(sessionId)
      .then(setAnalytics)
      .catch(() => setError("Could not load session analytics."));
  }, [sessionId]);

  return { analytics, error };
}
