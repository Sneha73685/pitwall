import * as echarts from "echarts/core";
import { BoxplotChart } from "echarts/charts";
import {
  DatasetComponent,
  GridComponent,
  TooltipComponent,
  TransformComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { DriverSummary } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildPaceDistributionChartOption } from "./paceDistributionChartOptions";
import styles from "./PaceDistributionChart.module.css";

echarts.use([
  BoxplotChart,
  DatasetComponent,
  TransformComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const CHART_HEIGHT = 320;

interface PaceDistributionChartProps {
  drivers: DriverSummary[];
}

/**
 * One box per driver, all drivers on a shared axis (plan Phase 4 item 2,
 * design doc §1.2 item 3). Mirrors DeltaChart's ECharts lifecycle (init
 * once, dispose on unmount, re-`setOption` on data change).
 */
export function PaceDistributionChart({ drivers }: PaceDistributionChartProps) {
  const containerRef = useEChartsInstance(
    () => buildPaceDistributionChartOption(drivers),
    [drivers],
  );

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Pace distribution chart"
      data-testid="pace-distribution-chart"
      className={styles.chart}
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
