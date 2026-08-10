import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { CompoundAggregate } from "../../../api/client";
import { CompoundDistributionChart } from "./CompoundDistributionChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return { ...actual, use: vi.fn(), init: vi.fn() };
});

function aggregate(overrides: Partial<CompoundAggregate> = {}): CompoundAggregate {
  return {
    compound: "SOFT",
    lap_count: 5,
    driver_count: 3,
    lap_times_ms: [90000, 90200, 90400, 90600, 90800],
    median_lap_time_ms: 90400,
    p25_lap_time_ms: 90200,
    p75_lap_time_ms: 90600,
    ...overrides,
  };
}

describe("CompoundDistributionChart", () => {
  const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

  beforeEach(() => {
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
  });

  afterEach(() => cleanup());

  it("initializes one chart instance against its container", () => {
    render(<CompoundDistributionChart compoundAggregates={[aggregate()]} />);

    expect(echarts.init).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledWith(screen.getByTestId("compound-distribution-chart"));
  });

  it("has an accessible image role and label", () => {
    render(<CompoundDistributionChart compoundAggregates={[aggregate()]} />);

    expect(
      screen.getByRole("img", { name: /lap time distribution by compound/i }),
    ).toBeInTheDocument();
  });

  it("renders a visible caption stating the compound order is fixed, not pace-sorted", () => {
    render(<CompoundDistributionChart compoundAggregates={[aggregate()]} />);

    expect(screen.getByText(/not sorted by pace/i)).toBeInTheDocument();
  });
});
