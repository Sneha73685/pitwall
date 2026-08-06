import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { DriverSummary } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildDriverRankingChartOption } from "./driverRankingChartOptions";
import styles from "./DriverRankingChart.module.css";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 320;

interface DriverRankingChartProps {
  drivers: DriverSummary[];
}

/**
 * Horizontal bar of best lap time per driver, sorted fastest-first (M9
 * addition, docs/m9-design-review.md). Mirrors PaceDistributionChart's
 * ECharts lifecycle. Fed by the same DriverSummary[] SessionAnalyticsPage
 * already passes to PaceDistributionChart -- no new fetch.
 */
export function DriverRankingChart({ drivers }: DriverRankingChartProps) {
  const containerRef = useEChartsInstance(() => buildDriverRankingChartOption(drivers), [drivers]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Driver ranking chart"
      data-testid="driver-ranking-chart"
      className={styles.chart}
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
