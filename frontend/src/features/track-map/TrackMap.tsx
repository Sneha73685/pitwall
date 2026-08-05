import { scaleLinear } from "d3-scale";
import { line as d3Line } from "d3-shape";
import type { TrackPoint } from "../../api/client";

interface Point {
  x: number;
  y: number;
}

interface TrackMapProps {
  /** Session-level track geometry (docs/data-model.md's TrackPoint), the static background shape. */
  trackPoints: TrackPoint[];
  /** The selected lap's own position samples, plotted as a highlighted line over the track shape. */
  lapPoints: Point[];
  /**
   * A second lap's position samples, for two-lap comparison (M6). Omitted
   * entirely for the single-lap view -- when absent, this renders exactly
   * as it did before M6 (one lap line, no second color).
   */
  secondaryLapPoints?: Point[];
  /**
   * Per-point colors for the track outline (M6 Phase 8: delta-based segment
   * coloring). Must be the same length as `trackPoints` -- the segment
   * between `trackPoints[i]` and `trackPoints[i + 1]` is stroked with
   * `segmentColors[i]`. Omitted for the single-lap view and for the
   * comparison view's plain two-lap-line case, both of which keep the
   * outline's fixed single color.
   */
  segmentColors?: string[];
}

const WIDTH = 600;
const HEIGHT = 400;
const PADDING = 20;

// Same fixed "A"/"B" pair TelemetryCharts uses for the comparison case --
// no team/driver color system exists in this app yet (see chartOptions.ts).
const LAP_A_COLOR = "#5470c6";
const LAP_B_COLOR = "#ee6666";

/**
 * Static track map (M4, ADR architecture.md §4): D3 only computes scales and
 * the path string, React renders the actual SVG elements -- D3 never
 * touches the DOM directly, avoiding the two libraries fighting over it.
 * No hover/cursor interactivity yet; that's V2 (docs/success-metrics.md).
 */
export function TrackMap({
  trackPoints,
  lapPoints,
  secondaryLapPoints,
  segmentColors,
}: TrackMapProps) {
  if (trackPoints.length === 0) {
    return <p>No track geometry available for this session.</p>;
  }

  const xs = trackPoints.map((point) => point.x);
  const ys = trackPoints.map((point) => point.y);

  const xScale = scaleLinear()
    .domain([Math.min(...xs), Math.max(...xs)])
    .range([PADDING, WIDTH - PADDING]);
  // SVG's y-axis grows downward; flip the range so the track isn't upside down.
  const yScale = scaleLinear()
    .domain([Math.min(...ys), Math.max(...ys)])
    .range([HEIGHT - PADDING, PADDING]);

  const lineGenerator = d3Line<Point>()
    .x((point) => xScale(point.x))
    .y((point) => yScale(point.y));

  const trackPath = lineGenerator(trackPoints);
  const trackSegments =
    segmentColors &&
    trackPoints.slice(0, -1).map((point, index) => ({
      d: lineGenerator([point, trackPoints[index + 1]]),
      color: segmentColors[index],
    }));
  const lapPath = lapPoints.length > 0 ? lineGenerator(lapPoints) : null;
  const startPoint = lapPoints[0];
  const secondaryLapPath =
    secondaryLapPoints && secondaryLapPoints.length > 0 ? lineGenerator(secondaryLapPoints) : null;
  const secondaryStartPoint = secondaryLapPoints?.[0];
  const lapColor = secondaryLapPoints ? LAP_A_COLOR : "red";

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Track map"
      data-testid="track-map"
    >
      {trackSegments
        ? trackSegments.map(
            (segment, index) =>
              segment.d && (
                <path
                  key={index}
                  d={segment.d}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={3}
                  data-testid={`track-segment-${index}`}
                />
              ),
          )
        : trackPath && (
            <path
              d={trackPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              opacity={0.4}
              data-testid="track-outline"
            />
          )}
      {lapPath && (
        <path d={lapPath} fill="none" stroke={lapColor} strokeWidth={3} data-testid="lap-line" />
      )}
      {startPoint && (
        <circle
          cx={xScale(startPoint.x)}
          cy={yScale(startPoint.y)}
          r={5}
          fill={lapColor}
          data-testid="lap-start-marker"
        />
      )}
      {secondaryLapPath && (
        <path
          d={secondaryLapPath}
          fill="none"
          stroke={LAP_B_COLOR}
          strokeWidth={3}
          data-testid="secondary-lap-line"
        />
      )}
      {secondaryStartPoint && (
        <circle
          cx={xScale(secondaryStartPoint.x)}
          cy={yScale(secondaryStartPoint.y)}
          r={5}
          fill={LAP_B_COLOR}
          data-testid="secondary-lap-start-marker"
        />
      )}
    </svg>
  );
}
