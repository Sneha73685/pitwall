/** Any distance-ordered point array the M14 cursor marker can search -- both
 * `TrackPoint` (the track outline, used by `TrackMapDelta`) and
 * `TelemetrySample` (a lap's real per-sample positions, used by
 * `TrackMapPage`) already satisfy this shape.
 */
export interface DistancePoint {
  distance_m: number;
  x: number;
  y: number;
}

/**
 * Nearest-point lookup for the synchronized cursor marker (M14,
 * docs/m14-design-review.md §9): given a distance-ordered points array and
 * a target `distanceM`, returns the point whose `distance_m` is closest.
 * Nearest-point, not interpolated -- §9 explains why interpolating between
 * two adjacent points on a 600x400px SVG map would be imperceptible at this
 * app's real point-count scale, so it isn't implemented.
 *
 * A plain linear scan: point arrays here are at most a few thousand long
 * (§13), well within "not a measurable cost" for a per-hover-event lookup.
 */
export function nearestTrackPointAt(
  points: DistancePoint[],
  distanceM: number | null,
): { x: number; y: number } | null {
  if (distanceM === null || points.length === 0) {
    return null;
  }

  let nearest = points[0];
  let nearestDelta = Math.abs(points[0].distance_m - distanceM);
  for (const point of points) {
    const delta = Math.abs(point.distance_m - distanceM);
    if (delta < nearestDelta) {
      nearest = point;
      nearestDelta = delta;
    }
  }
  return { x: nearest.x, y: nearest.y };
}
