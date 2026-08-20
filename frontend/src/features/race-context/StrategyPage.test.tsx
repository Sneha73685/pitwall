import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { StrategyPage } from "./StrategyPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sessions/:sessionId/drivers/:driverId/strategy" element={<StrategyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const stints: client.Stint[] = [
  { stint_number: 1, compound: "SOFT", start_lap: 1, end_lap: 10, tyre_life_at_start: 1 },
];

describe("StrategyPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "getStints").mockResolvedValue(stints);
    vi.spyOn(client, "getPitStops").mockResolvedValue([]);
  });

  it("renders the stint timeline and pit stops for the route's driver", async () => {
    renderAt("/sessions/2023_monza_race/drivers/VER/strategy");

    await waitFor(() => expect(screen.getByTestId("stint-segment-1")).toBeInTheDocument());
    expect(screen.getByText(/no pit stops recorded/i)).toBeInTheDocument();
  });

  it("keeps the existing View Stint Pace cross-link unchanged", async () => {
    renderAt("/sessions/2023_monza_race/drivers/VER/strategy");

    await waitFor(() => expect(screen.getByTestId("stint-segment-1")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "View Stint Pace" })).toHaveAttribute(
      "href",
      "/sessions/2023_monza_race/drivers/VER/stint-pace",
    );
  });

  // --- M15 discoverability (docs/m15-design-review.md §7, approved) ---

  it("adds a Compare Strategy link pre-filled with this session/driver as Session A/Driver A", async () => {
    renderAt("/sessions/2023_monza_race/drivers/VER/strategy");

    await waitFor(() => expect(screen.getByTestId("stint-segment-1")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Compare Strategy" })).toHaveAttribute(
      "href",
      "/stints/compare?sessionA=2023_monza_race&driverA=VER",
    );
  });
});
