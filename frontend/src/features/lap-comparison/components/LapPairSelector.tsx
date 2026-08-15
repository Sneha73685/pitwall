import { DriverLapPicker, type DriverLapSelection } from "./DriverLapPicker";
import styles from "./LapPairSelector.module.css";

interface LapPairSelectorProps {
  /**
   * M13: independent per side (docs/m13-design-review.md §4/§6) -- may be
   * equal (the M6-era same-session case) or different sessions entirely.
   */
  sessionIdA: string;
  sessionIdB: string;
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
 * only wires those two callbacks to its own props. M13: each picker now
 * reads its own session prop (DriverLapPicker already took `sessionId` as
 * an independent prop per instance -- the only thing that changes here is
 * that the two instances no longer share one value).
 *
 * A side-prefixed `key` on each picker (M13): DriverLapPicker's selected
 * driver/lap live in its own internal useState, refreshed only on mount
 * (docs/m13-design-review.md never called this out explicitly, but real
 * testing surfaced it -- see M13 implementation report). Without a key,
 * changing which session a side points at (via SessionPicker) would leave
 * that side's stale driver/lap selection displayed against the new
 * session's driver list. Keying on sessionId forces React to unmount and
 * remount the picker whenever its session changes, which is exactly the
 * same "session changed -> selection resets" behavior selectionStore's
 * own setSession/setEvent already apply to the primary trail (§6) --
 * ComparisonPage's parallel local state gets the equivalent behavior via
 * the key instead of a cascading-clear setter, since there's no shared
 * store here to hang one off. The key is prefixed ("a-"/"b-") rather than
 * the bare sessionId, because sessionIdA and sessionIdB are frequently
 * equal (the ordinary same-session comparison) -- two siblings sharing an
 * unprefixed key would collide (React requires uniqueness among siblings,
 * not just per-instance stability), which real testing also caught.
 */
export function LapPairSelector({
  sessionIdA,
  sessionIdB,
  onSelectA,
  onSelectB,
  initialSelectionA,
  initialSelectionB,
}: LapPairSelectorProps) {
  return (
    <div className={styles.pair}>
      <DriverLapPicker
        key={`a-${sessionIdA}`}
        sessionId={sessionIdA}
        label="Lap A"
        onSelect={onSelectA}
        initialSelection={initialSelectionA}
      />
      <DriverLapPicker
        key={`b-${sessionIdB}`}
        sessionId={sessionIdB}
        label="Lap B"
        onSelect={onSelectB}
        initialSelection={initialSelectionB}
      />
    </div>
  );
}
