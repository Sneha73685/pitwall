import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PitStop } from "../../../api/client";
import { PitLaneTimeSummary } from "./PitLaneTimeSummary";

function stop(overrides: Partial<PitStop> = {}): PitStop {
  return {
    driver_id: "VER",
    stop_number: 1,
    lap_number: 15,
    pit_lane_time_seconds: 23.886,
    ...overrides,
  };
}

describe("PitLaneTimeSummary", () => {
  it("shows an empty state when there are no pit stops", () => {
    render(<PitLaneTimeSummary pitStops={[]} />);

    expect(screen.getByText(/no pit stops recorded/i)).toBeInTheDocument();
  });

  it("renders the inherited 'not stationary box time' caveat, carried forward verbatim in spirit", () => {
    render(<PitLaneTimeSummary pitStops={[stop()]} />);

    expect(screen.getByText(/not stationary box/i)).toBeInTheDocument();
  });

  it("computes count/min/median/max descriptive statistics over real durations", () => {
    render(
      <PitLaneTimeSummary
        pitStops={[
          stop({ driver_id: "VER", stop_number: 1, pit_lane_time_seconds: 23.886 }),
          stop({ driver_id: "HAM", stop_number: 1, pit_lane_time_seconds: 25.0 }),
          stop({ driver_id: "BOT", stop_number: 2, pit_lane_time_seconds: 74.951 }),
        ]}
      />,
    );

    const stats = screen.getByTestId("pit-lane-time-stats");
    expect(stats).toHaveTextContent("3"); // stop count
    expect(stats).toHaveTextContent("23.886s"); // min
    expect(stats).toHaveTextContent("25.000s"); // median
    expect(stats).toHaveTextContent("74.951s"); // max
  });

  it("surfaces the real 74.951s Bahrain outlier in the table, not filtered out as an anomaly", () => {
    render(
      <PitLaneTimeSummary
        pitStops={[
          stop({ driver_id: "VER", stop_number: 1, pit_lane_time_seconds: 23.886 }),
          stop({ driver_id: "BOT", stop_number: 2, lap_number: 30, pit_lane_time_seconds: 74.951 }),
        ]}
      />,
    );

    const outlierRow = screen.getByTestId("pit-lane-row-BOT-2");
    expect(outlierRow).toHaveTextContent("74.951s");
  });

  it("orders rows by lap number, not by pit-lane duration", () => {
    render(
      <PitLaneTimeSummary
        pitStops={[
          stop({ driver_id: "BOT", stop_number: 2, lap_number: 30, pit_lane_time_seconds: 74.951 }),
          stop({ driver_id: "VER", stop_number: 1, lap_number: 15, pit_lane_time_seconds: 23.886 }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId(/^pit-lane-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "pit-lane-row-VER-1", // lap 15
      "pit-lane-row-BOT-2", // lap 30
    ]);
  });

  it("renders a dash for a null pit-lane duration", () => {
    render(<PitLaneTimeSummary pitStops={[stop({ pit_lane_time_seconds: null })]} />);

    expect(screen.getByTestId("pit-lane-row-VER-1")).toHaveTextContent("—");
  });

  it("omits the stat row entirely when every duration is null", () => {
    render(<PitLaneTimeSummary pitStops={[stop({ pit_lane_time_seconds: null })]} />);

    expect(screen.queryByTestId("pit-lane-time-stats")).not.toBeInTheDocument();
  });

  it("labels the column 'Pit lane time', not 'stop duration'", () => {
    render(<PitLaneTimeSummary pitStops={[stop()]} />);

    expect(screen.getByRole("columnheader", { name: "Pit lane time" })).toBeInTheDocument();
    expect(screen.queryByText(/stop duration/i)).not.toBeInTheDocument();
  });
});
