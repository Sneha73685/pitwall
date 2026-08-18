import type { LapComparisonResponse } from "../../../api/client";
import { Card } from "../../../components/Card";
import { TelemetryCharts } from "../../telemetry-charts/TelemetryCharts";
import type { CornerRegion } from "../../track-map/detectCorners";
import { COMPARISON_CHANNELS, useComparisonStore } from "../comparisonStore";
import { toChannelSamples } from "./toChannelSamples";
import styles from "./ChannelOverlayPanel.module.css";

interface ChannelOverlayPanelProps {
  comparison: LapComparisonResponse;
  /** Detected corner regions (M22, docs/m22-design-review.md §8), threaded
   * through to TelemetryCharts unchanged. */
  corners?: CornerRegion[];
}

/**
 * Toggle controls plus the real telemetry overlay charts (M6 Phase 7,
 * replacing Phase 6's per-channel placeholder text). Mounts a single
 * TelemetryCharts instance (M5, generalized in Phase 5) filtered to the
 * currently-visible channels via its `channels` prop, rather than one
 * ECharts instance per channel: TelemetryCharts is already one
 * multi-grid instance covering all channels together, so toggling channels
 * adds/removes grids within that one instance instead of mounting/
 * unmounting separate chart instances -- reuses the shared component as
 * built (Reuse Ledger, docs/m6-implementation-plan.md §3) rather than
 * reworking its architecture in this phase.
 *
 * M14 (docs/m14-design-review.md §8): passes `comparisonStore` down to
 * TelemetryCharts as its cursor store, so hovering this overlay
 * participates in the same synchronized cursor as DeltaChart/TrackMapDelta.
 */
export function ChannelOverlayPanel({ comparison, corners }: ChannelOverlayPanelProps) {
  const visibleChannels = useComparisonStore((state) => state.visibleChannels);
  const toggleChannel = useComparisonStore((state) => state.toggleChannel);

  const samplesA = toChannelSamples(comparison.distance_m, comparison.channels, "a");
  const samplesB = toChannelSamples(comparison.distance_m, comparison.channels, "b");

  return (
    <Card title="Telemetry overlay">
      <fieldset className={styles.toggles}>
        <legend className={styles.legend}>Telemetry channels</legend>
        {COMPARISON_CHANNELS.map((channel) => (
          <label
            key={channel.key}
            className={
              visibleChannels.has(channel.key) ? `${styles.chip} ${styles.active}` : styles.chip
            }
          >
            <input
              type="checkbox"
              checked={visibleChannels.has(channel.key)}
              onChange={() => toggleChannel(channel.key)}
              className={styles.checkbox}
            />
            {channel.label}
          </label>
        ))}
      </fieldset>
      <TelemetryCharts
        samples={samplesA}
        secondarySamples={samplesB}
        channels={[...visibleChannels]}
        cursorStore={useComparisonStore}
        corners={corners}
      />
    </Card>
  );
}
