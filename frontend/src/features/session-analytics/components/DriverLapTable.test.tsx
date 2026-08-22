import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DriverLapMetrics, ExclusionReason } from "../../../api/client";
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
    // M46 (docs/m46-design-review.md): humanized label, not the raw
    // machine value -- the underlying `exclusion_reason` field is unchanged.
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(Yellow Flag)");
  });

  it("renders the exclusion tag for a valid lap with a track-limits exclusion reason", () => {
    // M40 (docs/m40-design-review.md §22): the backend already resolves
    // track_limits/yellow_flag precedence before this component ever sees
    // exclusion_reason, so a single rendering case covers both the
    // deleted-alone and deleted-plus-yellow-flag scenarios identically.
    const laps = [lap({ is_valid: true, exclusion_reason: "track_limits" })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(Track Limits)");
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
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(Yellow Flag)");
  });

  it("does not render the exclusion tag for a valid lap with no exclusion reason", () => {
    const laps = [lap({ is_valid: true, exclusion_reason: null })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).queryByTestId("lap-excluded-1")).not.toBeInTheDocument();
  });

  it("falls back to the raw value for an exclusion reason this frontend doesn't have a label for yet", () => {
    // M46 (docs/m46-design-review.md §5): simulates a hypothetical
    // frontend/backend version skew -- a value the current ExclusionReason
    // union doesn't know about -- proving the component degrades to
    // displaying the raw value rather than disappearing or crashing.
    const laps = [lap({ is_valid: true, exclusion_reason: "safety_car" as ExclusionReason })];

    render(<DriverLapTable laps={laps} />);

    const row = screen.getByTestId("lap-row-1");
    expect(within(row).getByTestId("lap-excluded-1")).toHaveTextContent("(safety_car)");
  });
});
