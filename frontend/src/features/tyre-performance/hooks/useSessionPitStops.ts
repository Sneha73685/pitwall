import { useEffect, useState } from "react";
import { getPitStops, type PitStop } from "../../../api/client";

interface UseSessionPitStopsResult {
  pitStops: PitStop[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches every pit stop for a whole session (no `driverId` filter) via the
 * existing, unmodified `getPitStops` client function (M10) -- its `driverId`
 * parameter was already optional; this hook is the first caller to omit it.
 * Neither `useRaceContext` (driver-scoped) nor `useTyrePerformance`
 * (`TyrePerformanceResponse` carries no pit-stop field) covers this read
 * pattern, so `PitLaneTimeSummary` needs its own hook rather than reusing
 * either (docs/m11-frontend-design-note.md §3, §8.7, §17).
 *
 * Same plain useEffect+useState shape, and the same clear-before-fetch
 * convention `useTyrePerformance`/`useDriverStintPace` already use, since
 * there is only ever one sessionId in play per page instance.
 */
export function useSessionPitStops(sessionId: string | undefined): UseSessionPitStopsResult {
  const [pitStops, setPitStops] = useState<PitStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    setPitStops([]);
    setLoading(true);
    setError(null);
    getPitStops(sessionId)
      .then(setPitStops)
      .catch(() => setError("Could not load pit stops."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { pitStops, loading, error };
}
