import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CompoundUsageCount } from "../../../api/client";
import { CompoundUsageSummary } from "./CompoundUsageSummary";

function usage(overrides: Partial<CompoundUsageCount> = {}): CompoundUsageCount {
  return { compound: "SOFT", stint_count: 10, driver_count: 8, total_laps: 120, ...overrides };
}

describe("CompoundUsageSummary", () => {
  it("shows an empty state when there is no compound data", () => {
    render(<CompoundUsageSummary compoundUsage={[]} />);

    expect(screen.getByText(/no compound data available/i)).toBeInTheDocument();
  });

  it("renders one row per compound with stint/driver/lap counts", () => {
    render(<CompoundUsageSummary compoundUsage={[usage()]} />);

    const row = screen.getByTestId("compound-usage-row-SOFT");
    expect(row).toHaveTextContent("SOFT");
    expect(row).toHaveTextContent("10");
    expect(row).toHaveTextContent("8");
    expect(row).toHaveTextContent("120");
  });

  it("orders rows by the fixed compound taxonomy, never by usage count", () => {
    render(
      <CompoundUsageSummary
        compoundUsage={[
          usage({ compound: "HARD", total_laps: 500 }), // most-used, but must not sort first
          usage({ compound: "SOFT", total_laps: 10 }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId(/^compound-usage-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "compound-usage-row-SOFT",
      "compound-usage-row-HARD",
    ]);
  });
});
