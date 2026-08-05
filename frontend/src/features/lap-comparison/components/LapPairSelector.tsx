import { DriverLapPicker, type DriverLapSelection } from "./DriverLapPicker";

interface LapPairSelectorProps {
  sessionId: string;
  onSelectA: (selection: DriverLapSelection | null) => void;
  onSelectB: (selection: DriverLapSelection | null) => void;
  /** Forwarded to each DriverLapPicker (Phase 9 lap-table entry point). */
  initialSelectionA?: DriverLapSelection;
  initialSelectionB?: DriverLapSelection;
}

/**
 * Wraps two DriverLapPicker (Phase 5) instances side by side, labeled
 * "Lap A" / "Lap B" -- each picker is uncontrolled and self-contained
 * (Phase 5), reporting its own selection via callback; this component
 * only wires those two callbacks to its own props.
 */
export function LapPairSelector({
  sessionId,
  onSelectA,
  onSelectB,
  initialSelectionA,
  initialSelectionB,
}: LapPairSelectorProps) {
  return (
    <div>
      <DriverLapPicker
        sessionId={sessionId}
        label="Lap A"
        onSelect={onSelectA}
        initialSelection={initialSelectionA}
      />
      <DriverLapPicker
        sessionId={sessionId}
        label="Lap B"
        onSelect={onSelectB}
        initialSelection={initialSelectionB}
      />
    </div>
  );
}
