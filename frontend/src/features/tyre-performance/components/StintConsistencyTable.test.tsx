import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StintPace } from "../../../api/client";
import { StintConsistencyTable } from "./StintConsistencyTable";

function stint(overrides: Partial<StintPace> = {}): StintPace {
  return {
    stint_number: 1,
    compound: "SOFT",
    start_lap: 1,
    end_lap: 17,
    tyre_life_at_start: 0,
    eligible_lap_count: 15,
    consistency_ms: 122.47,
    consistency_cv: 0.0014,
    ...overrides,
  };
}

describe("StintConsistencyTable", () => {
  it("shows an empty state when there are no stints", () => {
    render(<StintConsistencyTable stints={[]} />);

    expect(screen.getByText(/no stint data available/i)).toBeInTheDocument();
  });

  it("renders one row per stint with compound, laps, tyre life, eligible laps, and consistency", () => {
    render(<StintConsistencyTable stints={[stint()]} />);

    const row = screen.getByTestId("stint-consistency-row-1");
    expect(row).toHaveTextContent("SOFT");
    expect(row).toHaveTextContent("L1–17");
    expect(row).toHaveTextContent("15");
    expect(row).toHaveTextContent("122.5ms");
    expect(row).toHaveTextContent("0.0014");
  });

  it("renders rows in stint_number order regardless of input order", () => {
    render(
      <StintConsistencyTable
        stints={[
          stint({ stint_number: 3 }),
          stint({ stint_number: 1 }),
          stint({ stint_number: 2 }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId(/^stint-consistency-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "stint-consistency-row-1",
      "stint-consistency-row-2",
      "stint-consistency-row-3",
    ]);
  });

  it("renders a dash for null consistency figures", () => {
    render(
      <StintConsistencyTable
        stints={[stint({ consistency_ms: null, consistency_cv: null, eligible_lap_count: 0 })]}
      />,
    );

    const row = screen.getByTestId("stint-consistency-row-1");
    expect(row).toHaveTextContent("—");
  });

  it("flags a stint with fewer than 2 eligible laps as insufficient, without hiding it", () => {
    // Reproduces the real HUL single-lap-stint case: 0 eligible laps
    // remaining after in/out-lap exclusion, still shown as a real row.
    render(
      <StintConsistencyTable
        stints={[
          stint({
            stint_number: 1,
            start_lap: 1,
            end_lap: 1,
            eligible_lap_count: 0,
            consistency_ms: null,
            consistency_cv: null,
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("stint-consistency-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("stint-insufficient-laps-1")).toHaveTextContent("insufficient laps");
  });

  it("does not flag a stint with 2 or more eligible laps", () => {
    render(<StintConsistencyTable stints={[stint({ eligible_lap_count: 2 })]} />);

    expect(screen.queryByTestId("stint-insufficient-laps-1")).not.toBeInTheDocument();
  });

  it("renders a dash for null tyre life at start", () => {
    render(<StintConsistencyTable stints={[stint({ tyre_life_at_start: null })]} />);

    expect(screen.getByTestId("stint-consistency-row-1")).toHaveTextContent("—");
  });

  it("has no sortable column controls, unlike DriverSummaryTable", () => {
    render(<StintConsistencyTable stints={[stint()]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
