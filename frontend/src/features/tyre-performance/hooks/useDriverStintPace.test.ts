import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useDriverStintPace } from "./useDriverStintPace";

const sampleResponse: client.DriverStintPaceResponse = {
  session_id: "2024_test_grand_prix_race",
  driver_id: "VER",
  laps: [
    {
      lap_number: 1,
      lap_time_seconds: 90.15,
      compound: "SOFT",
      stint_number: 1,
      lap_in_stint_index: 1,
      is_valid: true,
      is_in_lap: false,
      is_out_lap: false,
      is_trend_eligible: true,
    },
    {
      lap_number: 4,
      lap_time_seconds: 90.6,
      compound: "SOFT",
      stint_number: 1,
      lap_in_stint_index: 4,
      is_valid: true,
      is_in_lap: true,
      is_out_lap: false,
      is_trend_eligible: false,
    },
  ],
  stints: [
    {
      stint_number: 1,
      compound: "SOFT",
      start_lap: 1,
      end_lap: 4,
      tyre_life_at_start: 1,
      eligible_lap_count: 3,
      consistency_ms: 122.47,
      consistency_cv: 0.0014,
    },
  ],
};

describe("useDriverStintPace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch when sessionId is missing", () => {
    const spy = vi.spyOn(client, "getDriverStintPace");

    const { result } = renderHook(() => useDriverStintPace(undefined, "VER"));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.stintPace).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when driverId is missing", () => {
    const spy = vi.spyOn(client, "getDriverStintPace");

    const { result } = renderHook(() => useDriverStintPace("2024_test_grand_prix_race", undefined));

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.stintPace).toBeNull();
  });

  it("fetches the stint-pace endpoint with the given sessionId and driverId", async () => {
    const spy = vi.spyOn(client, "getDriverStintPace").mockResolvedValue(sampleResponse);

    renderHook(() => useDriverStintPace("2024_test_grand_prix_race", "VER"));

    await waitFor(() => expect(spy).toHaveBeenCalledWith("2024_test_grand_prix_race", "VER"));
  });

  it("exposes the returned data unmodified", async () => {
    vi.spyOn(client, "getDriverStintPace").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() => useDriverStintPace("2024_test_grand_prix_race", "VER"));

    await waitFor(() => expect(result.current.stintPace).toEqual(sampleResponse));
    expect(result.current.error).toBeNull();
  });

  it("reports loading true while the request is in flight, then false", async () => {
    let resolveRequest: (value: client.DriverStintPaceResponse) => void = () => {};
    vi.spyOn(client, "getDriverStintPace").mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const { result } = renderHook(() => useDriverStintPace("2024_test_grand_prix_race", "VER"));

    expect(result.current.loading).toBe(true);

    resolveRequest(sampleResponse);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "getDriverStintPace").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useDriverStintPace("2024_test_grand_prix_race", "VER"));

    await waitFor(() => expect(result.current.error).toBe("Could not load stint pace."));
    expect(result.current.loading).toBe(false);
    expect(result.current.stintPace).toBeNull();
  });

  it("refetches when sessionId changes", async () => {
    const spy = vi.spyOn(client, "getDriverStintPace").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => useDriverStintPace(sessionId, "VER"),
      { initialProps: { sessionId: "2024_test_grand_prix_race" } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ sessionId: "2024_other_grand_prix_race" });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith("2024_other_grand_prix_race", "VER");
  });

  it("refetches when driverId changes", async () => {
    const spy = vi.spyOn(client, "getDriverStintPace").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ driverId }: { driverId: string }) =>
        useDriverStintPace("2024_test_grand_prix_race", driverId),
      { initialProps: { driverId: "VER" } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ driverId: "HAM" });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith("2024_test_grand_prix_race", "HAM");
  });
});
