import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useSessionPitStops } from "./useSessionPitStops";

const sampleResponse: client.PitStop[] = [
  { driver_id: "VER", stop_number: 1, lap_number: 15, pit_lane_time_seconds: 23.886 },
  // Real 2024 Bahrain GP outlier (design note §8.7, §23) -- descriptive
  // analytics surfaces this, never filters it out as an "outlier."
  { driver_id: "BOT", stop_number: 2, lap_number: 30, pit_lane_time_seconds: 74.951 },
];

describe("useSessionPitStops", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch when sessionId is missing", () => {
    const spy = vi.spyOn(client, "getPitStops");

    const { result } = renderHook(() => useSessionPitStops(undefined));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.pitStops).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches every driver's pit stops for the session, with no driverId filter", async () => {
    const spy = vi.spyOn(client, "getPitStops").mockResolvedValue(sampleResponse);

    renderHook(() => useSessionPitStops("2024_bahrain_grand_prix_race"));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("2024_bahrain_grand_prix_race"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("exposes the returned data unmodified, including a genuine large outlier", async () => {
    vi.spyOn(client, "getPitStops").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() => useSessionPitStops("2024_bahrain_grand_prix_race"));

    await waitFor(() => expect(result.current.pitStops).toEqual(sampleResponse));
    expect(
      result.current.pitStops.find((stop) => stop.driver_id === "BOT")?.pit_lane_time_seconds,
    ).toBe(74.951);
    expect(result.current.error).toBeNull();
  });

  it("reports loading true while the request is in flight, then false", async () => {
    let resolveRequest: (value: client.PitStop[]) => void = () => {};
    vi.spyOn(client, "getPitStops").mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useSessionPitStops("2024_bahrain_grand_prix_race"));

    expect(result.current.loading).toBe(true);

    resolveRequest(sampleResponse);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "getPitStops").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useSessionPitStops("2024_bahrain_grand_prix_race"));

    await waitFor(() => expect(result.current.error).toBe("Could not load pit stops."));
    expect(result.current.loading).toBe(false);
    expect(result.current.pitStops).toEqual([]);
  });

  it("refetches when sessionId changes", async () => {
    const spy = vi.spyOn(client, "getPitStops").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => useSessionPitStops(sessionId),
      { initialProps: { sessionId: "2024_bahrain_grand_prix_race" } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ sessionId: "2024_other_grand_prix_race" });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith("2024_other_grand_prix_race");
  });
});
