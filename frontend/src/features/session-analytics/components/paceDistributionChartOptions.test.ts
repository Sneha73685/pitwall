import { describe, expect, it } from "vitest";
import type { DriverSummary } from "../../../api/client";
import { buildPaceDistributionChartOption } from "./paceDistributionChartOptions";

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

interface SourceDataset {
  source: number[][];
}

interface TransformDataset {
  transform: { type: string; config: { itemNameFormatter: (arg: { value: number }) => string } };
}

describe("buildPaceDistributionChartOption", () => {
  it("builds one box per driver with at least 2 valid laps", () => {
    const drivers = [
      driver({ driver: "VER", lap_times_ms: [90000, 89500, 90200] }),
      driver({ driver: "HAM", lap_times_ms: [91000, 90800] }),
    ];

    const option = buildPaceDistributionChartOption(drivers);
    const [sourceDataset] = option.dataset as [SourceDataset, TransformDataset];

    expect(sourceDataset.source).toHaveLength(2);
    expect(sourceDataset.source).toEqual([
      [90000, 89500, 90200],
      [91000, 90800],
    ]);
  });

  it("omits a driver with fewer than 2 valid laps (a box needs a distribution)", () => {
    const drivers = [
      driver({ driver: "VER", lap_times_ms: [90000, 89500] }),
      driver({ driver: "PER", lap_times_ms: [95000] }),
    ];

    const option = buildPaceDistributionChartOption(drivers);
    const [sourceDataset] = option.dataset as [SourceDataset, TransformDataset];

    expect(sourceDataset.source).toHaveLength(1);
    expect(sourceDataset.source).toEqual([[90000, 89500]]);
  });

  it("omits a driver with zero valid laps", () => {
    const drivers = [
      driver({ driver: "VER", lap_times_ms: [90000, 89500] }),
      driver({ driver: "PIA", lap_times_ms: [] }),
    ];

    const option = buildPaceDistributionChartOption(drivers);
    const [sourceDataset] = option.dataset as [SourceDataset, TransformDataset];

    expect(sourceDataset.source).toHaveLength(1);
  });

  it("maps box index back to the correct driver code, skipping omitted drivers", () => {
    const drivers = [
      driver({ driver: "VER", lap_times_ms: [90000, 89500] }),
      driver({ driver: "PER", lap_times_ms: [95000] }),
      driver({ driver: "HAM", lap_times_ms: [91000, 90800] }),
    ];

    const option = buildPaceDistributionChartOption(drivers);
    const [, transformDataset] = option.dataset as [SourceDataset, TransformDataset];
    const itemNameFormatter = transformDataset.transform.config.itemNameFormatter;

    // PER (index 1 in the original list) is omitted, so the surviving
    // boxes are VER then HAM, indexed 0 and 1 in the filtered dataset.
    expect(itemNameFormatter({ value: 0 })).toBe("VER");
    expect(itemNameFormatter({ value: 1 })).toBe("HAM");
  });

  it("uses the built-in 'boxplot' transform type, not the 'echarts:boxplot' namespaced form", () => {
    const option = buildPaceDistributionChartOption([driver({ lap_times_ms: [90000, 89500] })]);
    const [, transformDataset] = option.dataset as [SourceDataset, TransformDataset];

    expect(transformDataset.transform.type).toBe("boxplot");
  });
});
