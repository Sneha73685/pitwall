import { useEffect, useState } from "react";
import {
  getDriverSeasonPaceTrend,
  type SeasonPaceTrendResponse,
  type SessionType,
} from "../../../api/client";

interface UseDriverSeasonPaceTrendResult {
  trend: SeasonPaceTrendResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches one driver's season pace trend via plain useEffect+useState --
 * the same pattern every existing hook in this app already uses
 * (docs/m17-design-review.md §7). Refetches whenever the driver, season,
 * or session-type filter changes.
 */
export function useDriverSeasonPaceTrend(
  driverId: string | undefined,
  season: number | undefined,
  sessionType: SessionType,
): UseDriverSeasonPaceTrendResult {
  const [trend, setTrend] = useState<SeasonPaceTrendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverId || season === undefined) {
      return;
    }
    setTrend(null);
    setLoading(true);
    setError(null);
    getDriverSeasonPaceTrend(driverId, season, sessionType)
      .then(setTrend)
      .catch(() => setError("Could not load pace trend."))
      .finally(() => setLoading(false));
  }, [driverId, season, sessionType]);

  return { trend, loading, error };
}
