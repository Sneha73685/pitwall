import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { DriverLapMetrics } from "../../../api/client";
import { buildLapTimeTrendChartOption } from "./lapTimeTrendChartOptions";

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
    chartRef.current?.setOption(buildLapTimeTrendChartOption(laps), true);
  }, [laps]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Lap time trend chart"
      data-testid="lap-time-trend-chart"
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
