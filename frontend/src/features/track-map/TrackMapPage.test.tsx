import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import type { CursorSlice } from "../../components/useCursorSync";
import { useSelectionStore } from "../../state/selectionStore";
import { useTrackMapCursorStore } from "./cursorStore";
import { TrackMapPage } from "./TrackMapPage";
import type { UseBoundStore, StoreApi } from "zustand";

// TelemetryCharts owns a real ECharts instance (covered by its own test
// suite); TrackMapPage only needs to know it's wired up with the right
// data and cursor store. The stub's own button simulates a real hover by
// calling the injected store's setCursor directly, the same way the real
// component's onEvents handler would (M14, docs/m14-design-review.md §12's
// "TrackMapPage-level integration test" case).
vi.mock("../telemetry-charts/TelemetryCharts", () => ({
  TelemetryCharts: ({
    samples,
    cursorStore,
    corners,
  }: {
    samples: client.TelemetrySample[];
    cursorStore: UseBoundStore<StoreApi<CursorSlice>>;
    corners?: { start_distance_m: number; end_distance_m: number }[];
  }) => (
    <div data-testid="telemetry-charts-stub">
      {samples.length} samples, {corners?.length ?? 0} corners
      <button onClick={() => cursorStore.getState().setCursor(50, "telemetry-charts")}>
        simulate hover
      </button>
    </div>
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
  event_id: "2023_italian_grand_prix",
  round_number: 16,
  location: "Monza",
  country: "Italy",
  session_type: "race",
  session_date: null,
  has_telemetry: true,
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
    useTrackMapCursorStore.setState({ distanceM: null, source: null });
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

  // --- M22 corner highlighting (docs/m22-design-review.md §6/§11) ---

  it("computes corner regions from the fetched track points and passes them to TrackMap and TelemetryCharts", async () => {
    // A real single 90-degree left turn, r=100m -- the same shape
    // detectCorners.test.ts already validates as producing exactly one
    // region. Enough points to give the detection window real geometry.
    const turnPoints = Array.from({ length: 20 }, (_, i) => {
      const d = i * 8;
      const theta = d / 100;
      return { distance_m: d, x: 100 * Math.sin(theta), y: 100 * (1 - Math.cos(theta)) };
    });
    vi.spyOn(client, "getTrackPoints").mockResolvedValue(turnPoints);
    vi.spyOn(client, "getTelemetry").mockResolvedValue([sampleTelemetry]);

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");

    await waitFor(() => expect(screen.getByTestId("track-map")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId("telemetry-charts-stub")).toHaveTextContent("1 corners"),
    );
    expect(screen.getByTestId("corner-region-0")).toBeInTheDocument();
  });

  it("passes no corner regions when track geometry produces none (e.g. no track data)", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue([]);
    vi.spyOn(client, "getTelemetry").mockResolvedValue([sampleTelemetry]);

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");

    await waitFor(() =>
      expect(screen.getByTestId("telemetry-charts-stub")).toHaveTextContent("0 corners"),
    );
    expect(screen.queryByTestId("corner-region-0")).not.toBeInTheDocument();
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

  // --- M14 synchronized cursor (docs/m14-design-review.md §6.1/§9/§12) ---

  it("clears a stale cursor from a previous lap when the route's lap changes", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue([]);
    vi.spyOn(client, "getTelemetry").mockResolvedValue([sampleTelemetry]);
    useTrackMapCursorStore.setState({ distanceM: 42, source: "telemetry-charts" });

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");

    await waitFor(() => expect(useTrackMapCursorStore.getState().distanceM).toBeNull());
  });

  it("moves TrackMap's marker to the position TelemetryCharts hovered (TrackMapPage-level sync)", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue([
      { distance_m: 0, x: 0, y: 0 },
      { distance_m: 100, x: 10, y: 10 },
    ]);
    vi.spyOn(client, "getTelemetry").mockResolvedValue([
      { ...sampleTelemetry, distance_m: 0, x: 0, y: 0 },
      { ...sampleTelemetry, distance_m: 100, x: 10, y: 10 },
    ]);

    renderAt("/sessions/2023_monza_race/drivers/VER/laps/1");
    await waitFor(() => expect(screen.getByTestId("track-map")).toBeInTheDocument());
    expect(screen.queryByTestId("cursor-marker")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /simulate hover/i }));

    // distance 50 is exactly between the two samples' distances -- nearest
    // (ties resolved to the first, i.e. the earlier sample) is (0, 0).
    await waitFor(() => expect(screen.getByTestId("cursor-marker")).toBeInTheDocument());
  });
});
