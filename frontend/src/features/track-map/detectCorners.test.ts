import { describe, expect, it } from "vitest";
import type { DistancePoint } from "./nearestTrackPointAt";
import { detectCorners } from "./detectCorners";

// --- Synthetic geometry generators (docs/m22-design-review.md §3.5/§13.A) ---

function makeStraight(length = 500, step = 5): DistancePoint[] {
  const points: DistancePoint[] = [];
  for (let d = 0; d <= length; d += step) {
    points.push({ distance_m: d, x: d, y: 0 });
  }
  return points;
}

/** An arc of a circle. direction=1 -> left turn (CCW), -1 -> right (CW). */
function makeSingleTurn(
  radius: number,
  angleDeg: number,
  direction: 1 | -1,
  step = 5,
): DistancePoint[] {
  const arcLen = radius * (angleDeg * (Math.PI / 180));
  const n = Math.floor(arcLen / step) + 1;
  const points: DistancePoint[] = [];
  for (let i = 0; i < n; i++) {
    const d = i * step;
    const theta = direction * (d / radius);
    const x = radius * Math.sin(theta);
    const y = radius * (1 - Math.cos(theta)) * direction;
    points.push({ distance_m: d, x, y });
  }
  return points;
}

function makeHairpin(): DistancePoint[] {
  return makeSingleTurn(25, 170, 1, 2);
}

/** A left turn immediately followed by a right turn -- a tight chicane. */
function makeChicane(): DistancePoint[] {
  const left = makeSingleTurn(60, 35, 1, 5);
  const last = left[left.length - 1];
  const heading = (35 * Math.PI) / 180;
  const right = makeSingleTurn(60, 35, -1, 5);
  const points = [...left];
  for (let k = 1; k < right.length; k++) {
    const { distance_m: d, x, y } = right[k];
    const rx = x * Math.cos(heading) - y * Math.sin(heading);
    const ry = x * Math.sin(heading) + y * Math.cos(heading);
    points.push({ distance_m: last.distance_m + d, x: last.x + rx, y: last.y + ry });
  }
  return points;
}

function makeNoisyStraight(length = 500, step = 5, jitter = 0.15, seed = 42): DistancePoint[] {
  // Deterministic pseudo-random jitter (no external dependency): a simple
  // linear congruential generator, seeded, so this test is reproducible.
  let state = seed;
  function next(): number {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  }
  const points: DistancePoint[] = [];
  for (let i = 0; i * step <= length; i++) {
    const d = i * step;
    points.push({ distance_m: d, x: d, y: (next() * 2 - 1) * jitter });
  }
  return points;
}

describe("detectCorners", () => {
  it("returns [] for a straight", () => {
    expect(detectCorners(makeStraight())).toEqual([]);
  });

  it("detects exactly one region for a single left turn", () => {
    const regions = detectCorners(makeSingleTurn(100, 90, 1));
    expect(regions).toHaveLength(1);
  });

  it("detects exactly one region for a single right turn", () => {
    const regions = detectCorners(makeSingleTurn(100, 90, -1));
    expect(regions).toHaveLength(1);
  });

  it("detects exactly one tight region for a hairpin", () => {
    const regions = detectCorners(makeHairpin());
    expect(regions).toHaveLength(1);
  });

  it("merges a tight chicane's two direction changes into one region (documented behavior)", () => {
    const regions = detectCorners(makeChicane());
    expect(regions).toHaveLength(1);
  });

  it("does not false-positive on noisy (jittered) straight-line geometry", () => {
    expect(detectCorners(makeNoisyStraight())).toEqual([]);
  });

  it("returns [] for insufficient points without throwing", () => {
    expect(
      detectCorners([
        { distance_m: 0, x: 0, y: 0 },
        { distance_m: 5, x: 5, y: 0 },
      ]),
    ).toEqual([]);
  });

  it("returns [] for empty input without throwing", () => {
    expect(detectCorners([])).toEqual([]);
  });

  it("filters out non-finite points and still returns a result without throwing", () => {
    const points = makeSingleTurn(100, 90, 1);
    const withInvalid: DistancePoint[] = [
      { distance_m: NaN, x: 1, y: 1 },
      { distance_m: 5, x: Infinity, y: 0 },
      ...points,
      { distance_m: points[points.length - 1].distance_m + 5, x: -Infinity, y: 0 },
    ];
    expect(() => detectCorners(withInvalid)).not.toThrow();
    const regions = detectCorners(withInvalid);
    for (const region of regions) {
      expect(Number.isFinite(region.start_distance_m)).toBe(true);
      expect(Number.isFinite(region.end_distance_m)).toBe(true);
    }
  });

  it("handles duplicate distance_m values safely without throwing or producing non-finite output", () => {
    const points = makeSingleTurn(100, 90, 1);
    const withDuplicate: DistancePoint[] = [
      points[0],
      { ...points[1], distance_m: points[0].distance_m }, // duplicate distance
      ...points.slice(1),
    ];
    expect(() => detectCorners(withDuplicate)).not.toThrow();
    const regions = detectCorners(withDuplicate);
    for (const region of regions) {
      expect(Number.isFinite(region.start_distance_m)).toBe(true);
      expect(Number.isFinite(region.end_distance_m)).toBe(true);
    }
  });

  it("is deterministic: the same input always produces the same output", () => {
    const points = makeChicane();
    expect(detectCorners(points)).toEqual(detectCorners(points));
  });

  it("returns regions ordered by ascending start_distance_m", () => {
    const c1 = makeSingleTurn(80, 60, 1);
    const lastC1 = c1[c1.length - 1];
    const gap: DistancePoint[] = [];
    for (let k = 1; k <= 20; k++) {
      gap.push({ distance_m: lastC1.distance_m + k * 5, x: lastC1.x + k * 5, y: lastC1.y });
    }
    const lastGap = gap[gap.length - 1];
    const c2 = makeSingleTurn(80, 60, 1).map((p) => ({
      distance_m: lastGap.distance_m + p.distance_m,
      x: lastGap.x + p.x,
      y: lastGap.y + p.y,
    }));
    const regions = detectCorners([...c1, ...gap, ...c2]);
    expect(regions.length).toBeGreaterThanOrEqual(1);
    const starts = regions.map((r) => r.start_distance_m);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("does not mutate the input points array or its elements", () => {
    const points = makeSingleTurn(100, 90, 1);
    const snapshot = points.map((p) => ({ ...p }));
    detectCorners(points);
    expect(points).toEqual(snapshot);
  });

  it("never returns a region with non-finite start/end distances", () => {
    for (const regions of [
      detectCorners(makeStraight()),
      detectCorners(makeSingleTurn(100, 90, 1)),
      detectCorners(makeHairpin()),
      detectCorners(makeChicane()),
    ]) {
      for (const region of regions) {
        expect(Number.isFinite(region.start_distance_m)).toBe(true);
        expect(Number.isFinite(region.end_distance_m)).toBe(true);
        expect(region.end_distance_m).toBeGreaterThan(region.start_distance_m);
      }
    }
  });
});
