import { useEffect } from "react";
import type { Payload } from "echarts/core";
import type { StoreApi, UseBoundStore } from "zustand";

/**
 * Synchronized telemetry cursor (M14, docs/m14-design-review.md §5/§6).
 * Both `comparisonStore` and `track-map/cursorStore` implement this same
 * shape -- two feature-scoped store instances of one pattern, not two
 * different shapes (§6).
 */
export type CursorSource = "telemetry-charts" | "delta-chart" | "track-map";

export interface CursorSlice {
  /** Canonical position on the shared distance_m axis. null = no active hover anywhere. */
  distanceM: number | null;
  /** Which chart last set it (own-instance dispatch skip, §8) -- never rendered. */
  source: CursorSource | null;
  setCursor: (distanceM: number, source: CursorSource) => void;
  clearCursor: () => void;
}

type CursorStoreHook = UseBoundStore<StoreApi<CursorSlice>>;

/**
 * Reads the axis value ECharts' own "updateAxisPointer" event already
 * computed (docs/m14-design-review.md §7) -- no separate pixel->value
 * conversion needed. Returns null for events with no x-axis info (e.g.
 * currTrigger: "leave"), which callers treat as "ignore," not "clear"
 * (§6.1/§10: the cursor does not clear on mouse-leave).
 */
export function extractAxisPointerValue(params: unknown): number | null {
  const axesInfo = (params as { axesInfo?: { axisDim?: string; value?: number }[] } | undefined)
    ?.axesInfo;
  const xAxisInfo = axesInfo?.find((info) => info.axisDim === "x");
  return typeof xAxisInfo?.value === "number" ? xAxisInfo.value : null;
}

/**
 * Wires one ECharts instance's own axisPointer to a page-scoped cursor
 * store (docs/m14-design-review.md §8): whenever the store's `distanceM`
 * changes because a DIFFERENT chart set it, moves this instance's own
 * axisPointer/tooltip to match via `dispatch`. Skips dispatch when this
 * instance was the source (`source === own identity`) -- ECharts already
 * shows its own crosshair natively from the real hover that caused the
 * update, so re-dispatching into the same instance would be redundant, and
 * (more importantly) is exactly the feedback-loop shape §7/§12 call out:
 * dispatching `updateAxisPointer` into an instance re-fires that same
 * instance's own "updateAxisPointer" event. The chart-side handler that
 * reports genuine hover into the store (see each chart component; built on
 * `extractAxisPointerValue` above) additionally no-ops when the reported
 * value already equals the store's current `distanceM`, which is what
 * actually breaks that specific echo -- this effect's own source check just
 * avoids the redundant dispatch on the originating instance.
 *
 * One hook, parameterized by which store instance to sync against
 * (`useCursorStore`) -- so a chart component using it doesn't need to know
 * which page it's rendered on (§5/§8).
 */
export function useCursorSync(
  dispatch: (action: Payload) => void,
  source: CursorSource,
  useCursorStore: CursorStoreHook,
): void {
  const distanceM = useCursorStore((state) => state.distanceM);
  const cursorSource = useCursorStore((state) => state.source);

  useEffect(() => {
    if (cursorSource === source) {
      return;
    }
    if (distanceM === null) {
      dispatch({ type: "hideTip" });
      return;
    }
    dispatch({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      axesInfo: [{ axisDim: "x", axisIndex: 0, value: distanceM }],
    });
  }, [distanceM, cursorSource, source, dispatch]);
}
