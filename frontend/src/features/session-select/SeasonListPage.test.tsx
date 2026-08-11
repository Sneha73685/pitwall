import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { SeasonListPage } from "./SeasonListPage";

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SeasonListPage />
    </MemoryRouter>,
  );
}

describe("SeasonListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists ingested seasons with their event counts", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue([
      { season: 2024, event_count: 2 },
      { season: 2023, event_count: 1 },
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("2024")).toBeInTheDocument());
    expect(screen.getByText("2023")).toBeInTheDocument();
    expect(screen.getByText(/2 events ingested/i)).toBeInTheDocument();
    expect(screen.getByText(/1 event ingested/i)).toBeInTheDocument();
  });

  it("shows a message when there are no seasons", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(screen.getByText(/no seasons ingested yet/i)).toBeInTheDocument());
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "listSeasons").mockRejectedValue(new Error("network error"));

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load seasons/i),
    );
  });
});
