import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useCallback } from "react";
import type { LapComparisonResponse } from "../../../api/client";
import { Card } from "../../../components/Card";
import { extractAxisPointerValue, useCursorSync } from "../../../components/useCursorSync";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import type { CornerRegion } from "../../track-map/detectCorners";
import { useComparisonStore } from "../comparisonStore";
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
const CURSOR_SOURCE = "delta-chart" as const;

interface DeltaChartProps {
  comparison: LapComparisonResponse;
  /** Detected corner regions (M22, docs/m22-design-review.md §8) -- static
   * `markArea` bands, omitted when the caller hasn't computed corners. */
  corners?: CornerRegion[];
}

/**
 * Cumulative delta-vs-distance chart (M6 Phase 7, docs/m6-design-review.md
 * §9). Mirrors TelemetryCharts' own ECharts lifecycle (init once, dispose
 * on unmount, re-`setOption` on data change) -- see that component for why.
 *
 * M14 (docs/m14-design-review.md §8/§9): cursor-synced against
 * `comparisonStore` directly -- this component only ever renders on
 * `ComparisonPage`, unlike `TelemetryCharts`, so it doesn't need the
 * cursor store passed in as a prop. `comparison.distance_m` is already the
 * one shared grid both compared laps are aligned onto, so a `distanceM`
 * cursor value indexes both sides identically -- no reconciliation needed.
 */
export function DeltaChart({ comparison, corners }: DeltaChartProps) {
  const setCursor = useComparisonStore((state) => state.setCursor);

  const handleAxisPointerUpdate = useCallback(
    (params: unknown) => {
      const value = extractAxisPointerValue(params);
      if (value === null || value === useComparisonStore.getState().distanceM) {
        return;
      }
      setCursor(value, CURSOR_SOURCE);
    },
    [setCursor],
  );

  const chart = useEChartsInstance(
    () => buildDeltaChartOption(comparison, corners),
    [comparison, corners],
    { updateAxisPointer: handleAxisPointerUpdate },
  );
  useCursorSync(chart.dispatch, CURSOR_SOURCE, useComparisonStore);
  const containerRef = chart;

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
