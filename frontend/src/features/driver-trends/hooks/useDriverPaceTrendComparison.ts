import { useEffect, useState } from "react";
import {
  comparePaceTrends,
  type SeasonPaceTrendComparisonResponse,
  type SessionType,
} from "../../../api/client";

interface UseDriverPaceTrendComparisonResult {
  comparison: SeasonPaceTrendComparisonResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a two-driver season pace-trend comparison via plain
 * useEffect+useState -- mirrors useDriverSeasonPaceTrend.ts exactly (M17),
 * extended to the paired-sides shape (M25, docs/m25-design-review.md §6).
 * Refetches whenever any of the five fields changes. Callers pass
 * undefined for any field not yet resolved (e.g. an empty driver input);
 * the fetch is skipped entirely until all four required fields are
 * present, matching every other comparison hook's own gating convention
 * (useLapComparison, useStintComparison).
 */
export function useDriverPaceTrendComparison(
  driverA: string | undefined,
  seasonA: number | undefined,
  driverB: string | undefined,
  seasonB: number | undefined,
  sessionType: SessionType,
): UseDriverPaceTrendComparisonResult {
  const [comparison, setComparison] = useState<SeasonPaceTrendComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverA || seasonA === undefined || !driverB || seasonB === undefined) {
      return;
    }
    setComparison(null);
    setLoading(true);
    setError(null);
    comparePaceTrends({ driverA, seasonA, driverB, seasonB, sessionType })
      .then(setComparison)
      .catch(() => setError("Could not load pace trend comparison."))
      .finally(() => setLoading(false));
  }, [driverA, seasonA, driverB, seasonB, sessionType]);

  return { comparison, loading, error };
}
