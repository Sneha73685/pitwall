import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useSessionAnalytics } from "./useSessionAnalytics";

const sampleResponse: client.SessionAnalyticsResponse = {
  session_id: "2024_testcircuit_race",
  session_lap_count: 5,
  drivers: [
    {
      driver: "VER",
      valid_lap_count: 5,
      best_lap_ms: 89500,
      theoretical_best_lap_ms: 89500,
      theoretical_best_delta_ms: 0,
      median_lap_ms: 90000,
      consistency_ms: 506.0,
      consistency_cv: 0.0056,
      full_throttle_pct: 62.1,
      outlier_lap_count: 1,
      lap_times_ms: [90000, 89500, 90200, 91000, 89800],
    },
  ],
  warnings: [],
};

describe("useSessionAnalytics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch and returns null when sessionId is missing", () => {
    const spy = vi.spyOn(client, "getSessionAnalytics");

    const { result } = renderHook(() => useSessionAnalytics(undefined));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.analytics).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches and returns the analytics payload once a sessionId is provided", async () => {
    vi.spyOn(client, "getSessionAnalytics").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() => useSessionAnalytics("2024_testcircuit_race"));

    await waitFor(() => expect(result.current.analytics).toEqual(sampleResponse));
    expect(result.current.error).toBeNull();
  });

  it("calls getSessionAnalytics with the given sessionId", async () => {
    const spy = vi.spyOn(client, "getSessionAnalytics").mockResolvedValue(sampleResponse);

    renderHook(() => useSessionAnalytics("2024_testcircuit_race"));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("2024_testcircuit_race"));
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "getSessionAnalytics").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useSessionAnalytics("2024_testcircuit_race"));

    await waitFor(() => expect(result.current.error).toBe("Could not load session analytics."));
    expect(result.current.analytics).toBeNull();
  });

  it("refetches when the sessionId changes", async () => {
    const spy = vi.spyOn(client, "getSessionAnalytics").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => useSessionAnalytics(sessionId),
      { initialProps: { sessionId: "2024_testcircuit_race" } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ sessionId: "2024_othercircuit_race" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(spy).toHaveBeenLastCalledWith("2024_othercircuit_race");
  });
});
