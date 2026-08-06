import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { useEffect, useRef, type DependencyList, type RefObject } from "react";

/**
 * Shared ECharts instance lifecycle -- previously copy-pasted verbatim
 * across DeltaChart, TelemetryCharts, PaceDistributionChart,
 * DriverRankingChart, and LapTimeTrendChart: init the chart once against
 * its container, resize it on window resize, dispose it on unmount, and
 * re-`setOption` (with `notifyMerge: true`, matching every prior call
 * site) whenever `deps` changes.
 *
 * `buildOption` is called fresh inside the second effect rather than
 * passed as an already-built value, so callers pass an inline closure
 * over their latest props/state instead of re-building the option on
 * every render just to feed this hook.
 */
export function useEChartsInstance<T extends EChartsCoreOption>(
  buildOption: () => T,
  deps: DependencyList,
): RefObject<HTMLDivElement> {
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
    chartRef.current?.setOption(buildOption(), true);
    // buildOption intentionally excluded: callers pass a fresh closure each
    // render, and re-running this effect is driven by `deps` alone (the
    // same contract every migrated chart component had before extraction).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
