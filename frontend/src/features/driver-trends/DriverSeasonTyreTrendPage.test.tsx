import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { DriverSeasonTyreTrendPage } from "./DriverSeasonTyreTrendPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/drivers/:driverId/seasons/:season/tyre-trend"
          element={<DriverSeasonTyreTrendPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleTrend: client.SeasonTyreTrendResponse = {
  driver_id: "VER",
  season: 2024,
  session_type: "race",
  points: [
    {
      session_id: "2024_bahrain_grand_prix_race",
      event_id: "2024_bahrain_grand_prix",
      event_name: "Bahrain Grand Prix",
      round_number: 1,
      session_date: "2024-03-02T15:00:00+00:00",
      strategy: {
        driver_id: "VER",
        stint_count: 3,
        compound_sequence: ["SOFT", "MEDIUM", "HARD"],
        stint_lengths: [15, 20, 20],
      },
    },
    {
      session_id: "2024_saudi_arabian_grand_prix_race",
      event_id: "2024_saudi_arabian_grand_prix",
      event_name: "Saudi Arabian Grand Prix",
      round_number: 2,
      session_date: "2024-03-09T15:00:00+00:00",
      strategy: {
        driver_id: "VER",
        stint_count: 0,
        compound_sequence: [],
        stint_lengths: [],
      },
    },
  ],
};

describe("DriverSeasonTyreTrendPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state while the trend is being fetched", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockReturnValue(new Promise(() => {}));

    renderAt("/drivers/VER/seasons/2024/tyre-trend");

    expect(await screen.findByText(/loading tyre trend/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockRejectedValue(new Error("network error"));

    renderAt("/drivers/VER/seasons/2024/tyre-trend");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load tyre trend/i),
    );
  });

  it("shows an empty state when the season has no matching sessions", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue({
      driver_id: "VER",
      season: 2024,
      session_type: "race",
      points: [],
    });

    renderAt("/drivers/VER/seasons/2024/tyre-trend");

    await waitFor(() => expect(screen.getByText(/no race sessions found/i)).toBeInTheDocument());
  });

  it("renders the strategy list with the fetched trend points once loaded", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/tyre-trend");

    const bahrainRow = await screen.findByTestId("tyre-trend-row-2024_bahrain_grand_prix_race");
    expect(bahrainRow).toHaveTextContent("R1 Bahrain Grand Prix");
    expect(bahrainRow).toHaveTextContent("3 stints");
    const saudiRow = screen.getByTestId("tyre-trend-row-2024_saudi_arabian_grand_prix_race");
    expect(saudiRow).toHaveTextContent("0 stints");
  });

  it("fetches with the default race session type when none is given", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/tyre-trend");

    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "race"));
  });

  it("refetches with the selected session type when the filter changes", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/tyre-trend");
    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "race"));

    fireEvent.change(screen.getByLabelText("Session type"), { target: { value: "qualifying" } });

    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "qualifying"));
  });

  it("shows a back link using the fromSession query param", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/tyre-trend?fromSession=2023_monza_race");

    const backLink = await screen.findByRole("link", { name: /back to driver/i });
    expect(backLink).toHaveAttribute("href", "/sessions/2023_monza_race/drivers/VER");
  });

  it("falls back to the trend's own first session for the back link when fromSession is absent", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/tyre-trend");

    const backLink = await screen.findByRole("link", { name: /back to driver/i });
    expect(backLink).toHaveAttribute("href", "/sessions/2024_bahrain_grand_prix_race/drivers/VER");
  });
});
