import { describe, expect, it } from "vitest";
import type { CompoundLapIndexAggregate } from "../../../api/client";
import { buildCompoundLapTrendChartOption } from "./compoundLapTrendChartOptions";

function bin(overrides: Partial<CompoundLapIndexAggregate> = {}): CompoundLapIndexAggregate {
  return {
    compound: "SOFT",
    lap_in_stint_index: 1,
    lap_count: 2,
    lap_times_ms: [90000, 90200],
    median_lap_time_ms: 90100,
    ...overrides,
  };
}

interface SeriesLike {
  name?: string;
  type: string;
  data: { value: [number, number] }[];
}

function seriesOf(option: ReturnType<typeof buildCompoundLapTrendChartOption>): SeriesLike[] {
  return option.series as unknown as SeriesLike[];
}

describe("buildCompoundLapTrendChartOption", () => {
  it("never includes a line-type series -- scatter only, everywhere", () => {
    const option = buildCompoundLapTrendChartOption([
      bin({ compound: "SOFT", lap_in_stint_index: 1 }),
      bin({ compound: "SOFT", lap_in_stint_index: 2, median_lap_time_ms: 90300 }),
      bin({ compound: "HARD", lap_in_stint_index: 1, median_lap_time_ms: 91000 }),
    ]);

    for (const series of seriesOf(option)) {
      expect(series.type).toBe("scatter");
      expect(series.type).not.toBe("line");
    }
  });

  it("plots every raw observation, not one point per bin", () => {
    const option = buildCompoundLapTrendChartOption([
      bin({ compound: "SOFT", lap_in_stint_index: 1, lap_times_ms: [90000, 90200, 90400] }),
    ]);

    const rawSeries = seriesOf(option).filter((s) => s.name === "SOFT")[0];
    expect(rawSeries.data).toHaveLength(3);
  });

  it("plots one median point per bin as a separate scatter series", () => {
    const option = buildCompoundLapTrendChartOption([
      bin({ compound: "SOFT", lap_in_stint_index: 1, median_lap_time_ms: 90100 }),
      bin({ compound: "SOFT", lap_in_stint_index: 2, median_lap_time_ms: 90300 }),
    ]);

    const softSeries = seriesOf(option).filter((s) => s.name === "SOFT");
    const medianSeries = softSeries[1];
    expect(medianSeries.data).toHaveLength(2);
    expect(medianSeries.data.map((p) => p.value[1])).toEqual([90100, 90300]);
  });

  it("orders compound series by the fixed taxonomy, not by which compound is faster", () => {
    const option = buildCompoundLapTrendChartOption([
      bin({ compound: "HARD", median_lap_time_ms: 80000 }), // fastest
      bin({ compound: "SOFT", median_lap_time_ms: 99000 }), // slowest
    ]);

    expect(option.legend as { data: string[] }).toEqual(
      expect.objectContaining({ data: ["SOFT", "HARD"] }),
    );
  });

  it("labels the x-axis Lap in stint (not an absolute lap number)", () => {
    const option = buildCompoundLapTrendChartOption([bin()]);

    expect((option.xAxis as { name: string }).name).toBe("Lap in stint");
  });

  it("omits a median point when median_lap_time_ms is null", () => {
    const option = buildCompoundLapTrendChartOption([bin({ median_lap_time_ms: null })]);

    const softSeries = seriesOf(option).filter((s) => s.name === "SOFT");
    expect(softSeries[1].data).toHaveLength(0);
  });
});
