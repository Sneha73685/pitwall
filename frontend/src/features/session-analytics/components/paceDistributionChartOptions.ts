import type { EChartsCoreOption } from "echarts/core";
import type { DriverSummary } from "../../../api/client";

/** A box needs a distribution -- design doc §10: omit drivers with fewer than 2 valid laps. */
const MIN_LAPS_FOR_DISTRIBUTION = 2;

/**
 * Builds the pace distribution boxplot option (plan Phase 4 item 2, design
 * doc §9). Uses ECharts' own built-in `boxplot` dataset transform over each
 * driver's raw `lap_times_ms` array rather than computing quartiles here --
 * the B5 decision explicitly rejects a second, possibly-disagreeing
 * quartile implementation. `boxData`'s `low`/`high` whiskers are therefore
 * whatever ECharts' own IQR convention produces; they are not the
 * backend's `is_outlier` flag, which stays a table-only concern (B5) -- no
 * per-point outlier markers are added to this chart.
 *
 * Transform type is `"boxplot"`, not `"echarts:boxplot"`: ECharts
 * registers built-in transforms under the `echarts:` namespace but strips
 * that prefix from the lookup key it actually indexes by (see
 * `data/helper/transform.js`'s `registerExternalTransform` -- "the
 * transforms should be called directly via 'xxx' rather than
 * 'echarts:xxx'"). The `echarts:`-prefixed form throws
 * `Can not find transform on type "echarts:boxplot"` at render time.
 */
export function buildPaceDistributionChartOption(drivers: DriverSummary[]): EChartsCoreOption {
  const eligibleDrivers = drivers.filter(
    (driver) => driver.lap_times_ms.length >= MIN_LAPS_FOR_DISTRIBUTION,
  );
  const driverCodes = eligibleDrivers.map((driver) => driver.driver);

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    dataset: [
      { source: eligibleDrivers.map((driver) => driver.lap_times_ms) },
      {
        transform: {
          type: "boxplot",
          config: {
            itemNameFormatter: ({ value }: { value: number }) => driverCodes[value],
          },
        },
      },
    ],
    grid: { left: 70, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: "category",
      name: "Driver",
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
