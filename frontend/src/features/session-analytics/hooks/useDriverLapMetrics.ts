import { useEffect, useState } from "react";
import { getDriverLapMetrics, type DriverLapsResponse } from "../../../api/client";

interface UseDriverLapMetricsResult {
  metrics: DriverLapsResponse | null;
  error: string | null;
}

/**
 * Fetches one driver's lap-by-lap session-analytics metrics, lazily: only
 * once `driver` is provided (drill-down selection, Phase 4 -- nothing
 * calls this hook with a real driver yet), matching
 * docs/m8-design-review.md §3/§4's "fetched lazily per driver" design.
 *
 * Caches per driver so re-selecting a previously viewed driver doesn't
 * refetch (design doc §4). This is a deliberate, documented departure
 * from useSessionAnalytics/useLapComparison's plain no-cache convention
 * (docs/m8-implementation-plan.md §0.4c, option (a)): no other hook in
 * this codebase caches anything, but the drill-down UX this hook serves
 * specifically needs it, and a small in-hook cache keyed by driver is a
 * few lines, not a new dependency or library. The cache assumes a stable
 * `sessionId` for the hook's lifetime -- true in practice, since React
 * Router remounts SessionAnalyticsPage (and this hook with it) on a
 * session change.
 *
 * The effect re-running once more after a cache write (because `cache`
 * itself is a dependency) is expected and harmless: the second run sees
 * `cache[driver]` already populated and returns immediately without
 * fetching again.
 */
export function useDriverLapMetrics(
  sessionId: string | undefined,
  driver: string | undefined,
): UseDriverLapMetricsResult {
  const [cache, setCache] = useState<Record<string, DriverLapsResponse>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !driver || cache[driver]) {
      return;
    }
    setError(null);
    getDriverLapMetrics(sessionId, driver)
      .then((metrics) => setCache((current) => ({ ...current, [driver]: metrics })))
      .catch(() => setError("Could not load driver lap metrics."));
  }, [sessionId, driver, cache]);

  return { metrics: driver ? (cache[driver] ?? null) : null, error };
}
