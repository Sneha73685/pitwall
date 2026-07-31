import { describe, expect, it } from "vitest";
import type { TelemetrySample } from "../../api/client";
import { buildChartOption } from "./chartOptions";

function sample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    distance_m: 0,
    time_seconds: 0,
    speed_kph: 200,
    throttle_pct: 100,
    brake_active: false,
    rpm: 10000,
    gear: 5,
    drs_active: false,
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  };
}

describe("buildChartOption", () => {
  it("builds one grid-aligned series per channel, in PRD order", () => {
    const option = buildChartOption([sample()]);

    expect(option.series).toHaveLength(6);
    expect((option.series as { name: string }[]).map((series) => series.name)).toEqual([
      "Speed",
      "Throttle",
      "Brake",
      "RPM",
      "Gear",
      "DRS",
    ]);
  });

  it("pairs every channel value with its sample's distance", () => {
    const samples = [
      sample({ distance_m: 0, speed_kph: 100 }),
      sample({ distance_m: 50, speed_kph: 150 }),
    ];

    const option = buildChartOption(samples);
    const speedSeries = (option.series as { name: string; data: [number, number][] }[]).find(
      (series) => series.name === "Speed",
    )!;

    expect(speedSeries.data).toEqual([
      [0, 100],
      [50, 150],
    ]);
  });

  it("maps boolean channels (brake, DRS) to 0/1", () => {
    const samples = [
      sample({ distance_m: 0, brake_active: true, drs_active: false }),
      sample({ distance_m: 10, brake_active: false, drs_active: true }),
    ];

    const option = buildChartOption(samples);
    const series = option.series as { name: string; data: [number, number][] }[];
    const brake = series.find((entry) => entry.name === "Brake")!;
    const drs = series.find((entry) => entry.name === "DRS")!;

    expect(brake.data).toEqual([
      [0, 1],
      [10, 0],
    ]);
    expect(drs.data).toEqual([
      [0, 0],
      [10, 1],
    ]);
  });

  it("uses a step interpolation for discrete channels and a smooth line for continuous ones", () => {
    const option = buildChartOption([sample()]);
    const series = option.series as { name: string; step?: string }[];

    expect(series.find((entry) => entry.name === "Speed")!.step).toBeUndefined();
    expect(series.find((entry) => entry.name === "Brake")!.step).toBe("end");
    expect(series.find((entry) => entry.name === "Gear")!.step).toBe("end");
    expect(series.find((entry) => entry.name === "DRS")!.step).toBe("end");
  });

  it("produces empty series data (not an error) for an empty sample list", () => {
    const option = buildChartOption([]);
    const series = option.series as { data: unknown[] }[];

    expect(series).toHaveLength(6);
    series.forEach((entry) => expect(entry.data).toEqual([]));
  });
});
