import { useEffect, useMemo, useState } from "react";
import { getTrackPoints, type LapComparisonResponse, type TrackPoint } from "../../../api/client";
import { TrackMap } from "../../track-map/TrackMap";
import { computeSegmentColors } from "./trackMapSegmentColors";

interface TrackMapDeltaProps {
  sessionId: string;
  comparison: LapComparisonResponse;
}

/**
 * Track map colored by which lap was ahead at each point on track (M6
 * Phase 8, docs/m6-design-review.md §8/§9). Fetches session-level track
 * geometry the same way TrackMapPage does (M4/M5) -- the compare endpoint
 * doesn't return position data, only the six telemetry channels
 * (backend/app/models/lap_comparison.py's COMPARE_CHANNELS), so this
 * reuses getTrackPoints rather than adding x/y to the compare response.
 *
 * Colors the track *outline* (TrackPoint already carries distance_m), not
 * either lap's own driving line -- the comparison response has no per-lap
 * x/y telemetry to draw a second line from, and the outline is exactly the
 * shape delta coloring needs: one line, colored by whichever lap was ahead
 * at each distance.
 *
 * `segmentColors` is memoized on the fetched track geometry and the
 * comparison object so it isn't recomputed on unrelated re-renders (e.g. a
 * channel-visibility toggle elsewhere on the page) -- design §12's
 * performance note, applied without the cursor-sync machinery that note
 * also describes: `echarts.connect`/`useCursorSync` cross-chart sync is V2
 * scope per docs/success-metrics.md and ADR-0007/ADR-0008, already
 * deferred for DeltaChart/TelemetryCharts (Phase 7) -- this component
 * follows that same precedent, so there's no hover-driven marker here.
 */
export function TrackMapDelta({ sessionId, comparison }: TrackMapDeltaProps) {
  const [trackPoints, setTrackPoints] = useState<TrackPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTrackPoints(sessionId)
      .then(setTrackPoints)
      .catch(() => setError("Could not load track geometry."));
  }, [sessionId]);

  const segmentColors = useMemo(
    () => (trackPoints ? computeSegmentColors(trackPoints, comparison) : undefined),
    [trackPoints, comparison],
  );

  if (error) {
    return <p role="alert">{error}</p>;
  }
  if (!trackPoints) {
    return <p>Loading track map...</p>;
  }

  return <TrackMap trackPoints={trackPoints} lapPoints={[]} segmentColors={segmentColors} />;
}
