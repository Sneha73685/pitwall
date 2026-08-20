import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { EventListPage } from "./EventListPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/seasons/:season" element={<EventListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EventListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSelectionStore.setState({
      season: null,
      eventId: null,
      sessionId: null,
      driverId: null,
      lapId: null,
    });
  });

  it("lists a season's events and records the selected season", async () => {
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue([
      {
        event_id: "2024_bahrain_grand_prix",
        season: 2024,
        event_name: "Bahrain Grand Prix",
        round_number: 1,
        location: "Sakhir",
        country: "Bahrain",
        session_types: ["race", "qualifying"],
        session_count: 2,
      },
    ]);

    renderAt("/seasons/2024");

    await waitFor(() => expect(screen.getByText(/bahrain grand prix/i)).toBeInTheDocument());
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();
    expect(screen.getByText("Race")).toBeInTheDocument();
    expect(screen.getByText("Qualifying")).toBeInTheDocument();
    expect(useSelectionStore.getState().season).toBe(2024);
  });

  it("shows a message when the season has no ingested events", async () => {
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue([]);

    renderAt("/seasons/2099");

    await waitFor(() =>
      expect(screen.getByText(/no events ingested for 2099 yet/i)).toBeInTheDocument(),
    );
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "listEventsForSeason").mockRejectedValue(new Error("network error"));

    renderAt("/seasons/2024");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load events/i),
    );
  });
});
