import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useCallback } from "react";
import type { StoreApi, UseBoundStore } from "zustand";
import type { TelemetrySample } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import {
  extractAxisPointerValue,
  useCursorSync,
  type CursorSlice,
} from "../../components/useCursorSync";
import { useEChartsInstance } from "../../components/useEChartsInstance";
import type { CornerRegion } from "../track-map/detectCorners";
import { buildChartOption, type ChannelKey } from "./chartOptions";
import styles from "./TelemetryCharts.module.css";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 720;
const CURSOR_SOURCE = "telemetry-charts" as const;

interface TelemetryChartsProps {
  /** One lap's distance-ordered telemetry samples (same data TrackMap already fetches). */
  samples: TelemetrySample[];
  /**
   * A second lap's samples, for two-lap comparison (M6). Omitted entirely
   * for the single-lap view -- when absent, this renders exactly as it did
   * before M6 (one series per channel, no "(A)"/"(B)" labeling).
   */
  secondarySamples?: TelemetrySample[];
  /**
   * Restricts rendering to a subset of channels (M6 Phase 7: the comparison
   * view's per-channel toggle). Omitted for the single-lap view, which
   * keeps showing every channel as before.
   */
  channels?: ChannelKey[];
  /**
   * The page-scoped cursor store to sync against (M14,
   * docs/m14-design-review.md §5/§8) -- `comparisonStore` when rendered via
   * `ChannelOverlayPanel`, `track-map/cursorStore` when rendered via
   * `TrackMapPage`. Passed in rather than imported directly so this
   * component stays agnostic of which page it's rendered on.
   */
  cursorStore: UseBoundStore<StoreApi<CursorSlice>>;
  /**
   * Detected corner regions (M22, docs/m22-design-review.md §8), rendered
   * as static `markArea` bands on every channel -- static, non-
   * interactive, and orthogonal to `cursorStore`'s dynamic axisPointer
   * (§7). Omitted for any page/view that hasn't computed corners.
   */
  corners?: CornerRegion[];
}

/**
 * M5: static, distance-aligned speed/throttle/brake/RPM/gear/DRS traces for
 * one lap (or two, since M6), rendered as one ECharts instance with a grid
 * per channel (ADR-0008). The container div stays mounted regardless of
 * `samples` so the chart instance survives lap-to-lap navigation
 * (TrackMapPage doesn't remount on a route-param change) -- only its
 * visibility toggles when there's no data.
 *
 * M14: hovering this instance reports the hovered `distance_m` into
 * `cursorStore` (deduped against the store's current value to avoid
 * re-entering the store from this component's own programmatic
 * `dispatch`-driven axisPointer moves -- see `useCursorSync`'s docstring);
 * `useCursorSync` moves this instance's own axisPointer to match whenever
 * some other chart set the cursor instead.
 */
export function TelemetryCharts({
  samples,
  secondarySamples,
  channels,
  cursorStore,
  corners,
}: TelemetryChartsProps) {
  const hasData = samples.length > 0;
  const setCursor = cursorStore((state) => state.setCursor);

  const handleAxisPointerUpdate = useCallback(
    (params: unknown) => {
      const value = extractAxisPointerValue(params);
      if (value === null || value === cursorStore.getState().distanceM) {
        return;
      }
      setCursor(value, CURSOR_SOURCE);
    },
    [cursorStore, setCursor],
  );

  const chart = useEChartsInstance(
    () => buildChartOption(samples, secondarySamples, channels, corners),
    [samples, secondarySamples, channels, corners],
    { updateAxisPointer: handleAxisPointerUpdate },
  );
  useCursorSync(chart.dispatch, CURSOR_SOURCE, cursorStore);
  const containerRef = chart;

  return (
    <div>
      {!hasData && <EmptyState>No telemetry data available for this lap.</EmptyState>}
      <div
        ref={containerRef}
        role="img"
        aria-label="Telemetry channel traces"
        data-testid="telemetry-charts"
        className={styles.chart}
        style={{ width: "100%", height: CHART_HEIGHT, display: hasData ? "block" : "none" }}
      />
    </div>
  );
}
