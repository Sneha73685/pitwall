import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { DriverStrategySummary } from "../../../api/client";
import { StrategySummaryPanel } from "./StrategySummaryPanel";

function driverStrategy(overrides: Partial<DriverStrategySummary> = {}): DriverStrategySummary {
  return {
    driver_id: "VER",
    stint_count: 2,
    compound_sequence: ["SOFT", "HARD"],
    stint_lengths: [17, 20],
    ...overrides,
  };
}

function renderPanel(driverStrategies: DriverStrategySummary[]) {
  return render(
    <MemoryRouter>
      <StrategySummaryPanel
        sessionId="2024_bahrain_grand_prix_race"
        driverStrategies={driverStrategies}
      />
    </MemoryRouter>,
  );
}

describe("StrategySummaryPanel", () => {
  it("shows an empty state when there is no strategy data", () => {
    renderPanel([]);

    expect(screen.getByText(/no strategy data available/i)).toBeInTheDocument();
  });

  it("renders one row per driver with stint count and compound sequence", () => {
    renderPanel([driverStrategy()]);

    const row = screen.getByTestId("strategy-summary-row-VER");
    expect(row).toHaveTextContent("VER");
    expect(row).toHaveTextContent("2 stints");
    expect(row).toHaveTextContent("SOFT");
    expect(row).toHaveTextContent("HARD");
  });

  it("orders rows by driver_id alphabetically, regardless of input order or stint count", () => {
    renderPanel([
      driverStrategy({ driver_id: "VER", stint_count: 1 }),
      driverStrategy({ driver_id: "HAM", stint_count: 4 }),
      driverStrategy({ driver_id: "PER", stint_count: 2 }),
    ]);

    const rows = screen.getAllByTestId(/^strategy-summary-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "strategy-summary-row-HAM",
      "strategy-summary-row-PER",
      "strategy-summary-row-VER",
    ]);
  });

  it("links each row to that driver's stint-pace page", () => {
    renderPanel([driverStrategy({ driver_id: "VER" })]);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/sessions/2024_bahrain_grand_prix_race/drivers/VER/stint-pace",
    );
  });

  it("renders singular 'stint' for a 1-stop driver", () => {
    renderPanel([
      driverStrategy({
        driver_id: "PIA",
        stint_count: 1,
        compound_sequence: ["SOFT"],
        stint_lengths: [57],
      }),
    ]);

    expect(screen.getByTestId("strategy-summary-row-PIA")).toHaveTextContent("1 stint");
  });
});
