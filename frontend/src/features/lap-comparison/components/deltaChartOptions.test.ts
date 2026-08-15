import { describe, expect, it } from "vitest";
import type { LapComparisonResponse } from "../../../api/client";
import { buildDeltaChartOption } from "./deltaChartOptions";

function comparison(overrides: Partial<LapComparisonResponse> = {}): LapComparisonResponse {
  return {
    session_id_a: "2023_monza_race",
    session_id_b: "2023_monza_race",
    lap_a: {
      driver_id: "VER",
      lap_number: 1,
      lap_time_seconds: 91.234,
      sector_1_seconds: 30.1,
      sector_2_seconds: 31.0,
      sector_3_seconds: 30.134,
      is_personal_best: true,
      is_accurate: true,
    },
    lap_b: {
      driver_id: "LEC",
      lap_number: 1,
      lap_time_seconds: 91.546,
      sector_1_seconds: 30.3,
      sector_2_seconds: 31.1,
      sector_3_seconds: 30.146,
      is_personal_best: true,
      is_accurate: true,
    },
    compared_distance_m: 100,
    distance_m: [0, 50, 100],
    delta_ms: [0, 150, 150],
    channels: {},
    sectors: [],
    warnings: [],
    ...overrides,
  };
}

describe("buildDeltaChartOption", () => {
  it("builds exactly two series, for the NaN-gap approach", () => {
    const option = buildDeltaChartOption(comparison());

    expect(option.series).toHaveLength(2);
    const names = (option.series as { name: string }[]).map((series) => series.name);
    expect(names).toEqual(["Lap A ahead", "Lap B ahead"]);
  });

  it("pairs each delta value with its distance, per series", () => {
    const option = buildDeltaChartOption(comparison({ distance_m: [0, 50], delta_ms: [0, 150] }));
    const series = option.series as { name: string; data: [number, number][] }[];

    expect(series.find((entry) => entry.name === "Lap A ahead")!.data).toEqual([
      [0, 0],
      [50, 150],
    ]);
  });

  it("puts a positive delta only in the 'A ahead' series, NaN in 'B ahead'", () => {
    const option = buildDeltaChartOption(comparison({ distance_m: [0], delta_ms: [150] }));
    const series = option.series as { name: string; data: [number, number][] }[];

    expect(series.find((entry) => entry.name === "Lap A ahead")!.data[0][1]).toBe(150);
    expect(series.find((entry) => entry.name === "Lap B ahead")!.data[0][1]).toBeNaN();
  });

  it("puts a negative delta only in the 'B ahead' series, NaN in 'A ahead'", () => {
    const option = buildDeltaChartOption(comparison({ distance_m: [0], delta_ms: [-80] }));
    const series = option.series as { name: string; data: [number, number][] }[];

    expect(series.find((entry) => entry.name === "Lap B ahead")!.data[0][1]).toBe(-80);
    expect(series.find((entry) => entry.name === "Lap A ahead")!.data[0][1]).toBeNaN();
  });

  it("handles delta crossing zero multiple times, correctly gapping each series", () => {
    const option = buildDeltaChartOption(
      comparison({ distance_m: [0, 10, 20, 30], delta_ms: [50, -30, 20, -10] }),
    );
    const series = option.series as { name: string; data: [number, number][] }[];
    const aAhead = series.find((entry) => entry.name === "Lap A ahead")!.data.map((p) => p[1]);
    const bAhead = series.find((entry) => entry.name === "Lap B ahead")!.data.map((p) => p[1]);

    expect(aAhead).toEqual([50, NaN, 20, NaN]);
    expect(bAhead).toEqual([NaN, -30, NaN, -10]);
  });

  it("includes a zero-value markLine as the visual reference line", () => {
    const option = buildDeltaChartOption(comparison());
    const aAheadSeries = (option.series as { name: string; markLine?: { data: unknown[] } }[]).find(
      (entry) => entry.name === "Lap A ahead",
    )!;

    expect(aAheadSeries.markLine?.data).toEqual([{ yAxis: 0 }]);
  });
});
