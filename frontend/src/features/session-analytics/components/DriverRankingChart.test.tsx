import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { DriverSummary } from "../../../api/client";
import { DriverRankingChart } from "./DriverRankingChart";

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
    valid_lap_count: 5,
    best_lap_ms: 89500,
    theoretical_best_lap_ms: 89500,
    theoretical_best_delta_ms: 0,
    median_lap_ms: 90000,
    consistency_ms: 506.0,
    consistency_cv: 0.0056,
    full_throttle_pct: 62.1,
    outlier_lap_count: 1,
    lap_times_ms: [90000, 89500, 90200, 91000, 89800],
    ...overrides,
  };
}

describe("DriverRankingChart", () => {
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
    render(<DriverRankingChart drivers={[driver()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("driver-ranking-chart"));
  });

  it("sets a bar-chart option built from the given drivers", () => {
    const drivers = [
      driver({ driver: "VER", best_lap_ms: 89500 }),
      driver({ driver: "HAM", best_lap_ms: 90200 }),
    ];
    render(<DriverRankingChart drivers={drivers} />);

    const [appliedOption, notifyMerge] = fakeChart.setOption.mock.calls[0] as [
      { series: { type: string }[] },
      boolean,
    ];
    expect(notifyMerge).toBe(true);
    expect(appliedOption.series).toHaveLength(1);
    expect(appliedOption.series[0].type).toBe("bar");
  });

  it("re-applies options when the drivers prop changes without re-initializing", () => {
    const { rerender } = render(<DriverRankingChart drivers={[driver()]} />);
    rerender(<DriverRankingChart drivers={[driver(), driver({ driver: "HAM" })]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<DriverRankingChart drivers={[driver()]} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });
});
