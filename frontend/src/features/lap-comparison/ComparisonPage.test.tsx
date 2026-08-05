import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useComparisonStore, type ComparisonChannelKey } from "./comparisonStore";
import { ComparisonPage } from "./ComparisonPage";

// DeltaChart, ChannelOverlayPanel, and TrackMapDelta each own real
// rendering/fetch behavior (covered by their own test suites, Phase 7/8);
// ComparisonPage only needs to know they're wired up with the comparison
// data, same pattern TrackMapPage.test.tsx uses for TelemetryCharts.
vi.mock("./components/DeltaChart", () => ({
  DeltaChart: ({ comparison }: { comparison: client.LapComparisonResponse }) => (
    <div data-testid="delta-chart-stub">delta for {comparison.lap_a.driver_id}</div>
  ),
}));
vi.mock("./components/ChannelOverlayPanel", () => ({
  ChannelOverlayPanel: ({ comparison }: { comparison: client.LapComparisonResponse }) => (
    <div data-testid="channel-overlay-panel-stub">channels for {comparison.lap_b.driver_id}</div>
  ),
}));
vi.mock("./components/TrackMapDelta", () => ({
  TrackMapDelta: ({
    sessionId,
    comparison,
  }: {
    sessionId: string;
    comparison: client.LapComparisonResponse;
  }) => (
    <div data-testid="track-map-delta-stub">
      track map for {sessionId} ({comparison.lap_a.driver_id} vs {comparison.lap_b.driver_id})
    </div>
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/sessions/:sessionId/compare" element={<ComparisonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const drivers: client.Driver[] = [
  { driver_id: "VER", driver_number: 1, full_name: "Max Verstappen", team_name: "Red Bull Racing" },
  { driver_id: "LEC", driver_number: 16, full_name: "Charles Leclerc", team_name: "Ferrari" },
];

const verLaps: client.Lap[] = [
  {
    driver_id: "VER",
    lap_number: 1,
    lap_time_seconds: 91.234,
    sector_1_seconds: 30.1,
    sector_2_seconds: 31.0,
    sector_3_seconds: 30.134,
    is_personal_best: true,
    is_accurate: true,
  },
];

const lecLaps: client.Lap[] = [
  {
    driver_id: "LEC",
    lap_number: 1,
    lap_time_seconds: 91.546,
    sector_1_seconds: 30.3,
    sector_2_seconds: 31.1,
    sector_3_seconds: 30.146,
    is_personal_best: true,
    is_accurate: true,
  },
];

const sampleComparison: client.LapComparisonResponse = {
  session_id: "2023_monza_race",
  lap_a: verLaps[0],
  lap_b: lecLaps[0],
  compared_distance_m: 100,
  distance_m: [0, 100],
  delta_ms: [0, 150],
  channels: { speed_kph: { a: [200, 250], b: [195, 245] } },
  sectors: [{ sector: 1, delta_ms: 150, faster: "a" }],
  warnings: [],
};

async function selectDriverAndLap(pickerIndex: 0 | 1, driverId: string) {
  const driverSelects = screen.getAllByLabelText("Driver");
  fireEvent.change(driverSelects[pickerIndex], { target: { value: driverId } });

  // Scoped to this specific picker's own <select> -- querying the whole
  // document for "lap 1" can resolve early by matching the *other*
  // picker's already-loaded option, before this picker's own fetch (for a
  // different driver) has actually completed.
  const lapSelects = screen.getAllByLabelText("Lap");
  await within(lapSelects[pickerIndex]).findByRole("option", { name: /lap 1/i });

  // This change can be the one that completes the pair and kicks off
  // useLapComparison's fetch. fireEvent.change's own act() wrapping only
  // flushes synchronous work, not the promise that effect starts -- an
  // explicit async act() keeps the scope open across its resolution so
  // setComparison doesn't land in the gap before the next waitFor begins.
  await act(async () => {
    fireEvent.change(lapSelects[pickerIndex], { target: { value: "1" } });
  });
}

describe("ComparisonPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useComparisonStore.setState({
      hoverDistance: null,
      visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
    });
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    vi.spyOn(client, "listLaps").mockImplementation((_sessionId, driverId) =>
      Promise.resolve(driverId === "LEC" ? lecLaps : verLaps),
    );
  });

  it("renders the lap pair selector and nothing else before both laps are chosen", async () => {
    renderAt("/sessions/2023_monza_race/compare");

    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );
    expect(screen.queryByTestId("lap-a-summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/no sector data/i)).not.toBeInTheDocument();
  });

  it("fetches and renders the comparison once both laps are selected", async () => {
    vi.spyOn(client, "compareLaps").mockResolvedValue(sampleComparison);
    renderAt("/sessions/2023_monza_race/compare");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    await selectDriverAndLap(0, "VER");
    await selectDriverAndLap(1, "LEC");

    await waitFor(() => expect(screen.getByTestId("lap-a-summary")).toHaveTextContent("VER"));
    expect(screen.getByTestId("lap-b-summary")).toHaveTextContent("LEC");
    expect(screen.getByTestId("sector-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("delta-chart-stub")).toBeInTheDocument();
    expect(screen.getByTestId("channel-overlay-panel-stub")).toBeInTheDocument();
    expect(screen.getByTestId("track-map-delta-stub")).toBeInTheDocument();
  });

  it("swaps A and B when the swap button is clicked, refetching with params flipped", async () => {
    // Mock reflects the actual driverA/driverB passed in, so the DOM after
    // a swap genuinely differs -- a static mock would return the same
    // lap_a/lap_b regardless of params and couldn't tell a real swap from
    // a no-op.
    const compareLapsSpy = vi
      .spyOn(client, "compareLaps")
      .mockImplementation((_sessionId, params) =>
        Promise.resolve({
          ...sampleComparison,
          lap_a: params.driverA === "LEC" ? lecLaps[0] : verLaps[0],
          lap_b: params.driverB === "LEC" ? lecLaps[0] : verLaps[0],
        }),
      );
    renderAt("/sessions/2023_monza_race/compare");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    await selectDriverAndLap(0, "VER");
    await selectDriverAndLap(1, "LEC");
    // Wait for the resolved fetch to actually land in the DOM (not just for
    // the spy to have been called) before firing the next event, so the
    // first fetch's state update is fully settled -- and act()-wrapped --
    // before the swap click starts a second one.
    await waitFor(() => expect(screen.getByTestId("lap-a-summary")).toHaveTextContent("VER"));
    expect(compareLapsSpy).toHaveBeenLastCalledWith("2023_monza_race", {
      driverA: "VER",
      lapA: 1,
      driverB: "LEC",
      lapB: 1,
      resolution: undefined,
    });

    fireEvent.click(screen.getByRole("button", { name: /swap a\/b/i }));

    await waitFor(() => expect(screen.getByTestId("lap-a-summary")).toHaveTextContent("LEC"));
    expect(compareLapsSpy).toHaveBeenLastCalledWith("2023_monza_race", {
      driverA: "LEC",
      lapA: 1,
      driverB: "VER",
      lapB: 1,
      resolution: undefined,
    });
  });

  it("shows an error message when the comparison fetch fails", async () => {
    vi.spyOn(client, "compareLaps").mockRejectedValue(new Error("network error"));
    renderAt("/sessions/2023_monza_race/compare");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    await selectDriverAndLap(0, "VER");
    await selectDriverAndLap(1, "LEC");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load lap comparison/i),
    );
  });
});
