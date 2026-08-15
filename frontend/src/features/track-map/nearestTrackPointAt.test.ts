import { describe, expect, it } from "vitest";
import { nearestTrackPointAt, type DistancePoint } from "./nearestTrackPointAt";

const points: DistancePoint[] = [
  { distance_m: 0, x: 0, y: 0 },
  { distance_m: 50, x: 5, y: 5 },
  { distance_m: 100, x: 10, y: 10 },
];

describe("nearestTrackPointAt", () => {
  it("returns the exact point when distanceM matches one exactly", () => {
    expect(nearestTrackPointAt(points, 50)).toEqual({ x: 5, y: 5 });
  });

  it("returns the closer of two neighboring points", () => {
    expect(nearestTrackPointAt(points, 60)).toEqual({ x: 5, y: 5 });
    expect(nearestTrackPointAt(points, 80)).toEqual({ x: 10, y: 10 });
  });

  it("clamps to the nearest endpoint for a distance beyond the array's range", () => {
    expect(nearestTrackPointAt(points, 1000)).toEqual({ x: 10, y: 10 });
    expect(nearestTrackPointAt(points, -50)).toEqual({ x: 0, y: 0 });
  });

  it("returns null when distanceM is null (no active hover)", () => {
    expect(nearestTrackPointAt(points, null)).toBeNull();
  });

  it("returns null for an empty points array", () => {
    expect(nearestTrackPointAt([], 50)).toBeNull();
  });
});
