import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { TrackMapPage } from "./TrackMapPage";

// TelemetryCharts owns a real ECharts instance (covered by its own test
// suite); TrackMapPage only needs to know it's wired up with the right data.
vi.mock("../telemetry-charts/TelemetryCharts", () => ({
  TelemetryCharts: ({ samples }: { samples: client.TelemetrySample[] }) => (
    <div data-testid="telemetry-charts-stub">{samples.length} samples</div>
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/sessions/:sessionId/drivers/:driverId/laps/:lapNumber"
          element={<TrackMapPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleTelemetry: client.TelemetrySample = {
  distance_m: 0,
  time_seconds: 0,
  speed_kph: 200,
  throttle_pct: 100,
  brake_active: false,
  rpm: 10000,
  gear: 5,
  drs_active: false,
  x: 0,
  y: 0,
  z: 0,
};

const sampleSession: client.Session = {
  session_id: "2023_monza_race",
  season: 2023,
  event_name: "Italian Grand Prix",
  round_number: 16,
  location: "Monza",
  country: "Italy",
  session_type: "race",
  session_date: null,
};

const sampleLap: client.Lap = {
  driver_id: "VER",
  lap_number: 1,
  lap_time_seconds: 95.123,
  sector_1_seconds: 30.1,
  sector_2_seconds: 35.0,
  sector_3_seconds: 30.023,
  is_personal_best: true,
  is_accurate: true,
};

describe("TrackMapPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSelectionStore.setState({ sessionId: null, driverId: null, lapId: null });
    vi.spyOn(client, "getSession").mockResolvedValue(sampleSession);
    vi.spyOn(client, "listLaps").mockResolvedValue([sampleLap]);
  });

  it("renders the track map and records the selected lap", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue([
      { distance_m: 0, x: 0, y: 0 },
      { distance_m: 50, x: 10, y: 10 },
    ]);
    vi.spyOn(client, "getTelemetry").mockResolvedValue([sampleTelemetry]);

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");

    await waitFor(() => expect(screen.getByTestId("track-map")).toBeInTheDocument());
    expect(useSelectionStore.getState().lapId).toBe("1");
  });

  it("passes the fetched lap telemetry through to the telemetry charts", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue([]);
    vi.spyOn(client, "getTelemetry").mockResolvedValue([sampleTelemetry, sampleTelemetry]);

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");

    await waitFor(() =>
      expect(screen.getByTestId("telemetry-charts-stub")).toHaveTextContent("2 samples"),
    );
  });

  it("shows an error message when a request fails", async () => {
    vi.spyOn(client, "getTrackPoints").mockRejectedValue(new Error("network error"));
    vi.spyOn(client, "getTelemetry").mockResolvedValue([]);

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load track map/i),
    );
  });

  it("renders the top summary panel with driver/lap/session context", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue([]);
    vi.spyOn(client, "getTelemetry").mockResolvedValue([sampleTelemetry]);

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");

    await waitFor(() => expect(screen.getByText(/italian grand prix/i)).toBeInTheDocument());
  });
});
