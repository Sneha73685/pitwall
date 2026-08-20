import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import * as client from "../../api/client";
import { DriverSeasonPaceTrendPage } from "./DriverSeasonPaceTrendPage";

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
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/drivers/:driverId/seasons/:season/pace-trend"
          element={<DriverSeasonPaceTrendPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleTrend: client.SeasonPaceTrendResponse = {
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
    {
      session_id: "2024_saudi_arabian_grand_prix_race",
      event_id: "2024_saudi_arabian_grand_prix",
      event_name: "Saudi Arabian Grand Prix",
      round_number: 2,
      session_date: "2024-03-09T15:00:00+00:00",
      valid_lap_count: 0,
      best_lap_ms: null,
      median_lap_ms: null,
      theoretical_best_lap_ms: null,
      consistency_ms: null,
      consistency_cv: null,
    },
  ],
};

describe("DriverSeasonPaceTrendPage", () => {
  const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(fakeChart.resize).mockClear();
    vi.mocked(fakeChart.dispose).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
  });

  it("shows a loading state while the trend is being fetched", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockReturnValue(new Promise(() => {}));

    renderAt("/drivers/VER/seasons/2024/pace-trend");

    expect(await screen.findByText(/loading pace trend/i)).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockRejectedValue(new Error("network error"));

    renderAt("/drivers/VER/seasons/2024/pace-trend");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load pace trend/i),
    );
  });

  it("shows an empty state when the season has no matching sessions", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue({
      driver_id: "VER",
      season: 2024,
      session_type: "race",
      points: [],
    });

    renderAt("/drivers/VER/seasons/2024/pace-trend");

    await waitFor(() => expect(screen.getByText(/no race sessions found/i)).toBeInTheDocument());
  });

  it("renders the chart with the fetched trend points once loaded", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/pace-trend");

    await waitFor(() => expect(screen.getByTestId("season-pace-trend-chart")).toBeInTheDocument());
    const [appliedOption] = fakeChart.setOption.mock.calls[0] as [
      { xAxis: { data: string[] } },
      boolean,
    ];
    expect(appliedOption.xAxis.data).toEqual([
      "R1 Bahrain Grand Prix",
      "R2 Saudi Arabian Grand Prix",
    ]);
  });

  it("fetches with the default race session type when none is given", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/pace-trend");

    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "race"));
  });

  it("refetches with the selected session type when the filter changes", async () => {
    const spy = vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/pace-trend");
    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "race"));

    fireEvent.change(screen.getByLabelText("Session type"), { target: { value: "qualifying" } });

    await waitFor(() => expect(spy).toHaveBeenCalledWith("VER", 2024, "qualifying"));
  });

  it("shows a back link using the fromSession query param", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/pace-trend?fromSession=2023_monza_race");

    const backLink = await screen.findByRole("link", { name: /back to driver/i });
    expect(backLink).toHaveAttribute("href", "/sessions/2023_monza_race/drivers/VER");
  });

  it("falls back to the trend's own first session for the back link when fromSession is absent", async () => {
    vi.spyOn(client, "getDriverSeasonPaceTrend").mockResolvedValue(sampleTrend);

    renderAt("/drivers/VER/seasons/2024/pace-trend");

    const backLink = await screen.findByRole("link", { name: /back to driver/i });
    expect(backLink).toHaveAttribute("href", "/sessions/2024_bahrain_grand_prix_race/drivers/VER");
  });
});
