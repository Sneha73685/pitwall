import { describe, expect, it } from "vitest";
import type { DriverSummary } from "../../../api/client";
import { buildDriverRankingChartOption } from "./driverRankingChartOptions";

function driver(overrides: Partial<DriverSummary> = {}): DriverSummary {
  return {
    driver: "VER",
    valid_lap_count: 5,
    best_lap_ms: 89500,
    theoretical_best_lap_ms: 89500,
    theoretical_best_delta_ms: 0,
    median_lap_ms: 90000,
    consistency_ms: 506.0,
    consistency_cv: 0.0056,
    full_throttle_pct: 62.1,
    outlier_lap_count: 1,
    lap_times_ms: [90000, 89500, 90200, 91000, 89800],
    ...overrides,
  };
}

interface CategoryAxis {
  data: string[];
}

interface BarSeries {
  data: number[];
}

describe("buildDriverRankingChartOption", () => {
  it("sorts drivers fastest-first, with the fastest at the top of the bar", () => {
    const drivers = [
      driver({ driver: "PER", best_lap_ms: 91000 }),
      driver({ driver: "VER", best_lap_ms: 89500 }),
      driver({ driver: "HAM", best_lap_ms: 90200 }),
    ];

    const option = buildDriverRankingChartOption(drivers);
    const yAxis = option.yAxis as CategoryAxis;
    const [series] = option.series as [BarSeries];

    // Fastest (VER) renders last in a bottom-up horizontal bar so it
    // appears at the top of the chart.
    expect(yAxis.data).toEqual(["PER", "HAM", "VER"]);
    expect(series.data).toEqual([91000, 90200, 89500]);
  });

  it("omits drivers with no completed lap", () => {
    const drivers = [
      driver({ driver: "VER", best_lap_ms: 89500 }),
      driver({ driver: "PIA", best_lap_ms: null }),
    ];

    const option = buildDriverRankingChartOption(drivers);
    const yAxis = option.yAxis as CategoryAxis;

    expect(yAxis.data).toEqual(["VER"]);
  });

  it("returns an empty chart when no driver has a completed lap", () => {
    const option = buildDriverRankingChartOption([driver({ best_lap_ms: null })]);
    const yAxis = option.yAxis as CategoryAxis;
    const [series] = option.series as [BarSeries];

    expect(yAxis.data).toEqual([]);
    expect(series.data).toEqual([]);
  });
});
