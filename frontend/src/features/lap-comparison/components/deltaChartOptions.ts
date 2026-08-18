import type { EChartsCoreOption } from "echarts/core";
import type { LapComparisonResponse } from "../../../api/client";
import type { CornerRegion } from "../../track-map/detectCorners";

// Same fixed A/B pair TelemetryCharts/TrackMap already use -- no team/driver
// color system exists in this app yet.
const LAP_A_COLOR = "#5470c6";
const LAP_B_COLOR = "#ee6666";

/**
 * Builds the delta-vs-distance chart option (M6 Phase 7,
 * docs/m6-design-review.md §9). Sign convention: positive `delta_ms` means
 * lap A is ahead -- documented on the backend's
 * `LapComparisonResponse.delta_ms` field, and restated here since any PR
 * touching this file must re-verify the sign, not just glance at it
 * (docs/m6-implementation-plan.md §0.4).
 *
 * Splits `delta_ms` into two NaN-gapped series -- "Lap A ahead" (values
 * >= 0) and "Lap B ahead" (values <= 0) -- rather than a single series with
 * `visualMap` piecewise coloring. ECharts skips NaN points when drawing a
 * line/area, so each series' fill only covers the distance ranges where
 * that lap is actually ahead, and a sign flip just starts a new segment.
 * This is the only approach implemented (§0.2): `visualMap` piecewise is
 * not implemented, not stubbed, not left as a commented-out alternative.
 *
 * `corners` (M22, docs/m22-design-review.md §8): the same static,
 * non-interactive `markArea` treatment `chartOptions.ts` gives every
 * telemetry channel, applied here to this chart's own single grid.
 * Omitted (or empty) produces byte-identical output to before this
 * milestone.
 */
export function buildDeltaChartOption(
  comparison: LapComparisonResponse,
  corners?: CornerRegion[],
): EChartsCoreOption {
  const { distance_m, delta_ms } = comparison;

  const aAhead: [number, number][] = delta_ms.map((value, index) => [
    distance_m[index],
    value >= 0 ? value : NaN,
  ]);
  const bAhead: [number, number][] = delta_ms.map((value, index) => [
    distance_m[index],
    value <= 0 ? value : NaN,
  ]);

  const cornerMarkArea =
    corners && corners.length > 0
      ? {
          silent: true,
          itemStyle: { color: "rgba(144, 160, 179, 0.12)" },
          data: corners.map((corner) => [
            { xAxis: corner.start_distance_m },
            { xAxis: corner.end_distance_m },
          ]),
        }
      : undefined;

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: { left: 70, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: "value",
      min: "dataMin",
      max: "dataMax",
      name: "Distance (m)",
      nameLocation: "middle",
      nameGap: 25,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    yAxis: {
      type: "value",
      name: "Delta (ms)",
      nameLocation: "middle",
      nameGap: 45,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    legend: { data: ["Lap A ahead", "Lap B ahead"], textStyle: { color: "#90a0b3" } },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
    },
    series: [
      {
        name: "Lap A ahead",
        type: "line",
        showSymbol: false,
        color: LAP_A_COLOR,
        areaStyle: { opacity: 0.3 },
        data: aAhead,
        ...(cornerMarkArea ? { markArea: cornerMarkArea } : {}),
        markLine: {
          symbol: "none",
          silent: true,
          label: { show: false },
          lineStyle: { type: "dashed", color: "#999999" },
          data: [{ yAxis: 0 }],
        },
      },
      {
        name: "Lap B ahead",
        type: "line",
        showSymbol: false,
        color: LAP_B_COLOR,
        areaStyle: { opacity: 0.3 },
        data: bAhead,
      },
    ],
  };
}
