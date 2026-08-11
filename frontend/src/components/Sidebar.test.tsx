import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useSelectionStore } from "../state/selectionStore";
import { Sidebar } from "./Sidebar";

const DEFAULTS = { season: null, eventId: null, sessionId: null, driverId: null, lapId: null };

function renderSidebar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  beforeEach(() => {
    useSelectionStore.setState({ ...DEFAULTS });
  });

  it("always shows the Seasons root link", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Seasons" })).toBeInTheDocument();
  });

  it("does not show Events or Sessions links when nothing is selected (M12 Phase 5)", () => {
    renderSidebar();

    expect(screen.queryByRole("link", { name: "Events" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sessions" })).not.toBeInTheDocument();
  });

  it("shows the Events link once a season is selected", () => {
    useSelectionStore.setState({ ...DEFAULTS, season: 2024 });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/seasons/2024");
    expect(screen.queryByRole("link", { name: "Sessions" })).not.toBeInTheDocument();
  });

  it("shows the Sessions link once an event is also selected", () => {
    useSelectionStore.setState({ ...DEFAULTS, season: 2024, eventId: "2024_bahrain_grand_prix" });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute(
      "href",
      "/seasons/2024/events/2024_bahrain_grand_prix",
    );
  });

  it("still shows Drivers once a session is selected, alongside the season/event trail", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Drivers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Events" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sessions" })).toBeInTheDocument();
  });
});
