import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LapComparisonResponse } from "../../../api/client";
import { ComparisonHeader } from "./ComparisonHeader";

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
      is_personal_best: false,
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

describe("ComparisonHeader", () => {
  it("renders both drivers, lap numbers, and lap times", () => {
    render(<ComparisonHeader comparison={comparison()} onSwap={vi.fn()} />);

    expect(screen.getByTestId("lap-a-summary")).toHaveTextContent("VER");
    expect(screen.getByTestId("lap-a-summary")).toHaveTextContent("91.234s");
    expect(screen.getByTestId("lap-b-summary")).toHaveTextContent("LEC");
    expect(screen.getByTestId("lap-b-summary")).toHaveTextContent("91.546s");
  });

  it("shows A as faster when the final delta is positive", () => {
    render(<ComparisonHeader comparison={comparison({ delta_ms: [0, 150] })} onSwap={vi.fn()} />);

    expect(screen.getByTestId("overall-delta")).toHaveTextContent("150ms");
    expect(screen.getByTestId("overall-delta")).toHaveTextContent("A faster");
  });

  it("shows B as faster when the final delta is negative", () => {
    render(<ComparisonHeader comparison={comparison({ delta_ms: [0, -75] })} onSwap={vi.fn()} />);

    expect(screen.getByTestId("overall-delta")).toHaveTextContent("75ms");
    expect(screen.getByTestId("overall-delta")).toHaveTextContent("B faster");
  });

  it("calls onSwap when the swap button is clicked", () => {
    const onSwap = vi.fn();
    render(<ComparisonHeader comparison={comparison()} onSwap={onSwap} />);

    fireEvent.click(screen.getByRole("button", { name: /swap a\/b/i }));

    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it("omits the lap time when it's null (incomplete lap)", () => {
    render(
      <ComparisonHeader
        comparison={comparison({
          lap_a: {
            driver_id: "VER",
            lap_number: 2,
            lap_time_seconds: null,
            sector_1_seconds: null,
            sector_2_seconds: null,
            sector_3_seconds: null,
            is_personal_best: false,
            is_accurate: false,
          },
        })}
        onSwap={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("lap-a-summary");
    expect(summary).toHaveTextContent("Lap 2");
    expect(summary.textContent).not.toMatch(/\d+\.\d{3}s/);
  });
});
