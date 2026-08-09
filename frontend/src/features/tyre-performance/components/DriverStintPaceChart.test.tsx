import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { StintPace, StintPaceLap } from "../../../api/client";
import { DriverStintPaceChart } from "./DriverStintPaceChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function lap(overrides: Partial<StintPaceLap> = {}): StintPaceLap {
  return {
    lap_number: 1,
    lap_time_seconds: 90.15,
    compound: "SOFT",
    stint_number: 1,
    lap_in_stint_index: 1,
    is_valid: true,
    is_in_lap: false,
    is_out_lap: false,
    is_trend_eligible: true,
    ...overrides,
  };
}

function stint(overrides: Partial<StintPace> = {}): StintPace {
  return {
    stint_number: 1,
    compound: "SOFT",
    start_lap: 1,
    end_lap: 4,
    tyre_life_at_start: 0,
    eligible_lap_count: 3,
    consistency_ms: 100,
    consistency_cv: 0.001,
    ...overrides,
  };
}

describe("DriverStintPaceChart", () => {
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
    render(<DriverStintPaceChart laps={[lap()]} stints={[stint()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("driver-stint-pace-chart"));
  });

  it("has an accessible image role and label", () => {
    render(<DriverStintPaceChart laps={[lap()]} stints={[stint()]} />);

    expect(screen.getByRole("img", { name: /stint pace chart/i })).toBeInTheDocument();
  });

  it("renders a visible caption explaining the marker/color encoding", () => {
    render(<DriverStintPaceChart laps={[lap()]} stints={[stint()]} />);

    expect(screen.getByText(/out-lap/i)).toBeInTheDocument();
    expect(screen.getByText(/in-lap/i)).toBeInTheDocument();
    expect(screen.getByText(/never crosses a pit stop/i)).toBeInTheDocument();
  });

  it("re-applies options when laps/stints change without re-initializing", () => {
    const { rerender } = render(<DriverStintPaceChart laps={[lap()]} stints={[stint()]} />);
    rerender(<DriverStintPaceChart laps={[lap(), lap({ lap_number: 2 })]} stints={[stint()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(fakeChart.setOption).toHaveBeenCalledTimes(2);
  });

  it("disposes the chart instance on unmount", () => {
    const { unmount } = render(<DriverStintPaceChart laps={[lap()]} stints={[stint()]} />);
    unmount();

    expect(fakeChart.dispose).toHaveBeenCalledTimes(1);
  });
});
