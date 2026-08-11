import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as client from "./api/client";

// jsdom has no real canvas 2D context, so any chart that actually mounts
// (M11's TyrePerformancePage/StintPacePage render theirs unconditionally,
// unlike ComparisonPage's charts which only mount once lap data is picked)
// needs `echarts/core`'s `init` stubbed out here, matching every dedicated
// chart-component test file's existing pattern (e.g. PaceDistributionChart.test.tsx).
vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(() => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() })),
  };
});

function renderAppAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // The root route ("/") now renders SeasonListPage (M12 Phase 5).
    vi.spyOn(client, "listSeasons").mockResolvedValue([]);
  });

  it("renders the disclaimer", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText(/not affiliated with formula 1/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("reports the backend as online when the health check succeeds", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("reports the backend as offline when the health check fails", async () => {
    vi.spyOn(client, "getHealth").mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("offline"));
  });

  it("shows no session selected on the root route", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("selected-session")).toHaveTextContent("none");
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("renders the comparison page at /sessions/:sessionId/compare without error", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });
    vi.spyOn(client, "listDrivers").mockResolvedValue([]);

    renderAppAt("/sessions/2023_monza_race/compare");

    expect(screen.getByRole("heading", { name: "Compare laps" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("renders the tyre-performance page at /sessions/:sessionId/tyre-performance without error (M11 Phase 4)", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });
    vi.spyOn(client, "getSession").mockResolvedValue({
      session_id: "2024_bahrain_grand_prix_race",
      season: 2024,
      event_name: "Bahrain Grand Prix",
      event_id: "2024_bahrain_grand_prix",
      round_number: 1,
      location: "Sakhir",
      country: "Bahrain",
      session_type: "race",
      session_date: "2024-03-02T15:00:00",
      has_telemetry: true,
    });
    vi.spyOn(client, "getTyrePerformance").mockResolvedValue({
      session_id: "2024_bahrain_grand_prix_race",
      driver_strategies: [],
      compound_usage: [],
      compound_aggregates: [],
      compound_lap_index_aggregates: [],
      raw_lap_times_by_compound: [],
    });
    vi.spyOn(client, "getPitStops").mockResolvedValue([]);

    renderAppAt("/sessions/2024_bahrain_grand_prix_race/tyre-performance");

    expect(await screen.findByText("2024 Bahrain Grand Prix")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });

  it("renders the stint-pace page at /sessions/:sessionId/drivers/:driverId/stint-pace without error (M11 Phase 4)", async () => {
    vi.spyOn(client, "getHealth").mockResolvedValue({ status: "ok", service: "pitwall-backend" });
    vi.spyOn(client, "getDriverStintPace").mockResolvedValue({
      session_id: "2024_bahrain_grand_prix_race",
      driver_id: "HUL",
      laps: [],
      stints: [],
    });

    renderAppAt("/sessions/2024_bahrain_grand_prix_race/drivers/HUL/stint-pace");

    expect(await screen.findByRole("heading", { name: /stint pace — hul/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("backend-status")).toHaveTextContent("online"));
  });
});
