import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorState } from "../../components/ErrorState";
import { useLapComparison } from "./hooks/useLapComparison";
import { LapPairSelector } from "./components/LapPairSelector";
import { SessionPicker } from "./components/SessionPicker";
import { ComparisonHeader } from "./components/ComparisonHeader";
import { DeltaChart } from "./components/DeltaChart";
import { SectorBreakdownTable } from "./components/SectorBreakdownTable";
import { ChannelOverlayPanel } from "./components/ChannelOverlayPanel";
import { TrackMapDelta } from "./components/TrackMapDelta";
import type { DriverLapSelection } from "./components/DriverLapPicker";
import styles from "./ComparisonPage.module.css";

/**
 * Cross-session two-lap comparison shell (M6, generalized in M13 --
 * docs/m13-design-review.md), registered at the standalone "/laps/compare"
 * route in App.tsx -- no longer nested under "/sessions/:sessionId" (§4 of
 * that design: neither side is privileged once both are independently
 * selectable).
 *
 * Owns sessionIdA/sessionIdB alongside the existing selectionA/selectionB
 * driver+lap state, all as local useState -- not in selectionStore, which
 * stays scoped to the primary Season->Event->Session->Driver->Lap trail
 * (docs/m13-design-review.md §6: this page already isolated A/B state
 * locally before M13; the only change is one more field per side). The
 * primary navigation workflow (Sidebar, every other route) is unaffected.
 *
 * Reads optional sessionA/driverA/lapA/sessionB/driverB/lapB query params
 * as an initial selection: LapSelectPage's "Compare Selected" entry point
 * links here with sessionA=sessionB=<current session> plus driver/lap for
 * both sides so the comparison loads immediately; Sidebar's "Lap
 * Comparison" link sets only sessionA= (session B still needs picking).
 * Both are additive uses of the same mechanism M6 Phase 9 established.
 */
export function ComparisonPage() {
  const [searchParams] = useSearchParams();
  const [sessionIdA, setSessionIdA] = useState<string | null>(searchParams.get("sessionA"));
  const [sessionIdB, setSessionIdB] = useState<string | null>(searchParams.get("sessionB"));
  const [selectionA, setSelectionA] = useState<DriverLapSelection | null>(null);
  const [selectionB, setSelectionB] = useState<DriverLapSelection | null>(null);
  const [pickingSession, setPickingSession] = useState<"a" | "b" | null>(null);

  const { comparison, error } = useLapComparison(
    sessionIdA ?? undefined,
    selectionA?.driverId,
    selectionA?.lapNumber,
    sessionIdB ?? undefined,
    selectionB?.driverId,
    selectionB?.lapNumber,
  );

  function handleSwap() {
    setSessionIdA(sessionIdB);
    setSessionIdB(sessionIdA);
    setSelectionA(selectionB);
    setSelectionB(selectionA);
  }

  function handleSessionPicked(sessionId: string) {
    if (pickingSession === "a") {
      setSessionIdA(sessionId);
      setSelectionA(null);
    } else if (pickingSession === "b") {
      setSessionIdB(sessionId);
      setSelectionB(null);
    }
    setPickingSession(null);
  }

  return (
    <section className={styles.page}>
      <h2 className={styles.heading}>Compare laps</h2>
      <div className={styles.sessionPickers}>
        <SessionSlot
          label="Session A"
          sessionId={sessionIdA}
          onChange={() => setPickingSession("a")}
        />
        <SessionSlot
          label="Session B"
          sessionId={sessionIdB}
          onChange={() => setPickingSession("b")}
        />
      </div>
      {pickingSession && (
        <SessionPicker
          label={pickingSession === "a" ? "Session A" : "Session B"}
          onSelect={handleSessionPicked}
          onClose={() => setPickingSession(null)}
        />
      )}
      {sessionIdA && sessionIdB && (
        <LapPairSelector
          sessionIdA={sessionIdA}
          sessionIdB={sessionIdB}
          onSelectA={setSelectionA}
          onSelectB={setSelectionB}
          initialSelectionA={selectionFromParams(searchParams, "driverA", "lapA")}
          initialSelectionB={selectionFromParams(searchParams, "driverB", "lapB")}
        />
      )}
      {error && <ErrorState>{error}</ErrorState>}
      {comparison && (
        <div className={styles.workspace}>
          <ComparisonHeader comparison={comparison} onSwap={handleSwap} />
          <div className={styles.mapAndDelta}>
            <TrackMapDelta sessionId={comparison.session_id_a} comparison={comparison} />
            <DeltaChart comparison={comparison} />
          </div>
          <SectorBreakdownTable sectors={comparison.sectors} />
          <ChannelOverlayPanel comparison={comparison} />
        </div>
      )}
    </section>
  );
}

function SessionSlot({
  label,
  sessionId,
  onChange,
}: {
  label: string;
  sessionId: string | null;
  onChange: () => void;
}) {
  return (
    <div className={styles.sessionSlot}>
      <span className={styles.sessionSlotLabel}>{label}</span>
      <span className={styles.sessionSlotValue}>{sessionId ?? "No session selected"}</span>
      <button type="button" className={styles.sessionSlotButton} onClick={onChange}>
        {sessionId ? "Change" : "Select session"}
      </button>
    </div>
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
