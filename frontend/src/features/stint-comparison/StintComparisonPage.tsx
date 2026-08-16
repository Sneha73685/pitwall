import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { StatusChip } from "../../components/StatusChip";
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
 * Reads optional sessionA/driverA/sessionB/driverB query params as an
 * initial deep-link (populated by StrategyPage's "Compare Strategy" link),
 * matching M13's exact read-once-on-mount convention -- not written back as
 * selections change (§17: this intentionally doesn't fix ComparisonPage's
 * pre-existing stale-URL gap, for consistency with the pattern being
 * mirrored).
 */
export function StintComparisonPage() {
  const [searchParams] = useSearchParams();
  const [sessionIdA, setSessionIdA] = useState<string | null>(searchParams.get("sessionA"));
  const [sessionIdB, setSessionIdB] = useState<string | null>(searchParams.get("sessionB"));
  const [driverIdA, setDriverIdA] = useState<string | null>(searchParams.get("driverA"));
  const [driverIdB, setDriverIdB] = useState<string | null>(searchParams.get("driverB"));
  const [pickingSession, setPickingSession] = useState<"a" | "b" | null>(null);

  const { comparison, error } = useStintComparison(
    sessionIdA ?? undefined,
    driverIdA ?? undefined,
    sessionIdB ?? undefined,
    driverIdB ?? undefined,
  );

  function handleSessionPicked(sessionId: string) {
    if (pickingSession === "a") {
      setSessionIdA(sessionId);
      setDriverIdA(null);
    } else if (pickingSession === "b") {
      setSessionIdB(sessionId);
      setDriverIdB(null);
    }
    setPickingSession(null);
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
            onSelect={setDriverIdA}
            initialDriverId={driverIdA ?? undefined}
          />
          <DriverPicker
            key={`b-${sessionIdB}`}
            sessionId={sessionIdB}
            label="Driver B"
            onSelect={setDriverIdB}
            initialDriverId={driverIdB ?? undefined}
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
