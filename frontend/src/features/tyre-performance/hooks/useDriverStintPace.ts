import { useEffect, useState } from "react";
import { getDriverStintPace, type DriverStintPaceResponse } from "../../../api/client";

interface UseDriverStintPaceResult {
  stintPace: DriverStintPaceResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches one driver's descriptive per-stint raw lap-time view via plain
 * useEffect+useState -- the same pattern every existing hook in this app
 * already uses (no server-state library anywhere in the frontend). Data
 * layer only: this hook does not compute eligibility, consistency, or any
 * other analytical semantics -- all of that already happened in the
 * backend (docs/m11-design-review.md, Phase 1/2) and is served as-is.
 *
 * `stintPace` is cleared to `null` at the start of each new fetch (not left
 * stale from a previous driver) -- matching useSessionAnalytics's
 * clear-before-fetch convention rather than useRaceContext's, since a
 * per-driver hook risks showing one driver's stints under a different
 * driver's `driver_id` for a moment otherwise.
 */
export function useDriverStintPace(
  sessionId: string | undefined,
  driverId: string | undefined,
): UseDriverStintPaceResult {
  const [stintPace, setStintPace] = useState<DriverStintPaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !driverId) {
      return;
    }
    setStintPace(null);
    setLoading(true);
    setError(null);
    getDriverStintPace(sessionId, driverId)
      .then(setStintPace)
      .catch(() => setError("Could not load stint pace."))
      .finally(() => setLoading(false));
  }, [sessionId, driverId]);

  return { stintPace, loading, error };
}
