import type { EChartsCoreOption } from "echarts/core";
import type { RawLapTimeByCompound } from "../../../api/client";
import { driverColor } from "../../../components/driverColor";

interface ComparisonPoint {
  value: [number, number];
}

/**
 * Builds the raw driver/compound comparison option for one selected
 * compound (design note §8.6) -- the API's own item #18/§4.3 payload,
 * explicitly re-scoped by the design review from "driver-vs-driver pace
 * comparison" to "raw side-by-side display, not a ranking."
 *
 * One connected line series per driver, restricted to `selectedCompound`,
 * in lap-in-stint-index order -- this is one driver's own raw, real laps in
 * sequence, the same category of thing `LapTimeTrendChart`/
 * `DriverStintPaceChart` already draw as a connected raw line; it is not an
 * aggregate and not a fit.
 *
 * Series/legend order is `driver_id` alphabetical, fixed regardless of
 * input order or which driver has the fastest raw laps -- never sorted by
 * pace. Color is per-driver identity (`driverColor`, keyed on `driver_id`,
 * not a speed gradient) so two teammates on the same compound stay visually
 * distinct without either color encoding relative speed.
 *
 * No field in this option's shape is named or labeled "fastest," "best," or
 * "rank" -- there is nothing to render because `RawLapTimeByCompound` itself
 * carries no such field (enforced structurally at the data layer, per the
 * design review, not just by this file's own restraint).
 */
export function buildDriverCompoundComparisonChartOption(
  rawLapTimesByCompound: RawLapTimeByCompound[],
  selectedCompound: string,
): EChartsCoreOption {
  const forCompound = rawLapTimesByCompound
    .filter((entry) => entry.compound === selectedCompound)
    .slice()
    .sort((a, b) => a.driver_id.localeCompare(b.driver_id));

  const series = forCompound.map((entry) => {
    const points: ComparisonPoint[] = entry.lap_in_stint_indices
      .map((index, i) => ({ value: [index, entry.lap_times_ms[i]] as [number, number] }))
      .sort((a, b) => a.value[0] - b.value[0]);
    const color = driverColor(entry.driver_id);

    return {
      name: entry.driver_id,
      type: "line",
      showSymbol: true,
      symbolSize: 6,
      color,
      lineStyle: { color },
      data: points,
    };
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
    legend: {
      data: forCompound.map((entry) => entry.driver_id),
      textStyle: { color: "#90a0b3" },
      top: 0,
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
      formatter: (params: unknown) => {
        const point = params as { seriesName?: string; value?: [number, number] };
        const lines = [
          `Driver: ${point.seriesName ?? "unknown"}`,
          `Compound: ${selectedCompound}`,
          `Lap in stint: ${point.value?.[0] ?? "—"}`,
          `Lap time: ${point.value?.[1]?.toFixed(0) ?? "—"} ms`,
        ];
        return lines.join("<br/>");
      },
    },
    series: series as EChartsCoreOption["series"],
  };
}
