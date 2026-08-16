import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useDriverSeasonPaceTrend } from "./useDriverSeasonPaceTrend";

const sampleResponse: client.SeasonPaceTrendResponse = {
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
      valid_lap_count: 5,
      best_lap_ms: 90000,
      median_lap_ms: 91000,
      theoretical_best_lap_ms: 89500,
      consistency_ms: 120,
      consistency_cv: 0.001,
    },
  ],
};

describe("useDriverSeasonPaceTrend", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch and returns null when driverId or season is missing", () => {
    const spy = vi.spyOn(client, "getDriverSeasonPaceTrend");

    const { result } = renderHook(() => useDriverSeasonPaceTrend(undefined, 2024, "race"));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.trend).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches and returns the trend once driverId and season are provided", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() => useDriverSeasonPaceTrend("VER", 2024, "race"));

    await waitFor(() => expect(result.current.trend).toEqual(sampleResponse));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("calls getDriverSeasonPaceTrend with the given driver/season/session type", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleResponse);

    renderHook(() => useDriverSeasonPaceTrend("VER", 2024, "qualifying"));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "qualifying"));
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useDriverSeasonPaceTrend("VER", 2024, "race"));

    await waitFor(() => expect(result.current.error).toBe("Could not load pace trend."));
    expect(result.current.trend).toBeNull();
  });

  it("refetches when the session-type filter changes", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ sessionType }: { sessionType: client.SessionType }) =>
        useDriverSeasonPaceTrend("VER", 2024, sessionType),
      { initialProps: { sessionType: "race" as client.SessionType } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ sessionType: "qualifying" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(spy).toHaveBeenLastCalledWith("VER", 2024, "qualifying");
  });

  it("clears the previous trend before a new fetch settles", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleResponse);

    const { result, rerender } = renderHook(
      ({ sessionType }: { sessionType: client.SessionType }) =>
        useDriverSeasonPaceTrend("VER", 2024, sessionType),
      { initialProps: { sessionType: "race" as client.SessionType } },
    );
    await waitFor(() => expect(result.current.trend).toEqual(sampleResponse));

    spy.mockImplementation(() => new Promise(() => {}));
    rerender({ sessionType: "qualifying" });

    expect(result.current.trend).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
