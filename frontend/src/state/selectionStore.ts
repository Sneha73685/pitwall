/**
 * Selection state (session / driver / lap) -- the first of PitWall's
 * Zustand stores, scoped by concern per ADR-0007. A separate
 * `cursorStore` arrives in V2 for hover/time-cursor/corner-selection
 * state; it must not be merged into this one.
 */
import { create } from "zustand";

export interface SelectionState {
  sessionId: string | null;
  driverId: string | null;
  lapId: string | null;
  setSession: (sessionId: string | null) => void;
  setDriver: (driverId: string | null) => void;
  setLap: (lapId: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  sessionId: null,
  driverId: null,
  lapId: null,
  setSession: (sessionId) => set({ sessionId, driverId: null, lapId: null }),
  setDriver: (driverId) => set({ driverId, lapId: null }),
  setLap: (lapId) => set({ lapId }),
}));
