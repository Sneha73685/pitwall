/**
 * Cursor-sync state for TrackMapPage's two charts (M14,
 * docs/m14-design-review.md §5): a sibling of
 * `lap-comparison/comparisonStore.ts`'s cursor slot, implementing the same
 * `CursorSlice` shape, not a competing mechanism. Feature-scoped (not
 * `frontend/src/state/`) since nothing outside `TrackMapPage` reads it,
 * matching `comparisonStore`'s own precedent.
 *
 * A separate store rather than one shared/global cursor store: the two
 * page contexts (single-lap vs. comparison) are never mounted together
 * (§4) and have genuinely different cursor semantics (one lap's own
 * samples vs. two laps pre-aligned to one shared grid) -- a single global
 * store would need scope-guarding logic for zero real benefit (§5).
 */
import { create } from "zustand";
import { type CursorSlice } from "../../components/useCursorSync";

export const useTrackMapCursorStore = create<CursorSlice>((set) => ({
  distanceM: null,
  source: null,
  setCursor: (distanceM, source) => set({ distanceM, source }),
  clearCursor: () => set({ distanceM: null, source: null }),
}));
