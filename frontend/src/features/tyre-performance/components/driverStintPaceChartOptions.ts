import type { EChartsCoreOption } from "echarts/core";
import type { StintPace, StintPaceLap } from "../../../api/client";
import { compoundColor } from "../../race-context/compoundColor";

/**
 * Marker *shape* encodes lap category; color always encodes compound
 * (design note §7.1, §13, §17 -- boundary status must be distinguishable by
 * more than color). "triangle" is ECharts' built-in upward triangle
 * (out-lap); in-lap uses a custom downward-pointing path so the two boundary
 * categories are never visually confusable with each other.
 */
function symbolForLap(lap: StintPaceLap): string {
  if (lap.is_in_lap) {
    return "path://M0,0 L10,0 L5,10 Z"; // downward triangle
  }
  if (lap.is_out_lap) {
    return "triangle"; // built-in upward triangle
  }
  if (!lap.is_valid || !lap.is_trend_eligible) {
    return "diamond";
  }
  return "circle";
}

interface StintPacePoint {
  value: [number, number];
  symbol?: string;
  itemStyle?: { color: string };
  lineStyle?: { color: string };
  color?: string;
  raw: StintPaceLap;
}

function tooltipFormatter(params: unknown): string {
  const point = params as { data?: StintPacePoint };
  const lap = point.data?.raw;
  if (!lap) {
    return "";
  }
  const lines = [
    `Lap ${lap.lap_number}`,
    lap.stint_number !== null && lap.lap_in_stint_index !== null
      ? `Lap ${lap.lap_in_stint_index} of stint ${lap.stint_number}`
      : "No stint data",
    lap.lap_time_seconds !== null ? `${lap.lap_time_seconds.toFixed(3)} s` : "No time recorded",
    `Compound: ${lap.compound ?? "unknown"}`,
    `In-lap: ${lap.is_in_lap ? "Yes" : "No"}`,
    `Out-lap: ${lap.is_out_lap ? "Yes" : "No"}`,
    `Trend eligible: ${lap.is_trend_eligible ? "Yes" : "No"}`,
  ];
  return lines.join("<br/>");
}

/**
 * Builds the driver stint-pace chart option (design note §7.1). X-axis is
 * absolute lap number; one scatter series per stint plots every lap in that
 * stint (nothing dropped), and one line series per stint connects only that
 * stint's trend-eligible laps, in lap-number order -- raw, sequential,
 * never bridging a pit stop or a gap between stints. A stint with 0 or 1
 * trend-eligible laps produces a line series with 0-1 points, which ECharts
 * renders as nothing on its own -- no special-case branch needed, the same
 * way `stint_eligibility.py`'s `is_trend_eligible` flag was designed to make
 * this automatic (docs/m11-design-review.md §5.2).
 *
 * No fitted line, no regression, no smoothing, no extrapolation: every point
 * plotted is a real observed lap, and the only line ever drawn is a
 * point-to-point connection of a single stint's own trend-eligible laps.
 */
export function buildDriverStintPaceChartOption(
  laps: StintPaceLap[],
  stints: StintPace[],
): EChartsCoreOption {
  const orderedStints = [...stints].sort((a, b) => a.stint_number - b.stint_number);
  const series: Record<string, unknown>[] = [];
  const legendNames: string[] = [];

  orderedStints.forEach((stint) => {
    const stintLaps = laps
      .filter((lap) => lap.stint_number === stint.stint_number)
      .sort((a, b) => a.lap_number - b.lap_number);

    const seriesName = `Stint ${stint.stint_number} — ${stint.compound}`;
    legendNames.push(seriesName);
    const color = compoundColor(stint.compound);

    const scatterData: StintPacePoint[] = stintLaps
      .filter(
        (lap): lap is StintPaceLap & { lap_time_seconds: number } => lap.lap_time_seconds !== null,
      )
      .map((lap) => ({
        value: [lap.lap_number, lap.lap_time_seconds],
        symbol: symbolForLap(lap),
        itemStyle: { color },
        raw: lap,
      }));

    const lineData: StintPacePoint[] = stintLaps
      .filter(
        (lap): lap is StintPaceLap & { lap_time_seconds: number } =>
          lap.is_trend_eligible && lap.lap_time_seconds !== null,
      )
      .map((lap) => ({ value: [lap.lap_number, lap.lap_time_seconds], raw: lap }));

    series.push({
      name: seriesName,
      type: "scatter",
      symbolSize: 9,
      data: scatterData,
    });

    series.push({
      name: seriesName,
      type: "line",
      showSymbol: false,
      symbol: "none",
      color,
      lineStyle: { color },
      data: lineData,
    });
  });

  // Stint-boundary markers -- dashed, silent, no label, exactly DeltaChart's
  // existing markLine pattern (design note §7.1) -- carried on their own
  // empty-data series so they're not tied to any one stint's own line.
  series.push({
    name: "Stint boundaries",
    type: "line",
    data: [],
    silent: true,
    markLine: {
      symbol: "none",
      silent: true,
      label: { show: false },
      lineStyle: { type: "dashed", color: "#5b6472" },
      data: orderedStints.slice(1).map((stint) => ({ xAxis: stint.start_lap })),
    },
  });

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: { left: 70, right: 20, top: 50, bottom: 50 },
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
      name: "Lap time (s)",
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
      formatter: tooltipFormatter,
    },
    series: series as EChartsCoreOption["series"],
  };
}
