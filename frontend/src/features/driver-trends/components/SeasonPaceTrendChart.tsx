import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { SeasonPaceTrendPoint } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildSeasonPaceTrendChartOption } from "./seasonPaceTrendChartOptions";
import styles from "./SeasonPaceTrendChart.module.css";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 320;

interface SeasonPaceTrendChartProps {
  points: SeasonPaceTrendPoint[];
}

/**
 * One driver's best-lap trend across a season (docs/m17-design-review.md
 * §7). Mirrors LapTimeTrendChart's ECharts lifecycle exactly. No M14
 * cursor sync -- this page has exactly one chart, and the x-axis is
 * categorical (event/round), not `distance_m`, so there is nothing for a
 * synchronized cursor to synchronize against (§7's own reasoning,
 * restated because it's independently true here, not merely copied from
 * M15).
 */
export function SeasonPaceTrendChart({ points }: SeasonPaceTrendChartProps) {
  const containerRef = useEChartsInstance(() => buildSeasonPaceTrendChartOption(points), [points]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Season pace trend chart"
      data-testid="season-pace-trend-chart"
      className={styles.chart}
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
