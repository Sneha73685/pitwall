import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { StintComparisonPage } from "./StintComparisonPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/stints/compare" element={<StintComparisonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const drivers: client.Driver[] = [
  { driver_id: "VER", driver_number: 1, full_name: "Max Verstappen", team_name: "Red Bull Racing" },
  { driver_id: "HAM", driver_number: 44, full_name: "Lewis Hamilton", team_name: "Mercedes" },
];

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
    pit_stops: [{ driver_id: "VER", stop_number: 1, lap_number: 10, pit_lane_time_seconds: 24.1 }],
    ...overrides,
  };
}

const sampleComparison: client.StintComparisonResponse = {
  a: side(),
  b: side({ driver_id: "HAM", session_id: "2024_second_race" }),
  warnings: [],
};

describe("StintComparisonPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
  });

  it("shows 'No session selected' and no driver pickers when no session params are given", () => {
    renderAt("/stints/compare");

    expect(screen.getAllByText("No session selected")).toHaveLength(2);
    expect(screen.queryByLabelText("Driver")).not.toBeInTheDocument();
  });

  it("shows the driver pickers once both sessions are selected via query params", async () => {
    renderAt("/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race");

    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );
  });

  it("fetches and renders the comparison once both drivers are selected", async () => {
    vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
    renderAt("/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    const driverSelects = screen.getAllByLabelText("Driver");
    fireEvent.change(driverSelects[0], { target: { value: "VER" } });
    fireEvent.change(driverSelects[1], { target: { value: "HAM" } });

    await waitFor(() =>
      expect(screen.getByTestId("stint-comparison-side-a")).toHaveTextContent("VER"),
    );
    expect(screen.getByTestId("stint-comparison-side-b")).toHaveTextContent("HAM");
    // Each side's own stint/pit-stop data is rendered via the reused,
    // unmodified components -- StintTimeline's segment and PitStopList's row.
    expect(
      within(screen.getByTestId("stint-comparison-side-a")).getByTestId("stint-segment-1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("stint-comparison-side-a")).getByTestId("pit-stop-row-1"),
    ).toBeInTheDocument();
  });

  it("populates Session A and Driver A from an initial deep-link (StrategyPage's Compare Strategy link)", async () => {
    vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
    renderAt(
      "/stints/compare?sessionA=2024_test_grand_prix_race&driverA=VER&sessionB=2024_second_race",
    );

    await waitFor(() => expect(screen.getAllByLabelText("Driver")[0]).toHaveValue("VER"));

    fireEvent.change(screen.getAllByLabelText("Driver")[1], { target: { value: "HAM" } });

    await waitFor(() =>
      expect(screen.getByTestId("stint-comparison-side-a")).toHaveTextContent("VER"),
    );
  });

  it("shows an error message when the comparison fetch fails", async () => {
    vi.spyOn(client, "compareStints").mockRejectedValue(new Error("network error"));
    renderAt("/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    const driverSelects = screen.getAllByLabelText("Driver");
    fireEvent.change(driverSelects[0], { target: { value: "VER" } });
    fireEvent.change(driverSelects[1], { target: { value: "HAM" } });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load stint comparison/i),
    );
  });

  it("renders each warning as a status chip, distinguishable by side (A/B independence)", async () => {
    vi.spyOn(client, "compareStints").mockResolvedValue({
      ...sampleComparison,
      b: side({ driver_id: "HAM", session_id: "2024_second_race", stints: [] }),
      warnings: [
        { code: "different_circuit", detail: "Session A is at X, Session B is at Y" },
        { code: "no_stint_data_b", detail: "No stint data for HAM" },
      ],
    });
    renderAt("/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    const driverSelects = screen.getAllByLabelText("Driver");
    fireEvent.change(driverSelects[0], { target: { value: "VER" } });
    fireEvent.change(driverSelects[1], { target: { value: "HAM" } });

    const warnings = await screen.findByTestId("stint-comparison-warnings");
    expect(within(warnings).getByText(/different circuits/i)).toBeInTheDocument();
    expect(within(warnings).getByText(/no stint data.*session b/i)).toBeInTheDocument();
    // Comparison is still fully rendered -- disclose, don't block.
    expect(screen.getByTestId("stint-comparison-side-a")).toBeInTheDocument();
    expect(screen.getByTestId("stint-comparison-side-b")).toBeInTheDocument();
  });

  it("shows no warnings banner when the warnings list is empty", async () => {
    vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
    renderAt("/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    const driverSelects = screen.getAllByLabelText("Driver");
    fireEvent.change(driverSelects[0], { target: { value: "VER" } });
    fireEvent.change(driverSelects[1], { target: { value: "HAM" } });

    await waitFor(() => expect(screen.getByTestId("stint-comparison-side-a")).toBeInTheDocument());
    expect(screen.queryByTestId("stint-comparison-warnings")).not.toBeInTheDocument();
  });

  it("shows an empty-strategy state on a side with no stint data, without erroring", async () => {
    vi.spyOn(client, "compareStints").mockResolvedValue({
      a: side(),
      b: side({ driver_id: "HAM", session_id: "2024_second_race", stints: [], pit_stops: [] }),
      warnings: [{ code: "no_stint_data_b", detail: null }],
    });
    renderAt("/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race");
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    const driverSelects = screen.getAllByLabelText("Driver");
    fireEvent.change(driverSelects[0], { target: { value: "VER" } });
    fireEvent.change(driverSelects[1], { target: { value: "HAM" } });

    const sideB = await screen.findByTestId("stint-comparison-side-b");
    expect(within(sideB).getAllByText(/no stint data available/i)).toHaveLength(2);
    expect(within(sideB).getByText(/no pit stops recorded/i)).toBeInTheDocument();
  });
});
