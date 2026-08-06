import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { DriverLapMetrics } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildLapTimeTrendChartOption } from "./lapTimeTrendChartOptions";
import styles from "./LapTimeTrendChart.module.css";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 260;

interface LapTimeTrendChartProps {
  laps: DriverLapMetrics[];
}

/**
 * Lap time across the session for one driver (plan Phase 4 item 3, design
 * doc §1.2 item 4). Mirrors DeltaChart's ECharts lifecycle. Raw points
 * only -- see lapTimeTrendChartOptions.ts for why no second series is ever
 * added here.
 */
export function LapTimeTrendChart({ laps }: LapTimeTrendChartProps) {
  const containerRef = useEChartsInstance(() => buildLapTimeTrendChartOption(laps), [laps]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Lap time trend chart"
      data-testid="lap-time-trend-chart"
      className={styles.chart}
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
