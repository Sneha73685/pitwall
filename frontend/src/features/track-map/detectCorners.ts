import type { DistancePoint } from "./nearestTrackPointAt";

/**
 * One detected corner region on a session's track geometry (M22,
 * docs/m22-design-review.md §3/§4). Deliberately minimal -- no apex, no
 * direction, no corner number, no severity. `apex_distance_m` and turn
 * direction are computable internally during detection but are not
 * exposed: neither is independently validated (§3.5's own found sign-
 * convention bug), and nothing in this milestone's visual representation
 * (plain region shading, §8/§9) needs them.
 */
export interface CornerRegion {
  start_distance_m: number;
  end_distance_m: number;
}

/**
 * Tunable detection parameters (docs/m22-design-review.md §3.3/§20): a
 * validated starting point against four real, structurally different
 * circuits and nine synthetic cases, not claimed final-tuned. Exposed so
 * a future adjustment (§20's own anticipated smallest-fix case) doesn't
 * require touching the algorithm itself.
 */
export interface CornerDetectionOptions {
  /** Arc-length window (m) used to estimate local heading at each point. */
  windowM: number;
  /** Turn rate (rad/m) above which a point is considered "in a corner". */
  curvatureThreshold: number;
  /** Max gap (m) between flagged runs that still counts as one region. */
  mergeGapM: number;
  /** Minimum region length (m); shorter merged runs are discarded as noise. */
  minRegionLengthM: number;
}

export const DEFAULT_CORNER_DETECTION_OPTIONS: CornerDetectionOptions = {
  windowM: 40,
  curvatureThreshold: 0.008,
  mergeGapM: 25,
  minRegionLengthM: 15,
};

function isFinitePoint(point: DistancePoint): boolean {
  return Number.isFinite(point.distance_m) && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function wrapAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) {
    result -= 2 * Math.PI;
  }
  while (result < -Math.PI) {
    result += 2 * Math.PI;
  }
  return result;
}

/**
 * Local heading at every point, via a chord spanning `windowM` meters
 * centered on each point (an arc-length window, not a point-count one --
 * real track-point spacing is uneven, docs/m22-design-review.md §3.1).
 * `null` where the window collapses to a single point (start/end of the
 * array, or too few points overall).
 *
 * A single forward sliding window, not a per-point rescan: both window
 * edges are non-decreasing as `i` increases (distances are ascending), so
 * each pointer only ever moves forward -- O(n) total across all points,
 * not the O(n^2) repeated-rescan shape used for Stage B's rapid real-data
 * prototyping (docs/m22-design-review.md §18 step 1).
 */
function computeHeadings(points: readonly DistancePoint[], windowM: number): (number | null)[] {
  const n = points.length;
  const headings: (number | null)[] = new Array(n).fill(null);
  let loPtr = 0;
  let hiPtr = 0;

  for (let i = 0; i < n; i++) {
    const loTarget = points[i].distance_m - windowM / 2;
    const hiTarget = points[i].distance_m + windowM / 2;

    while (loPtr < n - 1 && points[loPtr + 1].distance_m <= loTarget) {
      loPtr++;
    }
    while (hiPtr < n - 1 && points[hiPtr].distance_m < hiTarget) {
      hiPtr++;
    }

    const lo = points[loPtr];
    const hi = points[hiPtr];
    if (lo === hi) {
      continue;
    }
    headings[i] = Math.atan2(hi.y - lo.y, hi.x - lo.x);
  }

  return headings;
}

/** Curvature (rad/m) at each point: unwrapped heading change between
 * consecutive points, divided by the distance between them. Points with
 * no computable heading, or a non-positive distance step (adjacent/
 * duplicate `distance_m`), contribute zero curvature rather than raising
 * -- duplicate distances are a real, if rare, possibility this function
 * degrades on safely, matching docs/m22-design-review.md §12. */
function computeCurvature(
  points: readonly DistancePoint[],
  headings: readonly (number | null)[],
): number[] {
  const n = points.length;
  const curvature = new Array(n).fill(0) as number[];

  for (let i = 1; i < n; i++) {
    const previousHeading = headings[i - 1];
    const currentHeading = headings[i];
    if (previousHeading === null || currentHeading === null) {
      continue;
    }
    const dd = points[i].distance_m - points[i - 1].distance_m;
    if (dd <= 0) {
      continue;
    }
    curvature[i] = wrapAngle(currentHeading - previousHeading) / dd;
  }

  return curvature;
}

/**
 * Detects corner regions from a session's distance-ordered track geometry
 * (docs/m22-design-review.md §3.3). Pure, deterministic, no network access,
 * no global state; never mutates `points`.
 *
 * Preconditions this function relies on but does not itself re-validate
 * (§3.1, §13.A): `points` is ordered by ascending `distance_m` -- the
 * existing `GET /sessions/{id}/track` contract already guarantees this, so
 * no real caller can violate it. Non-finite points (NaN/Infinity
 * `distance_m`/`x`/`y`) are filtered out defensively before detection runs,
 * satisfying "handle duplicate/invalid coordinates safely" without
 * assuming the input is already clean.
 *
 * Returns `[]` for empty, too-small, or otherwise unusable geometry --
 * never throws.
 */
export function detectCorners(
  points: readonly DistancePoint[],
  options: CornerDetectionOptions = DEFAULT_CORNER_DETECTION_OPTIONS,
): CornerRegion[] {
  const valid = points.filter(isFinitePoint);
  if (valid.length < 3) {
    return [];
  }

  const headings = computeHeadings(valid, options.windowM);
  const curvature = computeCurvature(valid, headings);
  const flagged = curvature.map((c) => Math.abs(c) > options.curvatureThreshold);

  const regions: CornerRegion[] = [];
  let i = 0;
  const n = valid.length;
  while (i < n) {
    if (!flagged[i]) {
      i++;
      continue;
    }
    const startIndex = i;
    let endIndex = i;
    let j = i + 1;
    while (j < n) {
      if (flagged[j]) {
        endIndex = j;
        j++;
      } else if (valid[j].distance_m - valid[endIndex].distance_m <= options.mergeGapM) {
        j++;
      } else {
        break;
      }
    }
    i = j;

    const startDistanceM = valid[startIndex].distance_m;
    const endDistanceM = valid[endIndex].distance_m;
    if (endDistanceM - startDistanceM >= options.minRegionLengthM) {
      regions.push({ start_distance_m: startDistanceM, end_distance_m: endDistanceM });
    }
  }

  return regions;
}
