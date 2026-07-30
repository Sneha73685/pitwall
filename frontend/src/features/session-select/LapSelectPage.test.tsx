import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { LapSelectPage } from "./LapSelectPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/sessions/:sessionId/drivers/:driverId" element={<LapSelectPage />} />
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

  it("selecting a lap records it in selectionStore", async () => {
    vi.spyOn(client, "listLaps").mockResolvedValue([sampleLap]);

    renderAt("/sessions/2023_monza_race/drivers/VER");
    await waitFor(() => expect(screen.getByText(/lap 1/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /lap 1/i }));

    expect(useSelectionStore.getState().lapId).toBe("1");
    expect(screen.getByTestId("selected-lap")).toHaveTextContent("Selected lap: 1");
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "listLaps").mockRejectedValue(new Error("network error"));

    renderAt("/sessions/2023_monza_race/drivers/VER");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load laps/i),
    );
  });
});
