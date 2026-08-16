import { useEffect, useState } from "react";
import { compareStints, type StintComparisonResponse } from "../../../api/client";

interface UseStintComparisonResult {
  comparison: StintComparisonResponse | null;
  error: string | null;
}

/**
 * Fetches a two-driver stint/tyre-strategy comparison via plain
 * useEffect+useState -- the same pattern every existing hook in this app
 * already uses (docs/m15-design-review.md §7, mirrors
 * lap-comparison/hooks/useLapComparison.ts exactly, minus the lap-number
 * dimension).
 */
export function useStintComparison(
  sessionIdA: string | undefined,
  driverA: string | undefined,
  sessionIdB: string | undefined,
  driverB: string | undefined,
): UseStintComparisonResult {
  const [comparison, setComparison] = useState<StintComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionIdA || !driverA || !sessionIdB || !driverB) {
      return;
    }
    setComparison(null);
    setError(null);
    compareStints({ sessionIdA, driverA, sessionIdB, driverB })
      .then(setComparison)
      .catch(() => setError("Could not load stint comparison."));
  }, [sessionIdA, driverA, sessionIdB, driverB]);

  return { comparison, error };
}
