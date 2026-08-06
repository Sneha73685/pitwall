import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { DriverSummary } from "../../../api/client";
import { PaceDistributionChart } from "./PaceDistributionChart";

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

describe("PaceDistributionChart", () => {
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
    render(<PaceDistributionChart drivers={[driver()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("pace-distribution-chart"));
  });

  it("sets chart options built from the given drivers, one box per eligible driver", () => {
    // Not a deep-equality comparison against buildPaceDistributionChartOption's
    // own return value: that option embeds a fresh itemNameFormatter closure
    // on every call, so two logically-identical options are never
    // reference-equal. Assert the parts that matter for wiring instead --
    // the pure box-count/omission behavior is covered in
    // paceDistributionChartOptions.test.ts.
    const drivers = [
      driver({ driver: "VER" }),
      driver({ driver: "HAM", lap_times_ms: [91000, 90800] }),
    ];
    render(<PaceDistributionChart drivers={drivers} />);

    const [appliedOption, notifyMerge] = fakeChart.setOption.mock.calls[0] as [
      { dataset: { source: number[][] }[]; series: { type: string }[] },
      boolean,
    ];
    expect(notifyMerge).toBe(true);
    expect(appliedOption.dataset[0].source).toEqual(drivers.map((d) => d.lap_times_ms));
    expect(appliedOption.series).toHaveLength(1);
    expect(appliedOption.series[0].type).toBe("boxplot");
  });

  it("omits drivers with fewer than 2 valid laps from the rendered option", () => {
    const drivers = [driver({ driver: "VER" }), driver({ driver: "PER", lap_times_ms: [95000] })];
    render(<PaceDistributionChart drivers={drivers} />);

    const [appliedOption] = fakeChart.setOption.mock.calls[0] as [
      { dataset: { source: number[][] }[] },
      boolean,
    ];
    expect(appliedOption.dataset[0].source).toHaveLength(1);
  });

  it("re-applies options when the drivers prop changes without re-initializing", () => {
    const { rerender } = render(<PaceDistributionChart drivers={[driver()]} />);
    rerender(<PaceDistributionChart drivers={[driver(), driver({ driver: "HAM" })]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<PaceDistributionChart drivers={[driver()]} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });
});
