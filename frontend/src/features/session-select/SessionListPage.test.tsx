import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { SessionListPage } from "./SessionListPage";

describe("SessionListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists ingested sessions", async () => {
    vi.spyOn(client, "listSessions").mockResolvedValue([
      {
        session_id: "2023_monza_race",
        season: 2023,
        event_name: "Italian Grand Prix",
        round_number: 16,
        location: "Monza",
        country: "Italy",
        session_type: "race",
        session_date: null,
      },
    ]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionListPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/italian grand prix/i)).toBeInTheDocument());
  });

  it("shows a message when there are no sessions", async () => {
    vi.spyOn(client, "listSessions").mockResolvedValue([]);

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionListPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/no sessions ingested yet/i)).toBeInTheDocument());
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "listSessions").mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionListPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load sessions/i),
    );
  });
});
