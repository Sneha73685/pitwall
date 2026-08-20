import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { DriverSummary } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildPositionTrendChartOption } from "./positionTrendChartOptions";
import styles from "./PositionTrendChart.module.css";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 320;

interface PositionTrendChartProps {
  drivers: DriverSummary[];
}

/**
 * Running order across the whole session, one line per driver (M35,
 * docs/m35-design-review.md §9). Mirrors DeltaChart's/LapTimeTrendChart's
 * ECharts lifecycle. `SessionAnalyticsPage` only renders this component
 * when at least one driver has a non-null position (docs/m35-design-review.md
 * §6) -- this component itself stays defensively correct either way.
 */
export function PositionTrendChart({ drivers }: PositionTrendChartProps) {
  const containerRef = useEChartsInstance(() => buildPositionTrendChartOption(drivers), [drivers]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Position by lap chart"
      data-testid="position-trend-chart"
      className={styles.chart}
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
