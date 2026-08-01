import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useComparisonStore, type ComparisonChannelKey } from "./comparisonStore";

const DEFAULTS = {
  hoverDistance: null,
  visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
};

describe("useComparisonStore", () => {
  beforeEach(() => {
    useComparisonStore.setState({ ...DEFAULTS });
  });

  it("defaults to only speed_kph visible and no hover distance", () => {
    const state = useComparisonStore.getState();

    expect(state.hoverDistance).toBeNull();
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

  it("setHoverDistance updates hoverDistance without touching visibleChannels", () => {
    useComparisonStore.getState().setHoverDistance(123.4);

    const state = useComparisonStore.getState();
    expect(state.hoverDistance).toBe(123.4);
    expect([...state.visibleChannels]).toEqual(["speed_kph"]);
  });

  it("a component subscribed only to visibleChannels does not re-render when hoverDistance changes", () => {
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
      useComparisonStore.getState().setHoverDistance(50);
      useComparisonStore.getState().setHoverDistance(100);
    });

    expect(renderCount).toBe(1);

    act(() => {
      useComparisonStore.getState().toggleChannel("rpm");
    });

    expect(renderCount).toBe(2);
  });
});
