import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getTrackPoints, type TrackPoint } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { detectCorners } from "../track-map/detectCorners";
import { useLapComparison } from "./hooks/useLapComparison";
import { LapPairSelector } from "./components/LapPairSelector";
import { SessionPicker } from "./components/SessionPicker";
import { ComparisonHeader } from "./components/ComparisonHeader";
import { DeltaChart } from "./components/DeltaChart";
import { SectorBreakdownTable } from "./components/SectorBreakdownTable";
import { ChannelOverlayPanel } from "./components/ChannelOverlayPanel";
import { TrackMapDelta } from "./components/TrackMapDelta";
import { useComparisonStore } from "./comparisonStore";
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
 *
 * M22 (docs/m22-design-review.md §7, §17): fetches session A's track
 * geometry once at this page level (lifted from `TrackMapDelta`'s own
 * former internal fetch -- same session, same "session A is the reference
 * geometry" convention that component already established, docs/m13-
 * design-review.md §9) so the one resulting corner list can be shared by
 * `TrackMapDelta`, `DeltaChart`, and `ChannelOverlayPanel` alike, keeping
 * them "in sync" by construction rather than by any new coordination.
 * Skipped entirely when session A/B are at different circuits (the
 * existing `different_circuit` warning), mirroring exactly the condition
 * `TrackMapDelta` already used to skip its own fetch -- the request
 * pattern is unchanged: still exactly one `getTrackPoints` call where one
 * was made before, never zero, never two.
 */
export function ComparisonPage() {
  const [searchParams] = useSearchParams();
  const [sessionIdA, setSessionIdA] = useState<string | null>(searchParams.get("sessionA"));
  const [sessionIdB, setSessionIdB] = useState<string | null>(searchParams.get("sessionB"));
  const [selectionA, setSelectionA] = useState<DriverLapSelection | null>(null);
  const [selectionB, setSelectionB] = useState<DriverLapSelection | null>(null);
  const [pickingSession, setPickingSession] = useState<"a" | "b" | null>(null);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[] | null>(null);
  const [trackPointsError, setTrackPointsError] = useState<string | null>(null);

  const { comparison, error } = useLapComparison(
    sessionIdA ?? undefined,
    selectionA?.driverId,
    selectionA?.lapNumber,
    sessionIdB ?? undefined,
    selectionB?.driverId,
    selectionB?.lapNumber,
  );
  const clearCursor = useComparisonStore((state) => state.clearCursor);
  const hasCircuitMismatch =
    comparison?.warnings.some((w) => w.code === "different_circuit") ?? false;

  // M14 (docs/m14-design-review.md §6.1): clear the synchronized cursor on
  // every new successful comparison fetch (session A/B, driver/lap, and the
  // swap button all produce a new `comparison` object through the same
  // hook) so a stale cursor from the previous pair never bleeds into the
  // next one. Not on every keystroke of picking a new driver/lap -- only
  // once a full new comparison has actually resolved.
  useEffect(() => {
    if (comparison) {
      clearCursor();
    }
  }, [comparison, clearCursor]);

  useEffect(() => {
    if (!comparison || hasCircuitMismatch) {
      setTrackPoints(null);
      return;
    }
    setTrackPointsError(null);
    getTrackPoints(comparison.session_id_a)
      .then(setTrackPoints)
      .catch(() => setTrackPointsError("Could not load track geometry."));
  }, [comparison, hasCircuitMismatch]);

  const corners = useMemo(() => (trackPoints ? detectCorners(trackPoints) : []), [trackPoints]);

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
            <TrackMapDelta
              comparison={comparison}
              trackPoints={trackPoints}
              error={trackPointsError}
              hasCircuitMismatch={hasCircuitMismatch}
              corners={corners}
            />
            <DeltaChart comparison={comparison} corners={corners} />
          </div>
          <SectorBreakdownTable sectors={comparison.sectors} />
          <ChannelOverlayPanel comparison={comparison} corners={corners} />
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
