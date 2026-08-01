import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { LapPairSelector } from "./LapPairSelector";

const drivers: client.Driver[] = [
  { driver_id: "VER", driver_number: 1, full_name: "Max Verstappen", team_name: "Red Bull Racing" },
];

const laps: client.Lap[] = [
  {
    driver_id: "VER",
    lap_number: 1,
    lap_time_seconds: 91.234,
    sector_1_seconds: 30.1,
    sector_2_seconds: 31.0,
    sector_3_seconds: 30.134,
    is_personal_best: true,
    is_accurate: true,
  },
];

describe("LapPairSelector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    vi.spyOn(client, "listLaps").mockResolvedValue(laps);
  });

  it("renders two labeled pickers, Lap A and Lap B", async () => {
    render(<LapPairSelector sessionId="2023_monza_race" onSelectA={vi.fn()} onSelectB={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );
    expect(screen.getByRole("heading", { name: "Lap A" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lap B" })).toBeInTheDocument();
  });

  it("fires onSelectA only from the Lap A picker", async () => {
    const onSelectA = vi.fn();
    const onSelectB = vi.fn();
    render(
      <LapPairSelector sessionId="2023_monza_race" onSelectA={onSelectA} onSelectB={onSelectB} />,
    );
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    const [driverSelectA] = screen.getAllByLabelText("Driver");
    fireEvent.change(driverSelectA, { target: { value: "VER" } });
    await screen.findAllByRole("option", { name: /lap 1/i });
    const [lapSelectA] = screen.getAllByLabelText("Lap");
    fireEvent.change(lapSelectA, { target: { value: "1" } });

    expect(onSelectA).toHaveBeenLastCalledWith({ driverId: "VER", lapNumber: 1 });
    expect(onSelectB).not.toHaveBeenCalledWith({ driverId: "VER", lapNumber: 1 });
  });

  it("fires onSelectB only from the Lap B picker", async () => {
    const onSelectA = vi.fn();
    const onSelectB = vi.fn();
    render(
      <LapPairSelector sessionId="2023_monza_race" onSelectA={onSelectA} onSelectB={onSelectB} />,
    );
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: /max verstappen/i })).toHaveLength(2),
    );

    const [, driverSelectB] = screen.getAllByLabelText("Driver");
    fireEvent.change(driverSelectB, { target: { value: "VER" } });
    await screen.findAllByRole("option", { name: /lap 1/i });
    const [, lapSelectB] = screen.getAllByLabelText("Lap");
    fireEvent.change(lapSelectB, { target: { value: "1" } });

    expect(onSelectB).toHaveBeenLastCalledWith({ driverId: "VER", lapNumber: 1 });
    expect(onSelectA).not.toHaveBeenCalledWith({ driverId: "VER", lapNumber: 1 });
  });
});
