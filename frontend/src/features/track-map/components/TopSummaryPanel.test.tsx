import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Lap, Session } from "../../../api/client";
import { TopSummaryPanel } from "./TopSummaryPanel";

const session: Session = {
  session_id: "2023_monza_race",
  season: 2023,
  event_name: "Italian Grand Prix",
  event_id: "2023_italian_grand_prix",
  round_number: 16,
  location: "Monza",
  country: "Italy",
  session_type: "race",
  session_date: null,
  has_telemetry: true,
};

const laps: Lap[] = [
  {
    driver_id: "VER",
    lap_number: 1,
    lap_time_seconds: 95.123,
    sector_1_seconds: 30.1,
    sector_2_seconds: 35.0,
    sector_3_seconds: 30.023,
    is_personal_best: false,
    is_accurate: true,
  },
  {
    driver_id: "VER",
    lap_number: 2,
    lap_time_seconds: 94.0,
    sector_1_seconds: 29.9,
    sector_2_seconds: 34.6,
    sector_3_seconds: 29.5,
    is_personal_best: true,
    is_accurate: true,
  },
];

describe("TopSummaryPanel", () => {
  it("renders driver, lap, and session context", () => {
    render(<TopSummaryPanel driver="VER" session={session} lap={laps[0]} laps={laps} />);

    expect(screen.getByText("VER")).toBeInTheDocument();
    expect(screen.getByText(/italian grand prix/i)).toBeInTheDocument();
    expect(screen.getByText("95.123s")).toBeInTheDocument();
  });

  it("computes delta to the driver's personal best lap", () => {
    render(<TopSummaryPanel driver="VER" session={session} lap={laps[0]} laps={laps} />);

    expect(screen.getByText("+1.123s")).toBeInTheDocument();
  });

  it("falls back gracefully when the current lap isn't found", () => {
    render(<TopSummaryPanel driver="VER" session={session} lap={null} laps={laps} />);

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
