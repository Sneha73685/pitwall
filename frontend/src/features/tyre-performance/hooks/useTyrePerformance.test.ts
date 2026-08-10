import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useTyrePerformance } from "./useTyrePerformance";

const sampleResponse: client.TyrePerformanceResponse = {
  session_id: "2024_test_grand_prix_race",
  driver_strategies: [
    {
      driver_id: "VER",
      stint_count: 3,
      compound_sequence: ["SOFT", "HARD", "SOFT"],
      stint_lengths: [4, 3, 3],
    },
    {
      driver_id: "HAM",
      stint_count: 2,
      compound_sequence: ["MEDIUM", "HARD"],
      stint_lengths: [5, 5],
    },
  ],
  compound_usage: [
    { compound: "HARD", stint_count: 2, driver_count: 2, total_laps: 8 },
    { compound: "MEDIUM", stint_count: 1, driver_count: 1, total_laps: 5 },
    { compound: "SOFT", stint_count: 2, driver_count: 1, total_laps: 7 },
  ],
  compound_aggregates: [
    {
      compound: "HARD",
      lap_count: 5,
      driver_count: 2,
      lap_times_ms: [90600, 91100, 91250, 91400, 91550],
      median_lap_time_ms: 91250,
      p25_lap_time_ms: 91100,
      p75_lap_time_ms: 91400,
    },
  ],
  compound_lap_index_aggregates: [
    {
      compound: "SOFT",
      lap_in_stint_index: 1,
      lap_count: 2,
      lap_times_ms: [90150, 91150],
      median_lap_time_ms: 90650,
    },
  ],
  raw_lap_times_by_compound: [
    {
      driver_id: "VER",
      compound: "SOFT",
      lap_count: 3,
      lap_times_ms: [90150, 90300, 90450],
      lap_in_stint_indices: [1, 2, 3],
      median_lap_time_ms: 90300,
    },
  ],
};

describe("useTyrePerformance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch when sessionId is missing", () => {
    const spy = vi.spyOn(client, "getTyrePerformance");

    const { result } = renderHook(() => useTyrePerformance(undefined));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.tyrePerformance).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches the tyre-performance endpoint with the given sessionId", async () => {
    const spy = vi.spyOn(client, "getTyrePerformance").mockResolvedValue(sampleResponse);

    renderHook(() => useTyrePerformance("2024_test_grand_prix_race"));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("2024_test_grand_prix_race"));
  });

  it("exposes the returned data unmodified", async () => {
    vi.spyOn(client, "getTyrePerformance").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() => useTyrePerformance("2024_test_grand_prix_race"));

    await waitFor(() => expect(result.current.tyrePerformance).toEqual(sampleResponse));
    expect(result.current.error).toBeNull();
  });

  it("reports loading true while the request is in flight, then false", async () => {
    let resolveRequest: (value: client.TyrePerformanceResponse) => void = () => {};
    vi.spyOn(client, "getTyrePerformance").mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useTyrePerformance("2024_test_grand_prix_race"));

    expect(result.current.loading).toBe(true);

    resolveRequest(sampleResponse);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "getTyrePerformance").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useTyrePerformance("2024_test_grand_prix_race"));

    await waitFor(() => expect(result.current.error).toBe("Could not load tyre performance."));
    expect(result.current.loading).toBe(false);
    expect(result.current.tyrePerformance).toBeNull();
  });

  it("refetches when sessionId changes", async () => {
    const spy = vi.spyOn(client, "getTyrePerformance").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => useTyrePerformance(sessionId),
      { initialProps: { sessionId: "2024_test_grand_prix_race" } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ sessionId: "2024_other_grand_prix_race" });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith("2024_other_grand_prix_race");
  });
});
