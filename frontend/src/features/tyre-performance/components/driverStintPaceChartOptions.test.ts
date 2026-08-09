import { describe, expect, it } from "vitest";
import type { StintPace, StintPaceLap } from "../../../api/client";
import { buildDriverStintPaceChartOption } from "./driverStintPaceChartOptions";

function lap(overrides: Partial<StintPaceLap> = {}): StintPaceLap {
  return {
    lap_number: 1,
    lap_time_seconds: 90.15,
    compound: "SOFT",
    stint_number: 1,
    lap_in_stint_index: 1,
    is_valid: true,
    is_in_lap: false,
    is_out_lap: false,
    is_trend_eligible: true,
    ...overrides,
  };
}

function stint(overrides: Partial<StintPace> = {}): StintPace {
  return {
    stint_number: 1,
    compound: "SOFT",
    start_lap: 1,
    end_lap: 4,
    tyre_life_at_start: 0,
    eligible_lap_count: 3,
    consistency_ms: 100,
    consistency_cv: 0.001,
    ...overrides,
  };
}

interface SeriesLike {
  name?: string;
  type: string;
  data: { value: [number, number]; symbol?: string; raw: StintPaceLap }[];
  markLine?: { data: { xAxis: number }[] };
}

function seriesOf(option: ReturnType<typeof buildDriverStintPaceChartOption>): SeriesLike[] {
  return option.series as unknown as SeriesLike[];
}

describe("buildDriverStintPaceChartOption", () => {
  it("builds one scatter series and one line series per stint, plus one boundary-marker series", () => {
    const stints = [
      stint({ stint_number: 1 }),
      stint({ stint_number: 2, start_lap: 5, end_lap: 8 }),
    ];
    const laps = [lap({ lap_number: 1, stint_number: 1 }), lap({ lap_number: 5, stint_number: 2 })];

    const option = buildDriverStintPaceChartOption(laps, stints);

    const series = seriesOf(option);
    expect(series).toHaveLength(5); // (scatter+line) x 2 stints + 1 boundary series
    expect(series.filter((s) => s.type === "scatter")).toHaveLength(2);
    expect(series.filter((s) => s.type === "line")).toHaveLength(3); // 2 per-stint + 1 boundary
  });

  it("includes every lap in the scatter series regardless of validity or eligibility", () => {
    const stints = [stint({ stint_number: 1, start_lap: 1, end_lap: 3 })];
    const laps = [
      lap({ lap_number: 1, is_out_lap: true, is_trend_eligible: false }),
      lap({ lap_number: 2 }),
      lap({ lap_number: 3, is_in_lap: true, is_trend_eligible: false }),
    ];

    const option = buildDriverStintPaceChartOption(laps, stints);
    const scatter = seriesOf(option).find((s) => s.type === "scatter");

    expect(scatter?.data).toHaveLength(3);
  });

  it("includes only trend-eligible laps in the connected line series", () => {
    const stints = [stint({ stint_number: 1, start_lap: 1, end_lap: 3 })];
    const laps = [
      lap({ lap_number: 1, is_out_lap: true, is_trend_eligible: false }),
      lap({ lap_number: 2, is_trend_eligible: true }),
      lap({ lap_number: 3, is_trend_eligible: true }),
    ];

    const option = buildDriverStintPaceChartOption(laps, stints);
    const line = seriesOf(option).filter(
      (s) => s.type === "line" && s.name?.startsWith("Stint 1"),
    )[0];

    expect(line.data).toHaveLength(2);
    expect(line.data.map((point) => point.value[0])).toEqual([2, 3]);
  });

  it("produces a line series with at most 1 point for a stint with 0 or 1 trend-eligible laps (the HUL case)", () => {
    // Real 2024 Bahrain GP case: HUL's stint 1 is one lap, which is also his
    // pit-in lap -- zero laps remain after in/out-lap exclusion.
    const stints = [stint({ stint_number: 1, start_lap: 1, end_lap: 1, eligible_lap_count: 0 })];
    const laps = [lap({ lap_number: 1, is_in_lap: true, is_trend_eligible: false })];

    const option = buildDriverStintPaceChartOption(laps, stints);
    const line = seriesOf(option).filter(
      (s) => s.type === "line" && s.name?.startsWith("Stint 1"),
    )[0];
    const scatter = seriesOf(option).find((s) => s.type === "scatter");

    expect(line.data).toHaveLength(0);
    // The lap itself is still visible as a scatter point -- not dropped.
    expect(scatter?.data).toHaveLength(1);
  });

  it("never connects laps across a stint boundary in a single line series", () => {
    const stints = [
      stint({ stint_number: 1, start_lap: 1, end_lap: 2 }),
      stint({ stint_number: 2, start_lap: 3, end_lap: 4, compound: "HARD" }),
    ];
    const laps = [
      lap({ lap_number: 1, stint_number: 1 }),
      lap({ lap_number: 2, stint_number: 1 }),
      lap({ lap_number: 3, stint_number: 2, compound: "HARD" }),
      lap({ lap_number: 4, stint_number: 2, compound: "HARD" }),
    ];

    const option = buildDriverStintPaceChartOption(laps, stints);
    const lineSeries = seriesOf(option).filter(
      (s) => s.type === "line" && s.name !== "Stint boundaries",
    );

    expect(lineSeries).toHaveLength(2);
    expect(lineSeries[0].data.map((p) => p.value[0])).toEqual([1, 2]);
    expect(lineSeries[1].data.map((p) => p.value[0])).toEqual([3, 4]);
  });

  it("uses a distinct marker symbol per lap category", () => {
    const stints = [stint({ stint_number: 1, start_lap: 1, end_lap: 4 })];
    const laps = [
      lap({ lap_number: 1 }), // normal
      lap({ lap_number: 2, is_in_lap: true, is_trend_eligible: false }),
      lap({ lap_number: 3, is_out_lap: true, is_trend_eligible: false }),
      lap({ lap_number: 4, is_valid: false, is_trend_eligible: false }),
    ];

    const option = buildDriverStintPaceChartOption(laps, stints);
    const scatter = seriesOf(option).find((s) => s.type === "scatter");
    const symbols = scatter?.data.map((point) => point.symbol);

    expect(symbols?.[0]).toBe("circle");
    expect(symbols?.[1]).toContain("path://"); // in-lap: custom downward triangle
    expect(symbols?.[2]).toBe("triangle"); // out-lap: built-in upward triangle
    expect(symbols?.[3]).toBe("diamond"); // invalid, non-boundary
    // All four categories must be visually distinguishable from each other.
    expect(new Set(symbols)).toEqual(new Set(["circle", symbols?.[1], "triangle", "diamond"]));
  });

  it("places a stint-boundary markLine at every stint start after the first, not the first", () => {
    const stints = [
      stint({ stint_number: 1, start_lap: 1, end_lap: 4 }),
      stint({ stint_number: 2, start_lap: 5, end_lap: 8 }),
      stint({ stint_number: 3, start_lap: 9, end_lap: 12 }),
    ];

    const option = buildDriverStintPaceChartOption([], stints);
    const boundarySeries = seriesOf(option).find((s) => s.name === "Stint boundaries");

    expect(boundarySeries?.markLine?.data).toEqual([{ xAxis: 5 }, { xAxis: 9 }]);
  });

  it("labels the x-axis Lap and y-axis Lap time (s)", () => {
    const option = buildDriverStintPaceChartOption([], []);

    expect((option.xAxis as { name: string }).name).toBe("Lap");
    expect((option.yAxis as { name: string }).name).toBe("Lap time (s)");
  });

  it("never sets a series type other than scatter or line (no bar/boxplot/graph implying a fit)", () => {
    const stints = [stint()];
    const laps = [lap()];

    const option = buildDriverStintPaceChartOption(laps, stints);

    for (const series of seriesOf(option)) {
      expect(["scatter", "line"]).toContain(series.type);
    }
  });

  it("does not smooth or interpolate the line series", () => {
    const option = buildDriverStintPaceChartOption([lap()], [stint()]);
    const lineSeries = seriesOf(option).filter((s) => s.type === "line");

    for (const series of lineSeries) {
      expect((series as unknown as { smooth?: boolean }).smooth).toBeUndefined();
    }
  });
});
