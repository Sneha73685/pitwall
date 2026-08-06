import type { EChartsCoreOption } from "echarts/core";
import type { TelemetrySample } from "../../api/client";

interface ChannelConfig {
  key: "speed_kph" | "throttle_pct" | "brake_active" | "rpm" | "gear" | "drs_active";
  label: string;
  unit: string;
  /** Discrete on/off or gear-change channels read better as a step trace than an interpolated line. */
  step: boolean;
}

export type ChannelKey = ChannelConfig["key"];

/** Order matches the PRD's channel list (docs/prd.md §2.1, §3 M5). */
const CHANNELS: ChannelConfig[] = [
  { key: "speed_kph", label: "Speed", unit: "km/h", step: false },
  { key: "throttle_pct", label: "Throttle", unit: "%", step: false },
  { key: "brake_active", label: "Brake", unit: "", step: true },
  { key: "rpm", label: "RPM", unit: "", step: false },
  { key: "gear", label: "Gear", unit: "", step: true },
  { key: "drs_active", label: "DRS", unit: "", step: true },
];

function channelValue(sample: TelemetrySample, key: ChannelConfig["key"]): number {
  const raw = sample[key];
  return typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
}

// Fixed, consistent series colors for the two-lap comparison case (M6) --
// there is no team/driver color system anywhere in this app to draw from
// yet, so these are just a stable "A"/"B" pair, not a real color scheme.
const LAP_A_COLOR = "#5470c6";
const LAP_B_COLOR = "#ee6666";

/**
 * Builds a single ECharts option with one grid/axis pair per channel, stacked
 * vertically and sharing a distance_m x-axis (docs/prd.md M5: "aligned by
 * distance"). A pure function so the channel-mapping logic is unit-testable
 * without touching an actual chart instance.
 *
 * `secondarySamples` is optional (M6): when omitted, this produces exactly
 * the single-series-per-channel option M5's single-lap view has always
 * gotten -- unchanged series names, unchanged shape. When provided, each
 * channel gets a second series for the comparison lap, suffixed "(A)"/"(B)"
 * and given a fixed, distinguishing color.
 *
 * Deliberately does not call echarts.connect()/axisPointer.link -- V1 is
 * static per-channel traces, not the synchronized cross-chart cursor that's
 * explicitly V2 scope (docs/success-metrics.md).
 *
 * `channels` (M6 Phase 7) restricts which channels get a grid/series at
 * all -- the comparison view's per-channel toggle (ChannelOverlayPanel)
 * needs to show only the channels a user has switched on. Omitted for the
 * single-lap view, which keeps rendering every channel as before.
 */
export function buildChartOption(
  samples: TelemetrySample[],
  secondarySamples?: TelemetrySample[],
  channels?: ChannelKey[],
): EChartsCoreOption {
  const activeChannels = channels
    ? CHANNELS.filter((channel) => channels.includes(channel.key))
    : CHANNELS;
  const gridCount = activeChannels.length;
  const gridGapPct = 3;
  const gridHeightPct = gridCount > 0 ? 100 / gridCount - gridGapPct : 0;
  const lastIndex = gridCount - 1;

  const series = activeChannels.flatMap((channel, index) => {
    const primary = {
      name: secondarySamples ? `${channel.label} (A)` : channel.label,
      type: "line" as const,
      xAxisIndex: index,
      yAxisIndex: index,
      showSymbol: false,
      step: channel.step ? "end" : undefined,
      color: secondarySamples ? LAP_A_COLOR : undefined,
      data: samples.map((sample) => [sample.distance_m, channelValue(sample, channel.key)]),
    };
    if (!secondarySamples) {
      return [primary];
    }
    const secondary = {
      name: `${channel.label} (B)`,
      type: "line" as const,
      xAxisIndex: index,
      yAxisIndex: index,
      showSymbol: false,
      step: channel.step ? "end" : undefined,
      color: LAP_B_COLOR,
      data: secondarySamples.map((sample) => [
        sample.distance_m,
        channelValue(sample, channel.key),
      ]),
    };
    return [primary, secondary];
  });

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: activeChannels.map((_, index) => ({
      left: 70,
      right: 20,
      top: `${(index * 100) / gridCount + 1}%`,
      height: `${gridHeightPct}%`,
    })),
    xAxis: activeChannels.map((_, index) => ({
      type: "value",
      gridIndex: index,
      min: "dataMin",
      max: "dataMax",
      name: index === lastIndex ? "Distance (m)" : undefined,
      nameLocation: "middle",
      nameGap: 25,
      axisLabel: { show: index === lastIndex },
      axisTick: { show: index === lastIndex },
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    })),
    yAxis: activeChannels.map((channel, index) => ({
      type: "value",
      gridIndex: index,
      name: channel.unit ? `${channel.label} (${channel.unit})` : channel.label,
      nameLocation: "middle",
      nameGap: 45,
      splitNumber: 2,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    })),
    series,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
    },
  };
}
