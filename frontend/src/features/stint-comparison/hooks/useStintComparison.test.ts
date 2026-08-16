import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { useStintComparison } from "./useStintComparison";

function side(
  overrides: Partial<client.DriverStintComparisonSide> = {},
): client.DriverStintComparisonSide {
  return {
    session_id: "2024_test_grand_prix_race",
    driver_id: "VER",
    strategy: {
      driver_id: "VER",
      stint_count: 1,
      compound_sequence: ["SOFT"],
      stint_lengths: [10],
    },
    stints: [
      {
        stint_number: 1,
        compound: "SOFT",
        start_lap: 1,
        end_lap: 10,
        tyre_life_at_start: 1,
        eligible_lap_count: 8,
        consistency_ms: 120.5,
        consistency_cv: 0.01,
      },
    ],
    pit_stops: [],
    ...overrides,
  };
}

const sampleResponse: client.StintComparisonResponse = {
  a: side(),
  b: side({ driver_id: "HAM" }),
  warnings: [],
};

describe("useStintComparison", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch and returns null when required params are missing", () => {
    const spy = vi.spyOn(client, "compareStints");

    const { result } = renderHook(() =>
      useStintComparison(
        "2024_test_grand_prix_race",
        undefined,
        "2024_test_grand_prix_race",
        "HAM",
      ),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.comparison).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("fetches and returns the comparison once every param is provided", async () => {
    vi.spyOn(client, "compareStints").mockResolvedValue(sampleResponse);

    const { result } = renderHook(() =>
      useStintComparison("2024_test_grand_prix_race", "VER", "2024_test_grand_prix_race", "HAM"),
    );

    await waitFor(() => expect(result.current.comparison).toEqual(sampleResponse));
    expect(result.current.error).toBeNull();
  });

  it("calls compareStints with the given sessions/drivers -- no lap or resolution params", async () => {
    const spy = vi.spyOn(client, "compareStints").mockResolvedValue(sampleResponse);

    renderHook(() =>
      useStintComparison("2024_test_grand_prix_race", "VER", "2024_spa_race", "LEC"),
    );

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        sessionIdA: "2024_test_grand_prix_race",
        driverA: "VER",
        sessionIdB: "2024_spa_race",
        driverB: "LEC",
      }),
    );
  });

  it("surfaces an error message when the request fails", async () => {
    vi.spyOn(client, "compareStints").mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() =>
      useStintComparison("2024_test_grand_prix_race", "VER", "2024_test_grand_prix_race", "HAM"),
    );

    await waitFor(() => expect(result.current.error).toBe("Could not load stint comparison."));
    expect(result.current.comparison).toBeNull();
  });

  it("refetches when the selected driver changes", async () => {
    const spy = vi.spyOn(client, "compareStints").mockResolvedValue(sampleResponse);

    const { rerender } = renderHook(
      ({ driverB }: { driverB: string }) =>
        useStintComparison(
          "2024_test_grand_prix_race",
          "VER",
          "2024_test_grand_prix_race",
          driverB,
        ),
      { initialProps: { driverB: "HAM" } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    rerender({ driverB: "LEC" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    expect(spy).toHaveBeenLastCalledWith({
      sessionIdA: "2024_test_grand_prix_race",
      driverA: "VER",
      sessionIdB: "2024_test_grand_prix_race",
      driverB: "LEC",
    });
  });

  it("clears the previous comparison before a new fetch settles", async () => {
    const spy = vi.spyOn(client, "compareStints").mockResolvedValue(sampleResponse);

    const { result, rerender } = renderHook(
      ({ driverB }: { driverB: string }) =>
        useStintComparison(
          "2024_test_grand_prix_race",
          "VER",
          "2024_test_grand_prix_race",
          driverB,
        ),
      { initialProps: { driverB: "HAM" } },
    );
    await waitFor(() => expect(result.current.comparison).toEqual(sampleResponse));

    spy.mockImplementation(() => new Promise(() => {}));
    rerender({ driverB: "LEC" });

    expect(result.current.comparison).toBeNull();
  });
});
