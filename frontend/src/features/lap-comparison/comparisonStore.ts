/**
 * Cursor-sync + channel-visibility state for the M6 comparison feature
 * (docs/m6-design-review.md §4, §12). A Zustand store, not a React
 * Context provider -- ADR-0007 chose Zustand specifically for this exact
 * state shape ("hover position, telemetry cursor... many components...
 * must read without re-rendering unnecessarily", predicting "a
 * cursorStore... without modifying" selectionStore). There is no other
 * Context usage anywhere in this frontend.
 *
 * Scoped to this feature folder (not frontend/src/state/, where
 * selectionStore.ts lives) since nothing outside lap-comparison reads
 * this store, unlike selectionStore's cross-page use.
 *
 * hoverDistance is only a state slot in Phase 6 -- nothing writes to it
 * yet. Phase 7 wires real chart hover events into setHoverDistance and
 * handles ECharts cross-instance synchronization; neither happens here.
 */
import { create } from "zustand";

export const COMPARISON_CHANNELS = [
  { key: "speed_kph", label: "Speed" },
  { key: "throttle_pct", label: "Throttle" },
  { key: "brake_active", label: "Brake" },
  { key: "rpm", label: "RPM" },
  { key: "gear", label: "Gear" },
  { key: "drs_active", label: "DRS" },
] as const;

export type ComparisonChannelKey = (typeof COMPARISON_CHANNELS)[number]["key"];

const DEFAULT_VISIBLE_CHANNELS: ReadonlySet<ComparisonChannelKey> = new Set(["speed_kph"]);

export interface ComparisonState {
  hoverDistance: number | null;
  setHoverDistance: (distance: number | null) => void;
  visibleChannels: ReadonlySet<ComparisonChannelKey>;
  toggleChannel: (channel: ComparisonChannelKey) => void;
}

export const useComparisonStore = create<ComparisonState>((set) => ({
  hoverDistance: null,
  setHoverDistance: (hoverDistance) => set({ hoverDistance }),
  visibleChannels: DEFAULT_VISIBLE_CHANNELS,
  toggleChannel: (channel) =>
    set((state) => {
      const next = new Set(state.visibleChannels);
      if (next.has(channel)) {
        next.delete(channel);
      } else {
        next.add(channel);
      }
      return { visibleChannels: next };
    }),
}));
