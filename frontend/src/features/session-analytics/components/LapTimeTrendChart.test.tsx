import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { DriverLapMetrics } from "../../../api/client";
import { buildLapTimeTrendChartOption } from "./lapTimeTrendChartOptions";
import { LapTimeTrendChart } from "./LapTimeTrendChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function lap(overrides: Partial<DriverLapMetrics> = {}): DriverLapMetrics {
  return {
    lap_number: 1,
    lap_time_ms: 90000,
    is_valid: true,
    exclusion_reason: null,
    is_outlier: false,
    delta_to_theoretical_best_ms: 500,
    delta_to_own_median_ms: 0,
    full_throttle_pct: 60,
    brake_event_count: 4,
    ...overrides,
  };
}

describe("LapTimeTrendChart", () => {
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
    render(<LapTimeTrendChart laps={[lap()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("lap-time-trend-chart"));
  });

  it("sets chart options built from the given laps", () => {
    const laps = [lap({ lap_number: 1 }), lap({ lap_number: 2, lap_time_ms: 89500 })];
    render(<LapTimeTrendChart laps={laps} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildLapTimeTrendChartOption(laps), true);
  });

  it("renders exactly one series -- no fitted trend/regression line is ever added", () => {
    const laps = [lap({ lap_number: 1 }), lap({ lap_number: 2 }), lap({ lap_number: 3 })];
    render(<LapTimeTrendChart laps={laps} />);

    const [appliedOption] = fakeChart.setOption.mock.calls[0] as [
      { series: { type: string }[] },
      boolean,
    ];
    expect(appliedOption.series).toHaveLength(1);
    expect(appliedOption.series[0].type).toBe("line");
  });

  it("re-applies options when the laps prop changes without re-initializing", () => {
    const { rerender } = render(<LapTimeTrendChart laps={[lap()]} />);
    rerender(<LapTimeTrendChart laps={[lap(), lap({ lap_number: 2 })]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<LapTimeTrendChart laps={[lap()]} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });
});
