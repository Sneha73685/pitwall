import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackMap } from "./TrackMap";

const trackPoints = [
  { distance_m: 0, x: 0, y: 0 },
  { distance_m: 50, x: 10, y: 0 },
  { distance_m: 100, x: 10, y: 10 },
];

const lapPoints = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
];

describe("TrackMap", () => {
  it("renders the track outline", () => {
    render(<TrackMap trackPoints={trackPoints} lapPoints={[]} />);

    expect(screen.getByTestId("track-map")).toBeInTheDocument();
  });

  it("renders the lap line and start marker when lap points are given", () => {
    render(<TrackMap trackPoints={trackPoints} lapPoints={lapPoints} />);

    expect(screen.getByTestId("lap-line")).toBeInTheDocument();
    expect(screen.getByTestId("lap-start-marker")).toBeInTheDocument();
  });

  it("omits the lap line and marker when there are no lap points", () => {
    render(<TrackMap trackPoints={trackPoints} lapPoints={[]} />);

    expect(screen.queryByTestId("lap-line")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lap-start-marker")).not.toBeInTheDocument();
  });

  it("shows a message when there is no track geometry", () => {
    render(<TrackMap trackPoints={[]} lapPoints={[]} />);

    expect(screen.getByText(/no track geometry available/i)).toBeInTheDocument();
  });

  describe("with a second lap (M6 comparison)", () => {
    const secondaryLapPoints = [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];

    it("renders both lap lines and start markers", () => {
      render(
        <TrackMap
          trackPoints={trackPoints}
          lapPoints={lapPoints}
          secondaryLapPoints={secondaryLapPoints}
        />,
      );

      expect(screen.getByTestId("lap-line")).toBeInTheDocument();
      expect(screen.getByTestId("lap-start-marker")).toBeInTheDocument();
      expect(screen.getByTestId("secondary-lap-line")).toBeInTheDocument();
      expect(screen.getByTestId("secondary-lap-start-marker")).toBeInTheDocument();
    });

    it("gives the two lap lines different colors", () => {
      render(
        <TrackMap
          trackPoints={trackPoints}
          lapPoints={lapPoints}
          secondaryLapPoints={secondaryLapPoints}
        />,
      );

      const primaryStroke = screen.getByTestId("lap-line").getAttribute("stroke");
      const secondaryStroke = screen.getByTestId("secondary-lap-line").getAttribute("stroke");
      expect(primaryStroke).toBeTruthy();
      expect(secondaryStroke).toBeTruthy();
      expect(primaryStroke).not.toBe(secondaryStroke);
    });

    it("omits the secondary lap line and marker when secondaryLapPoints is empty", () => {
      render(<TrackMap trackPoints={trackPoints} lapPoints={lapPoints} secondaryLapPoints={[]} />);

      expect(screen.queryByTestId("secondary-lap-line")).not.toBeInTheDocument();
      expect(screen.queryByTestId("secondary-lap-start-marker")).not.toBeInTheDocument();
    });
  });

  describe("with cursorPoint (M14)", () => {
    it("renders a marker at the given point's scaled position", () => {
      render(<TrackMap trackPoints={trackPoints} lapPoints={[]} cursorPoint={{ x: 10, y: 10 }} />);

      const marker = screen.getByTestId("cursor-marker");
      // Same xScale/yScale TrackMap already computes from trackPoints
      // (domain [0,10]x[0,10], range [20,580]x[380,20]).
      expect(marker).toHaveAttribute("cx", "580");
      expect(marker).toHaveAttribute("cy", "20");
    });

    it("omits the marker when cursorPoint is null", () => {
      render(<TrackMap trackPoints={trackPoints} lapPoints={[]} cursorPoint={null} />);

      expect(screen.queryByTestId("cursor-marker")).not.toBeInTheDocument();
    });

    it("omits the marker when cursorPoint is omitted entirely", () => {
      render(<TrackMap trackPoints={trackPoints} lapPoints={[]} />);

      expect(screen.queryByTestId("cursor-marker")).not.toBeInTheDocument();
    });
  });

  describe("with segmentColors (M6 Phase 8)", () => {
    it("renders one colored segment per consecutive trackPoints pair instead of a single outline", () => {
      render(
        <TrackMap trackPoints={trackPoints} lapPoints={[]} segmentColors={["red", "green"]} />,
      );

      expect(screen.queryByTestId("track-outline")).not.toBeInTheDocument();
      expect(screen.getByTestId("track-segment-0")).toHaveAttribute("stroke", "red");
      expect(screen.getByTestId("track-segment-1")).toHaveAttribute("stroke", "green");
    });

    it("falls back to the single-color outline when segmentColors is omitted", () => {
      render(<TrackMap trackPoints={trackPoints} lapPoints={[]} />);

      expect(screen.getByTestId("track-outline")).toBeInTheDocument();
      expect(screen.queryByTestId("track-segment-0")).not.toBeInTheDocument();
    });
  });

  describe("with cornerRegions (M22, docs/m22-design-review.md §9)", () => {
    it("renders one shaded region per corner, sliced from the matching trackPoints range", () => {
      render(
        <TrackMap
          trackPoints={trackPoints}
          lapPoints={[]}
          cornerRegions={[{ start_distance_m: 0, end_distance_m: 50 }]}
        />,
      );

      expect(screen.getByTestId("corner-region-0")).toBeInTheDocument();
    });

    it("renders one region per entry when multiple corners are given", () => {
      render(
        <TrackMap
          trackPoints={trackPoints}
          lapPoints={[]}
          cornerRegions={[
            { start_distance_m: 0, end_distance_m: 50 },
            { start_distance_m: 50, end_distance_m: 100 },
          ]}
        />,
      );

      expect(screen.getByTestId("corner-region-0")).toBeInTheDocument();
      expect(screen.getByTestId("corner-region-1")).toBeInTheDocument();
    });

    it("renders no corner regions when cornerRegions is omitted", () => {
      render(<TrackMap trackPoints={trackPoints} lapPoints={[]} />);

      expect(screen.queryByTestId("corner-region-0")).not.toBeInTheDocument();
    });

    it("renders no corner regions when cornerRegions is an empty array", () => {
      render(<TrackMap trackPoints={trackPoints} lapPoints={[]} cornerRegions={[]} />);

      expect(screen.queryByTestId("corner-region-0")).not.toBeInTheDocument();
    });

    it("skips a corner region whose distance range matches fewer than two track points", () => {
      render(
        <TrackMap
          trackPoints={trackPoints}
          lapPoints={[]}
          cornerRegions={[{ start_distance_m: 200, end_distance_m: 250 }]}
        />,
      );

      expect(screen.queryByTestId("corner-region-0")).not.toBeInTheDocument();
    });

    it("still renders the existing track outline, lap line, and cursor marker unchanged alongside corner regions", () => {
      render(
        <TrackMap
          trackPoints={trackPoints}
          lapPoints={lapPoints}
          cursorPoint={{ x: 10, y: 10 }}
          cornerRegions={[{ start_distance_m: 0, end_distance_m: 50 }]}
        />,
      );

      expect(screen.getByTestId("corner-region-0")).toBeInTheDocument();
      expect(screen.getByTestId("track-outline")).toBeInTheDocument();
      expect(screen.getByTestId("lap-line")).toBeInTheDocument();
      expect(screen.getByTestId("cursor-marker")).toBeInTheDocument();
    });
  });
});
