import { useEffect, useMemo, useState } from "react";
import { getTrackPoints, type LapComparisonResponse, type TrackPoint } from "../../../api/client";
import { Card } from "../../../components/Card";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
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
 *
 * M13 (docs/m13-design-review.md §9): `sessionId` is now the caller's
 * choice of *which* session's geometry to show -- always session A's,
 * matching the same "lap A is the reference" convention
 * app/services/lap_comparison/sectors.py already uses. When the backend's
 * `different_circuit` warning is present (session A and session B are at
 * different real-world locations), session A's track outline would
 * misrepresent lap B, which never drove it -- this component hides the
 * map entirely and explains why, rather than rendering a shape that
 * doesn't belong to one of the two compared laps.
 */
export function TrackMapDelta({ sessionId, comparison }: TrackMapDeltaProps) {
  const [trackPoints, setTrackPoints] = useState<TrackPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasCircuitMismatch = comparison.warnings.some((w) => w.code === "different_circuit");

  useEffect(() => {
    if (hasCircuitMismatch) {
      return;
    }
    getTrackPoints(sessionId)
      .then(setTrackPoints)
      .catch(() => setError("Could not load track geometry."));
  }, [sessionId, hasCircuitMismatch]);

  const segmentColors = useMemo(
    () => (trackPoints ? computeSegmentColors(trackPoints, comparison) : undefined),
    [trackPoints, comparison],
  );

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
      <TrackMap trackPoints={trackPoints} lapPoints={[]} segmentColors={segmentColors} />
    </Card>
  );
}
