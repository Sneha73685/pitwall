import { describe, expect, it } from "vitest";
import type { TrackPoint } from "../../../api/client";
import { computeSegmentColors } from "./trackMapSegmentColors";

const trackPoints: TrackPoint[] = [
  { distance_m: 0, x: 0, y: 0 },
  { distance_m: 50, x: 10, y: 0 },
  { distance_m: 100, x: 10, y: 10 },
];

describe("computeSegmentColors", () => {
  it("returns one color per track point", () => {
    const colors = computeSegmentColors(trackPoints, { distance_m: [0, 100], delta_ms: [50, 50] });

    expect(colors).toHaveLength(trackPoints.length);
  });

  it("colors a zero delta as neutral gray", () => {
    const colors = computeSegmentColors(trackPoints, { distance_m: [0, 100], delta_ms: [0, 0] });

    expect(colors.every((color) => color === "rgb(200, 200, 200)")).toBe(true);
  });

  it("tints toward Lap A's color when delta is positive (A ahead)", () => {
    const colors = computeSegmentColors(trackPoints, { distance_m: [0], delta_ms: [100] });

    // Full intensity (only one delta value, so it's also the max) -> exactly LAP_A_RGB.
    expect(colors[0]).toBe("rgb(84, 112, 198)");
  });

  it("tints toward Lap B's color when delta is negative (B ahead)", () => {
    const colors = computeSegmentColors(trackPoints, { distance_m: [0], delta_ms: [-100] });

    expect(colors[0]).toBe("rgb(238, 102, 102)");
  });

  it("scales tint intensity by magnitude relative to the comparison's own max delta", () => {
    const colors = computeSegmentColors(trackPoints, {
      distance_m: [0, 50, 100],
      delta_ms: [100, 50, 100],
    });

    // Same sign, half the magnitude of the max -> a lighter tint, i.e. a
    // color strictly between neutral gray and the fully-saturated one.
    const fullyTinted = colors[0];
    const halfTinted = colors[1];
    expect(halfTinted).not.toBe(fullyTinted);
    expect(halfTinted).not.toBe("rgb(200, 200, 200)");
  });

  it("looks up each track point's nearest compared distance grid point (not interpolated)", () => {
    const colors = computeSegmentColors(trackPoints, {
      distance_m: [0, 40],
      delta_ms: [100, -100],
    });

    // trackPoints[0] (distance 0) and [1] (distance 50) both fall on/after
    // grid point 0 (distance 0) until distance 40 is reached, so point 1
    // (distance 50 >= 40) picks up the second grid value.
    expect(colors[0]).toBe("rgb(84, 112, 198)");
    expect(colors[1]).toBe("rgb(238, 102, 102)");
  });

  it("returns neutral colors for every point when the comparison has no distance grid", () => {
    const colors = computeSegmentColors(trackPoints, { distance_m: [], delta_ms: [] });

    expect(colors.every((color) => color === "rgb(200, 200, 200)")).toBe(true);
  });
});
