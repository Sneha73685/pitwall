import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useComparisonStore, type ComparisonChannelKey } from "../comparisonStore";
import { ChannelOverlayPanel } from "./ChannelOverlayPanel";

describe("ChannelOverlayPanel", () => {
  beforeEach(() => {
    useComparisonStore.setState({
      hoverDistance: null,
      visibleChannels: new Set<ComparisonChannelKey>(["speed_kph"]),
    });
  });

  it("renders a toggle for every channel", () => {
    render(<ChannelOverlayPanel />);

    for (const label of ["Speed", "Throttle", "Brake", "RPM", "Gear", "DRS"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeInTheDocument();
    }
  });

  it("has only Speed checked and only a Speed placeholder by default", () => {
    render(<ChannelOverlayPanel />);

    expect(screen.getByRole("checkbox", { name: "Speed" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Throttle" })).not.toBeChecked();
    expect(screen.getByTestId("channel-placeholder-speed_kph")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-placeholder-throttle_pct")).not.toBeInTheDocument();
  });

  it("shows a channel's placeholder once its toggle is checked", () => {
    render(<ChannelOverlayPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Throttle" }));

    expect(screen.getByTestId("channel-placeholder-throttle_pct")).toBeInTheDocument();
  });

  it("hides a channel's placeholder once its toggle is unchecked", () => {
    render(<ChannelOverlayPanel />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Speed" }));

    expect(screen.queryByTestId("channel-placeholder-speed_kph")).not.toBeInTheDocument();
  });

  it("does not render any chart -- shell only, per Phase 6 scope", () => {
    render(<ChannelOverlayPanel />);

    expect(document.querySelector("canvas")).not.toBeInTheDocument();
    expect(screen.getByTestId("channel-placeholder-speed_kph")).toHaveTextContent("Phase 7");
  });
});
