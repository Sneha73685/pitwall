import { describe, expect, it } from "vitest";
import { driverColor } from "./driverColor";

describe("driverColor", () => {
  it("returns an hsl() color string", () => {
    expect(driverColor("VER")).toMatch(/^hsl\(\d+, 65%, 58%\)$/);
  });

  it("is deterministic for the same driver_id", () => {
    expect(driverColor("VER")).toBe(driverColor("VER"));
    expect(driverColor("HAM")).toBe(driverColor("HAM"));
  });

  it("gives different drivers different colors (spot check, not guaranteed collision-free)", () => {
    expect(driverColor("VER")).not.toBe(driverColor("HAM"));
    expect(driverColor("VER")).not.toBe(driverColor("PER"));
  });

  it("distinguishes teammates who would collide under teamColor.ts's team_name hash", () => {
    // Two different drivers on the same team must not be forced to the same
    // color the way teamAccent(team_name) would -- that's the entire reason
    // this utility exists (design note §8.6).
    expect(driverColor("VER")).not.toBe(driverColor("PER"));
  });
});
