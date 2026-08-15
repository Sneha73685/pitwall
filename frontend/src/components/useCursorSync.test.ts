import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { extractAxisPointerValue, useCursorSync, type CursorSlice } from "./useCursorSync";

function createTestStore() {
  return create<CursorSlice>((set) => ({
    distanceM: null,
    source: null,
    setCursor: (distanceM, source) => set({ distanceM, source }),
    clearCursor: () => set({ distanceM: null, source: null }),
  }));
}

describe("extractAxisPointerValue", () => {
  it("reads the x-axis value from an updateAxisPointer event's axesInfo", () => {
    const params = { axesInfo: [{ axisDim: "x", axisIndex: 0, value: 42.5 }] };

    expect(extractAxisPointerValue(params)).toBe(42.5);
  });

  it("returns null when there is no x-axis info (e.g. a leave event)", () => {
    expect(extractAxisPointerValue({ axesInfo: [] })).toBeNull();
    expect(extractAxisPointerValue({})).toBeNull();
    expect(extractAxisPointerValue(undefined)).toBeNull();
  });
});

describe("useCursorSync", () => {
  it("dispatches an updateAxisPointer action when another chart set the cursor", () => {
    const store = createTestStore();
    const dispatch = vi.fn();
    act(() => {
      store.setState({ distanceM: 100, source: "delta-chart" });
    });

    renderHook(() => useCursorSync(dispatch, "telemetry-charts", store));

    expect(dispatch).toHaveBeenCalledWith({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      axesInfo: [{ axisDim: "x", axisIndex: 0, value: 100 }],
    });
  });

  it("does not dispatch when this instance was the one that set the cursor (no feedback loop)", () => {
    const store = createTestStore();
    const dispatch = vi.fn();
    act(() => {
      store.setState({ distanceM: 100, source: "telemetry-charts" });
    });

    renderHook(() => useCursorSync(dispatch, "telemetry-charts", store));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches hideTip when the cursor is cleared by another source", () => {
    const store = createTestStore();
    const dispatch = vi.fn();

    renderHook(() => useCursorSync(dispatch, "telemetry-charts", store));
    dispatch.mockClear();

    act(() => {
      store.setState({ distanceM: 50, source: "delta-chart" });
    });
    dispatch.mockClear();

    act(() => {
      store.setState({ distanceM: null, source: null });
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "hideTip" });
  });

  it("re-dispatches when the store's distanceM changes to a new value from another source", () => {
    const store = createTestStore();
    const dispatch = vi.fn();
    act(() => {
      store.setState({ distanceM: 10, source: "delta-chart" });
    });

    renderHook(() => useCursorSync(dispatch, "telemetry-charts", store));
    dispatch.mockClear();

    act(() => {
      store.setState({ distanceM: 20, source: "delta-chart" });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      axesInfo: [{ axisDim: "x", axisIndex: 0, value: 20 }],
    });
  });
});
