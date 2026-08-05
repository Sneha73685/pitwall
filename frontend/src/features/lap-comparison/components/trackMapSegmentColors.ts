import type { LapComparisonResponse, TrackPoint } from "../../../api/client";

// Same fixed A/B pair TelemetryCharts/DeltaChart/TrackMap already use -- no
// team/driver color system exists in this app yet.
const LAP_A_RGB: [number, number, number] = [84, 112, 198]; // #5470c6
const LAP_B_RGB: [number, number, number] = [238, 102, 102]; // #ee6666
const NEUTRAL_RGB: [number, number, number] = [200, 200, 200];
const NEUTRAL_COLOR = `rgb(${NEUTRAL_RGB.join(", ")})`;

function mix(target: [number, number, number], intensity: number): string {
  const [r, g, b] = NEUTRAL_RGB.map((component, index) =>
    Math.round(component + (target[index] - component) * intensity),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Colors each track-outline segment by which lap was ahead at that point on
 * track (M6 Phase 8, docs/m6-design-review.md §8/§9), using the same
 * distance grid the compare endpoint already aligned both laps onto.
 * `trackPoints[i]`'s delta is looked up from the nearest compared
 * `distance_m` grid point at or before it -- the grid's resolution
 * (capped at MAX_COMPARE_RESOLUTION server-side) is coarser than the
 * track geometry's own sampling, so this is a lookup, not a new
 * interpolation (matching the "no new interpolation logic" reuse
 * discipline already established for the backend's sectors.py).
 *
 * A diverging tint, not a flat color: intensity scales with
 * `|delta_ms|` relative to the comparison's own max, so a barely-there
 * delta reads as barely-tinted and the biggest swing reads fully
 * saturated -- centered on a neutral gray at delta == 0.
 */
export function computeSegmentColors(
  trackPoints: TrackPoint[],
  comparison: Pick<LapComparisonResponse, "distance_m" | "delta_ms">,
): string[] {
  const { distance_m, delta_ms } = comparison;

  if (distance_m.length === 0) {
    return trackPoints.map(() => NEUTRAL_COLOR);
  }

  const maxAbsDelta = Math.max(1, ...delta_ms.map((value) => Math.abs(value)));

  let gridIndex = 0;
  return trackPoints.map((point) => {
    while (gridIndex + 1 < distance_m.length && distance_m[gridIndex + 1] <= point.distance_m) {
      gridIndex += 1;
    }
    const delta = delta_ms[gridIndex];
    const intensity = Math.min(1, Math.abs(delta) / maxAbsDelta);
    if (delta === 0) {
      return NEUTRAL_COLOR;
    }
    return delta > 0 ? mix(LAP_A_RGB, intensity) : mix(LAP_B_RGB, intensity);
  });
}
