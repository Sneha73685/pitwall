/**
 * Selection state (season / event / session / driver / lap) -- the first of
 * PitWall's Zustand stores, scoped by concern per ADR-0007. A separate
 * `cursorStore` arrives in V2 for hover/time-cursor/corner-selection
 * state; it must not be merged into this one.
 *
 * `season`/`eventId` were added in M12 Phase 5 alongside the existing
 * session/driver/lap fields -- Sidebar (rendered alongside routed content,
 * not inside it) needs them to render the Season -> Event -> Session nav
 * trail the same way it already reads sessionId/driverId/lapId, not a new
 * state concern.
 */
import { create } from "zustand";

export interface SelectionState {
  season: number | null;
  eventId: string | null;
  sessionId: string | null;
  driverId: string | null;
  lapId: string | null;
  setSeason: (season: number | null) => void;
  setEvent: (eventId: string | null) => void;
  setSession: (sessionId: string | null) => void;
  setDriver: (driverId: string | null) => void;
  setLap: (lapId: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  season: null,
  eventId: null,
  sessionId: null,
  driverId: null,
  lapId: null,
  setSeason: (season) =>
    set({ season, eventId: null, sessionId: null, driverId: null, lapId: null }),
  setEvent: (eventId) => set({ eventId, sessionId: null, driverId: null, lapId: null }),
  setSession: (sessionId) => set({ sessionId, driverId: null, lapId: null }),
  setDriver: (driverId) => set({ driverId, lapId: null }),
  setLap: (lapId) => set({ lapId }),
}));
