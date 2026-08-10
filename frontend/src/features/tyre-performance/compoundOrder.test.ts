import { describe, expect, it } from "vitest";
import { sortByCompoundOrder } from "./compoundOrder";

interface Item {
  compound: string;
  medianLapTimeMs: number;
}

describe("sortByCompoundOrder", () => {
  it("orders by the fixed SOFT/MEDIUM/HARD/INTERMEDIATE/WET taxonomy regardless of input order", () => {
    const items: Item[] = [
      { compound: "HARD", medianLapTimeMs: 90000 },
      { compound: "SOFT", medianLapTimeMs: 91000 },
      { compound: "WET", medianLapTimeMs: 95000 },
      { compound: "INTERMEDIATE", medianLapTimeMs: 93000 },
      { compound: "MEDIUM", medianLapTimeMs: 92000 },
    ];

    const sorted = sortByCompoundOrder(items, (item) => item.compound);

    expect(sorted.map((item) => item.compound)).toEqual([
      "SOFT",
      "MEDIUM",
      "HARD",
      "INTERMEDIATE",
      "WET",
    ]);
  });

  it("never reorders by a pace statistic, even when the fastest compound sorts last in the taxonomy", () => {
    // HARD has by far the fastest median here -- a pace-based sort would put
    // it first. The taxonomy order must still win.
    const items: Item[] = [
      { compound: "SOFT", medianLapTimeMs: 99000 },
      { compound: "HARD", medianLapTimeMs: 80000 },
    ];

    const sorted = sortByCompoundOrder(items, (item) => item.compound);

    expect(sorted.map((item) => item.compound)).toEqual(["SOFT", "HARD"]);
  });

  it("appends compounds outside the fixed taxonomy afterward, alphabetically, not dropped", () => {
    const items: Item[] = [
      { compound: "ZEBRA", medianLapTimeMs: 90000 },
      { compound: "HARD", medianLapTimeMs: 90500 },
      { compound: "APEX", medianLapTimeMs: 91000 },
    ];

    const sorted = sortByCompoundOrder(items, (item) => item.compound);

    expect(sorted.map((item) => item.compound)).toEqual(["HARD", "APEX", "ZEBRA"]);
  });

  it("is case-insensitive", () => {
    const items: Item[] = [
      { compound: "hard", medianLapTimeMs: 90000 },
      { compound: "soft", medianLapTimeMs: 91000 },
    ];

    const sorted = sortByCompoundOrder(items, (item) => item.compound);

    expect(sorted.map((item) => item.compound)).toEqual(["soft", "hard"]);
  });

  it("does not mutate the input array", () => {
    const items: Item[] = [
      { compound: "HARD", medianLapTimeMs: 90000 },
      { compound: "SOFT", medianLapTimeMs: 91000 },
    ];
    const original = [...items];

    sortByCompoundOrder(items, (item) => item.compound);

    expect(items).toEqual(original);
  });
});
