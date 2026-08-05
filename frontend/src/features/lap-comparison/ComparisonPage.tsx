import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useLapComparison } from "./hooks/useLapComparison";
import { LapPairSelector } from "./components/LapPairSelector";
import { ComparisonHeader } from "./components/ComparisonHeader";
import { DeltaChart } from "./components/DeltaChart";
import { SectorBreakdownTable } from "./components/SectorBreakdownTable";
import { ChannelOverlayPanel } from "./components/ChannelOverlayPanel";
import { TrackMapDelta } from "./components/TrackMapDelta";
import type { DriverLapSelection } from "./components/DriverLapPicker";

/**
 * Two-lap comparison shell (M6), registered at "/sessions/:sessionId/compare"
 * in App.tsx (plural "sessions", matching every other route here, over
 * docs/m6-design-review.md §1.1's singular "/session/:sessionId/compare").
 *
 * Owns lap-selection state (selectionA/selectionB) directly -- not in
 * comparisonStore, which is scoped to cursor/channel-visibility state only
 * (docs/adr/0007).
 *
 * Reads optional driverA/lapA/driverB/lapB query params as an initial
 * selection (Phase 9 deviation, not in the original plan's Phase 9 file
 * list): LapSelectPage's "Compare Selected" multi-select links here with
 * those params so the comparison loads immediately instead of landing on
 * two empty pickers the user has to refill by hand. Forwarded to
 * LapPairSelector/DriverLapPicker (Phase 5) via their new optional
 * initialSelection prop; absent for the dedicated-route entry path
 * (§1.1 path 2), which is unaffected.
 */
export function ComparisonPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
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
      <LapPairSelector
        sessionId={sessionId}
        onSelectA={setSelectionA}
        onSelectB={setSelectionB}
        initialSelectionA={selectionFromParams(searchParams, "driverA", "lapA")}
        initialSelectionB={selectionFromParams(searchParams, "driverB", "lapB")}
      />
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

function selectionFromParams(
  searchParams: URLSearchParams,
  driverKey: string,
  lapKey: string,
): DriverLapSelection | undefined {
  const driverId = searchParams.get(driverKey);
  const lapNumber = Number(searchParams.get(lapKey));
  return driverId && Number.isFinite(lapNumber) ? { driverId, lapNumber } : undefined;
}
