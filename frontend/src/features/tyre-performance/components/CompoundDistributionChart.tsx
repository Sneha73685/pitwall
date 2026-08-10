import * as echarts from "echarts/core";
import { BoxplotChart } from "echarts/charts";
import {
  DatasetComponent,
  GridComponent,
  TooltipComponent,
  TransformComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { CompoundAggregate } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildCompoundDistributionChartOption } from "./compoundDistributionChartOptions";
import styles from "./CompoundDistributionChart.module.css";

echarts.use([
  BoxplotChart,
  DatasetComponent,
  TransformComponent,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const CHART_HEIGHT = 320;

interface CompoundDistributionChartProps {
  compoundAggregates: CompoundAggregate[];
}

/**
 * One box per compound, all compounds on a shared axis in the fixed
 * taxonomy order -- never sorted by pace (design note §8.4). Mirrors
 * `PaceDistributionChart`'s ECharts lifecycle exactly.
 */
export function CompoundDistributionChart({ compoundAggregates }: CompoundDistributionChartProps) {
  const containerRef = useEChartsInstance(
    () => buildCompoundDistributionChartOption(compoundAggregates),
    [compoundAggregates],
  );

  return (
    <div className={styles.wrapper}>
      <p className={styles.caption}>
        Raw lap-time distribution per compound, in a fixed compound order &mdash; not sorted by
        pace. Each box summarizes the actual observed lap times for that compound in this session.
      </p>
      <div
        ref={containerRef}
        role="img"
        aria-label="Lap time distribution by compound chart"
        data-testid="compound-distribution-chart"
        className={styles.chart}
        style={{ width: "100%", height: CHART_HEIGHT }}
      />
    </div>
  );
}
