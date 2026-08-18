import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useDriverSeasonTyreTrend } from "./useDriverSeasonTyreTrend";

const sampleResponse: client.SeasonTyreTrendResponse = {
  driver_id: "VER",
  season: 2024,
  session_type: "race",
  points: [
    {
      session_id: "2024_bahrain_grand_prix_race",
      event_id: "2024_bahrain_grand_prix",
      event_name: "Bahrain Grand Prix",
      round_number: 1,
      session_date: "2024-03-02T15:00:00+00:00",
      strategy: {
        driver_id: "VER",
        stint_count: 2,
        compound_sequence: ["SOFT", "HARD"],
        stint_lengths: [15, 40],
      },
    },
  ],
};

describe("useDriverSeasonTyreTrend", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch and returns null when driverId or season is missing", () => {
    const spy = vi.spyOn(client, "getDriverSeasonTyreTrend");

    const { result } = renderHook(() => useDriverSeasonTyreTrend(undefined, 2024, "race"));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.trend).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches and returns the trend once driverId and season are provided", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() => useDriverSeasonTyreTrend("VER", 2024, "race"));

    await waitFor(() => expect(result.current.trend).toEqual(sampleResponse));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("calls getDriverSeasonTyreTrend with the given driver/season/session type", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleResponse);

    renderHook(() => useDriverSeasonTyreTrend("VER", 2024, "qualifying"));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "qualifying"));
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "getDriverSeasonTyreTrend").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useDriverSeasonTyreTrend("VER", 2024, "race"));

    await waitFor(() => expect(result.current.error).toBe("Could not load tyre trend."));
    expect(result.current.trend).toBeNull();
  });

  it("refetches when the session-type filter changes", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ sessionType }: { sessionType: client.SessionType }) =>
        useDriverSeasonTyreTrend("VER", 2024, sessionType),
      { initialProps: { sessionType: "race" as client.SessionType } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ sessionType: "qualifying" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(spy).toHaveBeenLastCalledWith("VER", 2024, "qualifying");
  });

  it("clears the previous trend before a new fetch settles", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonTyreTrend").mockResolvedValue(sampleResponse);

    const { result, rerender } = renderHook(
      ({ sessionType }: { sessionType: client.SessionType }) =>
        useDriverSeasonTyreTrend("VER", 2024, sessionType),
      { initialProps: { sessionType: "race" as client.SessionType } },
    );
    await waitFor(() => expect(result.current.trend).toEqual(sampleResponse));

    spy.mockImplementation(() => new Promise(() => {}));
    rerender({ sessionType: "qualifying" });

    expect(result.current.trend).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
