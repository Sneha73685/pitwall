import { useEffect, useState } from "react";
import {
  compareTyreTrends,
  type SeasonTyreTrendComparisonResponse,
  type SessionType,
} from "../../../api/client";

interface UseDriverTyreTrendComparisonResult {
  comparison: SeasonTyreTrendComparisonResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a two-driver season tyre-trend comparison via plain
 * useEffect+useState -- mirrors useDriverPaceTrendComparison.ts exactly
 * (M25), one trend over (M26, docs/m26-design-review.md §8). A separate,
 * independent hook rather than a generic useDriverTrendComparison: two
 * instances is below this project's own rule-of-three threshold, and a
 * generic version would need to abstract over SeasonPaceTrendResponse vs.
 * SeasonTyreTrendResponse's different point shapes for no real payoff
 * (docs/m26-design-review.md §8). Refetches whenever any of the five
 * fields changes; the fetch is skipped entirely until all four driver/
 * season fields are present, matching every other comparison hook's own
 * gating convention.
 */
export function useDriverTyreTrendComparison(
  driverA: string | undefined,
  seasonA: number | undefined,
  driverB: string | undefined,
  seasonB: number | undefined,
  sessionType: SessionType,
): UseDriverTyreTrendComparisonResult {
  const [comparison, setComparison] = useState<SeasonTyreTrendComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverA || seasonA === undefined || !driverB || seasonB === undefined) {
      return;
    }
    setComparison(null);
    setLoading(true);
    setError(null);
    compareTyreTrends({ driverA, seasonA, driverB, seasonB, sessionType })
      .then(setComparison)
      .catch(() => setError("Could not load tyre trend comparison."))
      .finally(() => setLoading(false));
  }, [driverA, seasonA, driverB, seasonB, sessionType]);

  return { comparison, loading, error };
}
