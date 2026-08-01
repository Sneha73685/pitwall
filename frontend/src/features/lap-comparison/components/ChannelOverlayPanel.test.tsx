import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import type { LapComparisonResponse } from "../../../api/client";
import { useComparisonStore, type ComparisonChannelKey } from "../comparisonStore";
import { ChannelOverlayPanel } from "./ChannelOverlayPanel";

vi.mock("echarts/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("echarts/core")>();
  return {
    ...actual,
    use: vi.fn(),
    init: vi.fn(),
  };
});

function comparison(): LapComparisonResponse {
  return {
    session_id: "2023_monza_race",
    lap_a: {
      driver_id: "VER",
      lap_number: 1,
      lap_time_seconds: 91.234,
      sector_1_seconds: 30.1,
      sector_2_seconds: 31.0,
      sector_3_seconds: 30.134,
      is_personal_best: true,
      is_accurate: true,
    },
    lap_b: {
      driver_id: "LEC",
      lap_number: 1,
      lap_time_seconds: 91.546,
      sector_1_seconds: 30.3,
      sector_2_seconds: 31.1,
      sector_3_seconds: 30.146,
      is_personal_best: true,
      is_accurate: true,
    },
    compared_distance_m: 100,
    distance_m: [0, 100],
    delta_ms: [0, 150],
    channels: {
      speed_kph: { a: [200, 250], b: [195, 245] },
      throttle_pct: { a: [100, 100], b: [100, 90] },
    },
    sectors: [],
    warnings: [],
  };
}

describe("ChannelOverlayPanel", () => {
  const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

  beforeEach(() => {
    useComparisonStore.setState({
      hoverDistance: null,
      visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
    });
    vi.mocked(fakeChart.setOption).mockClear();
    vi.mocked(fakeChart.resize).mockClear();
    vi.mocked(fakeChart.dispose).mockClear();
    vi.mocked(echarts.init).mockClear();
    vi.mocked(echarts.init).mockReturnValue(fakeChart as unknown as echarts.ECharts);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a toggle for every channel", () => {
    render(<ChannelOverlayPanel comparison={comparison()} />);

    for (const label of ["Speed", "Throttle", "Brake", "RPM", "Gear", "DRS"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
  });

  it("has only Speed checked by default and renders one grid for it", () => {
    render(<ChannelOverlayPanel comparison={comparison()} />);

    expect(screen.getByRole("checkbox", { name: "Speed" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Throttle" })).not.toBeChecked();
    const option = fakeChart.setOption.mock.calls.at(-1)![0];
    expect(option.series).toHaveLength(2); // Speed (A) + Speed (B)
  });

  it("adds a grid/series pair once a channel's toggle is checked", () => {
    render(<ChannelOverlayPanel comparison={comparison()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Throttle" }));

    const option = fakeChart.setOption.mock.calls.at(-1)![0];
    const names = (option.series as { name: string }[]).map((series) => series.name);
    expect(names).toEqual(["Speed (A)", "Speed (B)", "Throttle (A)", "Throttle (B)"]);
  });

  it("removes a grid/series pair once a channel's toggle is unchecked", () => {
    render(<ChannelOverlayPanel comparison={comparison()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Speed" }));

    const option = fakeChart.setOption.mock.calls.at(-1)![0];
    expect(option.series).toHaveLength(0);
  });

  it("passes both laps' values through to the chart, not just lap A", () => {
    render(<ChannelOverlayPanel comparison={comparison()} />);

    const option = fakeChart.setOption.mock.calls.at(-1)![0];
    const speedB = (option.series as { name: string; data: [number, number][] }[]).find(
      (series) => series.name === "Speed (B)",
    )!;
    expect(speedB.data).toEqual([
      [0, 195],
      [100, 245],
    ]);
  });
});
