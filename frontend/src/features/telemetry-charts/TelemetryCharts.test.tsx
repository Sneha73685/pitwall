import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import { create } from "zustand";
import type { TelemetrySample } from "../../api/client";
import type { CursorSlice } from "../../components/useCursorSync";
import { buildChartOption } from "./chartOptions";
import { TelemetryCharts } from "./TelemetryCharts";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function sample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    distance_m: 0,
    time_seconds: 0,
    speed_kph: 200,
    throttle_pct: 100,
    brake_active: false,
    rpm: 10000,
    gear: 5,
    drs_active: false,
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  };
}

function createCursorStore() {
  return create<CursorSlice>((set) => ({
    distanceM: null,
    source: null,
    setCursor: (distanceM, source) => set({ distanceM, source }),
    clearCursor: () => set({ distanceM: null, source: null }),
  }));
}

describe("TelemetryCharts", () => {
  const fakeChart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    dispatchAction: vi.fn(),
  };
  let cursorStore: ReturnType<typeof createCursorStore>;

  beforeEach(() => {
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(fakeChart.resize).mockClear();
    vi.mocked(fakeChart.dispose).mockClear();
    vi.mocked(fakeChart.on).mockClear();
    vi.mocked(fakeChart.off).mockClear();
    vi.mocked(fakeChart.dispatchAction).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
    cursorStore = createCursorStore();
  });

  afterEach(() => {
    cleanup();
  });

  it("initializes one chart instance against its container", () => {
    render(<TelemetryCharts samples={[sample()]} cursorStore={cursorStore} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("telemetry-charts"));
  });

  it("sets chart options built from the given samples", () => {
    const samples = [sample({ distance_m: 0 }), sample({ distance_m: 100 })];
    render(<TelemetryCharts samples={samples} cursorStore={cursorStore} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildChartOption(samples), true);
  });

  it("re-applies options when the samples prop changes without re-initializing", () => {
    const { rerender } = render(
      <TelemetryCharts samples={[sample({ distance_m: 0 })]} cursorStore={cursorStore} />,
    );
    rerender(
      <TelemetryCharts
        samples={[sample({ distance_m: 0 }), sample({ distance_m: 10 })]}
        cursorStore={cursorStore}
      />,
    );

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<TelemetryCharts samples={[sample()]} cursorStore={cursorStore} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });

  it("shows a message and hides the chart container when there is no telemetry", () => {
    render(<TelemetryCharts samples={[]} cursorStore={cursorStore} />);

    expect(screen.getByText(/no telemetry data available/i)).toBeInTheDocument();
    expect(screen.getByTestId("telemetry-charts")).toHaveStyle({ display: "none" });
  });

  it("keeps the same chart container mounted so a later lap with data can reuse it", () => {
    const { rerender } = render(<TelemetryCharts samples={[]} cursorStore={cursorStore} />);
    rerender(<TelemetryCharts samples={[sample()]} cursorStore={cursorStore} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("telemetry-charts")).toHaveStyle({ display: "block" });
    expect(screen.queryByText(/no telemetry data available/i)).not.toBeInTheDocument();
  });

  it("passes secondarySamples through to the built chart option, when given (M6)", () => {
    const samples = [sample({ distance_m: 0 })];
    const secondarySamples = [sample({ distance_m: 0, speed_kph: 250 })];
    render(
      <TelemetryCharts
        samples={samples}
        secondarySamples={secondarySamples}
        cursorStore={cursorStore}
      />,
    );

    expect(fakeChart.setOption).toHaveBeenCalledWith(
      buildChartOption(samples, secondarySamples),
      true,
    );
  });

  it("re-applies options when only secondarySamples changes", () => {
    const samples = [sample({ distance_m: 0 })];
    const { rerender } = render(<TelemetryCharts samples={samples} cursorStore={cursorStore} />);
    rerender(
      <TelemetryCharts samples={samples} secondarySamples={[sample()]} cursorStore={cursorStore} />,
    );

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("passes a channels filter through to the built chart option (M6 Phase 7)", () => {
    const samples = [sample({ distance_m: 0 })];
    render(
      <TelemetryCharts samples={samples} channels={["speed_kph"]} cursorStore={cursorStore} />,
    );

    expect(fakeChart.setOption).toHaveBeenCalledWith(
      buildChartOption(samples, undefined, ["speed_kph"]),
      true,
    );
  });

  it("re-applies options when only the channels filter changes", () => {
    const samples = [sample({ distance_m: 0 })];
    const { rerender } = render(
      <TelemetryCharts samples={samples} channels={["speed_kph"]} cursorStore={cursorStore} />,
    );
    rerender(
      <TelemetryCharts
        samples={samples}
        channels={["speed_kph", "gear"]}
        cursorStore={cursorStore}
      />,
    );

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  // --- M14 cursor sync (docs/m14-design-review.md §8/§12) ---

  it("reports a hovered distance into cursorStore, tagged with its own source", () => {
    render(<TelemetryCharts samples={[sample()]} cursorStore={cursorStore} />);

    const updateAxisPointer = vi
      .mocked(fakeChart.on)
      .mock.calls.find(([event]) => event === "updateAxisPointer")?.[1] as (
      params: unknown,
    ) => void;
    updateAxisPointer({ axesInfo: [{ axisDim: "x", value: 42 }] });

    expect(cursorStore.getState().distanceM).toBe(42);
    expect(cursorStore.getState().source).toBe("telemetry-charts");
  });

  it("does not re-set the store when the reported value already matches the store's current value", () => {
    cursorStore.setState({ distanceM: 42, source: "delta-chart" });
    render(<TelemetryCharts samples={[sample()]} cursorStore={cursorStore} />);

    const updateAxisPointer = vi
      .mocked(fakeChart.on)
      .mock.calls.find(([event]) => event === "updateAxisPointer")?.[1] as (
      params: unknown,
    ) => void;
    updateAxisPointer({ axesInfo: [{ axisDim: "x", value: 42 }] });

    // Source is untouched -- guards the dispatch-echo feedback loop
    // useCursorSync's docstring describes.
    expect(cursorStore.getState().source).toBe("delta-chart");
  });

  it("dispatches into its own instance when another chart set the cursor", () => {
    cursorStore.setState({ distanceM: 77, source: "delta-chart" });
    render(<TelemetryCharts samples={[sample()]} cursorStore={cursorStore} />);

    expect(fakeChart.dispatchAction).toHaveBeenCalledWith({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      axesInfo: [{ axisDim: "x", axisIndex: 0, value: 77 }],
    });
  });
});
