import type { EChartsCoreOption } from "echarts/core";
import type { SeasonPaceTrendPoint } from "../../../api/client";

/**
 * Builds the season pace-trend option (docs/m17-design-review.md §7).
 * Category x-axis (one category per session, labeled from event_name/
 * round_number), unlike LapTimeTrendChart's numeric lap-number axis --
 * the point-order the API already returns (session_date ascending) is
 * used directly, never re-sorted here. A point with a null best_lap_ms
 * (a roster-present, zero-valid-lap session) renders as a gap in the
 * line via ECharts' own null handling, not a zero.
 */
export function buildSeasonPaceTrendChartOption(points: SeasonPaceTrendPoint[]): EChartsCoreOption {
  const categories = points.map((point) => `R${point.round_number} ${point.event_name}`);
  const values = points.map((point) =>
    point.best_lap_ms !== null ? point.best_lap_ms / 1000 : null,
  );

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: { left: 70, right: 20, top: 40, bottom: 80 },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { rotate: 45, color: "#90a0b3" },
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    yAxis: {
      type: "value",
      name: "Best lap (s)",
      nameLocation: "middle",
      nameGap: 55,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
    },
    series: [
      {
        name: "Best lap",
        type: "line",
        showSymbol: true,
        connectNulls: false,
        color: "#f5a623",
        data: values,
      },
    ],
  };
}
