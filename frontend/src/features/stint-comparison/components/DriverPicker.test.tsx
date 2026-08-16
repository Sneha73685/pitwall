import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { DriverPicker } from "./DriverPicker";

const drivers: client.Driver[] = [
  { driver_id: "VER", driver_number: 1, full_name: "Max Verstappen", team_name: "Red Bull Racing" },
  { driver_id: "LEC", driver_number: 16, full_name: "Charles Leclerc", team_name: "Ferrari" },
];

describe("DriverPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists drivers on mount", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);

    render(<DriverPicker sessionId="2023_monza_race" label="Driver A" onSelect={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /max verstappen/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Driver A" })).toBeInTheDocument();
  });

  it("fires onSelect with the driver id once chosen -- no lap dimension", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    const onSelect = vi.fn();

    render(<DriverPicker sessionId="2023_monza_race" label="Driver A" onSelect={onSelect} />);
    await waitFor(() => screen.getByRole("option", { name: /max verstappen/i }));

    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "VER" } });

    expect(onSelect).toHaveBeenLastCalledWith("VER");
    // Confirms there is genuinely no lap <select> anywhere on this picker.
    expect(screen.queryByLabelText("Lap")).not.toBeInTheDocument();
  });

  it("fires onSelect(null) when the selection is cleared back to the placeholder", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    const onSelect = vi.fn();

    render(<DriverPicker sessionId="2023_monza_race" label="Driver A" onSelect={onSelect} />);
    await waitFor(() => screen.getByRole("option", { name: /max verstappen/i }));

    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "VER" } });
    onSelect.mockClear();
    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "" } });

    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("shows an error message when loading drivers fails", async () => {
    vi.spyOn(client, "listDrivers").mockRejectedValue(new Error("network error"));

    render(<DriverPicker sessionId="2023_monza_race" label="Driver B" onSelect={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load drivers for driver b/i),
    );
  });

  it("pre-selects the driver from initialDriverId once the roster has loaded, and fires onSelect", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    const onSelect = vi.fn();

    render(
      <DriverPicker
        sessionId="2023_monza_race"
        label="Driver A"
        onSelect={onSelect}
        initialDriverId="VER"
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Driver")).toHaveValue("VER"));
    expect(onSelect).toHaveBeenLastCalledWith("VER");
  });

  it("does not override a later user choice back to the initial driver", async () => {
    vi.spyOn(client, "listDrivers").mockResolvedValue(drivers);
    const onSelect = vi.fn();

    render(
      <DriverPicker
        sessionId="2023_monza_race"
        label="Driver A"
        onSelect={onSelect}
        initialDriverId="VER"
      />,
    );
    await waitFor(() => expect(onSelect).toHaveBeenLastCalledWith("VER"));

    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "LEC" } });

    expect(onSelect).toHaveBeenLastCalledWith("LEC");
    expect(screen.getByLabelText("Driver")).toHaveValue("LEC");
  });
});
