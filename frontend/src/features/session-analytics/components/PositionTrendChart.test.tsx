import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { DriverSummary } from "../../../api/client";
import { buildPositionTrendChartOption } from "./positionTrendChartOptions";
import { PositionTrendChart } from "./PositionTrendChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function driver(overrides: Partial<DriverSummary> = {}): DriverSummary {
  return {
    driver: "VER",
    valid_lap_count: 2,
    best_lap_ms: 90000,
    theoretical_best_lap_ms: 89500,
    theoretical_best_delta_ms: 500,
    median_lap_ms: 90100,
    consistency_ms: 100,
    consistency_cv: 0.001,
    full_throttle_pct: 70,
    outlier_lap_count: 0,
    lap_times_ms: [90000, 90200],
    positions: [
      { lap_number: 1, position: 1 },
      { lap_number: 2, position: 1 },
    ],
    ...overrides,
  };
}

describe("PositionTrendChart", () => {
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
    render(<PositionTrendChart drivers={[driver()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("position-trend-chart"));
  });

  it("sets chart options built from the given drivers", () => {
    const drivers = [driver({ driver: "VER" }), driver({ driver: "HAM" })];
    render(<PositionTrendChart drivers={drivers} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildPositionTrendChartOption(drivers), true);
  });

  it("re-applies options when the drivers prop changes without re-initializing", () => {
    const { rerender } = render(<PositionTrendChart drivers={[driver()]} />);
    rerender(<PositionTrendChart drivers={[driver(), driver({ driver: "HAM" })]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<PositionTrendChart drivers={[driver()]} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });
});
