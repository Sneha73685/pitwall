import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LapComparisonResponse, TrackPoint } from "../../../api/client";
import { useComparisonStore, type ComparisonChannelKey } from "../comparisonStore";
import * as trackMapSegmentColors from "./trackMapSegmentColors";
import { TrackMapDelta } from "./TrackMapDelta";

// TrackMap owns the actual SVG rendering (covered by its own test suite);
// TrackMapDelta only needs to know it's wired up with the right geometry,
// colors, corner regions, and (M14) cursor marker position -- same pattern
// TrackMapPage.test.tsx uses for TelemetryCharts.
vi.mock("../../track-map/TrackMap", () => ({
  TrackMap: ({
    trackPoints,
    segmentColors,
    cursorPoint,
    cornerRegions,
  }: {
    trackPoints: TrackPoint[];
    segmentColors?: string[];
    cursorPoint?: { x: number; y: number } | null;
    cornerRegions?: { start_distance_m: number; end_distance_m: number }[];
  }) => (
    <div data-testid="track-map-stub">
      {trackPoints.length} points, {segmentColors?.length ?? 0} colors,{" "}
      {cursorPoint ? `cursor at (${cursorPoint.x}, ${cursorPoint.y})` : "no cursor"},{" "}
      {cornerRegions?.length ?? 0} corners
    </div>
  ),
}));

const trackPoints: TrackPoint[] = [
  { distance_m: 0, x: 0, y: 0 },
  { distance_m: 100, x: 10, y: 0 },
];

const corners = [{ start_distance_m: 10, end_distance_m: 40 }];

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

  it("renders TrackMap with the given track geometry, computed colors, and corner regions", () => {
    render(
      <TrackMapDelta
        comparison={comparison()}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
        corners={corners}
      />,
    );

    expect(screen.getByTestId("track-map-stub")).toHaveTextContent(
      "2 points, 2 colors, no cursor, 1 corners",
    );
  });

  it("renders no corner regions when corners is omitted", () => {
    render(
      <TrackMapDelta
        comparison={comparison()}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );

    expect(screen.getByTestId("track-map-stub")).toHaveTextContent("0 corners");
  });

  it("shows a loading message while trackPoints is null (no error, no circuit mismatch)", () => {
    render(
      <TrackMapDelta
        comparison={comparison()}
        trackPoints={null}
        error={null}
        hasCircuitMismatch={false}
      />,
    );

    expect(screen.getByText(/loading track map/i)).toBeInTheDocument();
  });

  it("shows an error message when the error prop is set", () => {
    render(
      <TrackMapDelta
        comparison={comparison()}
        trackPoints={null}
        error="Could not load track geometry."
        hasCircuitMismatch={false}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/could not load track geometry/i);
  });

  it("memoizes segment-color computation: does not recompute on an unrelated rerender", () => {
    const computeSpy = vi.spyOn(trackMapSegmentColors, "computeSegmentColors");
    const data = comparison();

    const { rerender } = render(
      <TrackMapDelta
        comparison={data}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );
    const callsAfterFirstRender = computeSpy.mock.calls.length;

    rerender(
      <TrackMapDelta
        comparison={data}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );

    expect(computeSpy.mock.calls.length).toBe(callsAfterFirstRender);
  });

  it("recomputes segment colors when the comparison actually changes", () => {
    const computeSpy = vi.spyOn(trackMapSegmentColors, "computeSegmentColors");

    const { rerender } = render(
      <TrackMapDelta
        comparison={comparison()}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );
    const callsAfterFirstRender = computeSpy.mock.calls.length;

    rerender(
      <TrackMapDelta
        comparison={comparison({ delta_ms: [0, -200] })}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );

    expect(computeSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstRender);
  });

  // M13 (docs/m13-design-review.md §9): session A and session B at
  // different circuits -- session A's track outline would misrepresent
  // lap B, which never drove it, so the map is hidden and explained
  // rather than rendered.
  it("hides the track map and explains why when hasCircuitMismatch is true", () => {
    render(
      <TrackMapDelta
        comparison={comparison({
          warnings: [{ code: "different_circuit", detail: "Monza vs Spa" }],
        })}
        trackPoints={null}
        error={null}
        hasCircuitMismatch={true}
      />,
    );

    expect(screen.queryByTestId("track-map-stub")).not.toBeInTheDocument();
    expect(screen.getByText(/different circuits/i)).toBeInTheDocument();
  });

  it("renders the track map normally when hasCircuitMismatch is false, even with an unrelated warning present", () => {
    render(
      <TrackMapDelta
        comparison={comparison({
          warnings: [{ code: "invalid_lap_a", detail: "Lap A is not marked accurate." }],
        })}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );

    expect(screen.getByTestId("track-map-stub")).toHaveTextContent("2 points, 2 colors, no cursor");
  });

  // --- M14 cursor marker (docs/m14-design-review.md §9/§12) ---

  it("passes the nearest track-outline point as the cursor marker when comparisonStore.distanceM is set (same circuit)", () => {
    useComparisonStore.setState({ distanceM: 60, source: "delta-chart" });

    render(
      <TrackMapDelta
        comparison={comparison()}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );

    // trackPoints: distance_m 0 -> (0,0), 100 -> (10,0); 60 is nearer 100.
    expect(screen.getByTestId("track-map-stub")).toHaveTextContent("cursor at (10, 0)");
  });

  it("passes no cursor marker when comparisonStore.distanceM is null", () => {
    render(
      <TrackMapDelta
        comparison={comparison()}
        trackPoints={trackPoints}
        error={null}
        hasCircuitMismatch={false}
      />,
    );

    expect(screen.getByTestId("track-map-stub")).toHaveTextContent("no cursor");
  });
});
