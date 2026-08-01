import type { LapComparisonResponse } from "../../../api/client";

interface ComparisonHeaderProps {
  comparison: LapComparisonResponse;
  onSwap: () => void;
}

/**
 * Driver/lap identity, overall delta, and the A/B swap control
 * (docs/m6-design-review.md §1.2). Swapping just flips which selection
 * ComparisonPage holds as A vs B -- useLapComparison (Phase 4) refetches
 * naturally on the param change, and the backend's sign convention
 * (positive delta_ms == lap A faster) flips correctly along with it, so
 * there's nothing to invert here.
 */
export function ComparisonHeader({ comparison, onSwap }: ComparisonHeaderProps) {
  const overallDeltaMs = comparison.delta_ms.at(-1) ?? 0;
  const fasterLabel = overallDeltaMs >= 0 ? "A" : "B";

  return (
    <header>
      <div data-testid="lap-a-summary">
        <span>{comparison.lap_a.driver_id}</span>
        <span> — Lap {comparison.lap_a.lap_number}</span>
        {comparison.lap_a.lap_time_seconds !== null && (
          <span> — {comparison.lap_a.lap_time_seconds.toFixed(3)}s</span>
        )}
      </div>
      <button type="button" onClick={onSwap}>
        Swap A/B
      </button>
      <div data-testid="lap-b-summary">
        <span>{comparison.lap_b.driver_id}</span>
        <span> — Lap {comparison.lap_b.lap_number}</span>
        {comparison.lap_b.lap_time_seconds !== null && (
          <span> — {comparison.lap_b.lap_time_seconds.toFixed(3)}s</span>
        )}
      </div>
      <p data-testid="overall-delta">
        Overall delta: {Math.abs(overallDeltaMs).toFixed(0)}ms ({fasterLabel} faster)
      </p>
    </header>
  );
}
