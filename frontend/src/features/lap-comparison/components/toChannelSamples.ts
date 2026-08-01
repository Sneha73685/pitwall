import type { ChannelSeries, TelemetrySample } from "../../../api/client";

/**
 * Reshapes the compare endpoint's per-channel `{a, b}` arrays (already
 * aligned to the shared `distance_m` grid, backend/app/models/lap_comparison.py)
 * into the `TelemetrySample[]` shape `TelemetryCharts` (M5, generalized in
 * Phase 5) already knows how to render -- lets Phase 7 reuse that component
 * for the comparison view's telemetry overlays instead of forking a second
 * chart implementation for the same six channels.
 *
 * `time_seconds`/`x`/`y`/`z` are never read by TelemetryCharts/buildChartOption
 * (position and elapsed time aren't rendered there); they're zeroed out here
 * purely to satisfy TelemetrySample's shape, not fabricated data.
 */
export function toChannelSamples(
  distanceM: number[],
  channels: Record<string, ChannelSeries>,
  lap: "a" | "b",
): TelemetrySample[] {
  return distanceM.map((distance, index) => ({
    distance_m: distance,
    time_seconds: 0,
    speed_kph: channels.speed_kph?.[lap][index] ?? 0,
    throttle_pct: channels.throttle_pct?.[lap][index] ?? 0,
    brake_active: (channels.brake_active?.[lap][index] ?? 0) > 0,
    rpm: channels.rpm?.[lap][index] ?? 0,
    gear: channels.gear?.[lap][index] ?? 0,
    drs_active: (channels.drs_active?.[lap][index] ?? 0) > 0,
    x: 0,
    y: 0,
    z: 0,
  }));
}
