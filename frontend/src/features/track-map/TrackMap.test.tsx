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
});
