import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DriverSummary } from "../../../api/client";
import { DriverSummaryTable } from "./DriverSummaryTable";

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

describe("DriverSummaryTable", () => {
  it("renders '—' for null consistency fields rather than NaN or 0", () => {
    const drivers = [
      driver({
        driver: "PER",
        valid_lap_count: 1,
        consistency_ms: null,
        consistency_cv: null,
      }),
    ];

    render(<DriverSummaryTable drivers={drivers} selectedDriver={null} onSelectDriver={vi.fn()} />);

    const row = screen.getByTestId("driver-row-PER");
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).queryByText("NaNms")).not.toBeInTheDocument();
    expect(within(row).queryByText("0.0ms")).not.toBeInTheDocument();
  });

  it("flags a driver below the ranking threshold as ranking-ineligible, without hiding the row", () => {
    const drivers = [driver({ driver: "PER", valid_lap_count: 1 })];

    render(<DriverSummaryTable drivers={drivers} selectedDriver={null} onSelectDriver={vi.fn()} />);

    const row = screen.getByTestId("driver-row-PER");
    expect(row).toHaveAttribute("data-ranking-eligible", "false");
    expect(within(row).getByTestId("ranking-ineligible-PER")).toHaveTextContent(
      "(insufficient laps)",
    );
  });

  it("does not flag a driver at or above the ranking threshold", () => {
    const drivers = [driver({ driver: "VER", valid_lap_count: 2 })];

    render(<DriverSummaryTable drivers={drivers} selectedDriver={null} onSelectDriver={vi.fn()} />);

    const row = screen.getByTestId("driver-row-VER");
    expect(row).toHaveAttribute("data-ranking-eligible", "true");
    expect(within(row).queryByTestId("ranking-ineligible-VER")).not.toBeInTheDocument();
  });
});
