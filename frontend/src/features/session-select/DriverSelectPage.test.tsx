import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { DriverSelectPage } from "./DriverSelectPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/sessions/:sessionId" element={<DriverSelectPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DriverSelectPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSelectionStore.setState({ sessionId: null, driverId: null, lapId: null });
  });

  it("lists a session's drivers and records the selected session", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
      },
    ]);

    renderAt("/sessions/2023_monza_race");

    await waitFor(() => expect(screen.getByText(/max verstappen/i)).toBeInTheDocument());
    expect(useSelectionStore.getState().sessionId).toBe("2023_monza_race");
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "listDrivers").mockRejectedValue(new Error("network error"));

    renderAt("/sessions/2023_monza_race");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load drivers/i),
    );
  });
});
