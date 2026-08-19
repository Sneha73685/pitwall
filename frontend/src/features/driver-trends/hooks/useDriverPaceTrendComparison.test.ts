import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useDriverPaceTrendComparison } from "./useDriverPaceTrendComparison";

function trendSide(driverId: string, season: number): client.SeasonPaceTrendResponse {
  return {
    driver_id: driverId,
    season,
    session_type: "race",
    points: [
      {
        session_id: `${season}_round_1_race`,
        event_id: `${season}_round_1`,
        event_name: "Round 1 Grand Prix",
        round_number: 1,
        session_date: `${season}-03-02T15:00:00+00:00`,
        valid_lap_count: 5,
        best_lap_ms: 90000,
        median_lap_ms: 91000,
        theoretical_best_lap_ms: 89500,
        consistency_ms: 120,
        consistency_cv: 0.001,
      },
    ],
  };
}

const sampleComparison: client.SeasonPaceTrendComparisonResponse = {
  a: trendSide("VER", 2023),
  b: trendSide("PER", 2023),
};

describe("useDriverPaceTrendComparison", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch when any required field is missing", () => {
    const spy = vi.spyOn(client, "comparePaceTrends");

    const { result } = renderHook(() =>
      useDriverPaceTrendComparison(undefined, 2023, "PER", 2023, "race"),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.comparison).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("fetches and returns the comparison once all four fields are provided", async () => {
    vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);

    const { result } = renderHook(() =>
      useDriverPaceTrendComparison("VER", 2023, "PER", 2023, "race"),
    );

    await waitFor(() => expect(result.current.comparison).toEqual(sampleComparison));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("calls comparePaceTrends with the given driver/season/session-type fields", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);

    renderHook(() => useDriverPaceTrendComparison("VER", 2023, "PER", 2022, "qualifying"));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        driverA: "VER",
        seasonA: 2023,
        driverB: "PER",
        seasonB: 2022,
        sessionType: "qualifying",
      }),
    );
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "comparePaceTrends").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() =>
      useDriverPaceTrendComparison("VER", 2023, "PER", 2023, "race"),
    );

    await waitFor(() => expect(result.current.error).toBe("Could not load pace trend comparison."));
    expect(result.current.comparison).toBeNull();
  });

  it("refetches when either season changes (cross-season handled like any other field)", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);

    const { rerender } = renderHook(
      ({ seasonB }: { seasonB: number }) =>
        useDriverPaceTrendComparison("VER", 2023, "PER", seasonB, "race"),
      { initialProps: { seasonB: 2023 } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ seasonB: 2022 });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(spy).toHaveBeenLastCalledWith({
      driverA: "VER",
      seasonA: 2023,
      driverB: "PER",
      seasonB: 2022,
      sessionType: "race",
    });
  });

  it("clears the previous comparison before a new fetch settles", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);

    const { result, rerender } = renderHook(
      ({ seasonB }: { seasonB: number }) =>
        useDriverPaceTrendComparison("VER", 2023, "PER", seasonB, "race"),
      { initialProps: { seasonB: 2023 } },
    );
    await waitFor(() => expect(result.current.comparison).toEqual(sampleComparison));

    spy.mockImplementation(() => new Promise(() => {}));
    rerender({ seasonB: 2022 });

    expect(result.current.comparison).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
