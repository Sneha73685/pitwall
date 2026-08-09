import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StintPaceLap } from "../../../api/client";
import { StintPaceLapTable } from "./StintPaceLapTable";

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

describe("StintPaceLapTable", () => {
  it("shows an empty state when there are no laps", () => {
    render(<StintPaceLapTable laps={[]} />);

    expect(screen.getByText(/no lap data available/i)).toBeInTheDocument();
  });

  it("renders one row per lap with lap, stint, lap-in-stint index, compound, and lap time", () => {
    render(
      <StintPaceLapTable laps={[lap({ lap_number: 4, stint_number: 2, lap_in_stint_index: 3 })]} />,
    );

    const row = screen.getByTestId("stint-pace-lap-row-4");
    expect(row).toHaveTextContent("4");
    expect(row).toHaveTextContent("2");
    expect(row).toHaveTextContent("3");
    expect(row).toHaveTextContent("SOFT");
    expect(row).toHaveTextContent("90.150s");
  });

  it("flags an in-lap without dropping the row", () => {
    render(
      <StintPaceLapTable
        laps={[lap({ lap_number: 4, is_in_lap: true, is_trend_eligible: false })]}
      />,
    );

    expect(screen.getByTestId("stint-pace-lap-flag-4")).toHaveTextContent("in-lap");
  });

  it("flags an out-lap without dropping the row", () => {
    render(
      <StintPaceLapTable
        laps={[lap({ lap_number: 18, is_out_lap: true, is_trend_eligible: false })]}
      />,
    );

    expect(screen.getByTestId("stint-pace-lap-flag-18")).toHaveTextContent("out-lap");
  });

  it("flags an invalid, non-boundary lap distinctly from in/out-laps", () => {
    render(
      <StintPaceLapTable
        laps={[lap({ lap_number: 9, is_valid: false, is_trend_eligible: false })]}
      />,
    );

    expect(screen.getByTestId("stint-pace-lap-flag-9")).toHaveTextContent("invalid");
  });

  it("flags a valid, non-boundary lap that is simply trend-ineligible as excluded", () => {
    render(<StintPaceLapTable laps={[lap({ lap_number: 12, is_trend_eligible: false })]} />);

    expect(screen.getByTestId("stint-pace-lap-flag-12")).toHaveTextContent("excluded");
  });

  it("shows no flag for a normal trend-eligible lap", () => {
    render(<StintPaceLapTable laps={[lap({ lap_number: 5 })]} />);

    expect(screen.queryByTestId("stint-pace-lap-flag-5")).not.toBeInTheDocument();
  });

  it("renders explicit Yes/No trend-eligibility text, not just the inline flag", () => {
    render(
      <StintPaceLapTable
        laps={[
          lap({ lap_number: 1, is_trend_eligible: true }),
          lap({ lap_number: 2, is_trend_eligible: false }),
        ]}
      />,
    );

    expect(screen.getByTestId("stint-pace-lap-row-1")).toHaveTextContent("Yes");
    expect(screen.getByTestId("stint-pace-lap-row-2")).toHaveTextContent("No");
  });

  it("renders a dash for a null lap time", () => {
    render(<StintPaceLapTable laps={[lap({ lap_number: 1, lap_time_seconds: null })]} />);

    expect(screen.getByTestId("stint-pace-lap-row-1")).toHaveTextContent("—");
  });
});
