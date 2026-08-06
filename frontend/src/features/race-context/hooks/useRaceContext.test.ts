import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useRaceContext } from "./useRaceContext";

const sampleStints: client.Stint[] = [
  { stint_number: 1, compound: "SOFT", start_lap: 1, end_lap: 17, tyre_life_at_start: 4 },
];

const samplePitStops: client.PitStop[] = [
  { driver_id: "VER", stop_number: 1, lap_number: 17, pit_lane_time_seconds: 25.088 },
];

describe("useRaceContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch when sessionId or driverId is missing", () => {
    const stintsSpy = vi.spyOn(client, "getStints");
    const pitStopsSpy = vi.spyOn(client, "getPitStops");

    const { result } = renderHook(() => useRaceContext(undefined, "VER"));

    expect(stintsSpy).not.toHaveBeenCalled();
    expect(pitStopsSpy).not.toHaveBeenCalled();
    expect(result.current.stints).toEqual([]);
    expect(result.current.pitStops).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches both stints and pit stops once session and driver are provided", async () => {
    const stintsSpy = vi.spyOn(client, "getStints").mockResolvedValue(sampleStints);
    const pitStopsSpy = vi.spyOn(client, "getPitStops").mockResolvedValue(samplePitStops);

    const { result } = renderHook(() => useRaceContext("2023_monza_race", "VER"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.stints).toEqual(sampleStints));
    expect(result.current.pitStops).toEqual(samplePitStops);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(stintsSpy).toHaveBeenCalledWith("2023_monza_race", "VER");
    expect(pitStopsSpy).toHaveBeenCalledWith("2023_monza_race", "VER");
  });

  it("surfaces a combined error message when either request fails", async () => {
    vi.spyOn(client, "getStints").mockRejectedValue(new Error("network error"));
    vi.spyOn(client, "getPitStops").mockResolvedValue(samplePitStops);

    const { result } = renderHook(() => useRaceContext("2023_monza_race", "VER"));

    await waitFor(() => expect(result.current.error).toBe("Could not load race strategy."));
    expect(result.current.loading).toBe(false);
  });

  it("refetches when the driver changes", async () => {
    const stintsSpy = vi.spyOn(client, "getStints").mockResolvedValue(sampleStints);
    vi.spyOn(client, "getPitStops").mockResolvedValue(samplePitStops);

    const { rerender } = renderHook(
      ({ driverId }: { driverId: string }) => useRaceContext("2023_monza_race", driverId),
      { initialProps: { driverId: "VER" } },
    );
    await waitFor(() => expect(stintsSpy).toHaveBeenCalledTimes(1));

    rerender({ driverId: "LEC" });

    await waitFor(() => expect(stintsSpy).toHaveBeenCalledTimes(2));
    expect(stintsSpy).toHaveBeenLastCalledWith("2023_monza_race", "LEC");
  });
});
