import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { DriverLapPicker } from "./DriverLapPicker";

const drivers: client.Driver[] = [
  { driver_id: "VER", driver_number: 1, full_name: "Max Verstappen", team_name: "Red Bull Racing" },
  { driver_id: "LEC", driver_number: 16, full_name: "Charles Leclerc", team_name: "Ferrari" },
];

const verLaps: client.Lap[] = [
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
  {
    driver_id: "VER",
    lap_number: 2,
    lap_time_seconds: null,
    sector_1_seconds: null,
    sector_2_seconds: null,
    sector_3_seconds: null,
    is_personal_best: false,
    is_accurate: false,
  },
];

describe("DriverLapPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists drivers on mount", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);

    render(<DriverLapPicker sessionId="2023_monza_race" label="Lap A" onSelect={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /max verstappen/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Lap A" })).toBeInTheDocument();
  });

  it("loads that driver's laps once a driver is selected", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    const listLapsSpy = vi.spyOn(client, "listLaps").mockResolvedValue(verLaps);

    render(<DriverLapPicker sessionId="2023_monza_race" label="Lap A" onSelect={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: /max verstappen/i }));

    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "VER" } });

    await waitFor(() => expect(listLapsSpy).toHaveBeenCalledWith("2023_monza_race", "VER"));
    expect(await screen.findByRole("option", { name: /lap 1.*91\.234s.*pb/i })).toBeInTheDocument();
  });

  it("fires onSelect with the driver and lap once both are chosen", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    vi.spyOn(client, "listLaps").mockResolvedValue(verLaps);
    const onSelect = vi.fn();

    render(<DriverLapPicker sessionId="2023_monza_race" label="Lap A" onSelect={onSelect} />);
    await waitFor(() => screen.getByRole("option", { name: /max verstappen/i }));

    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "VER" } });
    await screen.findByRole("option", { name: /lap 1/i });
    fireEvent.change(screen.getByLabelText("Lap"), { target: { value: "1" } });

    expect(onSelect).toHaveBeenLastCalledWith({ driverId: "VER", lapNumber: 1 });
  });

  it("resets the lap selection and calls onSelect(null) when the driver changes", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    vi.spyOn(client, "listLaps").mockResolvedValue(verLaps);
    const onSelect = vi.fn();

    render(<DriverLapPicker sessionId="2023_monza_race" label="Lap A" onSelect={onSelect} />);
    await waitFor(() => screen.getByRole("option", { name: /max verstappen/i }));

    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "VER" } });
    await screen.findByRole("option", { name: /lap 1/i });
    fireEvent.change(screen.getByLabelText("Lap"), { target: { value: "1" } });
    expect(onSelect).toHaveBeenLastCalledWith({ driverId: "VER", lapNumber: 1 });

    onSelect.mockClear();
    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "LEC" } });

    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(screen.getByLabelText("Lap")).toHaveValue("");
    // Switching driver also re-fetches laps for LEC; let that settle within
    // act() rather than leaving it pending when the test ends.
    await waitFor(() => expect(client.listLaps).toHaveBeenLastCalledWith("2023_monza_race", "LEC"));
  });

  it("disables the lap select until a driver is chosen", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);

    render(<DriverLapPicker sessionId="2023_monza_race" label="Lap A" onSelect={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: /max verstappen/i }));

    expect(screen.getByLabelText("Lap")).toBeDisabled();
  });

  it("shows an error message when loading drivers fails", async () => {
    vi.spyOn(client, "listDrivers").mockRejectedValue(new Error("network error"));

    render(<DriverLapPicker sessionId="2023_monza_race" label="Lap B" onSelect={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load drivers for lap b/i),
    );
  });
});
