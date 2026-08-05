import { useState } from "react";
import { useParams } from "react-router-dom";
import { useLapComparison } from "./hooks/useLapComparison";
import { LapPairSelector } from "./components/LapPairSelector";
import { ComparisonHeader } from "./components/ComparisonHeader";
import { DeltaChart } from "./components/DeltaChart";
import { SectorBreakdownTable } from "./components/SectorBreakdownTable";
import { ChannelOverlayPanel } from "./components/ChannelOverlayPanel";
import { TrackMapDelta } from "./components/TrackMapDelta";
import type { DriverLapSelection } from "./components/DriverLapPicker";

/**
 * Two-lap comparison shell (M6). Not yet wired into app routing -- that's
 * Phase 9 -- but reads sessionId via useParams like every other page
 * (SessionListPage/DriverSelectPage/LapSelectPage/TrackMapPage), so Phase
 * 9's wiring is just adding a <Route>, no prop-passing change here.
 *
 * Route path note: docs/m6-design-review.md §1.1 says "/session/:sessionId
 * /compare" (singular "session"), but every existing route in this app is
 * "/sessions/..." (plural) -- App.tsx's own routes, all of them. Phase 9
 * should register this under "/sessions/:sessionId/compare" to match; this
 * page doesn't hard-code the path itself, but its own tests use the
 * corrected plural form.
 *
 * Owns lap-selection state (selectionA/selectionB) directly -- not in
 * comparisonStore, which is scoped to cursor/channel-visibility state only
 * (docs/adr/0007).
 */
export function ComparisonPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [selectionA, setSelectionA] = useState<DriverLapSelection | null>(null);
  const [selectionB, setSelectionB] = useState<DriverLapSelection | null>(null);

  const { comparison, error } = useLapComparison(
    sessionId,
    selectionA?.driverId,
    selectionA?.lapNumber,
    selectionB?.driverId,
    selectionB?.lapNumber,
  );

  function handleSwap() {
    setSelectionA(selectionB);
    setSelectionB(selectionA);
  }

  if (!sessionId) {
    return null;
  }

  return (
    <section>
      <h2>Compare laps</h2>
      <LapPairSelector sessionId={sessionId} onSelectA={setSelectionA} onSelectB={setSelectionB} />
      {error && <p role="alert">{error}</p>}
      {comparison && (
        <>
          <ComparisonHeader comparison={comparison} onSwap={handleSwap} />
          <TrackMapDelta sessionId={sessionId} comparison={comparison} />
          <DeltaChart comparison={comparison} />
          <SectorBreakdownTable sectors={comparison.sectors} />
          <ChannelOverlayPanel comparison={comparison} />
        </>
      )}
    </section>
  );
}
