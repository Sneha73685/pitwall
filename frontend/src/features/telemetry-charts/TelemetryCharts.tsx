import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { TelemetrySample } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { useEChartsInstance } from "../../components/useEChartsInstance";
import { buildChartOption, type ChannelKey } from "./chartOptions";
import styles from "./TelemetryCharts.module.css";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 720;

interface TelemetryChartsProps {
  /** One lap's distance-ordered telemetry samples (same data TrackMap already fetches). */
  samples: TelemetrySample[];
  /**
   * A second lap's samples, for two-lap comparison (M6). Omitted entirely
   * for the single-lap view -- when absent, this renders exactly as it did
   * before M6 (one series per channel, no "(A)"/"(B)" labeling).
   */
  secondarySamples?: TelemetrySample[];
  /**
   * Restricts rendering to a subset of channels (M6 Phase 7: the comparison
   * view's per-channel toggle). Omitted for the single-lap view, which
   * keeps showing every channel as before.
   */
  channels?: ChannelKey[];
}

/**
 * M5: static, distance-aligned speed/throttle/brake/RPM/gear/DRS traces for
 * one lap (or two, since M6), rendered as one ECharts instance with a grid
 * per channel (ADR-0008). The container div stays mounted regardless of
 * `samples` so the chart instance survives lap-to-lap navigation
 * (TrackMapPage doesn't remount on a route-param change) -- only its
 * visibility toggles when there's no data.
 */
export function TelemetryCharts({ samples, secondarySamples, channels }: TelemetryChartsProps) {
  const hasData = samples.length > 0;
  const containerRef = useEChartsInstance(
    () => buildChartOption(samples, secondarySamples, channels),
    [samples, secondarySamples, channels],
  );

  return (
    <div>
      {!hasData && <EmptyState>No telemetry data available for this lap.</EmptyState>}
      <div
        ref={containerRef}
        role="img"
        aria-label="Telemetry channel traces"
        data-testid="telemetry-charts"
        className={styles.chart}
        style={{ width: "100%", height: CHART_HEIGHT, display: hasData ? "block" : "none" }}
      />
    </div>
  );
}
