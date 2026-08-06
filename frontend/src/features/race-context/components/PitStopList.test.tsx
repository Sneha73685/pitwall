import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PitStop } from "../../../api/client";
import { PitStopList } from "./PitStopList";

describe("PitStopList", () => {
  it("renders one row per pit stop", () => {
    const pitStops: PitStop[] = [
      { driver_id: "VER", stop_number: 1, lap_number: 17, pit_lane_time_seconds: 25.088 },
      { driver_id: "VER", stop_number: 2, lap_number: 37, pit_lane_time_seconds: 24.218 },
    ];

    render(<PitStopList pitStops={pitStops} />);

    expect(within(screen.getByTestId("pit-stop-row-1")).getByText("17")).toBeInTheDocument();
    expect(within(screen.getByTestId("pit-stop-row-1")).getByText("25.088s")).toBeInTheDocument();
    expect(within(screen.getByTestId("pit-stop-row-2")).getByText("37")).toBeInTheDocument();
    expect(within(screen.getByTestId("pit-stop-row-2")).getByText("24.218s")).toBeInTheDocument();
  });

  it("renders a dash for a null pit lane time", () => {
    const pitStops: PitStop[] = [
      { driver_id: "VER", stop_number: 1, lap_number: 57, pit_lane_time_seconds: null },
    ];

    render(<PitStopList pitStops={pitStops} />);

    expect(within(screen.getByTestId("pit-stop-row-1")).getByText("—")).toBeInTheDocument();
  });

  it("shows an empty state when there are no pit stops for this driver", () => {
    render(<PitStopList pitStops={[]} />);

    expect(screen.getByText(/no pit stops recorded/i)).toBeInTheDocument();
  });
});
