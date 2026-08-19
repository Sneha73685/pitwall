import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import * as client from "../../api/client";
import { DriverPaceTrendComparisonPage } from "./DriverPaceTrendComparisonPage";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/drivers/pace-trend/compare" element={<DriverPaceTrendComparisonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// M25 (docs/m25-design-review.md §11.2): mirrors the LocationProbe pattern
// docs/m24-design-review.md's own test files established -- asserts on the
// resulting search string and replace-vs-push semantics without touching
// the page itself.
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

function renderWithProbe(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <LocationProbe />
      <Routes>
        <Route path="/drivers/pace-trend/compare" element={<DriverPaceTrendComparisonPage />} />
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

const seasons: client.SeasonSummary[] = [
  { season: 2022, event_count: 22 },
  { season: 2023, event_count: 22 },
  { season: 2024, event_count: 24 },
];

function trendSide(driverId: string, season: number): client.SeasonPaceTrendResponse {
  return {
    driver_id: driverId,
    season,
    session_type: "race",
    points: [
      {
        session_id: `${season}_round_1_race`,
        event_id: `${season}_round_1`,
        event_name: "Round 1 Grand Prix",
        round_number: 1,
        session_date: `${season}-03-02T15:00:00+00:00`,
        valid_lap_count: 5,
        best_lap_ms: 90000,
        median_lap_ms: 91000,
        theoretical_best_lap_ms: 89500,
        consistency_ms: 120,
        consistency_cv: 0.001,
      },
    ],
  };
}

const sampleComparison: client.SeasonPaceTrendComparisonResponse = {
  a: trendSide("VER", 2023),
  b: trendSide("PER", 2023),
};

describe("DriverPaceTrendComparisonPage", () => {
  const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(fakeChart.resize).mockClear();
    vi.mocked(fakeChart.dispose).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
  });

  // --- Initial load / URL as source of truth --------------------------------

  it("shows empty form fields and no fetch when no query params are given", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends");
    renderAt("/drivers/pace-trend/compare");

    await waitFor(() => expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)).toHaveLength(2));
    expect(spy).not.toHaveBeenCalled();
  });

  it("resolves the comparison from a fully specified URL with no interaction", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);
    renderAt("/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    await waitFor(() =>
      expect(screen.getByTestId("pace-trend-comparison-side-a")).toHaveTextContent("VER — 2023"),
    );
    expect(screen.getByTestId("pace-trend-comparison-side-b")).toHaveTextContent("PER — 2023");
    expect(spy).toHaveBeenCalledWith({
      driverA: "VER",
      seasonA: 2023,
      driverB: "PER",
      seasonB: 2023,
      sessionType: "race",
    });
  });

  it("pre-fills the form inputs from the URL on mount", async () => {
    vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);
    renderAt("/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    await waitFor(() =>
      expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)[0]).toHaveValue("VER"),
    );
    expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)[1]).toHaveValue("PER");
  });

  // --- Typing does not write the URL live ------------------------------------

  it("does not update the URL while typing into the driver inputs", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends");
    renderWithProbe("/drivers/pace-trend/compare");
    await waitFor(() => expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)).toHaveLength(2));

    const driverInputs = screen.getAllByPlaceholderText(/e\.g\. VER/i);
    fireEvent.change(driverInputs[0], { target: { value: "V" } });
    fireEvent.change(driverInputs[0], { target: { value: "VE" } });
    fireEvent.change(driverInputs[0], { target: { value: "VER" } });

    expect(currentSearch()).toBe("");
    expect(spy).not.toHaveBeenCalled();
  });

  // --- Compare submit commits atomically --------------------------------------

  it("writes the complete comparison state to the URL in one replace navigation on Compare", async () => {
    vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);
    renderWithProbe("/drivers/pace-trend/compare");
    await waitFor(() => expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)).toHaveLength(2));

    const driverInputs = screen.getAllByPlaceholderText(/e\.g\. VER/i);
    const seasonSelects = screen.getAllByLabelText("Season");
    fireEvent.change(driverInputs[0], { target: { value: "VER" } });
    fireEvent.change(seasonSelects[0], { target: { value: "2023" } });
    fireEvent.change(driverInputs[1], { target: { value: "PER" } });
    fireEvent.change(seasonSelects[1], { target: { value: "2023" } });

    expect(currentSearch()).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /compare/i }));

    expect(currentSearch()).toContain("driverA=VER");
    expect(currentSearch()).toContain("seasonA=2023");
    expect(currentSearch()).toContain("driverB=PER");
    expect(currentSearch()).toContain("seasonB=2023");
    expect(currentNavType()).toBe("REPLACE");

    // Flush the fetch the URL write triggers, so the mocked promise's
    // resolution doesn't land in an unwrapped act() gap after this test
    // returns.
    await waitFor(() =>
      expect(screen.getByTestId("pace-trend-comparison-side-a")).toBeInTheDocument(),
    );
  });

  // --- Refresh / deep-link reproduction ---------------------------------------

  it("reproduces an identical comparison on refresh (re-mount at the same URL)", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);
    const url = "/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023";
    renderAt(url);
    await waitFor(() =>
      expect(screen.getByTestId("pace-trend-comparison-side-a")).toBeInTheDocument(),
    );

    spy.mockClear();
    renderAt(url);

    await waitFor(() =>
      expect(screen.getAllByTestId("pace-trend-comparison-side-a")).toHaveLength(1),
    );
    expect(spy).toHaveBeenCalledWith({
      driverA: "VER",
      seasonA: 2023,
      driverB: "PER",
      seasonB: 2023,
      sessionType: "race",
    });
  });

  // --- Independent sides / labeling --------------------------------------------

  it("renders both trend datasets independently with correct A/B driver + season labels", async () => {
    vi.spyOn(client, "comparePaceTrends").mockResolvedValue({
      a: trendSide("VER", 2023),
      b: trendSide("VER", 2022),
    });
    renderAt("/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=VER&seasonB=2022");

    await waitFor(() =>
      expect(screen.getByTestId("pace-trend-comparison-side-a")).toHaveTextContent("VER — 2023"),
    );
    expect(screen.getByTestId("pace-trend-comparison-side-b")).toHaveTextContent("VER — 2022");
    expect(screen.getAllByTestId("season-pace-trend-chart")).toHaveLength(2);
  });

  // --- session_type filtering (live, no Compare click needed) ------------------

  it("refetches immediately with the selected session type, without a Compare click", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);
    renderAt("/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        driverA: "VER",
        seasonA: 2023,
        driverB: "PER",
        seasonB: 2023,
        sessionType: "race",
      }),
    );

    fireEvent.change(screen.getByLabelText("Session type"), { target: { value: "qualifying" } });

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({
        driverA: "VER",
        seasonA: 2023,
        driverB: "PER",
        seasonB: 2023,
        sessionType: "qualifying",
      }),
    );
  });

  // --- Missing/unknown driver, per existing trend-route semantics ----------------

  it("shows an empty state for a side with no matching sessions, without affecting the other side", async () => {
    vi.spyOn(client, "comparePaceTrends").mockResolvedValue({
      a: trendSide("VER", 2023),
      b: { driver_id: "ZZZ", season: 2023, session_type: "race", points: [] },
    });
    renderAt("/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=ZZZ&seasonB=2023");

    await waitFor(() =>
      expect(screen.getByTestId("pace-trend-comparison-side-b")).toHaveTextContent(
        /no sessions found for zzz/i,
      ),
    );
    expect(screen.getByTestId("pace-trend-comparison-side-a")).toHaveTextContent("VER — 2023");
    expect(screen.getAllByTestId("season-pace-trend-chart")).toHaveLength(1);
  });

  // --- Loading / error states ----------------------------------------------------

  it("shows a loading state while the comparison is being fetched", async () => {
    vi.spyOn(client, "comparePaceTrends").mockReturnValue(new Promise(() => {}));

    renderAt("/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    expect(await screen.findByText(/loading pace trend comparison/i)).toBeInTheDocument();
  });

  it("shows an error message when the comparison request fails", async () => {
    vi.spyOn(client, "comparePaceTrends").mockRejectedValue(new Error("network error"));

    renderAt("/drivers/pace-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load pace trend comparison/i),
    );
  });

  // --- No N² fan-out ---------------------------------------------------------------

  it("fetches the comparison exactly once per resolved parameter set (no per-keystroke fan-out)", async () => {
    const spy = vi.spyOn(client, "comparePaceTrends").mockResolvedValue(sampleComparison);
    renderWithProbe("/drivers/pace-trend/compare");
    await waitFor(() => expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)).toHaveLength(2));

    const driverInputs = screen.getAllByPlaceholderText(/e\.g\. VER/i);
    const seasonSelects = screen.getAllByLabelText("Season");
    fireEvent.change(driverInputs[0], { target: { value: "V" } });
    fireEvent.change(driverInputs[0], { target: { value: "VE" } });
    fireEvent.change(driverInputs[0], { target: { value: "VER" } });
    fireEvent.change(seasonSelects[0], { target: { value: "2023" } });
    fireEvent.change(driverInputs[1], { target: { value: "PER" } });
    fireEvent.change(seasonSelects[1], { target: { value: "2023" } });

    expect(spy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /compare/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });
});
