import * as echarts from "echarts/core";
import type { EChartsCoreOption, Payload } from "echarts/core";
import { useCallback, useEffect, useRef, type DependencyList, type RefObject } from "react";

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
 *
 * `onEvents` (M14, docs/m14-design-review.md §8): optional, additive --
 * every pre-M14 call site omits it and keeps working unchanged. Registers
 * `chart.on(event, handler)` once, in the same init effect as
 * `echarts.init` (not re-run on every render), reading the latest handler
 * via a ref so callers can pass a fresh closure each render without
 * tearing down and reinitializing the chart. The returned `dispatch`
 * closes over the internal `chartRef` (never exposing the raw instance) so
 * `useCursorSync` can programmatically move this chart's own
 * axisPointer/tooltip when a page-scoped cursor store changes for a
 * different reason than this chart's own hover.
 */
export function useEChartsInstance<T extends EChartsCoreOption>(
  buildOption: () => T,
  deps: DependencyList,
  onEvents?: Record<string, (params: unknown) => void>,
): RefObject<HTMLDivElement> & { dispatch: (action: Payload) => void } {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const registeredEvents = Object.keys(onEventsRef.current ?? {});
    const wrappedHandlers = registeredEvents.map(
      (event) => (params: unknown) => onEventsRef.current?.[event]?.(params),
    );
    registeredEvents.forEach((event, index) => chart.on(event, wrappedHandlers[index]));

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      registeredEvents.forEach((event, index) => chart.off(event, wrappedHandlers[index]));
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

  const dispatch = useCallback((action: Payload) => {
    chartRef.current?.dispatchAction(action);
  }, []);

  return Object.assign(containerRef, { dispatch });
}
