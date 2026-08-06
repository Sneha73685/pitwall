import * as echarts from "echarts/core";
import { BoxplotChart } from "echarts/charts";
import {
  DatasetComponent,
  GridComponent,
  TooltipComponent,
  TransformComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { DriverSummary } from "../../../api/client";
import { buildPaceDistributionChartOption } from "./paceDistributionChartOptions";

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
    chartRef.current?.setOption(buildPaceDistributionChartOption(drivers), true);
  }, [drivers]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Pace distribution chart"
      data-testid="pace-distribution-chart"
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
