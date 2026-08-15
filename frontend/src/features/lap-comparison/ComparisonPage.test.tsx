import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { useComparisonStore, type ComparisonChannelKey } from "./comparisonStore";
import { ComparisonPage } from "./ComparisonPage";

// Used inside the vi.mock factories below -- referencing a normal
// top-level import from a mock factory is safe in Vitest: the factory body
// only runs when the mocked module is first resolved (after this file's
// own imports have all evaluated), not at vi.mock's hoist time.

// DeltaChart, ChannelOverlayPanel, and TrackMapDelta each own real
// rendering/fetch behavior (covered by their own test suites, Phase 7/8 and
// M13's TrackMapDelta.test.tsx circuit-mismatch cases); ComparisonPage only
// needs to know they're wired up with the comparison data, same pattern
// TrackMapPage.test.tsx uses for TelemetryCharts.
// Each stub reads/writes comparisonStore directly (not mocked -- it's the
// real store, same as the real components use) so M14 cross-chart cursor
// sync (docs/m14-design-review.md §12's "ComparisonPage-level" case) is
// testable at this level too: a "hover" button simulates the real
// component's own hover-report, and the rendered text proves whether the
// OTHER stubs' own read of the store reflects it.
vi.mock("./components/DeltaChart", () => ({
  DeltaChart: ({ comparison }: { comparison: client.LapComparisonResponse }) => {
    const distanceM = useComparisonStore((s) => s.distanceM);
    const setCursor = useComparisonStore((s) => s.setCursor);
    return (
      <div data-testid="delta-chart-stub">
        delta for {comparison.lap_a.driver_id}, cursor: {distanceM ?? "none"}
        <button onClick={() => setCursor(75, "delta-chart")}>hover delta chart</button>
      </div>
    );
  },
}));
vi.mock("./components/ChannelOverlayPanel", () => ({
  ChannelOverlayPanel: ({ comparison }: { comparison: client.LapComparisonResponse }) => {
    const distanceM = useComparisonStore((s) => s.distanceM);
    return (
      <div data-testid="channel-overlay-panel-stub">
        channels for {comparison.lap_b.driver_id}, cursor: {distanceM ?? "none"}
      </div>
    );
  },
}));
vi.mock("./components/TrackMapDelta", () => ({
  TrackMapDelta: ({
    sessionId,
    comparison,
  }: {
    sessionId: string;
    comparison: client.LapComparisonResponse;
  }) => {
    const distanceM = useComparisonStore((s) => s.distanceM);
    return (
      <div data-testid="track-map-delta-stub">
        track map for {sessionId} ({comparison.lap_a.driver_id} vs {comparison.lap_b.driver_id}),
        cursor: {distanceM ?? "none"}
      </div>
    );
  },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/laps/compare" element={<ComparisonPage />} />
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
  session_id_a: "2023_monza_race",
  session_id_b: "2023_monza_race",
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
      distanceM: null,
      source: null,
      visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
    });
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    vi.spyOn(client, "listLaps").mockImplementation((_sessionId, driverId) =>
      Promise.resolve(driverId === "LEC" ? lecLaps : verLaps),
    );
  });

  it("renders the lap pair selector and nothing else before both laps are chosen", async () => {
    renderAt("/laps/compare?sessionA=2023_monza_race&sessionB=2023_monza_race");

    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );
    expect(screen.queryByTestId("lap-a-summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/no sector data/i)).not.toBeInTheDocument();
  });

  it("shows 'No session selected' and does not render the lap pickers when session params are absent", () => {
    renderAt("/laps/compare");

    expect(screen.getAllByText("No session selected")).toHaveLength(2);
    expect(screen.queryByLabelText("Driver")).not.toBeInTheDocument();
  });

  it("fetches and renders the comparison once both laps are selected", async () => {
    vi.spyOn(client, "compareLaps").mockResolvedValue(sampleComparison);
    renderAt("/laps/compare?sessionA=2023_monza_race&sessionB=2023_monza_race");
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

  // --- M14 synchronized cursor (docs/m14-design-review.md §6.1/§12) ---

  it("propagates a hover from one chart to the others (ComparisonPage-level cross-chart sync)", async () => {
    vi.spyOn(client, "compareLaps").mockResolvedValue(sampleComparison);
    renderAt("/laps/compare?sessionA=2023_monza_race&sessionB=2023_monza_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );
    await selectDriverAndLap(0, "VER");
    await selectDriverAndLap(1, "LEC");
    await waitFor(() => expect(screen.getByTestId("delta-chart-stub")).toHaveTextContent("none"));

    fireEvent.click(screen.getByRole("button", { name: /hover delta chart/i }));

    await waitFor(() =>
      expect(screen.getByTestId("channel-overlay-panel-stub")).toHaveTextContent("cursor: 75"),
    );
    expect(screen.getByTestId("track-map-delta-stub")).toHaveTextContent("cursor: 75");
  });

  it("clears the cursor when a new comparison is fetched (session/lap change)", async () => {
    const compareLapsSpy = vi.spyOn(client, "compareLaps").mockResolvedValue(sampleComparison);
    renderAt("/laps/compare?sessionA=2023_monza_race&sessionB=2023_monza_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );
    await selectDriverAndLap(0, "VER");
    await selectDriverAndLap(1, "LEC");
    await waitFor(() => expect(screen.getByTestId("delta-chart-stub")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /hover delta chart/i }));
    await waitFor(() =>
      expect(screen.getByTestId("delta-chart-stub")).toHaveTextContent("cursor: 75"),
    );

    // A genuinely new comparison fetch (swap produces one via the same
    // useLapComparison hook) must reset the stale cursor.
    compareLapsSpy.mockResolvedValue({
      ...sampleComparison,
      lap_a: lecLaps[0],
      lap_b: verLaps[0],
    });
    fireEvent.click(screen.getByRole("button", { name: /swap a\/b/i }));

    await waitFor(() =>
      expect(screen.getByTestId("delta-chart-stub")).toHaveTextContent("cursor: none"),
    );
  });

  it("swaps A and B when the swap button is clicked, refetching with params flipped", async () => {
    // Mock reflects the actual driverA/driverB passed in, so the DOM after
    // a swap genuinely differs -- a static mock would return the same
    // lap_a/lap_b regardless of params and couldn't tell a real swap from
    // a no-op.
    const compareLapsSpy = vi.spyOn(client, "compareLaps").mockImplementation((params) =>
      Promise.resolve({
        ...sampleComparison,
        lap_a: params.driverA === "LEC" ? lecLaps[0] : verLaps[0],
        lap_b: params.driverB === "LEC" ? lecLaps[0] : verLaps[0],
      }),
    );
    renderAt("/laps/compare?sessionA=2023_monza_race&sessionB=2023_monza_race");
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
    expect(compareLapsSpy).toHaveBeenLastCalledWith({
      sessionIdA: "2023_monza_race",
      driverA: "VER",
      lapA: 1,
      sessionIdB: "2023_monza_race",
      driverB: "LEC",
      lapB: 1,
      resolution: undefined,
    });

    fireEvent.click(screen.getByRole("button", { name: /swap a\/b/i }));

    await waitFor(() => expect(screen.getByTestId("lap-a-summary")).toHaveTextContent("LEC"));
    expect(compareLapsSpy).toHaveBeenLastCalledWith({
      sessionIdA: "2023_monza_race",
      driverA: "LEC",
      lapA: 1,
      sessionIdB: "2023_monza_race",
      driverB: "VER",
      lapB: 1,
      resolution: undefined,
    });
  });

  it("shows an error message when the comparison fetch fails", async () => {
    vi.spyOn(client, "compareLaps").mockRejectedValue(new Error("network error"));
    renderAt("/laps/compare?sessionA=2023_monza_race&sessionB=2023_monza_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    await selectDriverAndLap(0, "VER");
    await selectDriverAndLap(1, "LEC");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load lap comparison/i),
    );
  });

  // --- M13 cross-session picker tests (docs/m13-design-review.md §6/§7/§8) ---

  describe("cross-session Session B picker", () => {
    beforeEach(() => {
      vi.spyOn(client, "listSeasons").mockResolvedValue([{ season: 2024, event_count: 1 }]);
      vi.spyOn(client, "listEventsForSeason").mockResolvedValue([
        {
          event_id: "2024_spa_grand_prix",
          season: 2024,
          event_name: "Belgian Grand Prix",
          round_number: 12,
          location: "Spa",
          country: "Belgium",
          session_types: ["race"],
          session_count: 1,
        },
      ]);
      vi.spyOn(client, "listSessionsForEvent").mockResolvedValue([
        {
          session_id: "2024_spa_grand_prix_race",
          season: 2024,
          event_name: "Belgian Grand Prix",
          round_number: 12,
          location: "Spa",
          country: "Belgium",
          session_type: "race",
          session_date: null,
          event_id: "2024_spa_grand_prix",
          has_telemetry: true,
        },
      ]);
    });

    it("opens the Session B picker when its Select/Change button is clicked", async () => {
      renderAt("/laps/compare?sessionA=2023_monza_race");

      fireEvent.click(screen.getByRole("button", { name: /select session/i }));

      expect(await screen.findByRole("dialog", { name: /select session b/i })).toBeInTheDocument();
    });

    it("selecting a different season/event/session for B updates Session B and closes the picker", async () => {
      renderAt("/laps/compare?sessionA=2023_monza_race");

      fireEvent.click(screen.getByRole("button", { name: /select session/i }));
      const dialog = await screen.findByRole("dialog", { name: /select session b/i });

      fireEvent.click(await within(dialog).findByText(/2024 — 1 event/i));
      fireEvent.click(await within(dialog).findByText("Belgian Grand Prix"));
      fireEvent.click(await screen.findByText("Race"));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText("2024_spa_grand_prix_race")).toBeInTheDocument();
    });

    it("independently selects Driver/Lap B once Session B is chosen, without disturbing Session A", async () => {
      // Both sessions start present (the common "compare within this
      // session, same as before" entry) so LapPairSelector already renders
      // -- it only mounts once sessionIdA AND sessionIdB are both set.
      renderAt("/laps/compare?sessionA=2023_monza_race&sessionB=2023_monza_race");
      await waitFor(() =>
        expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
      );

      // Select driver/lap for both sides first, same as the existing
      // same-session flow.
      await selectDriverAndLap(0, "VER");
      await selectDriverAndLap(1, "LEC");
      const driverSelects = screen.getAllByLabelText("Driver");
      expect(driverSelects[0]).toHaveValue("VER");
      expect(driverSelects[1]).toHaveValue("LEC");

      // Now change Session B to a genuinely different session.
      // Both A and B now show "Change" -- index 1 is Session B's slot.
      fireEvent.click(screen.getAllByRole("button", { name: /change/i })[1]);
      const dialog = await screen.findByRole("dialog", { name: /select session b/i });
      fireEvent.click(await within(dialog).findByText(/2024 — 1 event/i));
      fireEvent.click(await within(dialog).findByText("Belgian Grand Prix"));
      fireEvent.click(await screen.findByText("Race"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // Session A's own driver select still shows VER selected -- picking
      // a new Session B never touched it (docs/m13-design-review.md §6).
      const driverSelectsAfter = screen.getAllByLabelText("Driver");
      expect(driverSelectsAfter[0]).toHaveValue("VER");
      // Session B's driver/lap selection was reset by the new session pick
      // (its old driver/lap choice no longer applies to a different
      // session's roster).
      expect(driverSelectsAfter[1]).toHaveValue("");

      // Independently select driver/lap B for the new session.
      await selectDriverAndLap(1, "LEC");

      expect(client.listLaps).toHaveBeenLastCalledWith("2024_spa_grand_prix_race", "LEC");
    });
  });
});
