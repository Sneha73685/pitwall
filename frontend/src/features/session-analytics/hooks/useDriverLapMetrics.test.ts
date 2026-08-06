import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useDriverLapMetrics } from "./useDriverLapMetrics";

function lapsResponse(driver: string): client.DriverLapsResponse {
  return {
    session_id: "2024_testcircuit_race",
    driver,
    laps: [
      {
        lap_number: 1,
        lap_time_ms: 90000,
        is_valid: true,
        exclusion_reason: null,
        is_outlier: false,
        delta_to_theoretical_best_ms: 500,
        delta_to_own_median_ms: 0,
        full_throttle_pct: 60,
        brake_event_count: 4,
      },
    ],
    warnings: [],
  };
}

describe("useDriverLapMetrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch and returns null metrics when driver is undefined (lazy fetch)", () => {
    const spy = vi.spyOn(client, "getDriverLapMetrics");

    const { result } = renderHook(() => useDriverLapMetrics("2024_testcircuit_race", undefined));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.metrics).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches once a driver is selected", async () => {
    const spy = vi.spyOn(client, "getDriverLapMetrics").mockResolvedValue(lapsResponse("VER"));

    const { result } = renderHook(() => useDriverLapMetrics("2024_testcircuit_race", "VER"));

    await waitFor(() => expect(result.current.metrics).toEqual(lapsResponse("VER")));
    expect(spy).toHaveBeenCalledWith("2024_testcircuit_race", "VER");
  });

  it("does not refetch when re-selecting a driver already cached", async () => {
    const spy = vi
      .spyOn(client, "getDriverLapMetrics")
      .mockImplementation((_sessionId, driver) => Promise.resolve(lapsResponse(driver)));

    const { result, rerender } = renderHook(
      ({ driver }: { driver: string }) => useDriverLapMetrics("2024_testcircuit_race", driver),
      { initialProps: { driver: "VER" } },
    );
    await waitFor(() => expect(result.current.metrics).toEqual(lapsResponse("VER")));
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ driver: "HAM" });
    await waitFor(() => expect(result.current.metrics).toEqual(lapsResponse("HAM")));
    expect(spy).toHaveBeenCalledTimes(2);

    // Re-selecting VER: already cached, must not trigger a third fetch.
    rerender({ driver: "VER" });
    await waitFor(() => expect(result.current.metrics).toEqual(lapsResponse("VER")));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "getDriverLapMetrics").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useDriverLapMetrics("2024_testcircuit_race", "VER"));

    await waitFor(() => expect(result.current.error).toBe("Could not load driver lap metrics."));
    expect(result.current.metrics).toBeNull();
  });
});
