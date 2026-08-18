import { useEffect, useState } from "react";
import {
  getDriverSeasonTyreTrend,
  type SeasonTyreTrendResponse,
  type SessionType,
} from "../../../api/client";

interface UseDriverSeasonTyreTrendResult {
  trend: SeasonTyreTrendResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches one driver's season tyre/stint-strategy trend via plain
 * useEffect+useState -- the same pattern every existing hook in this app
 * already uses, mirroring useDriverSeasonPaceTrend.ts (M17) exactly
 * (docs/m21-design-review.md §7). Refetches whenever the driver, season,
 * or session-type filter changes.
 */
export function useDriverSeasonTyreTrend(
  driverId: string | undefined,
  season: number | undefined,
  sessionType: SessionType,
): UseDriverSeasonTyreTrendResult {
  const [trend, setTrend] = useState<SeasonTyreTrendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverId || season === undefined) {
      return;
    }
    setTrend(null);
    setLoading(true);
    setError(null);
    getDriverSeasonTyreTrend(driverId, season, sessionType)
      .then(setTrend)
      .catch(() => setError("Could not load tyre trend."))
      .finally(() => setLoading(false));
  }, [driverId, season, sessionType]);

  return { trend, loading, error };
}
