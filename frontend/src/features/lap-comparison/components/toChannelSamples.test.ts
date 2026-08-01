import { describe, expect, it } from "vitest";
import type { ChannelSeries } from "../../../api/client";
import { toChannelSamples } from "./toChannelSamples";

describe("toChannelSamples", () => {
  const channels: Record<string, ChannelSeries> = {
    speed_kph: { a: [200, 210], b: [195, 205] },
    brake_active: { a: [0, 1], b: [1, 0] },
  };

  it("zips distance_m with each channel's lap-specific values", () => {
    const samples = toChannelSamples([0, 100], channels, "a");

    expect(samples).toEqual([
      expect.objectContaining({ distance_m: 0, speed_kph: 200, brake_active: false }),
      expect.objectContaining({ distance_m: 100, speed_kph: 210, brake_active: true }),
    ]);
  });

  it("reads the other lap's series when given 'b'", () => {
    const samples = toChannelSamples([0, 100], channels, "b");

    expect(samples[0].speed_kph).toBe(195);
    expect(samples[0].brake_active).toBe(true);
  });

  it("defaults missing channels to 0/false rather than throwing", () => {
    const samples = toChannelSamples([0], { speed_kph: { a: [200], b: [195] } }, "a");

    expect(samples[0]).toMatchObject({
      throttle_pct: 0,
      brake_active: false,
      rpm: 0,
      gear: 0,
      drs_active: false,
    });
  });

  it("produces an empty array for an empty distance grid", () => {
    expect(toChannelSamples([], channels, "a")).toEqual([]);
  });
});
