import { describe, expect, it } from "vitest";
import type { CompoundAggregate } from "../../../api/client";
import { buildCompoundDistributionChartOption } from "./compoundDistributionChartOptions";

function aggregate(overrides: Partial<CompoundAggregate> = {}): CompoundAggregate {
  return {
    compound: "SOFT",
    lap_count: 5,
    driver_count: 3,
    lap_times_ms: [90000, 90200, 90400, 90600, 90800],
    median_lap_time_ms: 90400,
    p25_lap_time_ms: 90200,
    p75_lap_time_ms: 90600,
    ...overrides,
  };
}

interface DatasetLike {
  source?: number[][];
}
interface OptionShape {
  dataset: DatasetLike[];
  series: { type: string }[];
}

describe("buildCompoundDistributionChartOption", () => {
  it("builds one boxplot dataset source entry per eligible compound, from raw lap_times_ms only", () => {
    const option = buildCompoundDistributionChartOption([
      aggregate({ compound: "SOFT", lap_times_ms: [90000, 90200] }),
      aggregate({ compound: "HARD", lap_times_ms: [91000, 91200] }),
    ]) as unknown as OptionShape;

    expect(option.dataset[0].source).toEqual([
      [90000, 90200],
      [91000, 91200],
    ]);
  });

  it("never feeds the precomputed median/p25/p75 fields into the dataset source", () => {
    const option = buildCompoundDistributionChartOption([
      aggregate({
        compound: "SOFT",
        lap_times_ms: [90000, 90200],
        median_lap_time_ms: 99999,
        p25_lap_time_ms: 88888,
        p75_lap_time_ms: 77777,
      }),
    ]) as unknown as OptionShape;

    const flatSource = option.dataset[0].source?.flat() ?? [];
    expect(flatSource).not.toContain(99999);
    expect(flatSource).not.toContain(88888);
    expect(flatSource).not.toContain(77777);
  });

  it("omits compounds with fewer than 2 laps", () => {
    const option = buildCompoundDistributionChartOption([
      aggregate({ compound: "SOFT", lap_times_ms: [90000, 90200] }),
      aggregate({ compound: "HARD", lap_times_ms: [91000] }),
    ]) as unknown as OptionShape;

    expect(option.dataset[0].source).toHaveLength(1);
  });

  it("orders compounds by the fixed taxonomy, not by median lap time", () => {
    const option = buildCompoundDistributionChartOption([
      aggregate({ compound: "HARD", lap_times_ms: [80000, 80200], median_lap_time_ms: 80100 }), // fastest
      aggregate({ compound: "SOFT", lap_times_ms: [99000, 99200], median_lap_time_ms: 99100 }), // slowest
    ]) as unknown as OptionShape;

    // SOFT before HARD per the fixed taxonomy, even though HARD is faster here.
    expect(option.dataset[0].source).toEqual([
      [99000, 99200],
      [80000, 80200],
    ]);
  });

  it("uses exactly one boxplot series, sourced from the transformed dataset", () => {
    const option = buildCompoundDistributionChartOption([aggregate()]) as unknown as OptionShape;

    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe("boxplot");
  });
});
