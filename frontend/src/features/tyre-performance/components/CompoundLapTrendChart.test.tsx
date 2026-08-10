import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { CompoundLapIndexAggregate } from "../../../api/client";
import { CompoundLapTrendChart } from "./CompoundLapTrendChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return { ...actual, use: vi.fn(), init: vi.fn() };
});

function bin(overrides: Partial<CompoundLapIndexAggregate> = {}): CompoundLapIndexAggregate {
  return {
    compound: "SOFT",
    lap_in_stint_index: 1,
    lap_count: 2,
    lap_times_ms: [90000, 90200],
    median_lap_time_ms: 90100,
    ...overrides,
  };
}

describe("CompoundLapTrendChart", () => {
  const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

  beforeEach(() => {
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
  });

  afterEach(() => cleanup());

  it("initializes one chart instance against its container", () => {
    render(<CompoundLapTrendChart compoundLapIndexAggregates={[bin()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("compound-lap-trend-chart"));
  });

  it("has an accessible image role and label", () => {
    render(<CompoundLapTrendChart compoundLapIndexAggregates={[bin()]} />);

    expect(screen.getByRole("img", { name: /lap-in-stint index chart/i })).toBeInTheDocument();
  });

  it("renders a visible caption stating points are never connected", () => {
    render(<CompoundLapTrendChart compoundLapIndexAggregates={[bin()]} />);

    expect(screen.getByText(/never connected/i)).toBeInTheDocument();
    expect(screen.getByText(/not a degradation curve/i)).toBeInTheDocument();
  });
});
