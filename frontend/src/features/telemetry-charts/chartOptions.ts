import type { EChartsCoreOption } from "echarts/core";
import type { TelemetrySample } from "../../api/client";

interface ChannelConfig {
  key: "speed_kph" | "throttle_pct" | "brake_active" | "rpm" | "gear" | "drs_active";
  label: string;
  unit: string;
  /** Discrete on/off or gear-change channels read better as a step trace than an interpolated line. */
  step: boolean;
}

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

/**
 * Builds a single ECharts option with one grid/axis pair per channel, stacked
 * vertically and sharing a distance_m x-axis (docs/prd.md M5: "aligned by
 * distance"). A pure function so the channel-mapping logic is unit-testable
 * without touching an actual chart instance.
 *
 * Deliberately does not call echarts.connect()/axisPointer.link -- V1 is
 * static per-channel traces, not the synchronized cross-chart cursor that's
 * explicitly V2 scope (docs/success-metrics.md).
 */
export function buildChartOption(samples: TelemetrySample[]): EChartsCoreOption {
  const gridCount = CHANNELS.length;
  const gridGapPct = 3;
  const gridHeightPct = 100 / gridCount - gridGapPct;
  const lastIndex = gridCount - 1;

  return {
    animation: false,
    grid: CHANNELS.map((_, index) => ({
      left: 70,
      right: 20,
      top: `${(index * 100) / gridCount + 1}%`,
      height: `${gridHeightPct}%`,
    })),
    xAxis: CHANNELS.map((_, index) => ({
      type: "value",
      gridIndex: index,
      min: "dataMin",
      max: "dataMax",
      name: index === lastIndex ? "Distance (m)" : undefined,
      nameLocation: "middle",
      nameGap: 25,
      axisLabel: { show: index === lastIndex },
      axisTick: { show: index === lastIndex },
    })),
    yAxis: CHANNELS.map((channel, index) => ({
      type: "value",
      gridIndex: index,
      name: channel.unit ? `${channel.label} (${channel.unit})` : channel.label,
      nameLocation: "middle",
      nameGap: 45,
      splitNumber: 2,
    })),
    series: CHANNELS.map((channel, index) => ({
      name: channel.label,
      type: "line",
      xAxisIndex: index,
      yAxisIndex: index,
      showSymbol: false,
      step: channel.step ? "end" : undefined,
      data: samples.map((sample) => [sample.distance_m, channelValue(sample, channel.key)]),
    })),
    tooltip: { trigger: "axis" },
  };
}
