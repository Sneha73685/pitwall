import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SeasonTyreTrendPoint } from "../../../api/client";
import { SeasonTyreTrendList } from "./SeasonTyreTrendList";

function point(overrides: Partial<SeasonTyreTrendPoint> = {}): SeasonTyreTrendPoint {
  return {
    session_id: "2024_bahrain_grand_prix_race",
    event_id: "2024_bahrain_grand_prix",
    event_name: "Bahrain Grand Prix",
    round_number: 1,
    session_date: "2024-03-02T15:00:00+00:00",
    strategy: {
      driver_id: "VER",
      stint_count: 2,
      compound_sequence: ["SOFT", "HARD"],
      stint_lengths: [17, 20],
    },
    ...overrides,
  };
}

describe("SeasonTyreTrendList", () => {
  it("renders one row per point with round label, stint count, and compound sequence", () => {
    render(<SeasonTyreTrendList points={[point()]} />);

    const row = screen.getByTestId("tyre-trend-row-2024_bahrain_grand_prix_race");
    expect(row).toHaveTextContent("R1 Bahrain Grand Prix");
    expect(row).toHaveTextContent("2 stints");
    expect(row).toHaveTextContent("SOFT");
    expect(row).toHaveTextContent("HARD");
  });

  it("renders rows in the given order, never re-sorting", () => {
    render(
      <SeasonTyreTrendList
        points={[
          point({ session_id: "round_2", round_number: 2, event_name: "Round 2" }),
          point({ session_id: "round_1", round_number: 1, event_name: "Round 1" }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId(/^tyre-trend-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      "tyre-trend-row-round_2",
      "tyre-trend-row-round_1",
    ]);
  });

  it("renders singular 'stint' for a 1-stint session", () => {
    render(
      <SeasonTyreTrendList
        points={[
          point({
            strategy: {
              driver_id: "VER",
              stint_count: 1,
              compound_sequence: ["MEDIUM"],
              stint_lengths: [57],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("tyre-trend-row-2024_bahrain_grand_prix_race")).toHaveTextContent(
      "1 stint",
    );
  });

  it("renders a zero-stint point (roster-present, no recorded stints) without error", () => {
    render(
      <SeasonTyreTrendList
        points={[
          point({
            strategy: {
              driver_id: "VER",
              stint_count: 0,
              compound_sequence: [],
              stint_lengths: [],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("tyre-trend-row-2024_bahrain_grand_prix_race")).toHaveTextContent(
      "0 stints",
    );
  });

  it("renders nothing (an empty list) when points is empty", () => {
    render(<SeasonTyreTrendList points={[]} />);

    expect(screen.queryAllByTestId(/^tyre-trend-row-/)).toHaveLength(0);
  });
});
