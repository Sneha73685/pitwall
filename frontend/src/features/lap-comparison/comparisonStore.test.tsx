import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useComparisonStore, type ComparisonChannelKey } from "./comparisonStore";

const DEFAULTS = {
  distanceM: null,
  source: null,
  visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
};

describe("useComparisonStore", () => {
  beforeEach(() => {
    useComparisonStore.setState({ ...DEFAULTS });
  });

  it("defaults to only speed_kph visible and no cursor", () => {
    const state = useComparisonStore.getState();

    expect(state.distanceM).toBeNull();
    expect(state.source).toBeNull();
    expect([...state.visibleChannels]).toEqual(["speed_kph"]);
  });

  it("toggleChannel adds a channel that isn't visible yet", () => {
    useComparisonStore.getState().toggleChannel("throttle_pct");

    expect(useComparisonStore.getState().visibleChannels.has("throttle_pct")).toBe(true);
    // Doesn't disturb the existing default.
    expect(useComparisonStore.getState().visibleChannels.has("speed_kph")).toBe(true);
  });

  it("toggleChannel removes a channel that's already visible", () => {
    useComparisonStore.getState().toggleChannel("speed_kph");

    expect(useComparisonStore.getState().visibleChannels.has("speed_kph")).toBe(false);
  });

  it("setCursor updates distanceM and records the source, without touching visibleChannels", () => {
    useComparisonStore.getState().setCursor(123.4, "delta-chart");

    const state = useComparisonStore.getState();
    expect(state.distanceM).toBe(123.4);
    expect(state.source).toBe("delta-chart");
    expect([...state.visibleChannels]).toEqual(["speed_kph"]);
  });

  it("a later setCursor call overwrites the previous distance and source cleanly", () => {
    useComparisonStore.getState().setCursor(50, "telemetry-charts");
    useComparisonStore.getState().setCursor(100, "delta-chart");

    const state = useComparisonStore.getState();
    expect(state.distanceM).toBe(100);
    expect(state.source).toBe("delta-chart");
  });

  it("clearCursor resets distanceM and source to null", () => {
    useComparisonStore.getState().setCursor(100, "delta-chart");

    useComparisonStore.getState().clearCursor();

    const state = useComparisonStore.getState();
    expect(state.distanceM).toBeNull();
    expect(state.source).toBeNull();
  });

  it("a component subscribed only to visibleChannels does not re-render when the cursor changes", () => {
    let renderCount = 0;
    function ChannelReader() {
      // Selector subscription (matches how ChannelOverlayPanel reads the
      // store) -- Zustand only re-renders on changes to the selected slice.
      useComparisonStore((state) => state.visibleChannels);
      renderCount += 1;
      return null;
    }

    render(<ChannelReader />);
    expect(renderCount).toBe(1);

    act(() => {
      useComparisonStore.getState().setCursor(50, "telemetry-charts");
      useComparisonStore.getState().setCursor(100, "delta-chart");
    });

    expect(renderCount).toBe(1);

    act(() => {
      useComparisonStore.getState().toggleChannel("rpm");
    });

    expect(renderCount).toBe(2);
  });
});
