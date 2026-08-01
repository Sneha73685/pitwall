import { COMPARISON_CHANNELS, useComparisonStore } from "../comparisonStore";

/**
 * Shell only (M6 Phase 6): toggle controls for each channel, plus a
 * placeholder for each currently-visible one. Real TelemetryCharts/
 * ECharts wiring is Phase 7 -- this component does not import or render
 * any chart. Speed is visible by default (docs/m6-implementation-plan.md
 * §0.2); the rest exist as toggles, off until switched on.
 */
export function ChannelOverlayPanel() {
  const visibleChannels = useComparisonStore((state) => state.visibleChannels);
  const toggleChannel = useComparisonStore((state) => state.toggleChannel);

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
      <div>
        {COMPARISON_CHANNELS.filter((channel) => visibleChannels.has(channel.key)).map(
          (channel) => (
            <p key={channel.key} data-testid={`channel-placeholder-${channel.key}`}>
              {channel.label} chart (Phase 7)
            </p>
          ),
        )}
      </div>
    </div>
  );
}
