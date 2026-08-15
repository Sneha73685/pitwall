import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../../api/client";
import { SessionPicker } from "./SessionPicker";

const seasons: client.SeasonSummary[] = [{ season: 2024, event_count: 2 }];

const events: client.EventSummary[] = [
  {
    event_id: "2024_belgian_grand_prix",
    season: 2024,
    event_name: "Belgian Grand Prix",
    round_number: 12,
    location: "Spa",
    country: "Belgium",
    session_types: ["race"],
    session_count: 1,
  },
];

const sessions: client.Session[] = [
  {
    session_id: "2024_belgian_grand_prix_race",
    season: 2024,
    event_name: "Belgian Grand Prix",
    round_number: 12,
    location: "Spa",
    country: "Belgium",
    session_type: "race",
    session_date: null,
    event_id: "2024_belgian_grand_prix",
    has_telemetry: true,
  },
];

describe("SessionPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state before seasons have arrived", () => {
    vi.spyOn(client, "listSeasons").mockReturnValue(new Promise(() => {}));

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText(/loading seasons/i)).toBeInTheDocument();
  });

  it("shows an error message when the seasons fetch fails", async () => {
    vi.spyOn(client, "listSeasons").mockRejectedValue(new Error("network error"));

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load seasons/i);
  });

  it("shows an empty state when no seasons are ingested", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue([]);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText(/no seasons ingested yet/i)).toBeInTheDocument();
  });

  it("renders the dialog labeled with the given side", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: /select session b/i })).toBeInTheDocument();
    await screen.findByText(/2024/);
  });

  it("moves to the event step when a season is selected", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText(/2024 — 2 events/i));

    expect(await screen.findByText("Belgian Grand Prix")).toBeInTheDocument();
    expect(client.listEventsForSeason).toHaveBeenCalledWith(2024);
  });

  it("shows a loading state on the event step before events have arrived", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockReturnValue(new Promise(() => {}));

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));

    expect(await screen.findByText(/loading events/i)).toBeInTheDocument();
  });

  it("shows an error message when the events fetch fails", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockRejectedValue(new Error("network error"));

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load events/i);
  });

  it("shows an empty state when the season has no ingested events", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue([]);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));

    expect(await screen.findByText(/no events ingested for 2024/i)).toBeInTheDocument();
  });

  it("moves to the session step when an event is selected", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue(sessions);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));
    fireEvent.click(await screen.findByText("Belgian Grand Prix"));

    expect(await screen.findByText("Race")).toBeInTheDocument();
    expect(client.listSessionsForEvent).toHaveBeenCalledWith(2024, "2024_belgian_grand_prix");
  });

  it("shows a loading state on the session step before sessions have arrived", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);
    vi.spyOn(client, "listSessionsForEvent").mockReturnValue(new Promise(() => {}));

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));
    fireEvent.click(await screen.findByText("Belgian Grand Prix"));

    expect(await screen.findByText(/loading sessions/i)).toBeInTheDocument();
  });

  it("shows an error message when the sessions fetch fails", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);
    vi.spyOn(client, "listSessionsForEvent").mockRejectedValue(new Error("network error"));

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));
    fireEvent.click(await screen.findByText("Belgian Grand Prix"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load sessions/i);
  });

  it("shows an empty state when the event has no ingested sessions", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue([]);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));
    fireEvent.click(await screen.findByText("Belgian Grand Prix"));

    expect(await screen.findByText(/no sessions ingested for this event/i)).toBeInTheDocument();
  });

  it("calls onSelect with the chosen session_id when a session is selected", async () => {
    const onSelect = vi.fn();
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue(sessions);

    render(<SessionPicker label="Session B" onSelect={onSelect} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));
    fireEvent.click(await screen.findByText("Belgian Grand Prix"));
    fireEvent.click(await screen.findByText("Race"));

    expect(onSelect).toHaveBeenCalledWith("2024_belgian_grand_prix_race");
  });

  it("navigates back from the event step to the season step", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));
    await screen.findByText("Belgian Grand Prix");

    fireEvent.click(screen.getByRole("button", { name: /← seasons/i }));

    expect(await screen.findByText(/2024 — 2 events/i)).toBeInTheDocument();
    expect(screen.queryByText("Belgian Grand Prix")).not.toBeInTheDocument();
  });

  it("navigates back from the session step to the event step", async () => {
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);
    vi.spyOn(client, "listEventsForSeason").mockResolvedValue(events);
    vi.spyOn(client, "listSessionsForEvent").mockResolvedValue(sessions);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(/2024 — 2 events/i));
    fireEvent.click(await screen.findByText("Belgian Grand Prix"));
    await screen.findByText("Race");

    fireEvent.click(screen.getByRole("button", { name: /← events/i }));

    expect(await screen.findByText("Belgian Grand Prix")).toBeInTheDocument();
    expect(screen.queryByText("Race")).not.toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={onClose} />);
    await screen.findByText(/2024/);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked, but not when the dialog content is clicked", async () => {
    const onClose = vi.fn();
    vi.spyOn(client, "listSeasons").mockResolvedValue(seasons);

    render(<SessionPicker label="Session B" onSelect={vi.fn()} onClose={onClose} />);
    await screen.findByText(/2024/);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
