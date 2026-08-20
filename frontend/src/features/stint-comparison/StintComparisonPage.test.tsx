import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { StintComparisonPage } from "./StintComparisonPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/stints/compare" element={<StintComparisonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// M24 (docs/m24-design-review.md §11): mirrors ComparisonPage.test.tsx's
// identical probe -- see that file's comment for why plain MemoryRouter is
// used here instead of a createMemoryRouter/RouterProvider data router.
function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <div
      data-testid="location-probe"
      data-search={location.search}
      data-nav-type={navigationType}
    />
  );
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      go back (test helper)
    </button>
  );
}

function renderWithProbe(initialEntries: string | string[]) {
  const entries = Array.isArray(initialEntries) ? initialEntries : [initialEntries];
  return render(
    <MemoryRouter initialEntries={entries}>
      <LocationProbe />
      <BackButton />
      <Routes>
        <Route path="/stints/compare" element={<StintComparisonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function currentSearch() {
  return screen.getByTestId("location-probe").dataset.search ?? "";
}

function currentNavType() {
  return screen.getByTestId("location-probe").dataset.navType;
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

  // --- M24 URL persistence/shareability (docs/m24-design-review.md) ---

  describe("M24 URL persistence/shareability", () => {
    it("resolves the comparison from a fully specified URL with no interaction", async () => {
      vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
      renderAt(
        "/stints/compare?sessionA=2024_test_grand_prix_race&driverA=VER" +
          "&sessionB=2024_second_race&driverB=HAM",
      );

      await waitFor(() =>
        expect(screen.getByTestId("stint-comparison-side-a")).toHaveTextContent("VER"),
      );
      expect(screen.getByTestId("stint-comparison-side-b")).toHaveTextContent("HAM");
      expect(client.compareStints).toHaveBeenCalledWith({
        sessionIdA: "2024_test_grand_prix_race",
        driverA: "VER",
        sessionIdB: "2024_second_race",
        driverB: "HAM",
      });
    });

    it("writes each resolved driver selection to the URL as it's picked, with replace semantics", async () => {
      vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
      renderWithProbe(
        "/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race",
      );
      await waitFor(() =>
        expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
      );

      const driverSelects = screen.getAllByLabelText("Driver");
      await act(async () => {
        fireEvent.change(driverSelects[0], { target: { value: "VER" } });
      });
      expect(currentSearch()).toContain("driverA=VER");
      expect(currentNavType()).toBe("REPLACE");

      await act(async () => {
        fireEvent.change(driverSelects[1], { target: { value: "HAM" } });
      });
      expect(currentSearch()).toContain("driverB=HAM");
      expect(currentNavType()).toBe("REPLACE");
      expect(currentSearch()).toContain("driverA=VER");
    });

    it("clears the stale driver param for a side when its session changes", async () => {
      vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
      vi.spyOn(client, "listSeasons").mockResolvedValue([{ season: 2024, event_count: 1 }]);
      vi.spyOn(client, "listEventsForSeason").mockResolvedValue([
        {
          event_id: "2024_spa_grand_prix",
          season: 2024,
          event_name: "Belgian Grand Prix",
          round_number: 12,
          location: "Spa",
          country: "Belgium",
          session_types: ["race"],
          session_count: 1,
        },
      ]);
      vi.spyOn(client, "listSessionsForEvent").mockResolvedValue([
        {
          session_id: "2024_spa_grand_prix_race",
          season: 2024,
          event_name: "Belgian Grand Prix",
          round_number: 12,
          location: "Spa",
          country: "Belgium",
          session_type: "race",
          session_date: null,
          event_id: "2024_spa_grand_prix",
          has_telemetry: true,
        },
      ]);
      renderWithProbe(
        "/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race",
      );
      await waitFor(() =>
        expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
      );

      fireEvent.change(screen.getAllByLabelText("Driver")[1], { target: { value: "HAM" } });
      expect(currentSearch()).toContain("driverB=HAM");

      fireEvent.click(screen.getAllByRole("button", { name: /change/i })[1]);
      const dialog = await screen.findByRole("dialog", { name: /select session b/i });
      fireEvent.click(await within(dialog).findByText(/2024 — 1 event/i));
      fireEvent.click(await within(dialog).findByText("Belgian Grand Prix"));
      fireEvent.click(await screen.findByText("Race"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      expect(currentSearch()).toContain("sessionB=2024_spa_grand_prix_race");
      expect(currentSearch()).not.toContain("driverB=");
      expect(currentNavType()).toBe("REPLACE");
    });

    it("treats an empty query value the same as an absent one", () => {
      renderAt("/stints/compare?sessionA=&sessionB=2024_second_race");

      expect(screen.getByText("No session selected")).toBeInTheDocument();
      expect(screen.queryByLabelText("Driver")).not.toBeInTheDocument();
    });

    it("preserves an unrelated query parameter across a picker-driven URL write", async () => {
      vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
      renderWithProbe(
        "/stints/compare?sessionA=2024_test_grand_prix_race&sessionB=2024_second_race&utm_source=test",
      );
      await waitFor(() =>
        expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
      );

      fireEvent.change(screen.getAllByLabelText("Driver")[0], { target: { value: "VER" } });

      expect(currentSearch()).toContain("utm_source=test");
      expect(currentSearch()).toContain("driverA=VER");
    });

    it("re-resolves the comparison across a session-changing Back navigation", async () => {
      vi.spyOn(client, "compareStints").mockResolvedValue(sampleComparison);
      renderWithProbe([
        "/stints/compare?sessionA=2024_test_grand_prix_race&driverA=VER" +
          "&sessionB=2024_second_race&driverB=HAM",
        "/stints/compare",
      ]);
      await waitFor(() => expect(screen.getAllByText("No session selected")).toHaveLength(2));

      fireEvent.click(screen.getByRole("button", { name: /go back \(test helper\)/i }));

      await waitFor(() =>
        expect(screen.getByTestId("stint-comparison-side-a")).toHaveTextContent("VER"),
      );
      expect(screen.getByTestId("stint-comparison-side-b")).toHaveTextContent("HAM");
    });
  });
});
