import { beforeEach, describe, expect, it } from "vitest";
import { useSelectionStore } from "./selectionStore";

const DEFAULTS = { season: null, eventId: null, sessionId: null, driverId: null, lapId: null };

describe("useSelectionStore", () => {
  beforeEach(() => {
    useSelectionStore.setState({ ...DEFAULTS });
  });

  it("defaults to nothing selected", () => {
    expect(useSelectionStore.getState()).toMatchObject(DEFAULTS);
  });

  it("setSeason sets season and clears event/session/driver/lap", () => {
    useSelectionStore.setState({
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
      driverId: "VER",
      lapId: "1",
    });

    useSelectionStore.getState().setSeason(2024);

    expect(useSelectionStore.getState()).toMatchObject({
      season: 2024,
      eventId: null,
      sessionId: null,
      driverId: null,
      lapId: null,
    });
  });

  it("setEvent sets eventId and clears session/driver/lap, but not season", () => {
    useSelectionStore.setState({
      season: 2024,
      sessionId: "2024_bahrain_grand_prix_race",
      driverId: "VER",
      lapId: "1",
    });

    useSelectionStore.getState().setEvent("2024_bahrain_grand_prix");

    expect(useSelectionStore.getState()).toMatchObject({
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: null,
      driverId: null,
      lapId: null,
    });
  });

  it("setSession clears driver/lap but preserves season/eventId (existing M1-era behavior, unchanged)", () => {
    useSelectionStore.setState({
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      driverId: "VER",
      lapId: "1",
    });

    useSelectionStore.getState().setSession("2024_bahrain_grand_prix_race");

    expect(useSelectionStore.getState()).toMatchObject({
      season: 2024,
      eventId: "2024_bahrain_grand_prix",
      sessionId: "2024_bahrain_grand_prix_race",
      driverId: null,
      lapId: null,
    });
  });
});
