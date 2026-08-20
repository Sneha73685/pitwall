import type { EChartsCoreOption } from "echarts/core";
import type { DriverSummary } from "../../../api/client";
import { driverColor } from "../../../components/driverColor";

/**
 * Builds the lap-by-lap running-order option (M35, docs/m35-design-review.md
 * §9). One connected line series per driver -- the same multi-driver,
 * per-driver-colored pattern
 * `features/tyre-performance/components/driverCompoundComparisonChartOptions.ts`
 * already established (M35's own design review found that file, not
 * `lapTimeTrendChartOptions.ts`, is the correct existing precedent:
 * `lapTimeTrendChartOptions.ts` builds a single-driver series only).
 *
 * Y-axis is inverted so P1 renders at the top, matching every real F1
 * position chart's convention. Laps with a `null` position (a driver's
 * DNF-generated lap, or a session type FastF1 doesn't rank -- see
 * docs/m35-design-review.md §3) are simply excluded from that driver's
 * line, never plotted as 0 or otherwise fabricated. Drivers with no
 * `positions` field at all (optional on the frontend type, docs/m35-design-review.md
 * §9) or zero non-null positions produce no series at all.
 */
export function buildPositionTrendChartOption(drivers: DriverSummary[]): EChartsCoreOption {
  const withPositions = drivers.filter(
    (driver) => driver.positions?.some((p) => p.position !== null) ?? false,
  );

  const series = withPositions.map((driver) => {
    const points: [number, number][] = (driver.positions ?? [])
      .filter((p): p is { lap_number: number; position: number } => p.position !== null)
      .map((p) => [p.lap_number, p.position]);
    const color = driverColor(driver.driver);

    return {
      name: driver.driver,
      type: "line",
      showSymbol: true,
      symbolSize: 6,
      color,
      lineStyle: { color },
      data: points,
    };
  });

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { color: "#90a0b3", fontFamily: "monospace" },
    grid: { left: 70, right: 20, top: 40, bottom: 50 },
    xAxis: {
      type: "value",
      name: "Lap",
      nameLocation: "middle",
      nameGap: 25,
      minInterval: 1,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    yAxis: {
      type: "value",
      name: "Position",
      nameLocation: "middle",
      nameGap: 35,
      inverse: true,
      minInterval: 1,
      axisLine: { lineStyle: { color: "#3a4453" } },
      splitLine: { lineStyle: { color: "#232a35" } },
    },
    legend: {
      data: withPositions.map((driver) => driver.driver),
      textStyle: { color: "#90a0b3" },
      top: 0,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a2029",
      borderColor: "#3a4453",
      textStyle: { color: "#e8edf3" },
    },
    series: series as EChartsCoreOption["series"],
  };
}
