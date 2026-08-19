import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { StatusChip } from "../../components/StatusChip";
import { getParam, setOrDelete } from "../../components/urlSearchParams";
import { SessionPicker } from "../lap-comparison/components/SessionPicker";
import { StintTimeline } from "../race-context/components/StintTimeline";
import { PitStopList } from "../race-context/components/PitStopList";
import { StintConsistencyTable } from "../tyre-performance/components/StintConsistencyTable";
import type { DriverStintComparisonSide, StintComparisonWarningCode } from "../../api/client";
import { DriverPicker } from "./components/DriverPicker";
import { useStintComparison } from "./hooks/useStintComparison";
import styles from "./StintComparisonPage.module.css";

const WARNING_LABELS: Record<StintComparisonWarningCode, string> = {
  different_circuit: "Sessions are at different circuits",
  no_stint_data_a: "No stint data for Session A's driver",
  no_stint_data_b: "No stint data for Session B's driver",
};

/**
 * /stints/compare (M15, docs/m15-design-review.md §7): pairwise
 * cross-session stint/tyre-strategy comparison -- Session A + Driver A vs.
 * Session B + Driver B. Mirrors ComparisonPage's own local-state shape
 * exactly (§7's explicit decision: no Zustand store, no selectionStore
 * pollution), minus the lap-number dimension this comparison doesn't need.
 *
 * `SessionPicker` is reused unmodified (§6/§14) -- the exact same
 * modal Season -> Event -> Session picker `/laps/compare` already uses.
 * `StintTimeline`/`StintConsistencyTable`/`PitStopList` are reused
 * unmodified per side, the same card sequence StintPacePage already
 * established (Strategy -> Stint Detail -> Pit stops), duplicated into two
 * columns instead of rendered once.
 *
 * M24 (docs/m24-design-review.md §5): sessionA/sessionB/driverA/driverB
 * query params are the comparison's canonical, shareable representation.
 * sessionIdA/sessionIdB are read directly from the URL every render -- no
 * local state mirror, since SessionPicker's onSelect sets them immediately
 * with no async roster check in between. driverIdA/driverIdB remain local
 * useState, populated only through DriverPicker's own existing, unmodified
 * roster-validation (its `initialDriverId` prop, computed from the URL
 * exactly as before); this milestone preserves that validation rather than
 * bypassing it. The URL is written to (one-way, local->URL) only at the
 * three already-atomic state-change call sites below -- never from a
 * watching useEffect -- mirroring ComparisonPage's identical treatment
 * (docs/m24-design-review.md §2.2 records why the two pages' state shapes
 * differ enough not to share an abstraction, §9).
 */
export function StintComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionIdA = getParam(searchParams, "sessionA");
  const sessionIdB = getParam(searchParams, "sessionB");
  const [driverIdA, setDriverIdA] = useState<string | null>(getParam(searchParams, "driverA"));
  const [driverIdB, setDriverIdB] = useState<string | null>(getParam(searchParams, "driverB"));
  const [pickingSession, setPickingSession] = useState<"a" | "b" | null>(null);

  const { comparison, error } = useStintComparison(
    sessionIdA ?? undefined,
    driverIdA ?? undefined,
    sessionIdB ?? undefined,
    driverIdB ?? undefined,
  );

  // M24 (docs/m24-design-review.md §5): session picks are never gated by
  // validation, so the URL is the sole source of truth for them -- set the
  // new session and clear that side's now-stale driver param in the same
  // call, atomically with the local driver-state clear.
  function handleSessionPicked(sessionId: string) {
    const side = pickingSession;
    setSearchParams(
      (params) => {
        if (side === "a") {
          params.set("sessionA", sessionId);
          params.delete("driverA");
        } else if (side === "b") {
          params.set("sessionB", sessionId);
          params.delete("driverB");
        }
        return params;
      },
      { replace: true },
    );
    if (side === "a") {
      setDriverIdA(null);
    } else if (side === "b") {
      setDriverIdB(null);
    }
    setPickingSession(null);
  }

  // M24 (docs/m24-design-review.md §5): the only two places driverIdA/
  // driverIdB change outside a session pick -- write the resolved value (or
  // its absence) to the URL in the same handler, never from a watching
  // effect.
  function handleSelectA(driverId: string | null) {
    setDriverIdA(driverId);
    setSearchParams(
      (params) => {
        setOrDelete(params, "driverA", driverId);
        return params;
      },
      { replace: true },
    );
  }

  function handleSelectB(driverId: string | null) {
    setDriverIdB(driverId);
    setSearchParams(
      (params) => {
        setOrDelete(params, "driverB", driverId);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <section className={styles.page}>
      <h2 className={styles.heading}>Compare stint & tyre strategy</h2>
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
        <div className={styles.sessionPickers}>
          <DriverPicker
            key={`a-${sessionIdA}`}
            sessionId={sessionIdA}
            label="Driver A"
            onSelect={handleSelectA}
            initialDriverId={getParam(searchParams, "driverA") ?? undefined}
          />
          <DriverPicker
            key={`b-${sessionIdB}`}
            sessionId={sessionIdB}
            label="Driver B"
            onSelect={handleSelectB}
            initialDriverId={getParam(searchParams, "driverB") ?? undefined}
          />
        </div>
      )}
      {error && <ErrorState>{error}</ErrorState>}
      {comparison && (
        <div className={styles.page}>
          {comparison.warnings.length > 0 && (
            <div className={styles.warnings} data-testid="stint-comparison-warnings">
              {comparison.warnings.map((warning) => (
                <StatusChip key={warning.code} tone="warning">
                  {WARNING_LABELS[warning.code]}
                </StatusChip>
              ))}
            </div>
          )}
          <div className={styles.columns}>
            <StrategyColumn label="A" side={comparison.a} />
            <StrategyColumn label="B" side={comparison.b} />
          </div>
        </div>
      )}
    </section>
  );
}

function StrategyColumn({ label, side }: { label: string; side: DriverStintComparisonSide }) {
  return (
    <div className={styles.column} data-testid={`stint-comparison-side-${label.toLowerCase()}`}>
      <h3 className={styles.columnHeading}>
        {label} — {side.driver_id}
      </h3>
      <Card title="Strategy">
        <StintTimeline stints={side.stints} />
      </Card>
      <Card title="Stint Detail">
        <StintConsistencyTable stints={side.stints} />
      </Card>
      <PitStopList pitStops={side.pit_stops} />
    </div>
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
