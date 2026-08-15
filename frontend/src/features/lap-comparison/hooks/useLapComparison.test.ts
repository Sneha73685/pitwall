import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useLapComparison } from "./useLapComparison";

const sampleResponse: client.LapComparisonResponse = {
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
  compared_distance_m: 100.0,
  distance_m: [0, 50, 100],
  delta_ms: [0, 50, 100],
  channels: {
    speed_kph: { a: [200, 220, 250], b: [195, 215, 245] },
  },
  sectors: [{ sector: 1, delta_ms: 50, faster: "a" }],
  warnings: [],
};

describe("useLapComparison", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch and returns null when required params are missing", () => {
    const spy = vi.spyOn(client, "compareLaps");

    const { result } = renderHook(() =>
      useLapComparison("2023_monza_race", undefined, undefined, "2023_monza_race", "LEC", 1),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.comparison).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches and returns the comparison once every param is provided", async () => {
    vi.spyOn(client, "compareLaps").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() =>
      useLapComparison("2023_monza_race", "VER", 1, "2023_monza_race", "LEC", 1),
    );

    await waitFor(() => expect(result.current.comparison).toEqual(sampleResponse));
    expect(result.current.error).toBeNull();
  });

  it("calls compareLaps with the given sessions and params, including resolution", async () => {
    const spy = vi.spyOn(client, "compareLaps").mockResolvedValue(sampleResponse);

    renderHook(() => useLapComparison("2023_monza_race", "VER", 1, "2024_spa_race", "LEC", 1, 500));

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        sessionIdA: "2023_monza_race",
        driverA: "VER",
        lapA: 1,
        sessionIdB: "2024_spa_race",
        driverB: "LEC",
        lapB: 1,
        resolution: 500,
      }),
    );
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "compareLaps").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() =>
      useLapComparison("2023_monza_race", "VER", 1, "2023_monza_race", "LEC", 1),
    );

    await waitFor(() => expect(result.current.error).toBe("Could not load lap comparison."));
    expect(result.current.comparison).toBeNull();
  });

  it("refetches when the selected laps change", async () => {
    const spy = vi.spyOn(client, "compareLaps").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ lapB }: { lapB: number }) =>
        useLapComparison("2023_monza_race", "VER", 1, "2023_monza_race", "LEC", lapB),
      { initialProps: { lapB: 1 } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ lapB: 2 });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(spy).toHaveBeenLastCalledWith({
      sessionIdA: "2023_monza_race",
      driverA: "VER",
      lapA: 1,
      sessionIdB: "2023_monza_race",
      driverB: "LEC",
      lapB: 2,
      resolution: undefined,
    });
  });
});
