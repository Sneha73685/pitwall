import type { EChartsCoreOption } from "echarts/core";
import type { DriverSummary } from "../../../api/client";

/**
 * Builds the driver-ranking horizontal bar chart option (M9 addition,
 * docs/m9-design-review.md): best_lap_ms per driver, sorted fastest-first.
 * Drivers with no completed lap (`best_lap_ms === null`) are omitted rather
 * than plotted as zero. Fed entirely by the DriverSummary[] array
 * SessionAnalyticsPage already fetches -- no new API calls.
 */
export function buildDriverRankingChartOption(drivers: DriverSummary[]): EChartsCoreOption {
  const ranked = drivers
    .filter(
      (driver): driver is DriverSummary & { best_lap_ms: number } => driver.best_lap_ms !== null,
    )
    .sort((a, b) => a.best_lap_ms - b.best_lap_ms);

  // Reversed so the fastest driver renders at the top of the horizontal bar.
  const driverCodes = ranked.map((driver) => driver.driver).reverse();
  const lapTimes = ranked.map((driver) => driver.best_lap_ms).reverse();

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: { left: 70, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: "value",
      name: "Best lap (ms)",
      nameLocation: "middle",
      nameGap: 25,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    yAxis: {
      type: "category",
      data: driverCodes,
      axisLine: { lineStyle: { color: "#3a4453" } },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
    },
    series: [
      {
        name: "Best lap",
        type: "bar",
        data: lapTimes,
        color: "#f5a623",
      },
    ],
  };
}
