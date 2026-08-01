import { useEffect, useState } from "react";
import { compareLaps, type LapComparisonResponse } from "../../../api/client";

interface UseLapComparisonResult {
  comparison: LapComparisonResponse | null;
  error: string | null;
}

/**
 * Fetches a two-lap comparison via plain useEffect+useState -- the same
 * pattern every existing page in this app already uses (no server-state
 * library exists anywhere in the frontend; confirmed in M6 Phase 0).
 *
 * Extracted as a hook, unlike the single-lap views' inline per-page
 * fetches: the comparison page's several child components (delta chart,
 * telemetry overlays, sector table -- Phase 6+) all need this same fetch
 * result, not just one page, so there's a real second consumer to justify
 * pulling it out.
 *
 * Takes individual primitive params (not a params object) so each stays
 * independently stable across renders for the effect's dependency array,
 * matching getTelemetry's own (sessionId, driverId, lapNumber) shape
 * rather than introducing an object the caller would need to memoize.
 */
export function useLapComparison(
  sessionId: string | undefined,
  driverA: string | undefined,
  lapA: number | undefined,
  driverB: string | undefined,
  lapB: number | undefined,
  resolution?: number,
): UseLapComparisonResult {
  const [comparison, setComparison] = useState<LapComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !driverA || lapA === undefined || !driverB || lapB === undefined) {
      return;
    }
    setComparison(null);
    setError(null);
    compareLaps(sessionId, { driverA, lapA, driverB, lapB, resolution })
      .then(setComparison)
      .catch(() => setError("Could not load lap comparison."));
  }, [sessionId, driverA, lapA, driverB, lapB, resolution]);

  return { comparison, error };
}
