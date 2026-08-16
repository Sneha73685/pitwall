import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { SeasonPaceTrendPoint } from "../../../api/client";
import { buildSeasonPaceTrendChartOption } from "./seasonPaceTrendChartOptions";
import { SeasonPaceTrendChart } from "./SeasonPaceTrendChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function point(overrides: Partial<SeasonPaceTrendPoint> = {}): SeasonPaceTrendPoint {
  return {
    session_id: "2024_bahrain_grand_prix_race",
    event_id: "2024_bahrain_grand_prix",
    event_name: "Bahrain Grand Prix",
    round_number: 1,
    session_date: "2024-03-02T15:00:00+00:00",
    valid_lap_count: 5,
    best_lap_ms: 90000,
    median_lap_ms: 91000,
    theoretical_best_lap_ms: 89500,
    consistency_ms: 120,
    consistency_cv: 0.001,
    ...overrides,
  };
}

describe("SeasonPaceTrendChart", () => {
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
    render(<SeasonPaceTrendChart points={[point()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("season-pace-trend-chart"));
  });

  it("sets chart options built from the given points", () => {
    const points = [point({ round_number: 1 }), point({ round_number: 2, best_lap_ms: 89500 })];
    render(<SeasonPaceTrendChart points={points} />);

    expect(fakeChart.setOption).toHaveBeenCalledWith(buildSeasonPaceTrendChartOption(points), true);
  });

  it("re-applies options when the points prop changes without re-initializing", () => {
    const { rerender } = render(<SeasonPaceTrendChart points={[point()]} />);
    rerender(<SeasonPaceTrendChart points={[point(), point({ round_number: 2 })]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<SeasonPaceTrendChart points={[point()]} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });
});
