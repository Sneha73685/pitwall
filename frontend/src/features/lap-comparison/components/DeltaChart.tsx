import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { LapComparisonResponse } from "../../../api/client";
import { Card } from "../../../components/Card";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildDeltaChartOption } from "./deltaChartOptions";
import styles from "./DeltaChart.module.css";

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const CHART_HEIGHT = 260;

interface DeltaChartProps {
  comparison: LapComparisonResponse;
}

/**
 * Cumulative delta-vs-distance chart (M6 Phase 7, docs/m6-design-review.md
 * §9). Mirrors TelemetryCharts' own ECharts lifecycle (init once, dispose
 * on unmount, re-`setOption` on data change) -- see that component for why.
 *
 * Static, not cursor-synced: `echarts.connect`/`useCursorSync` cross-chart
 * sync is V2 scope per docs/success-metrics.md and ADR-0007/ADR-0008 (the
 * same call already made for TelemetryCharts in Phase 5/6 -- this chart
 * follows that precedent rather than reintroducing V2 work into M6).
 */
export function DeltaChart({ comparison }: DeltaChartProps) {
  const containerRef = useEChartsInstance(() => buildDeltaChartOption(comparison), [comparison]);

  return (
    <Card title="Delta">
      <div
        ref={containerRef}
        role="img"
        aria-label="Lap delta chart"
        data-testid="delta-chart"
        style={{ width: "100%", height: CHART_HEIGHT }}
      />
      <p className={styles.caption}>
        Positive delta means Lap A is ahead; negative means Lap B is ahead.
      </p>
    </Card>
  );
}
