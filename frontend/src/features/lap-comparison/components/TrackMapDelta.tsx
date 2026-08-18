import { useMemo } from "react";
import type { LapComparisonResponse, TrackPoint } from "../../../api/client";
import { Card } from "../../../components/Card";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import type { CornerRegion } from "../../track-map/detectCorners";
import { nearestTrackPointAt } from "../../track-map/nearestTrackPointAt";
import { TrackMap } from "../../track-map/TrackMap";
import { useComparisonStore } from "../comparisonStore";
import { computeSegmentColors } from "./trackMapSegmentColors";

interface TrackMapDeltaProps {
  comparison: LapComparisonResponse;
  /**
   * Session A's track geometry (M22, docs/m22-design-review.md §17):
   * fetched once by the parent `ComparisonPage`, not by this component --
   * lifted so the same `trackPoints`-derived corner list can also reach
   * `DeltaChart`/`ChannelOverlayPanel` on the same page. `null` while
   * loading, matching the previous internal-fetch state shape exactly.
   */
  trackPoints: TrackPoint[] | null;
  /** Track-geometry fetch error, if any, from the parent's fetch. */
  error: string | null;
  /** Whether session A/B are at different real-world circuits (M13) --
   * computed once by the parent from the same `comparison.warnings` this
   * component used to read directly. */
  hasCircuitMismatch: boolean;
  /** Detected corner regions (M22, docs/m22-design-review.md §9), already
   * computed by the parent from the same `trackPoints`. */
  corners?: CornerRegion[];
}

/**
 * Track map colored by which lap was ahead at each point on track (M6
 * Phase 8, docs/m6-design-review.md §8/§9). Session-level track geometry
 * (M4/M5) -- the compare endpoint doesn't return position data, only the
 * six telemetry channels (backend/app/models/lap_comparison.py's
 * COMPARE_CHANNELS), so `trackPoints` comes from `GET /sessions/{id}/track`
 * instead.
 *
 * Colors the track *outline* (TrackPoint already carries distance_m), not
 * either lap's own driving line -- the comparison response has no per-lap
 * x/y telemetry to draw a second line from, and the outline is exactly the
 * shape delta coloring needs: one line, colored by whichever lap was ahead
 * at each distance.
 *
 * `segmentColors` is memoized on the fetched track geometry and the
 * comparison object so it isn't recomputed on unrelated re-renders (e.g. a
 * channel-visibility toggle elsewhere on the page).
 *
 * M14 (docs/m14-design-review.md §9): the synchronized cursor's marker,
 * resolved via `nearestTrackPointAt` against `trackPoints` (the outline --
 * this component never has per-lap x/y, see above) rather than against
 * either lap's own samples. Reads `comparisonStore` directly, same as
 * `DeltaChart`, since this component only ever renders on `ComparisonPage`.
 *
 * M13 (docs/m13-design-review.md §9): when the backend's
 * `different_circuit` warning is present (session A and session B are at
 * different real-world locations), session A's track outline would
 * misrepresent lap B, which never drove it -- this component hides the
 * map entirely and explains why, rather than rendering a shape that
 * doesn't belong to one of the two compared laps.
 *
 * M22 (docs/m22-design-review.md §17): `trackPoints`/`error`/
 * `hasCircuitMismatch` are now props, fetched and computed once by the
 * parent `ComparisonPage` rather than by this component itself -- this
 * component's own loading/error/circuit-mismatch *rendering* is otherwise
 * unchanged. `corners` is passed straight through to `TrackMap`.
 */
export function TrackMapDelta({
  comparison,
  trackPoints,
  error,
  hasCircuitMismatch,
  corners,
}: TrackMapDeltaProps) {
  const cursorDistanceM = useComparisonStore((state) => state.distanceM);

  const segmentColors = useMemo(
    () => (trackPoints ? computeSegmentColors(trackPoints, comparison) : undefined),
    [trackPoints, comparison],
  );
  const cursorPoint = trackPoints ? nearestTrackPointAt(trackPoints, cursorDistanceM) : null;

  if (hasCircuitMismatch) {
    return (
      <Card title="Track Map — Delta">
        <p>
          Track visualization is unavailable: Session A and Session B are at different circuits, so
          there is no single track outline both laps actually drove.
        </p>
      </Card>
    );
  }
  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }
  if (!trackPoints) {
    return <LoadingState>Loading track map...</LoadingState>;
  }

  return (
    <Card title="Track Map — Delta">
      <TrackMap
        trackPoints={trackPoints}
        lapPoints={[]}
        segmentColors={segmentColors}
        cursorPoint={cursorPoint}
        cornerRegions={corners}
      />
    </Card>
  );
}
