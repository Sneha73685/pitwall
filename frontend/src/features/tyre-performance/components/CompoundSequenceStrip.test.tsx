import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompoundSequenceStrip } from "./CompoundSequenceStrip";

describe("CompoundSequenceStrip", () => {
  it("renders one segment per stint with proportional widths and compound colors", () => {
    render(<CompoundSequenceStrip compoundSequence={["SOFT", "HARD"]} stintLengths={[17, 20]} />);

    const segment1 = screen.getByTestId("compound-sequence-segment-1");
    const segment2 = screen.getByTestId("compound-sequence-segment-2");

    expect(segment1.style.flexGrow).toBe("17");
    expect(segment2.style.flexGrow).toBe("20");
    expect(segment1.style.backgroundColor).toBe("rgb(218, 41, 28)"); // SOFT
    expect(segment2.style.backgroundColor).toBe("rgb(245, 245, 245)"); // HARD
    expect(screen.getByText("SOFT")).toBeInTheDocument();
    expect(screen.getByText("HARD")).toBeInTheDocument();
  });

  it("renders nothing for an empty sequence", () => {
    const { container } = render(<CompoundSequenceStrip compoundSequence={[]} stintLengths={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("preserves compound order as given -- never reordered by any statistic", () => {
    render(
      <CompoundSequenceStrip
        compoundSequence={["HARD", "SOFT", "HARD"]}
        stintLengths={[10, 5, 15]}
      />,
    );

    const segments = screen.getAllByRole("listitem");
    expect(segments.map((s) => s.title)).toEqual([
      "Stint 1: HARD, 10 laps",
      "Stint 2: SOFT, 5 laps",
      "Stint 3: HARD, 15 laps",
    ]);
  });
});
