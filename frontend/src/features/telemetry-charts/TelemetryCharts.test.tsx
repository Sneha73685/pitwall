import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { TelemetrySample } from "../../api/client";
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

describe("TelemetryCharts", () => {
  const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

  beforeEach(() => {
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(fakeChart.resize).mockClear();
    vi.mocked(fakeChart.dispose).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
  });

  afterEach(() => {
    cleanup();
  });

  it("initializes one chart instance against its container", () => {
    render(<TelemetryCharts samples={[sample()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("telemetry-charts"));
  });

  it("sets chart options built from the given samples", () => {
    const samples = [sample({ distance_m: 0 }), sample({ distance_m: 100 })];
    render(<TelemetryCharts samples={samples} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildChartOption(samples), true);
  });

  it("re-applies options when the samples prop changes without re-initializing", () => {
    const { rerender } = render(<TelemetryCharts samples={[sample({ distance_m: 0 })]} />);
    rerender(<TelemetryCharts samples={[sample({ distance_m: 0 }), sample({ distance_m: 10 })]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<TelemetryCharts samples={[sample()]} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });

  it("shows a message and hides the chart container when there is no telemetry", () => {
    render(<TelemetryCharts samples={[]} />);

    expect(screen.getByText(/no telemetry data available/i)).toBeInTheDocument();
    expect(screen.getByTestId("telemetry-charts")).toHaveStyle({ display: "none" });
  });

  it("keeps the same chart container mounted so a later lap with data can reuse it", () => {
    const { rerender } = render(<TelemetryCharts samples={[]} />);
    rerender(<TelemetryCharts samples={[sample()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("telemetry-charts")).toHaveStyle({ display: "block" });
    expect(screen.queryByText(/no telemetry data available/i)).not.toBeInTheDocument();
  });

  it("passes secondarySamples through to the built chart option, when given (M6)", () => {
    const samples = [sample({ distance_m: 0 })];
    const secondarySamples = [sample({ distance_m: 0, speed_kph: 250 })];
    render(<TelemetryCharts samples={samples} secondarySamples={secondarySamples} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(
      buildChartOption(samples, secondarySamples),
      true,
    );
  });

  it("re-applies options when only secondarySamples changes", () => {
    const samples = [sample({ distance_m: 0 })];
    const { rerender } = render(<TelemetryCharts samples={samples} />);
    rerender(<TelemetryCharts samples={samples} secondarySamples={[sample()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("passes a channels filter through to the built chart option (M6 Phase 7)", () => {
    const samples = [sample({ distance_m: 0 })];
    render(<TelemetryCharts samples={samples} channels={["speed_kph"]} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(
      buildChartOption(samples, undefined, ["speed_kph"]),
      true,
    );
  });

  it("re-applies options when only the channels filter changes", () => {
    const samples = [sample({ distance_m: 0 })];
    const { rerender } = render(<TelemetryCharts samples={samples} channels={["speed_kph"]} />);
    rerender(<TelemetryCharts samples={samples} channels={["speed_kph", "gear"]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });
});
