import { describe, expect, it } from "vitest";
import type { DriverLapMetrics } from "../../../api/client";
import { buildLapTimeTrendChartOption } from "./lapTimeTrendChartOptions";

function lap(overrides: Partial<DriverLapMetrics> = {}): DriverLapMetrics {
  return {
    lap_number: 1,
    lap_time_ms: 90000,
    is_valid: true,
    exclusion_reason: null,
    is_outlier: false,
    delta_to_theoretical_best_ms: 500,
    delta_to_own_median_ms: 0,
    full_throttle_pct: 60,
    brake_event_count: 4,
    ...overrides,
  };
}

describe("buildLapTimeTrendChartOption", () => {
  it("builds exactly one series -- no fitted trend/regression line", () => {
    const option = buildLapTimeTrendChartOption([lap({ lap_number: 1 }), lap({ lap_number: 2 })]);

    expect(option.series).toHaveLength(1);
    const [series] = option.series as { name: string; type: string; markLine?: unknown }[];
    expect(series.type).toBe("line");
    expect(series.markLine).toBeUndefined();
  });

  it("maps each lap to a raw [lap_number, lap_time_ms] point", () => {
    const laps = [
      lap({ lap_number: 1, lap_time_ms: 90000 }),
      lap({ lap_number: 2, lap_time_ms: 89500 }),
      lap({ lap_number: 3, lap_time_ms: 91200 }),
    ];

    const option = buildLapTimeTrendChartOption(laps);
    const [series] = option.series as { data: [number, number][] }[];

    expect(series.data).toEqual([
      [1, 90000],
      [2, 89500],
      [3, 91200],
    ]);
  });

  it("skips laps with a null lap_time_ms rather than plotting a gap value", () => {
    const laps = [
      lap({ lap_number: 1, lap_time_ms: 90000 }),
      lap({ lap_number: 2, lap_time_ms: null }),
      lap({ lap_number: 3, lap_time_ms: 91200 }),
    ];

    const option = buildLapTimeTrendChartOption(laps);
    const [series] = option.series as { data: [number, number][] }[];

    expect(series.data).toEqual([
      [1, 90000],
      [3, 91200],
    ]);
  });

  it("produces an empty series for no laps, not an error", () => {
    const option = buildLapTimeTrendChartOption([]);
    const [series] = option.series as { data: [number, number][] }[];

    expect(series.data).toEqual([]);
  });
});
