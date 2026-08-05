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
});
