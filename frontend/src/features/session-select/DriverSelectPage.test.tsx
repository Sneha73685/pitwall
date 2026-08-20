import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { DriverSelectPage } from "./DriverSelectPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
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

  // --- M17 discoverability (docs/m17-design-review.md §7) ---

  it("adds a Pace Trend link per driver, pre-filled with this session's season", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
      },
    ]);
    vi.spyOn(client, "getSession").mockResolvedValue({
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
    });

    renderAt("/sessions/2023_monza_race");

    const paceTrendLink = await screen.findByRole("link", { name: "Pace Trend" });
    expect(paceTrendLink).toHaveAttribute(
      "href",
      "/drivers/VER/seasons/2023/pace-trend?fromSession=2023_monza_race",
    );
    // Distinct from the primary link to the driver's own detail page.
    expect(screen.getByRole("link", { name: /max verstappen/i })).toHaveAttribute(
      "href",
      "/sessions/2023_monza_race/drivers/VER",
    );
  });

  // --- M21 discoverability (docs/m21-design-review.md §7) ---

  it("adds a Tyre Trend link per driver, pre-filled with this session's season", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
      },
    ]);
    vi.spyOn(client, "getSession").mockResolvedValue({
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
    });

    renderAt("/sessions/2023_monza_race");

    const tyreTrendLink = await screen.findByRole("link", { name: "Tyre Trend" });
    expect(tyreTrendLink).toHaveAttribute(
      "href",
      "/drivers/VER/seasons/2023/tyre-trend?fromSession=2023_monza_race",
    );
    // Both trend links coexist per driver card, alongside the driver's own link.
    expect(screen.getByRole("link", { name: "Pace Trend" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /max verstappen/i })).toHaveAttribute(
      "href",
      "/sessions/2023_monza_race/drivers/VER",
    );
  });

  it("omits the Pace Trend link while the session's season hasn't loaded yet", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
      },
    ]);
    vi.spyOn(client, "getSession").mockReturnValue(new Promise(() => {}));

    renderAt("/sessions/2023_monza_race");

    await waitFor(() => expect(screen.getByText(/max verstappen/i)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Pace Trend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tyre Trend" })).not.toBeInTheDocument();
  });

  it("still renders the driver list when the season lookup fails", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
      },
    ]);
    vi.spyOn(client, "getSession").mockRejectedValue(new Error("network error"));

    renderAt("/sessions/2023_monza_race");

    await waitFor(() => expect(screen.getByText(/max verstappen/i)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Pace Trend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
