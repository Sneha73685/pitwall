import { useEffect, useState } from "react";
import { getPitStops, getStints, type PitStop, type Stint } from "../../../api/client";

interface UseRaceContextResult {
  stints: Stint[];
  pitStops: PitStop[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches one driver's stints and one session's (driver_id-filtered) pit
 * stops together, via plain useEffect+useState -- the same pattern every
 * existing page/hook in this app already uses (no server-state library
 * anywhere in the frontend; confirmed in M8 Phase 0, §0.4c).
 *
 * One combined hook, not two, matching useLapComparison's precedent of one
 * hook per page-level concern: StrategyPage needs both pieces together, so
 * one loading/error state is simpler than reconciling two independent ones
 * (docs/m10-implementation-plan.md Phase 5).
 */
export function useRaceContext(
  sessionId: string | undefined,
  driverId: string | undefined,
): UseRaceContextResult {
  const [stints, setStints] = useState<Stint[]>([]);
  const [pitStops, setPitStops] = useState<PitStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !driverId) {
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([getStints(sessionId, driverId), getPitStops(sessionId, driverId)])
      .then(([stintsResult, pitStopsResult]) => {
        setStints(stintsResult);
        setPitStops(pitStopsResult);
      })
      .catch(() => setError("Could not load race strategy."))
      .finally(() => setLoading(false));
  }, [sessionId, driverId]);

  return { stints, pitStops, loading, error };
}
