import { describe, expect, it } from "vitest";
import type { RawLapTimeByCompound } from "../../../api/client";
import { buildDriverCompoundComparisonChartOption } from "./driverCompoundComparisonChartOptions";

function entry(overrides: Partial<RawLapTimeByCompound> = {}): RawLapTimeByCompound {
  return {
    driver_id: "VER",
    compound: "SOFT",
    lap_count: 3,
    lap_times_ms: [90150, 90300, 90450],
    lap_in_stint_indices: [1, 2, 3],
    median_lap_time_ms: 90300,
    ...overrides,
  };
}

interface SeriesLike {
  name?: string;
  type: string;
  data: { value: [number, number] }[];
}

function seriesOf(
  option: ReturnType<typeof buildDriverCompoundComparisonChartOption>,
): SeriesLike[] {
  return option.series as unknown as SeriesLike[];
}

describe("buildDriverCompoundComparisonChartOption", () => {
  it("filters to only the selected compound", () => {
    const option = buildDriverCompoundComparisonChartOption(
      [
        entry({ driver_id: "VER", compound: "SOFT" }),
        entry({ driver_id: "HAM", compound: "HARD" }),
      ],
      "SOFT",
    );

    expect(seriesOf(option).map((s) => s.name)).toEqual(["VER"]);
  });

  it("orders driver series alphabetically, regardless of input order or which driver is fastest", () => {
    const option = buildDriverCompoundComparisonChartOption(
      [
        entry({ driver_id: "VER", compound: "SOFT", lap_times_ms: [88000, 88100, 88200] }), // fastest
        entry({ driver_id: "HAM", compound: "SOFT", lap_times_ms: [99000, 99100, 99200] }), // slowest
        entry({ driver_id: "ALO", compound: "SOFT" }),
      ],
      "SOFT",
    );

    expect(seriesOf(option).map((s) => s.name)).toEqual(["ALO", "HAM", "VER"]);
  });

  it("connects each driver's own raw laps in lap-in-stint-index order", () => {
    const option = buildDriverCompoundComparisonChartOption(
      [
        entry({
          driver_id: "VER",
          compound: "SOFT",
          lap_in_stint_indices: [3, 1, 2],
          lap_times_ms: [90450, 90150, 90300],
        }),
      ],
      "SOFT",
    );

    const series = seriesOf(option)[0];
    expect(series.data.map((p) => p.value)).toEqual([
      [1, 90150],
      [2, 90300],
      [3, 90450],
    ]);
  });

  it("assigns each driver a distinct color, including two drivers on the same team", () => {
    const option = buildDriverCompoundComparisonChartOption(
      [
        entry({ driver_id: "VER", compound: "SOFT" }),
        entry({ driver_id: "PER", compound: "SOFT" }),
      ],
      "SOFT",
    );

    const series = seriesOf(option) as unknown as { color: string }[];
    expect(series[0].color).not.toBe(series[1].color);
  });

  it("contains no ranking, sort-by-pace, or fastest/best/rank field anywhere in the built option", () => {
    const option = buildDriverCompoundComparisonChartOption(
      [
        entry({ driver_id: "VER", compound: "SOFT", lap_times_ms: [88000, 88100, 88200] }),
        entry({ driver_id: "HAM", compound: "SOFT", lap_times_ms: [99000, 99100, 99200] }),
      ],
      "SOFT",
    );

    const serialized = JSON.stringify(option);
    expect(serialized).not.toMatch(/fastest|best|rank/i);
  });

  it("uses only type: line series -- no bar/boxplot implying a summary or a fit", () => {
    const option = buildDriverCompoundComparisonChartOption([entry()], "SOFT");

    for (const series of seriesOf(option)) {
      expect(series.type).toBe("line");
    }
  });
});
