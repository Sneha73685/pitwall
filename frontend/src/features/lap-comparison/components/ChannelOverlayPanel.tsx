import type { LapComparisonResponse } from "../../../api/client";
import { TelemetryCharts } from "../../telemetry-charts/TelemetryCharts";
import { COMPARISON_CHANNELS, useComparisonStore } from "../comparisonStore";
import { toChannelSamples } from "./toChannelSamples";

interface ChannelOverlayPanelProps {
  comparison: LapComparisonResponse;
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
 * Static, not cursor-synced -- see DeltaChart.tsx for why.
 */
export function ChannelOverlayPanel({ comparison }: ChannelOverlayPanelProps) {
  const visibleChannels = useComparisonStore((state) => state.visibleChannels);
  const toggleChannel = useComparisonStore((state) => state.toggleChannel);

  const samplesA = toChannelSamples(comparison.distance_m, comparison.channels, "a");
  const samplesB = toChannelSamples(comparison.distance_m, comparison.channels, "b");

  return (
    <div>
      <fieldset>
        <legend>Telemetry channels</legend>
        {COMPARISON_CHANNELS.map((channel) => (
          <label key={channel.key}>
            <input
              type="checkbox"
              checked={visibleChannels.has(channel.key)}
              onChange={() => toggleChannel(channel.key)}
            />
            {channel.label}
          </label>
        ))}
      </fieldset>
      <TelemetryCharts
        samples={samplesA}
        secondarySamples={samplesB}
        channels={[...visibleChannels]}
      />
    </div>
  );
}
