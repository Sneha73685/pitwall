import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useSelectionStore } from "../state/selectionStore";
import { Sidebar } from "./Sidebar";

const DEFAULTS = { season: null, eventId: null, sessionId: null, driverId: null, lapId: null };

function renderSidebar() {
  return render(
    <MemoryRouter>
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

  // M14 (docs/m14-design-review.md §11): relabeled from "Lap Comparison" so
  // it reads as an invitation to pick a second session, since the
  // destination page has supported cross-session comparison since M13.
  it("labels the comparison link 'Compare Sessions' once a session is selected", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Compare Sessions" })).toHaveAttribute(
      "href",
      "/laps/compare?sessionA=2024_bahrain_grand_prix_race",
    );
    expect(screen.queryByRole("link", { name: "Lap Comparison" })).not.toBeInTheDocument();
  });

  // M27 (docs/m27-design-review.md §10): gated on driverId alone -- not
  // season, since /stints/compare has no season concept in its URL
  // contract -- seeding both sessionA and driverA (mirrors StrategyPage's
  // own "Compare Strategy" link, the only pre-existing entry point to this
  // route).
  it("shows the Compare Stints link once a driver is selected, seeding session and driver", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
      driverId: "VER",
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Compare Stints" })).toHaveAttribute(
      "href",
      "/stints/compare?sessionA=2024_bahrain_grand_prix_race&driverA=VER",
    );
  });

  it("does not show the Compare Stints link before a driver is selected", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
    });

    renderSidebar();

    expect(screen.queryByRole("link", { name: "Compare Stints" })).not.toBeInTheDocument();
  });

  // Confirms season is genuinely not part of the gating condition (unlike
  // the two trend-comparison links below) -- the link still appears with
  // season explicitly absent, as long as a driver is selected.
  it("shows the Compare Stints link even when season is not set", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: null,
      sessionId: "2024_bahrain_grand_prix_race",
      driverId: "VER",
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Compare Stints" })).toHaveAttribute(
      "href",
      "/stints/compare?sessionA=2024_bahrain_grand_prix_race&driverA=VER",
    );
  });

  // M25 (docs/m25-design-review.md §8/§15): gated on driverId && season,
  // not sessionId -- season is the dimension this comparison spans, so the
  // link should appear as soon as a driver is selected, not only once a
  // lap is also picked.
  it("shows the Compare Pace Trends link once a driver is selected, seeding only side A", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
      driverId: "VER",
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Compare Pace Trends" })).toHaveAttribute(
      "href",
      "/drivers/pace-trend/compare?driverA=VER&seasonA=2024",
    );
  });

  it("does not show the Compare Pace Trends link before a driver is selected", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
    });

    renderSidebar();

    expect(screen.queryByRole("link", { name: "Compare Pace Trends" })).not.toBeInTheDocument();
  });

  // M26 (docs/m26-design-review.md §7): identical gating/seeding pattern
  // to M25's own "Compare Pace Trends" link.
  it("shows the Compare Tyre Trends link once a driver is selected, seeding only side A", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
      driverId: "VER",
    });

    renderSidebar();

    expect(screen.getByRole("link", { name: "Compare Tyre Trends" })).toHaveAttribute(
      "href",
      "/drivers/tyre-trend/compare?driverA=VER&seasonA=2024",
    );
  });

  it("does not show the Compare Tyre Trends link before a driver is selected", () => {
    useSelectionStore.setState({
      ...DEFAULTS,
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
    });

    renderSidebar();

    expect(screen.queryByRole("link", { name: "Compare Tyre Trends" })).not.toBeInTheDocument();
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
