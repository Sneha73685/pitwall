import { describe, expect, it } from "vitest";
import type { DriverSummary } from "../../../api/client";
import { buildPositionTrendChartOption } from "./positionTrendChartOptions";

function driver(overrides: Partial<DriverSummary> = {}): DriverSummary {
  return {
    driver: "VER",
    valid_lap_count: 3,
    best_lap_ms: 90000,
    theoretical_best_lap_ms: 89500,
    theoretical_best_delta_ms: 500,
    median_lap_ms: 90200,
    consistency_ms: 100,
    consistency_cv: 0.001,
    full_throttle_pct: 70,
    outlier_lap_count: 0,
    lap_times_ms: [90000, 90200, 90400],
    positions: [
      { lap_number: 1, position: 1 },
      { lap_number: 2, position: 1 },
      { lap_number: 3, position: 2 },
    ],
    ...overrides,
  };
}

interface SeriesLike {
  name?: string;
  type: string;
  color: string;
  data: [number, number][];
}

function seriesOf(option: ReturnType<typeof buildPositionTrendChartOption>): SeriesLike[] {
  return option.series as unknown as SeriesLike[];
}

describe("buildPositionTrendChartOption", () => {
  it("builds one line series per driver with a non-null position", () => {
    const option = buildPositionTrendChartOption([
      driver({ driver: "VER" }),
      driver({ driver: "HAM" }),
    ]);

    expect(seriesOf(option).map((s) => s.name)).toEqual(["VER", "HAM"]);
  });

  it("plots [lap_number, position] points in lap order", () => {
    const option = buildPositionTrendChartOption([driver({ driver: "VER" })]);

    expect(seriesOf(option)[0].data).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);
  });

  it("excludes laps with a null position rather than plotting 0", () => {
    const option = buildPositionTrendChartOption([
      driver({
        driver: "VER",
        positions: [
          { lap_number: 1, position: 1 },
          { lap_number: 2, position: null },
          { lap_number: 3, position: 2 },
        ],
      }),
    ]);

    expect(seriesOf(option)[0].data).toEqual([
      [1, 1],
      [3, 2],
    ]);
  });

  it("omits a driver entirely when every position is null", () => {
    const option = buildPositionTrendChartOption([
      driver({
        driver: "VER",
        positions: [
          { lap_number: 1, position: null },
          { lap_number: 2, position: null },
        ],
      }),
    ]);

    expect(seriesOf(option)).toEqual([]);
  });

  it("omits a driver with no positions field at all (optional on the frontend type)", () => {
    const option = buildPositionTrendChartOption([driver({ driver: "VER", positions: undefined })]);

    expect(seriesOf(option)).toEqual([]);
  });

  it("assigns each driver a distinct color", () => {
    const option = buildPositionTrendChartOption([
      driver({ driver: "VER" }),
      driver({ driver: "PER" }),
    ]);

    const series = seriesOf(option);
    expect(series[0].color).not.toBe(series[1].color);
  });

  it("inverts the Y-axis so P1 renders above P2", () => {
    const option = buildPositionTrendChartOption([driver()]);

    expect(option.yAxis).toMatchObject({ inverse: true });
  });

  it("uses only type: line series", () => {
    const option = buildPositionTrendChartOption([driver()]);

    for (const series of seriesOf(option)) {
      expect(series.type).toBe("line");
    }
  });
});
