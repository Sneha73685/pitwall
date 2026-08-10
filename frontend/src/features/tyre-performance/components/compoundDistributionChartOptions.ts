import type { EChartsCoreOption } from "echarts/core";
import type { CompoundAggregate } from "../../../api/client";
import { sortByCompoundOrder } from "../compoundOrder";

/** Same threshold as `paceDistributionChartOptions.ts`'s `MIN_LAPS_FOR_DISTRIBUTION` -- a box needs a distribution. */
const MIN_LAPS_FOR_DISTRIBUTION = 2;

/**
 * Builds the per-compound pace distribution boxplot option (design note
 * §8.4). Directly reuses `paceDistributionChartOptions.ts`'s exact pattern
 * -- ECharts' own `boxplot` dataset transform over each compound's raw
 * `lap_times_ms` array -- grouped by compound instead of driver.
 *
 * `CompoundAggregate` also carries pre-computed `median_lap_time_ms`/
 * `p25_lap_time_ms`/`p75_lap_time_ms`. Those fields are deliberately NOT fed
 * into this chart: only `lap_times_ms`, through ECharts' own transform, so
 * there is exactly one source of truth for this chart's quartiles -- the
 * same B5 decision `paceDistributionChartOptions.ts` already made, applied
 * again here rather than reopened (design note §8.4).
 *
 * X-axis category order is the fixed compound taxonomy
 * (`compoundOrder.ts`), never sorted by median or any other statistic.
 */
export function buildCompoundDistributionChartOption(
  compoundAggregates: CompoundAggregate[],
): EChartsCoreOption {
  const eligible = sortByCompoundOrder(
    compoundAggregates.filter(
      (aggregate) => aggregate.lap_times_ms.length >= MIN_LAPS_FOR_DISTRIBUTION,
    ),
    (aggregate) => aggregate.compound,
  );
  const compoundNames = eligible.map((aggregate) => aggregate.compound);

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    dataset: [
      { source: eligible.map((aggregate) => aggregate.lap_times_ms) },
      {
        transform: {
          type: "boxplot",
          config: {
            itemNameFormatter: ({ value }: { value: number }) => compoundNames[value],
          },
        },
      },
    ],
    grid: { left: 70, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: "category",
      name: "Compound",
      nameLocation: "middle",
      nameGap: 30,
      boundaryGap: true,
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
    tooltip: {
      trigger: "item",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
    },
    series: [
      {
        name: "Lap time distribution",
        type: "boxplot",
        datasetIndex: 1,
      },
    ],
  };
}
