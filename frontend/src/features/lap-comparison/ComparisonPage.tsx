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
 * M24 (docs/m24-design-review.md §5/§7): sessionIdA/sessionIdB are read
 * directly from the URL every render -- no local state mirror -- since
 * nothing validates them before use (SessionPicker's onSelect sets them
 * immediately, no async roster check in between). selectionA/selectionB
 * remain local useState, not in selectionStore (which stays scoped to the
 * primary Season->Event->Session->Driver->Lap trail): they're only ever
 * populated through DriverLapPicker's own existing, unmodified
 * roster/lap-existence validation, which this milestone preserves rather
 * than bypasses. The URL is written to (one-way, local->URL) only at the
 * four already-atomic state-change call sites below -- never from a
 * watching useEffect -- so no local-state<->URL loop is possible.
 *
 * Reads sessionA/driverA/lapA/sessionB/driverB/lapB query params as the
 * comparison's canonical, shareable representation: LapSelectPage's
 * "Compare Selected" entry point links here with sessionA=sessionB=<current
 * session> plus driver/lap for both sides so the comparison loads
 * immediately; Sidebar's "Lap Comparison" link sets only sessionA= (session
 * B still needs picking). Every picker interaction now writes the resolved
 * state back (M24), so the address bar always reflects what's on screen,
 * survives a refresh, and reproduces identically from a copied URL.
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
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionIdA = getParam(searchParams, "sessionA");
  const sessionIdB = getParam(searchParams, "sessionB");
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

  // M24 (docs/m24-design-review.md §8): one setSearchParams call swaps all
  // six URL fields atomically; the two setSelection* calls below swap the
  // matching local state in the same event-handler tick. React 18's
  // automatic batching commits both as one render, so no half-swapped URL
  // is ever written or visible.
  function handleSwap() {
    setSearchParams(
      (params) => {
        const nextSessionA = params.get("sessionB");
        const nextSessionB = params.get("sessionA");
        const nextDriverA = params.get("driverB");
        const nextLapA = params.get("lapB");
        const nextDriverB = params.get("driverA");
        const nextLapB = params.get("lapA");
        setOrDelete(params, "sessionA", nextSessionA);
        setOrDelete(params, "sessionB", nextSessionB);
        setOrDelete(params, "driverA", nextDriverA);
        setOrDelete(params, "lapA", nextLapA);
        setOrDelete(params, "driverB", nextDriverB);
        setOrDelete(params, "lapB", nextLapB);
        return params;
      },
      { replace: true },
    );
    setSelectionA(selectionB);
    setSelectionB(selectionA);
  }

  // M24 (docs/m24-design-review.md §5): session picks are never gated by
  // validation, so the URL is the sole source of truth for them -- set the
  // new session and clear that side's now-stale driver/lap params in the
  // same call, atomically with the local selection clear.
  function handleSessionPicked(sessionId: string) {
    const side = pickingSession;
    setSearchParams(
      (params) => {
        if (side === "a") {
          params.set("sessionA", sessionId);
          params.delete("driverA");
          params.delete("lapA");
        } else if (side === "b") {
          params.set("sessionB", sessionId);
          params.delete("driverB");
          params.delete("lapB");
        }
        return params;
      },
      { replace: true },
    );
    if (side === "a") {
      setSelectionA(null);
    } else if (side === "b") {
      setSelectionB(null);
    }
    setPickingSession(null);
  }

  // M24 (docs/m24-design-review.md §5): the only two places selectionA/
  // selectionB change outside a session pick -- write the resolved pair (or
  // its absence) to the URL in the same handler, never from a watching
  // effect.
  function handleSelectA(selection: DriverLapSelection | null) {
    setSelectionA(selection);
    setSearchParams(
      (params) => {
        setOrDelete(params, "driverA", selection?.driverId ?? null);
        setOrDelete(params, "lapA", selection ? String(selection.lapNumber) : null);
        return params;
      },
      { replace: true },
    );
  }

  function handleSelectB(selection: DriverLapSelection | null) {
    setSelectionB(selection);
    setSearchParams(
      (params) => {
        setOrDelete(params, "driverB", selection?.driverId ?? null);
        setOrDelete(params, "lapB", selection ? String(selection.lapNumber) : null);
        return params;
      },
      { replace: true },
    );
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
          onSelectA={handleSelectA}
          onSelectB={handleSelectB}
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

// M24 (docs/m24-design-review.md §3): "" is a legitimate URLSearchParams
// value for a bare "?key=" -- normalized to absent here so it behaves
// identically to a missing param everywhere this is read.
function getParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(key) || null;
}

// M24 (docs/m24-design-review.md §3/§9): sets `key` when `value` is
// present, deletes it otherwise -- never writes an empty-string value.
// Duplicated identically in StintComparisonPage.tsx rather than shared
// (docs/m24-design-review.md §9): two call sites, three lines, matching
// this project's own rule-of-three convention.
function setOrDelete(params: URLSearchParams, key: string, value: string | null) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

function selectionFromParams(
  searchParams: URLSearchParams,
  driverKey: string,
  lapKey: string,
): DriverLapSelection | undefined {
  const driverId = getParam(searchParams, driverKey);
  const lapParam = getParam(searchParams, lapKey);
  const lapNumber = lapParam !== null ? Number(lapParam) : NaN;
  return driverId && Number.isFinite(lapNumber) ? { driverId, lapNumber } : undefined;
}
