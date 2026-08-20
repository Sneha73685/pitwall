import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { StintPacePage } from "./StintPacePage";

// DriverStintPaceChart owns its own real ECharts rendering (covered by its
// own test suite); StintPacePage only needs to know it's wired up with the
// fetched data, same stubbing pattern ComparisonPage.test.tsx already uses.
vi.mock("./components/DriverStintPaceChart", () => ({
  DriverStintPaceChart: ({ laps }: { laps: client.StintPaceLap[] }) => (
    <div data-testid="driver-stint-pace-chart-stub">{laps.length} laps</div>
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/sessions/:sessionId/drivers/:driverId/stint-pace"
          element={<StintPacePage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleResponse: client.DriverStintPaceResponse = {
  session_id: "2024_bahrain_grand_prix_race",
  driver_id: "VER",
  laps: [
    {
      lap_number: 1,
      lap_time_seconds: 90.15,
      compound: "SOFT",
      stint_number: 1,
      lap_in_stint_index: 1,
      is_valid: true,
      is_in_lap: false,
      is_out_lap: false,
      is_trend_eligible: true,
    },
  ],
  stints: [
    {
      stint_number: 1,
      compound: "SOFT",
      start_lap: 1,
      end_lap: 17,
      tyre_life_at_start: 0,
      eligible_lap_count: 16,
      consistency_ms: 120.5,
      consistency_cv: 0.0013,
    },
  ],
};

describe("StintPacePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state while the request is in flight", () => {
    vi.spyOn(client, "getDriverStintPace").mockReturnValue(new Promise(() => {}));

    renderAt("/sessions/2024_bahrain_grand_prix_race/drivers/VER/stint-pace");

    expect(screen.getByText(/loading stint pace/i)).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    vi.spyOn(client, "getDriverStintPace").mockRejectedValue(new Error("network error"));

    renderAt("/sessions/2024_bahrain_grand_prix_race/drivers/VER/stint-pace");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load stint pace/i);
  });

  it("renders the driver heading, strategy timeline, chart, and detail tables once loaded", async () => {
    vi.spyOn(client, "getDriverStintPace").mockResolvedValue(sampleResponse);

    renderAt("/sessions/2024_bahrain_grand_prix_race/drivers/VER/stint-pace");

    expect(await screen.findByRole("heading", { name: /stint pace — ver/i })).toBeInTheDocument();
    expect(screen.getByTestId("stint-segment-1")).toBeInTheDocument(); // reused StintTimeline
    expect(screen.getByTestId("driver-stint-pace-chart-stub")).toHaveTextContent("1 laps");
    expect(screen.getByTestId("stint-consistency-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("stint-pace-lap-row-1")).toBeInTheDocument();
  });

  it("links back to the driver's raw Strategy page", async () => {
    vi.spyOn(client, "getDriverStintPace").mockResolvedValue(sampleResponse);

    renderAt("/sessions/2024_bahrain_grand_prix_race/drivers/VER/stint-pace");

    const link = await screen.findByRole("link", { name: /view strategy/i });
    expect(link).toHaveAttribute(
      "href",
      "/sessions/2024_bahrain_grand_prix_race/drivers/VER/strategy",
    );
  });

  it("shows an empty state when the driver has no stint data", async () => {
    vi.spyOn(client, "getDriverStintPace").mockResolvedValue({
      session_id: "2024_bahrain_grand_prix_race",
      driver_id: "VER",
      laps: [],
      stints: [],
    });

    renderAt("/sessions/2024_bahrain_grand_prix_race/drivers/VER/stint-pace");

    // "No stint data available" appears twice: StintTimeline's own empty
    // state (Strategy card) and StintConsistencyTable's (Stint Detail card).
    const emptyStintMessages = await screen.findAllByText(/no stint data available/i);
    expect(emptyStintMessages).toHaveLength(2);
    expect(screen.getByText(/no lap data available/i)).toBeInTheDocument();
    await waitFor(() => expect(client.getDriverStintPace).toHaveBeenCalledTimes(1));
  });
});
