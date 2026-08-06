import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { DriverSummary } from "../../../api/client";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(buildDriverRankingChartOption(drivers), true);
  }, [drivers]);

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
