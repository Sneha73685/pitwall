import type { EChartsCoreOption } from "echarts/core";
import type { CompoundLapIndexAggregate } from "../../../api/client";
import { compoundColor } from "../../race-context/compoundColor";
import { sortByCompoundOrder } from "../compoundOrder";

/**
 * Builds the per-compound raw lap-time-by-tyre-age option (design note
 * §8.5) -- the highest-risk chart in this feature, so it gets the most
 * conservative treatment. For every compound, plots:
 *
 *  - one small, semi-transparent scatter point per RAW observation in each
 *    `lap_in_stint_index` bin's `lap_times_ms` array (not one point per bin)
 *  - one larger diamond scatter point per bin for that bin's
 *    `median_lap_time_ms`, purely for legibility
 *
 * Every series is `type: "scatter"`. No series in this chart may ever be
 * `type: "line"` -- connecting per-bin medians in x-order would visually
 * reproduce a degradation-curve shape even though nothing was literally
 * fit (docs/m11-design-review.md §4.2), so this file forbids it structurally,
 * not just in prose. See the "never a line series" test in
 * compoundLapTrendChartOptions.test.ts.
 */
export function buildCompoundLapTrendChartOption(
  compoundLapIndexAggregates: CompoundLapIndexAggregate[],
): EChartsCoreOption {
  const compounds = sortByCompoundOrder(
    Array.from(new Set(compoundLapIndexAggregates.map((bin) => bin.compound))).map((compound) => ({
      compound,
    })),
    (item) => item.compound,
  ).map((item) => item.compound);

  const series: Record<string, unknown>[] = [];
  const legendNames: string[] = [];

  compounds.forEach((compound) => {
    const bins = compoundLapIndexAggregates
      .filter((bin) => bin.compound === compound)
      .sort((a, b) => a.lap_in_stint_index - b.lap_in_stint_index);
    const color = compoundColor(compound);

    const rawPoints = bins.flatMap((bin) =>
      bin.lap_times_ms.map((value) => ({
        value: [bin.lap_in_stint_index, value],
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color, opacity: 0.45 },
      })),
    );

    const medianPoints = bins
      .filter((bin) => bin.median_lap_time_ms !== null)
      .map((bin) => ({
        value: [bin.lap_in_stint_index, bin.median_lap_time_ms as number],
        symbol: "diamond",
        symbolSize: 12,
        itemStyle: { color, opacity: 1, borderColor: "#e8edf3", borderWidth: 1 },
        lapCount: bin.lap_count,
      }));

    legendNames.push(compound);
    series.push({
      name: compound,
      type: "scatter",
      data: rawPoints,
    });
    series.push({
      name: compound,
      type: "scatter",
      data: medianPoints,
    });
  });

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: { left: 70, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: "value",
      name: "Lap in stint",
      nameLocation: "middle",
      nameGap: 25,
      minInterval: 1,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    yAxis: {
      type: "value",
      name: "Lap time (ms)",
      nameLocation: "middle",
      nameGap: 55,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    legend: { data: legendNames, textStyle: { color: "#90a0b3" }, top: 0 },
    tooltip: {
      trigger: "item",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
      formatter: (params: unknown) => {
        const point = params as {
          seriesName?: string;
          value?: [number, number];
          data?: { lapCount?: number };
        };
        const isMedian = point.data?.lapCount !== undefined;
        const lines = [
          `Compound: ${point.seriesName ?? "unknown"}`,
          `Lap in stint: ${point.value?.[0] ?? "—"}`,
          isMedian
            ? `Median of ${point.data?.lapCount} laps: ${point.value?.[1]?.toFixed(0) ?? "—"} ms`
            : `Lap time: ${point.value?.[1]?.toFixed(0) ?? "—"} ms`,
        ];
        return lines.join("<br/>");
      },
    },
    series: series as EChartsCoreOption["series"],
  };
}
