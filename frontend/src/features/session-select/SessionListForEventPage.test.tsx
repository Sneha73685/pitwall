import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { SessionListForEventPage } from "./SessionListForEventPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/seasons/:season/events/:eventId" element={<SessionListForEventPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SessionListForEventPage", () => {
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

  it("lists an event's sessions and records the selected event", async () => {
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue([
      {
        session_id: "2024_bahrain_grand_prix_qualifying",
        season: 2024,
        event_name: "Bahrain Grand Prix",
        event_id: "2024_bahrain_grand_prix",
        round_number: 1,
        location: "Sakhir",
        country: "Bahrain",
        session_type: "qualifying",
        session_date: "2024-03-01T18:00:00+00:00",
        has_telemetry: true,
      },
      {
        session_id: "2024_bahrain_grand_prix_race",
        season: 2024,
        event_name: "Bahrain Grand Prix",
        event_id: "2024_bahrain_grand_prix",
        round_number: 1,
        location: "Sakhir",
        country: "Bahrain",
        session_type: "race",
        session_date: "2024-03-02T15:00:00+00:00",
        has_telemetry: true,
      },
    ]);

    renderAt("/seasons/2024/events/2024_bahrain_grand_prix");

    await waitFor(() => expect(screen.getByText("Qualifying")).toBeInTheDocument());
    expect(screen.getByText("Race")).toBeInTheDocument();
    expect(useSelectionStore.getState().eventId).toBe("2024_bahrain_grand_prix");
  });

  it("flags a session with no telemetry data, the real 2018-class case", async () => {
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue([
      {
        session_id: "2018_bahrain_grand_prix_race",
        season: 2018,
        event_name: "Bahrain Grand Prix",
        event_id: "2018_bahrain_grand_prix",
        round_number: 1,
        location: "Sakhir",
        country: "Bahrain",
        session_type: "race",
        session_date: "2018-04-08T15:10:00+00:00",
        has_telemetry: false,
      },
    ]);

    renderAt("/seasons/2018/events/2018_bahrain_grand_prix");

    await waitFor(() => expect(screen.getByText(/no telemetry data/i)).toBeInTheDocument());
  });

  it("shows a message when the event has no ingested sessions", async () => {
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue([]);

    renderAt("/seasons/2024/events/2024_monaco_grand_prix");

    await waitFor(() =>
      expect(screen.getByText(/no sessions ingested for this event yet/i)).toBeInTheDocument(),
    );
  });

  // --- M14 discoverability (docs/m14-design-review.md §11) ---

  it("gives each session card a Compare entry point to /laps/compare?sessionA=<id>", async () => {
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue([
      {
        session_id: "2024_bahrain_grand_prix_race",
        season: 2024,
        event_name: "Bahrain Grand Prix",
        event_id: "2024_bahrain_grand_prix",
        round_number: 1,
        location: "Sakhir",
        country: "Bahrain",
        session_type: "race",
        session_date: "2024-03-02T15:00:00+00:00",
        has_telemetry: true,
      },
    ]);

    renderAt("/seasons/2024/events/2024_bahrain_grand_prix");

    const compareLink = await screen.findByRole("link", { name: /compare/i });
    expect(compareLink).toHaveAttribute(
      "href",
      "/laps/compare?sessionA=2024_bahrain_grand_prix_race",
    );
    // Distinct from the primary link to the session's own detail page.
    expect(screen.getByRole("link", { name: /race/i })).toHaveAttribute(
      "href",
      "/sessions/2024_bahrain_grand_prix_race",
    );
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "listSessionsForEvent").mockRejectedValue(new Error("network error"));

    renderAt("/seasons/2024/events/2024_bahrain_grand_prix");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load sessions/i),
    );
  });
});
