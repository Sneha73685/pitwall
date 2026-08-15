import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import type { LapComparisonResponse, TrackPoint } from "../../../api/client";
import { useComparisonStore, type ComparisonChannelKey } from "../comparisonStore";
import * as trackMapSegmentColors from "./trackMapSegmentColors";
import { TrackMapDelta } from "./TrackMapDelta";

// TrackMap owns the actual SVG rendering (covered by its own test suite);
// TrackMapDelta only needs to know it's wired up with the right geometry,
// colors, and (M14) cursor marker position -- same pattern
// TrackMapPage.test.tsx uses for TelemetryCharts.
vi.mock("../../track-map/TrackMap", () => ({
  TrackMap: ({
    trackPoints,
    segmentColors,
    cursorPoint,
  }: {
    trackPoints: TrackPoint[];
    segmentColors?: string[];
    cursorPoint?: { x: number; y: number } | null;
  }) => (
    <div data-testid="track-map-stub">
      {trackPoints.length} points, {segmentColors?.length ?? 0} colors,{" "}
      {cursorPoint ? `cursor at (${cursorPoint.x}, ${cursorPoint.y})` : "no cursor"}
    </div>
  ),
}));

const trackPoints: TrackPoint[] = [
  { distance_m: 0, x: 0, y: 0 },
  { distance_m: 100, x: 10, y: 0 },
];

function comparison(overrides: Partial<LapComparisonResponse> = {}): LapComparisonResponse {
  return {
    session_id_a: "2023_monza_race",
    session_id_b: "2023_monza_race",
    lap_a: {
      driver_id: "VER",
      lap_number: 1,
      lap_time_seconds: 91.234,
      sector_1_seconds: 30.1,
      sector_2_seconds: 31.0,
      sector_3_seconds: 30.134,
      is_personal_best: true,
      is_accurate: true,
    },
    lap_b: {
      driver_id: "LEC",
      lap_number: 1,
      lap_time_seconds: 91.546,
      sector_1_seconds: 30.3,
      sector_2_seconds: 31.1,
      sector_3_seconds: 30.146,
      is_personal_best: true,
      is_accurate: true,
    },
    compared_distance_m: 100,
    distance_m: [0, 100],
    delta_ms: [0, 150],
    channels: {},
    sectors: [],
    warnings: [],
    ...overrides,
  };
}

describe("TrackMapDelta", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useComparisonStore.setState({
      distanceM: null,
      source: null,
      visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
    });
  });

  it("fetches session track geometry and passes it, plus computed colors, to TrackMap", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue(trackPoints);

    render(<TrackMapDelta sessionId="2023_monza_race" comparison={comparison()} />);

    await waitFor(() => expect(client.getTrackPoints).toHaveBeenCalledWith("2023_monza_race"));
    expect(await screen.findByTestId("track-map-stub")).toHaveTextContent(
      "2 points, 2 colors, no cursor",
    );
  });

  it("shows a loading message before track geometry has arrived", () => {
    vi.spyOn(client, "getTrackPoints").mockReturnValue(new Promise(() => {}));

    render(<TrackMapDelta sessionId="2023_monza_race" comparison={comparison()} />);

    expect(screen.getByText(/loading track map/i)).toBeInTheDocument();
  });

  it("shows an error message when the track geometry fetch fails", async () => {
    vi.spyOn(client, "getTrackPoints").mockRejectedValue(new Error("network error"));

    render(<TrackMapDelta sessionId="2023_monza_race" comparison={comparison()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load track geometry/i);
  });

  it("memoizes segment-color computation: does not recompute on an unrelated rerender", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue(trackPoints);
    const computeSpy = vi.spyOn(trackMapSegmentColors, "computeSegmentColors");
    const data = comparison();

    const { rerender } = render(<TrackMapDelta sessionId="2023_monza_race" comparison={data} />);
    await screen.findByTestId("track-map-stub");
    const callsAfterFirstRender = computeSpy.mock.calls.length;

    rerender(<TrackMapDelta sessionId="2023_monza_race" comparison={data} />);

    expect(computeSpy.mock.calls.length).toBe(callsAfterFirstRender);
  });

  it("recomputes segment colors when the comparison actually changes", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue(trackPoints);
    const computeSpy = vi.spyOn(trackMapSegmentColors, "computeSegmentColors");

    const { rerender } = render(
      <TrackMapDelta sessionId="2023_monza_race" comparison={comparison()} />,
    );
    await screen.findByTestId("track-map-stub");
    const callsAfterFirstRender = computeSpy.mock.calls.length;

    rerender(
      <TrackMapDelta
        sessionId="2023_monza_race"
        comparison={comparison({ delta_ms: [0, -200] })}
      />,
    );

    expect(computeSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstRender);
  });

  // M13 (docs/m13-design-review.md §9): session A and session B at
  // different circuits -- session A's track outline would misrepresent
  // lap B, which never drove it, so the map is hidden and explained
  // rather than rendered.
  it("hides the track map and explains why when sessions are at different circuits", () => {
    const getTrackPointsSpy = vi.spyOn(client, "getTrackPoints").mockResolvedValue(trackPoints);

    render(
      <TrackMapDelta
        sessionId="2023_monza_race"
        comparison={comparison({
          warnings: [{ code: "different_circuit", detail: "Monza vs Spa" }],
        })}
      />,
    );

    expect(screen.queryByTestId("track-map-stub")).not.toBeInTheDocument();
    expect(screen.getByText(/different circuits/i)).toBeInTheDocument();
    // Never even fetches geometry it won't use.
    expect(getTrackPointsSpy).not.toHaveBeenCalled();
  });

  it("renders the track map normally when sessions share a circuit (no different_circuit warning)", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue(trackPoints);

    render(
      <TrackMapDelta
        sessionId="2023_monza_race"
        comparison={comparison({
          warnings: [{ code: "invalid_lap_a", detail: "Lap A is not marked accurate." }],
        })}
      />,
    );

    expect(await screen.findByTestId("track-map-stub")).toHaveTextContent(
      "2 points, 2 colors, no cursor",
    );
  });

  // --- M14 cursor marker (docs/m14-design-review.md §9/§12) ---

  it("passes the nearest track-outline point as the cursor marker when comparisonStore.distanceM is set (same circuit)", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue(trackPoints);
    useComparisonStore.setState({ distanceM: 60, source: "delta-chart" });

    render(<TrackMapDelta sessionId="2023_monza_race" comparison={comparison()} />);

    // trackPoints: distance_m 0 -> (0,0), 100 -> (10,0); 60 is nearer 100.
    expect(await screen.findByTestId("track-map-stub")).toHaveTextContent("cursor at (10, 0)");
  });

  it("passes no cursor marker when comparisonStore.distanceM is null", async () => {
    vi.spyOn(client, "getTrackPoints").mockResolvedValue(trackPoints);

    render(<TrackMapDelta sessionId="2023_monza_race" comparison={comparison()} />);

    expect(await screen.findByTestId("track-map-stub")).toHaveTextContent("no cursor");
  });
});
