import { beforeEach, describe, expect, it } from "vitest";
import { useTrackMapCursorStore } from "./cursorStore";

describe("useTrackMapCursorStore", () => {
  beforeEach(() => {
    useTrackMapCursorStore.setState({ distanceM: null, source: null });
  });

  it("defaults to no cursor", () => {
    const state = useTrackMapCursorStore.getState();

    expect(state.distanceM).toBeNull();
    expect(state.source).toBeNull();
  });

  it("setCursor updates distanceM and records the source", () => {
    useTrackMapCursorStore.getState().setCursor(42, "telemetry-charts");

    const state = useTrackMapCursorStore.getState();
    expect(state.distanceM).toBe(42);
    expect(state.source).toBe("telemetry-charts");
  });

  it("a later setCursor call overwrites the previous distance and source cleanly", () => {
    useTrackMapCursorStore.getState().setCursor(10, "telemetry-charts");
    useTrackMapCursorStore.getState().setCursor(20, "track-map");

    const state = useTrackMapCursorStore.getState();
    expect(state.distanceM).toBe(20);
    expect(state.source).toBe("track-map");
  });

  it("clearCursor resets distanceM and source to null", () => {
    useTrackMapCursorStore.getState().setCursor(42, "telemetry-charts");

    useTrackMapCursorStore.getState().clearCursor();

    const state = useTrackMapCursorStore.getState();
    expect(state.distanceM).toBeNull();
    expect(state.source).toBeNull();
  });
});
