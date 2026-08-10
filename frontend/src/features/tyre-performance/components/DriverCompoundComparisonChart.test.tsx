import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { RawLapTimeByCompound } from "../../../api/client";
import { DriverCompoundComparisonChart } from "./DriverCompoundComparisonChart";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return { ...actual, use: vi.fn(), init: vi.fn() };
});

function entry(overrides: Partial<RawLapTimeByCompound> = {}): RawLapTimeByCompound {
  return {
    driver_id: "VER",
    compound: "SOFT",
    lap_count: 3,
    lap_times_ms: [90150, 90300, 90450],
    lap_in_stint_indices: [1, 2, 3],
    median_lap_time_ms: 90300,
    ...overrides,
  };
}

describe("DriverCompoundComparisonChart", () => {
  const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

  beforeEach(() => {
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
  });

  afterEach(() => cleanup());

  it("shows an empty state when there is no comparison data", () => {
    render(<DriverCompoundComparisonChart rawLapTimesByCompound={[]} />);

    expect(screen.getByText(/no driver comparison data available/i)).toBeInTheDocument();
  });

  it("defaults to the first compound in the fixed taxonomy order, not input order", () => {
    render(
      <DriverCompoundComparisonChart
        rawLapTimesByCompound={[entry({ compound: "HARD" }), entry({ compound: "SOFT" })]}
      />,
    );

    expect(screen.getByRole("button", { name: "SOFT" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches compound on tab click, re-applying chart options", () => {
    render(
      <DriverCompoundComparisonChart
        rawLapTimesByCompound={[entry({ compound: "HARD" }), entry({ compound: "SOFT" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "HARD" }));

    expect(screen.getByRole("button", { name: "HARD" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "SOFT" })).toHaveAttribute("aria-pressed", "false");
  });

  it("has an accessible image role naming the selected compound", () => {
    render(<DriverCompoundComparisonChart rawLapTimesByCompound={[entry({ compound: "SOFT" })]} />);

    expect(screen.getByRole("img", { name: /soft/i })).toBeInTheDocument();
  });

  it("renders a caption stating this is not a ranking", () => {
    render(<DriverCompoundComparisonChart rawLapTimesByCompound={[entry()]} />);

    expect(screen.getByText(/not a ranking/i)).toBeInTheDocument();
  });

  it("never renders a ranking verdict, even when one driver is clearly faster", () => {
    // Adversarial fixture: VER is far faster than HAM on the same compound --
    // a naive implementation would be tempted to call this out. The page's
    // own disclaimer text legitimately contains the word "ranking" (to deny
    // it), so this checks for positive ranking claims specifically, not the
    // bare word.
    render(
      <DriverCompoundComparisonChart
        rawLapTimesByCompound={[
          entry({ driver_id: "VER", compound: "SOFT", lap_times_ms: [80000, 80100, 80200] }),
          entry({ driver_id: "HAM", compound: "SOFT", lap_times_ms: [99000, 99100, 99200] }),
        ]}
      />,
    );

    expect(document.body.textContent).not.toMatch(
      /fastest driver|slowest driver|best driver|faster than|performance ranking|pace ranking|\b1st\b|\b2nd\b|\b3rd\b/i,
    );
  });
});
