import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SectorDelta } from "../../../api/client";
import { SectorBreakdownTable } from "./SectorBreakdownTable";

describe("SectorBreakdownTable", () => {
  it("renders one row per sector with its delta and faster driver", () => {
    const sectors: SectorDelta[] = [
      { sector: 1, delta_ms: 45, faster: "a" },
      { sector: 2, delta_ms: -12, faster: "b" },
      { sector: 3, delta_ms: 82, faster: "a" },
    ];

    render(<SectorBreakdownTable sectors={sectors} />);

    expect(within(screen.getByTestId("sector-row-1")).getByText("45ms")).toBeInTheDocument();
    expect(within(screen.getByTestId("sector-row-1")).getByText("A")).toBeInTheDocument();
    expect(within(screen.getByTestId("sector-row-2")).getByText("12ms")).toBeInTheDocument();
    expect(within(screen.getByTestId("sector-row-2")).getByText("B")).toBeInTheDocument();
  });

  it("highlights the sector with the largest absolute delta as best", () => {
    const sectors: SectorDelta[] = [
      { sector: 1, delta_ms: 45, faster: "a" },
      { sector: 2, delta_ms: -12, faster: "b" },
      { sector: 3, delta_ms: 82, faster: "a" },
    ];

    render(<SectorBreakdownTable sectors={sectors} />);

    expect(
      within(screen.getByTestId("sector-row-3")).getByTestId("best-sector-marker"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("sector-row-1")).queryByTestId("best-sector-marker"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("sector-row-2")).queryByTestId("best-sector-marker"),
    ).not.toBeInTheDocument();
  });

  it("highlights the largest-magnitude sector even when B is faster there", () => {
    const sectors: SectorDelta[] = [
      { sector: 1, delta_ms: 10, faster: "a" },
      { sector: 2, delta_ms: -99, faster: "b" },
      { sector: 3, delta_ms: 20, faster: "a" },
    ];

    render(<SectorBreakdownTable sectors={sectors} />);

    expect(
      within(screen.getByTestId("sector-row-2")).getByTestId("best-sector-marker"),
    ).toBeInTheDocument();
  });

  it("shows a message when there are no sectors", () => {
    render(<SectorBreakdownTable sectors={[]} />);

    expect(screen.getByText(/no sector data available/i)).toBeInTheDocument();
  });
});
