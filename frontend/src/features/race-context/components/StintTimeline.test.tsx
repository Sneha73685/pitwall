import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Stint } from "../../../api/client";
import { StintTimeline } from "./StintTimeline";

describe("StintTimeline", () => {
  it("renders one segment per stint with proportional widths and compound colors", () => {
    const stints: Stint[] = [
      { stint_number: 1, compound: "SOFT", start_lap: 1, end_lap: 17, tyre_life_at_start: 4 },
      { stint_number: 2, compound: "HARD", start_lap: 18, end_lap: 37, tyre_life_at_start: 1 },
    ];

    render(<StintTimeline stints={stints} />);

    const segment1 = screen.getByTestId("stint-segment-1");
    const segment2 = screen.getByTestId("stint-segment-2");

    // Stint 1 spans 17 laps (1-17), stint 2 spans 20 laps (18-37) --
    // proportional flex-grow, not equal-width segments.
    expect(segment1.style.flexGrow).toBe("17");
    expect(segment2.style.flexGrow).toBe("20");

    expect(segment1.style.backgroundColor).toBe("rgb(218, 41, 28)"); // SOFT: #da291c
    expect(segment2.style.backgroundColor).toBe("rgb(245, 245, 245)"); // HARD: #f5f5f5

    expect(screen.getByText("SOFT")).toBeInTheDocument();
    expect(screen.getByText("HARD")).toBeInTheDocument();
  });

  it("shows an empty state when there are no stints", () => {
    render(<StintTimeline stints={[]} />);

    expect(screen.getByText(/no stint data available/i)).toBeInTheDocument();
  });
});
