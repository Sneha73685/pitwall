import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { LapComparisonResponse } from "../../../api/client";
import { useComparisonStore, type ComparisonChannelKey } from "../comparisonStore";
import { buildDeltaChartOption } from "./deltaChartOptions";
import { DeltaChart } from "./DeltaChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function comparison(overrides: Partial<LapComparisonResponse> = {}): LapComparisonResponse {
  return {
    session_id_a: "2023_monza_race",
    session_id_b: "2023_monza_race",
    lap_a: {
      driver_id: "VER",
      lap_number: 1,
      lap_time_seconds: 91.234,
      sector_1_seconds: 30.1,
      sector_2_seconds: 31.0,
      sector_3_seconds: 30.134,
      is_personal_best: true,
      is_accurate: true,
    },
    lap_b: {
      driver_id: "LEC",
      lap_number: 1,
      lap_time_seconds: 91.546,
      sector_1_seconds: 30.3,
      sector_2_seconds: 31.1,
      sector_3_seconds: 30.146,
      is_personal_best: true,
      is_accurate: true,
    },
    compared_distance_m: 100,
    distance_m: [0, 100],
    delta_ms: [0, 150],
    channels: {},
    sectors: [],
    warnings: [],
    ...overrides,
  };
}

describe("DeltaChart", () => {
  const fakeChart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    dispatchAction: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(fakeChart.resize).mockClear();
    vi.mocked(fakeChart.dispose).mockClear();
    vi.mocked(fakeChart.on).mockClear();
    vi.mocked(fakeChart.off).mockClear();
    vi.mocked(fakeChart.dispatchAction).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
    useComparisonStore.setState({
      distanceM: null,
      source: null,
      visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("initializes one chart instance against its container", () => {
    render(<DeltaChart comparison={comparison()} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("delta-chart"));
  });

  it("sets chart options built from the given comparison", () => {
    const data = comparison();
    render(<DeltaChart comparison={data} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildDeltaChartOption(data), true);
  });

  it("sets chart options with corners threaded through, when given (M22)", () => {
    const data = comparison();
    const corners = [{ start_distance_m: 10, end_distance_m: 40 }];
    render(<DeltaChart comparison={data} corners={corners} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildDeltaChartOption(data, corners), true);
  });

  it("re-applies options when the comparison prop changes without re-initializing", () => {
    const { rerender } = render(<DeltaChart comparison={comparison()} />);
    rerender(<DeltaChart comparison={comparison({ delta_ms: [0, 200] })} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<DeltaChart comparison={comparison()} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });

  it("states the sign convention as legend text", () => {
    render(<DeltaChart comparison={comparison()} />);

    expect(screen.getByText(/positive delta means lap a is ahead/i)).toBeInTheDocument();
  });

  // --- M14 cursor sync (docs/m14-design-review.md §8/§9/§12) ---

  it("reports a hovered distance into comparisonStore, tagged as delta-chart", () => {
    render(<DeltaChart comparison={comparison()} />);

    const updateAxisPointer = vi
      .mocked(fakeChart.on)
      .mock.calls.find(([event]) => event === "updateAxisPointer")?.[1] as (
      params: unknown,
    ) => void;
    updateAxisPointer({ axesInfo: [{ axisDim: "x", value: 50 }] });

    expect(useComparisonStore.getState().distanceM).toBe(50);
    expect(useComparisonStore.getState().source).toBe("delta-chart");
  });

  it("dispatches into its own instance when another chart set the cursor", () => {
    useComparisonStore.setState({ distanceM: 30, source: "telemetry-charts" });

    render(<DeltaChart comparison={comparison()} />);

    expect(fakeChart.dispatchAction).toHaveBeenCalledWith({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      axesInfo: [{ axisDim: "x", axisIndex: 0, value: 30 }],
    });
  });

  it("does not dispatch into its own instance when it was the source that set the cursor", () => {
    useComparisonStore.setState({ distanceM: 30, source: "delta-chart" });

    render(<DeltaChart comparison={comparison()} />);

    expect(fakeChart.dispatchAction).not.toHaveBeenCalled();
  });
});
