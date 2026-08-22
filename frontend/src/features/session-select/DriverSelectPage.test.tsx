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

  // --- M34 classification (docs/m34-design-review.md §8/§9) --------------

  it("shows classification info when present", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
        classified_position: "1",
        grid_position: 1,
        status: "Finished",
        points: 25,
      },
    ]);

    renderAt("/sessions/2023_monza_race");

    await waitFor(() => expect(screen.getByText("P1")).toBeInTheDocument());
    expect(screen.getByText("Started P1")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("25 pts")).toBeInTheDocument();
  });

  it("renders a non-numeric classified position as-is", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
        classified_position: "R",
        status: "Crash",
      },
    ]);

    renderAt("/sessions/2023_monza_race");

    await waitFor(() => expect(screen.getByText("R")).toBeInTheDocument());
    expect(screen.getByText("Crash")).toBeInTheDocument();
  });

  it("omits classification info when absent (Practice sessions, pre-M34 data)", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
      },
    ]);

    renderAt("/sessions/2023_monza_practice_1");

    await waitFor(() => expect(screen.getByText(/max verstappen/i)).toBeInTheDocument());
    expect(screen.queryByText(/^P\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/started p/i)).not.toBeInTheDocument();
  });

  // --- M42 qualifying segment times (docs/m42-design-review.md) ----------

  it("shows all three qualifying segment times when present", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "VER",
        driver_number: 1,
        full_name: "Max Verstappen",
        team_name: "Red Bull Racing",
        q1_seconds: 78.241,
        q2_seconds: 77.593,
        q3_seconds: 76.982,
      },
    ]);

    renderAt("/sessions/2023_monza_qualifying");

    await waitFor(() => expect(screen.getByText(/max verstappen/i)).toBeInTheDocument());
    expect(screen.getByText("Q1 78241ms")).toBeInTheDocument();
    expect(screen.getByText("Q2 77593ms")).toBeInTheDocument();
    expect(screen.getByText("Q3 76982ms")).toBeInTheDocument();
  });

  it("shows only the qualifying segments a driver reached, with no placeholder for the rest", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue([
      {
        driver_id: "HAM",
        driver_number: 44,
        full_name: "Lewis Hamilton",
        team_name: "Mercedes",
        q1_seconds: 79.104,
      },
    ]);

    renderAt("/sessions/2023_monza_qualifying");

    await waitFor(() => expect(screen.getByText(/lewis hamilton/i)).toBeInTheDocument());
    expect(screen.getByText("Q1 79104ms")).toBeInTheDocument();
    expect(screen.queryByText(/^Q2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Q3/)).not.toBeInTheDocument();
  });

  it("omits qualifying segment times when absent (Race/Practice sessions, pre-M42 data)", async () => {
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
    expect(screen.queryByText(/^Q1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Q2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Q3/)).not.toBeInTheDocument();
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
