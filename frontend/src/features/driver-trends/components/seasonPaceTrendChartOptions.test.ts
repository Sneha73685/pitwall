import { describe, expect, it } from "vitest";
import type { SeasonPaceTrendPoint } from "../../../api/client";
import { buildSeasonPaceTrendChartOption } from "./seasonPaceTrendChartOptions";

function point(overrides: Partial<SeasonPaceTrendPoint> = {}): SeasonPaceTrendPoint {
  return {
    session_id: "2024_bahrain_grand_prix_race",
    event_id: "2024_bahrain_grand_prix",
    event_name: "Bahrain Grand Prix",
    round_number: 1,
    session_date: "2024-03-02T15:00:00+00:00",
    valid_lap_count: 5,
    best_lap_ms: 90000,
    median_lap_ms: 91000,
    theoretical_best_lap_ms: 89500,
    consistency_ms: 120,
    consistency_cv: 0.001,
    ...overrides,
  };
}

describe("buildSeasonPaceTrendChartOption", () => {
  it("builds exactly one series -- best lap only", () => {
    const option = buildSeasonPaceTrendChartOption([point()]);

    expect(option.series).toHaveLength(1);
    const [series] = option.series as { type: string; data: unknown[] }[];
    expect(series.type).toBe("line");
  });

  it("uses a category x-axis labeled by round and event name, in response order", () => {
    const points = [
      point({ round_number: 1, event_name: "Bahrain Grand Prix" }),
      point({ round_number: 2, event_name: "Saudi Arabian Grand Prix" }),
    ];

    const option = buildSeasonPaceTrendChartOption(points);
    const xAxis = option.xAxis as { type: string; data: string[] };

    expect(xAxis.type).toBe("category");
    expect(xAxis.data).toEqual(["R1 Bahrain Grand Prix", "R2 Saudi Arabian Grand Prix"]);
  });

  it("converts best_lap_ms to seconds for the y-axis series", () => {
    const option = buildSeasonPaceTrendChartOption([point({ best_lap_ms: 90500 })]);
    const [series] = option.series as { data: (number | null)[] }[];

    expect(series.data).toEqual([90.5]);
  });

  it("renders a null best_lap_ms as a gap, not a zero", () => {
    const points = [
      point({ round_number: 1, best_lap_ms: 90000 }),
      point({ round_number: 2, best_lap_ms: null }),
      point({ round_number: 3, best_lap_ms: 91000 }),
    ];

    const option = buildSeasonPaceTrendChartOption(points);
    const [series] = option.series as { data: (number | null)[]; connectNulls: boolean }[];

    expect(series.data).toEqual([90, null, 91]);
    expect(series.connectNulls).toBe(false);
  });

  it("produces an empty series for no points, not an error", () => {
    const option = buildSeasonPaceTrendChartOption([]);
    const [series] = option.series as { data: unknown[] }[];
    const xAxis = option.xAxis as { data: string[] };

    expect(series.data).toEqual([]);
    expect(xAxis.data).toEqual([]);
  });
});
