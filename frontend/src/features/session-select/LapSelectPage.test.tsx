import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { LapSelectPage } from "./LapSelectPage";

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location-probe">{location.pathname + location.search}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/sessions/:sessionId/drivers/:driverId"
          element={
            <>
              <LapSelectPage />
              <LocationProbe />
            </>
          }
        />
        <Route path="/laps/compare" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleLap: client.Lap = {
  driver_id: "VER",
  lap_number: 1,
  lap_time_seconds: 95.123,
  sector_1_seconds: 30.1,
  sector_2_seconds: 35.0,
  sector_3_seconds: 30.023,
  is_personal_best: true,
  is_accurate: true,
};

const twoLaps: client.Lap[] = [
  sampleLap,
  {
    driver_id: "VER",
    lap_number: 2,
    lap_time_seconds: 94.001,
    sector_1_seconds: 29.9,
    sector_2_seconds: 34.6,
    sector_3_seconds: 29.501,
    is_personal_best: false,
    is_accurate: true,
  },
  {
    driver_id: "VER",
    lap_number: 3,
    lap_time_seconds: 96.4,
    sector_1_seconds: 30.5,
    sector_2_seconds: 35.4,
    sector_3_seconds: 30.5,
    is_personal_best: false,
    is_accurate: true,
  },
];

describe("LapSelectPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSelectionStore.setState({ sessionId: null, driverId: null, lapId: null });
  });

  it("lists a driver's laps and records the selected driver", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue([sampleLap]);

    renderAt("/sessions/2023_monza_race/drivers/VER");

    await waitFor(() => expect(screen.getByText(/lap 1/i)).toBeInTheDocument());
    expect(useSelectionStore.getState().driverId).toBe("VER");
  });

  it("links a lap to its track map route", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue([sampleLap]);

    renderAt("/sessions/2023_monza_race/drivers/VER");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /lap 1/i })).toHaveAttribute(
        "href",
        "/sessions/2023_monza_race/drivers/VER/laps/1",
      ),
    );
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "listLaps").mockRejectedValue(new Error("network error"));

    renderAt("/sessions/2023_monza_race/drivers/VER");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load laps/i),
    );
  });

  it("does not show Compare Selected until exactly two laps are checked", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue(twoLaps);

    renderAt("/sessions/2023_monza_race/drivers/VER");
    await waitFor(() => expect(screen.getByText(/lap 1/i)).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /compare selected/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select lap 1 for comparison"));
    expect(screen.queryByRole("button", { name: /compare selected/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select lap 2 for comparison"));
    expect(screen.getByRole("button", { name: /compare selected/i })).toBeInTheDocument();
  });

  it("disables checking a third lap once two are already selected", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue(twoLaps);

    renderAt("/sessions/2023_monza_race/drivers/VER");
    await waitFor(() => expect(screen.getByText(/lap 1/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select lap 1 for comparison"));
    fireEvent.click(screen.getByLabelText("Select lap 2 for comparison"));

    expect(screen.getByLabelText("Select lap 3 for comparison")).toBeDisabled();
  });

  it("navigates to the compare route with both selected laps as query params", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue(twoLaps);

    renderAt("/sessions/2023_monza_race/drivers/VER");
    await waitFor(() => expect(screen.getByText(/lap 1/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select lap 1 for comparison"));
    fireEvent.click(screen.getByLabelText("Select lap 3 for comparison"));
    fireEvent.click(screen.getByRole("button", { name: /compare selected/i }));

    await waitFor(() =>
      expect(screen.getByTestId("location-probe")).toHaveTextContent(
        "/laps/compare?sessionA=2023_monza_race&driverA=VER&lapA=1&sessionB=2023_monza_race&driverB=VER&lapB=3",
      ),
    );
  });

  it("shows a link to the driver's strategy page", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue([sampleLap]);

    renderAt("/sessions/2023_monza_race/drivers/VER");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /view strategy/i })).toHaveAttribute(
        "href",
        "/sessions/2023_monza_race/drivers/VER/strategy",
      ),
    );
  });

  it("shows a compound chip for a lap with compound data", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue([{ ...sampleLap, compound: "SOFT" }]);

    renderAt("/sessions/2023_monza_race/drivers/VER");

    await waitFor(() => expect(screen.getByText("SOFT")).toBeInTheDocument());
    expect(screen.getByTitle("Compound: SOFT")).toBeInTheDocument();
  });

  it("shows no compound chip for a lap without compound data", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue([sampleLap]);

    renderAt("/sessions/2023_monza_race/drivers/VER");

    await waitFor(() => expect(screen.getByText(/lap 1/i)).toBeInTheDocument());
    expect(screen.queryByTitle(/compound:/i)).not.toBeInTheDocument();
  });
});
