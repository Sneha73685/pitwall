import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { LapComparisonResponse } from "../../../api/client";
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
    render(<DeltaChart comparison={comparison()} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("delta-chart"));
  });

  it("sets chart options built from the given comparison", () => {
    const data = comparison();
    render(<DeltaChart comparison={data} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildDeltaChartOption(data), true);
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
});
