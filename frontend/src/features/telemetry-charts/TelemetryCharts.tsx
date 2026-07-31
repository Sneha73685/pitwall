import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { TelemetrySample } from "../../api/client";
import { buildChartOption } from "./chartOptions";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 720;

interface TelemetryChartsProps {
  /** One lap's distance-ordered telemetry samples (same data TrackMap already fetches). */
  samples: TelemetrySample[];
}

/**
 * M5: static, distance-aligned speed/throttle/brake/RPM/gear/DRS traces for
 * one lap, rendered as one ECharts instance with a grid per channel (ADR-0008).
 * The container div stays mounted regardless of `samples` so the chart
 * instance survives lap-to-lap navigation (TrackMapPage doesn't remount on a
 * route-param change) -- only its visibility toggles when there's no data.
 */
export function TelemetryCharts({ samples }: TelemetryChartsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const hasData = samples.length > 0;

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
    chartRef.current?.setOption(buildChartOption(samples), true);
  }, [samples]);

  return (
    <div>
      {!hasData && <p>No telemetry data available for this lap.</p>}
      <div
        ref={containerRef}
        role="img"
        aria-label="Telemetry channel traces"
        data-testid="telemetry-charts"
        style={{ width: "100%", height: CHART_HEIGHT, display: hasData ? "block" : "none" }}
      />
    </div>
  );
}
