import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { TyrePerformancePage } from "./TyrePerformancePage";

// Chart components each own their own real ECharts rendering (covered by
// their own test suites); TyrePerformancePage only needs to know they're
// wired up with the fetched data, same stubbing pattern
// ComparisonPage.test.tsx already uses.
vi.mock("./components/CompoundDistributionChart", () => ({
  CompoundDistributionChart: ({ compoundAggregates }: { compoundAggregates: unknown[] }) => (
    <div data-testid="compound-distribution-chart-stub">{compoundAggregates.length} compounds</div>
  ),
}));
vi.mock("./components/CompoundLapTrendChart", () => ({
  CompoundLapTrendChart: () => <div data-testid="compound-lap-trend-chart-stub" />,
}));
vi.mock("./components/DriverCompoundComparisonChart", () => ({
  DriverCompoundComparisonChart: () => <div data-testid="driver-compound-comparison-chart-stub" />,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/sessions/:sessionId/tyre-performance" element={<TyrePerformancePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleSession: client.Session = {
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
};

const sampleTyrePerformance: client.TyrePerformanceResponse = {
  session_id: "2024_bahrain_grand_prix_race",
  driver_strategies: [
    {
      driver_id: "VER",
      stint_count: 2,
      compound_sequence: ["SOFT", "HARD"],
      stint_lengths: [17, 40],
    },
  ],
  compound_usage: [
    { compound: "SOFT", stint_count: 20, driver_count: 20, total_laps: 300 },
    { compound: "HARD", stint_count: 22, driver_count: 20, total_laps: 800 },
  ],
  compound_aggregates: [
    {
      compound: "SOFT",
      lap_count: 300,
      driver_count: 20,
      lap_times_ms: [90000, 90200],
      median_lap_time_ms: 90100,
      p25_lap_time_ms: 90000,
      p75_lap_time_ms: 90200,
    },
  ],
  compound_lap_index_aggregates: [
    {
      compound: "SOFT",
      lap_in_stint_index: 1,
      lap_count: 2,
      lap_times_ms: [90000, 90200],
      median_lap_time_ms: 90100,
    },
  ],
  raw_lap_times_by_compound: [
    {
      driver_id: "VER",
      compound: "SOFT",
      lap_count: 2,
      lap_times_ms: [90000, 90200],
      lap_in_stint_indices: [1, 2],
      median_lap_time_ms: 90100,
    },
  ],
};

const samplePitStops: client.PitStop[] = [
  { driver_id: "VER", stop_number: 1, lap_number: 15, pit_lane_time_seconds: 23.886 },
  { driver_id: "BOT", stop_number: 2, lap_number: 30, pit_lane_time_seconds: 74.951 },
];

describe("TyrePerformancePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "getSession").mockResolvedValue(sampleSession);
    vi.spyOn(client, "getTyrePerformance").mockResolvedValue(sampleTyrePerformance);
    vi.spyOn(client, "getPitStops").mockResolvedValue(samplePitStops);
  });

  it("shows a loading state while requests are in flight", async () => {
    vi.spyOn(client, "getTyrePerformance").mockReturnValue(new Promise(() => {}));

    renderAt("/sessions/2024_bahrain_grand_prix_race/tyre-performance");

    expect(await screen.findByText(/loading tyre performance/i)).toBeInTheDocument();
  });

  it("shows an error state when the tyre-performance request fails", async () => {
    vi.spyOn(client, "getTyrePerformance").mockRejectedValue(new Error("network error"));

    renderAt("/sessions/2024_bahrain_grand_prix_race/tyre-performance");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load tyre performance/i);
  });

  it("shows an error state when the session-wide pit-stops request fails", async () => {
    vi.spyOn(client, "getPitStops").mockRejectedValue(new Error("network error"));

    renderAt("/sessions/2024_bahrain_grand_prix_race/tyre-performance");

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load pit stops/i);
  });

  it("renders session identity, strategy summary, compound usage, charts, and pit-lane time once loaded", async () => {
    renderAt("/sessions/2024_bahrain_grand_prix_race/tyre-performance");

    expect(await screen.findByText("2024 Bahrain Grand Prix")).toBeInTheDocument();
    expect(screen.getByTestId("strategy-summary-row-VER")).toBeInTheDocument();
    expect(screen.getByTestId("compound-usage-row-SOFT")).toBeInTheDocument();
    expect(screen.getByTestId("compound-distribution-chart-stub")).toHaveTextContent("1 compounds");
    expect(screen.getByTestId("compound-lap-trend-chart-stub")).toBeInTheDocument();
    expect(screen.getByTestId("driver-compound-comparison-chart-stub")).toBeInTheDocument();
    expect(screen.getByTestId("pit-lane-row-BOT-2")).toHaveTextContent("74.951s");
  });

  it("fetches session-wide pit stops with no driverId filter", async () => {
    renderAt("/sessions/2024_bahrain_grand_prix_race/tyre-performance");

    await waitFor(() =>
      expect(client.getPitStops).toHaveBeenCalledWith("2024_bahrain_grand_prix_race"),
    );
  });
});
