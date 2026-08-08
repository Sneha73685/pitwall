import { useEffect, useState } from "react";
import { getTyrePerformance, type TyrePerformanceResponse } from "../../../api/client";

interface UseTyrePerformanceResult {
  tyrePerformance: TyrePerformanceResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the session-wide descriptive tyre/stint performance payload via
 * plain useEffect+useState -- the same pattern every existing hook in this
 * app already uses (no server-state library anywhere in the frontend).
 * Data layer only: this hook does not compute compound aggregates,
 * strategy summaries, or any other analytical semantics -- all of that
 * already happened in the backend (docs/m11-design-review.md, Phase 1/2)
 * and is served as-is.
 *
 * `tyrePerformance` is cleared to `null` at the start of each new fetch,
 * matching useSessionAnalytics's clear-before-fetch convention for the
 * same reason: there is only ever one sessionId in play per page instance.
 */
export function useTyrePerformance(sessionId: string | undefined): UseTyrePerformanceResult {
  const [tyrePerformance, setTyrePerformance] = useState<TyrePerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    setTyrePerformance(null);
    setLoading(true);
    setError(null);
    getTyrePerformance(sessionId)
      .then(setTyrePerformance)
      .catch(() => setError("Could not load tyre performance."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { tyrePerformance, loading, error };
}
