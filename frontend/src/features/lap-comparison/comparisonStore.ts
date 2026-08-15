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
 * The cursor slot (M14, docs/m14-design-review.md §5/§6) implements the
 * shared `CursorSlice` shape -- the same one `track-map/cursorStore.ts`
 * implements for `TrackMapPage` -- wired up here, not replaced: this is
 * the same store M6 Phase 6 declared and deliberately left unwired
 * ("hoverDistance is only a state slot... Phase 7 wires real chart hover
 * events... neither happens here"). Phase 7 never ran; M14 finishes it,
 * renaming `hoverDistance`/`setHoverDistance` to the canonical
 * `distanceM`/`setCursor`/`clearCursor` shape in the process (§6.1: "today's
 * unused `setHoverDistance(null)` call site" becomes `clearCursor()`).
 */
import { create } from "zustand";
import { type CursorSlice } from "../../components/useCursorSync";

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

export interface ComparisonState extends CursorSlice {
  visibleChannels: ReadonlySet<ComparisonChannelKey>;
  toggleChannel: (channel: ComparisonChannelKey) => void;
}

export const useComparisonStore = create<ComparisonState>((set) => ({
  distanceM: null,
  source: null,
  setCursor: (distanceM, source) => set({ distanceM, source }),
  clearCursor: () => set({ distanceM: null, source: null }),
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
