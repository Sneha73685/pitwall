import type { EChartsCoreOption } from "echarts/core";
import type { DriverLapMetrics } from "../../../api/client";

/**
 * Builds the lap-time trend option (plan Phase 4 item 3, design doc §9).
 * Exactly one series -- raw `[lap_number, lap_time_ms]` points, connected,
 * no fitted line/regression/smoothing -- guards the M9 boundary (§9's most
 * emphatic instruction in the whole design doc). Do not add a second
 * series here; that is exactly the mistake §9 warns against.
 */
export function buildLapTimeTrendChartOption(laps: DriverLapMetrics[]): EChartsCoreOption {
  const points: [number, number][] = laps
    .filter((lap): lap is DriverLapMetrics & { lap_time_ms: number } => lap.lap_time_ms !== null)
    .map((lap) => [lap.lap_number, lap.lap_time_ms]);

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: { left: 70, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: "value",
      name: "Lap",
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
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
    },
    series: [
      {
        name: "Lap time",
        type: "line",
        showSymbol: true,
        color: "#f5a623",
        data: points,
      },
    ],
  };
}
