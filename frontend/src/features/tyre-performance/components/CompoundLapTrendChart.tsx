import * as echarts from "echarts/core";
import { ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { CompoundLapIndexAggregate } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildCompoundLapTrendChartOption } from "./compoundLapTrendChartOptions";
import styles from "./CompoundLapTrendChart.module.css";

echarts.use([ScatterChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 320;

interface CompoundLapTrendChartProps {
  compoundLapIndexAggregates: CompoundLapIndexAggregate[];
}

/**
 * Raw scatter of lap time by lap-in-stint index, grouped by compound
 * (design note §8.5). Deliberately never draws a connected line: doing so
 * would visually reproduce a degradation curve even without literally
 * fitting one (docs/m11-design-review.md §4.2).
 */
export function CompoundLapTrendChart({ compoundLapIndexAggregates }: CompoundLapTrendChartProps) {
  const containerRef = useEChartsInstance(
    () => buildCompoundLapTrendChartOption(compoundLapIndexAggregates),
    [compoundLapIndexAggregates],
  );

  return (
    <div className={styles.wrapper}>
      <p className={styles.caption}>
        Raw lap times by lap-in-stint index, one dot per observed lap, grouped by compound. Larger
        diamonds mark the median of each lap-in-stint bin. Points are never connected &mdash; this
        is not a degradation curve or a fitted trend.
      </p>
      <div
        ref={containerRef}
        role="img"
        aria-label="Raw lap time by lap-in-stint index chart, grouped by compound"
        data-testid="compound-lap-trend-chart"
        className={styles.chart}
        style={{ width: "100%", height: CHART_HEIGHT }}
      />
    </div>
  );
}
