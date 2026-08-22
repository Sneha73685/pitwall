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

  it("renders the exclusion tag for a valid lap with a track-limits exclusion reason", () => {
    // M40 (docs/m40-design-review.md §22): the backend already resolves
    // track_limits/yellow_flag precedence before this component ever sees
    // exclusion_reason, so a single rendering case covers both the
    // deleted-alone and deleted-plus-yellow-flag scenarios identically.
    const laps = [lap({ is_valid: true, exclusion_reason: "track_limits" })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(track_limits)");
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
