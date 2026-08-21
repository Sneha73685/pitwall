import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DriverLapMetrics } from "../../../api/client";
import { DriverLapTable } from "./DriverLapTable";

function lap(overrides: Partial<DriverLapMetrics> = {}): DriverLapMetrics {
  return {
    lap_number: 1,
    lap_time_ms: 90000,
    is_valid: true,
    exclusion_reason: null,
    is_outlier: false,
    delta_to_theoretical_best_ms: 500,
    delta_to_own_median_ms: 0,
    full_throttle_pct: 62.1,
    brake_event_count: 4,
    ...overrides,
  };
}

describe("DriverLapTable", () => {
  it("renders the exclusion tag for a valid lap with a yellow-flag exclusion reason", () => {
    const laps = [lap({ is_valid: true, exclusion_reason: "yellow_flag" })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(yellow_flag)");
  });

  it("renders the exclusion tag for an invalid lap with no exclusion reason", () => {
    const laps = [lap({ is_valid: false, exclusion_reason: null })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(excluded)");
  });

  it("renders the exclusion tag for an invalid lap that also has a yellow-flag exclusion reason", () => {
    const laps = [lap({ is_valid: false, exclusion_reason: "yellow_flag" })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(yellow_flag)");
  });

  it("does not render the exclusion tag for a valid lap with no exclusion reason", () => {
    const laps = [lap({ is_valid: true, exclusion_reason: null })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).queryByTestId("lap-excluded-1")).not.toBeInTheDocument();
  });
});
