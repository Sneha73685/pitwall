import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../api/client";
import { DriverTyreTrendComparisonPage } from "./DriverTyreTrendComparisonPage";

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/drivers/tyre-trend/compare" element={<DriverTyreTrendComparisonPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// M26 (docs/m26-design-review.md §9.2): mirrors DriverPaceTrendComparisonPage.test.tsx's
// own LocationProbe pattern -- see that file's comment for the original
// (docs/m24-design-review.md) rationale.
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
        <Route path="/drivers/tyre-trend/compare" element={<DriverTyreTrendComparisonPage />} />
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

function trendSide(driverId: string, season: number): client.SeasonTyreTrendResponse {
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
        strategy: {
          driver_id: driverId,
          stint_count: 2,
          compound_sequence: ["SOFT", "HARD"],
          stint_lengths: [20, 35],
        },
      },
    ],
  };
}

const sampleComparison: client.SeasonTyreTrendComparisonResponse = {
  a: trendSide("VER", 2023),
  b: trendSide("PER", 2023),
};

describe("DriverTyreTrendComparisonPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
  });

  // --- Initial load / URL as source of truth --------------------------------

  it("shows empty form fields and no fetch when no query params are given", async () => {
    const spy = vi.spyOn(client, "compareTyreTrends");
    renderAt("/drivers/tyre-trend/compare");

    await waitFor(() => expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)).toHaveLength(2));
    expect(spy).not.toHaveBeenCalled();
  });

  it("resolves the comparison from a fully specified URL with no interaction", async () => {
    const spy = vi.spyOn(client, "compareTyreTrends").mockResolvedValue(sampleComparison);
    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    await waitFor(() =>
      expect(screen.getByTestId("tyre-trend-comparison-side-a")).toHaveTextContent("VER — 2023"),
    );
    expect(screen.getByTestId("tyre-trend-comparison-side-b")).toHaveTextContent("PER — 2023");
    expect(spy).toHaveBeenCalledWith({
      driverA: "VER",
      seasonA: 2023,
      driverB: "PER",
      seasonB: 2023,
      sessionType: "race",
    });
  });

  it("pre-fills the form inputs from the URL on mount", async () => {
    vi.spyOn(client, "compareTyreTrends").mockResolvedValue(sampleComparison);
    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    await waitFor(() =>
      expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)[0]).toHaveValue("VER"),
    );
    expect(screen.getAllByPlaceholderText(/e\.g\. VER/i)[1]).toHaveValue("PER");
  });

  // --- Typing does not write the URL live ------------------------------------

  it("does not update the URL while typing into the driver inputs", async () => {
    const spy = vi.spyOn(client, "compareTyreTrends");
    renderWithProbe("/drivers/tyre-trend/compare");
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
    vi.spyOn(client, "compareTyreTrends").mockResolvedValue(sampleComparison);
    renderWithProbe("/drivers/tyre-trend/compare");
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
      expect(screen.getByTestId("tyre-trend-comparison-side-a")).toBeInTheDocument(),
    );
  });

  // --- Refresh / deep-link reproduction ---------------------------------------

  it("reproduces an identical comparison on refresh (re-mount at the same URL)", async () => {
    const spy = vi.spyOn(client, "compareTyreTrends").mockResolvedValue(sampleComparison);
    const url = "/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023";
    renderAt(url);
    await waitFor(() =>
      expect(screen.getByTestId("tyre-trend-comparison-side-a")).toBeInTheDocument(),
    );

    spy.mockClear();
    renderAt(url);

    await waitFor(() =>
      expect(screen.getAllByTestId("tyre-trend-comparison-side-a")).toHaveLength(1),
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

  it("renders both trend lists independently with correct A/B driver + season labels", async () => {
    vi.spyOn(client, "compareTyreTrends").mockResolvedValue({
      a: trendSide("VER", 2023),
      b: trendSide("VER", 2022),
    });
    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=VER&seasonB=2022");

    await waitFor(() =>
      expect(screen.getByTestId("tyre-trend-comparison-side-a")).toHaveTextContent("VER — 2023"),
    );
    expect(screen.getByTestId("tyre-trend-comparison-side-b")).toHaveTextContent("VER — 2022");
    expect(screen.getAllByLabelText("Season tyre/stint-strategy trend")).toHaveLength(2);
  });

  it("does not align, merge, or otherwise combine the two lists", async () => {
    vi.spyOn(client, "compareTyreTrends").mockResolvedValue({
      a: {
        driver_id: "VER",
        season: 2023,
        session_type: "race",
        points: [
          trendSide("VER", 2023).points[0],
          { ...trendSide("VER", 2023).points[0], session_id: "2023_round_2_race", round_number: 2 },
        ],
      },
      b: trendSide("PER", 2023),
    });
    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    await waitFor(() =>
      expect(
        screen.getByTestId("tyre-trend-comparison-side-a").querySelectorAll("li"),
      ).toHaveLength(2),
    );
    // Side B has one point -- independent list lengths, no padding/alignment.
    expect(screen.getByTestId("tyre-trend-comparison-side-b").querySelectorAll("li")).toHaveLength(
      1,
    );
  });

  // --- session_type filtering (live, no Compare click needed) ------------------

  it("refetches immediately with the selected session type, without a Compare click", async () => {
    const spy = vi.spyOn(client, "compareTyreTrends").mockResolvedValue(sampleComparison);
    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");
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
    vi.spyOn(client, "compareTyreTrends").mockResolvedValue({
      a: trendSide("VER", 2023),
      b: { driver_id: "ZZZ", season: 2023, session_type: "race", points: [] },
    });
    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=ZZZ&seasonB=2023");

    await waitFor(() =>
      expect(screen.getByTestId("tyre-trend-comparison-side-b")).toHaveTextContent(
        /no sessions found for zzz/i,
      ),
    );
    expect(screen.getByTestId("tyre-trend-comparison-side-a")).toHaveTextContent("VER — 2023");
    expect(screen.getAllByLabelText("Season tyre/stint-strategy trend")).toHaveLength(1);
  });

  // --- Loading / error states ----------------------------------------------------

  it("shows a loading state while the comparison is being fetched", async () => {
    vi.spyOn(client, "compareTyreTrends").mockReturnValue(new Promise(() => {}));

    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    expect(await screen.findByText(/loading tyre trend comparison/i)).toBeInTheDocument();
  });

  it("shows an error message when the comparison request fails", async () => {
    vi.spyOn(client, "compareTyreTrends").mockRejectedValue(new Error("network error"));

    renderAt("/drivers/tyre-trend/compare?driverA=VER&seasonA=2023&driverB=PER&seasonB=2023");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load tyre trend comparison/i),
    );
  });

  // --- No N² fan-out ---------------------------------------------------------------

  it("fetches the comparison exactly once per resolved parameter set (no per-keystroke fan-out)", async () => {
    const spy = vi.spyOn(client, "compareTyreTrends").mockResolvedValue(sampleComparison);
    renderWithProbe("/drivers/tyre-trend/compare");
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
