import { useState } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { RawLapTimeByCompound } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { sortByCompoundOrder } from "../compoundOrder";
import { buildDriverCompoundComparisonChartOption } from "./driverCompoundComparisonChartOptions";
import styles from "./DriverCompoundComparisonChart.module.css";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const CHART_HEIGHT = 320;

interface DriverCompoundComparisonChartProps {
  rawLapTimesByCompound: RawLapTimeByCompound[];
}

/**
 * Raw, per-driver lap-time comparison on one compound at a time (design
 * note §8.6). NOT a ranking: driver order is alphabetical everywhere
 * (legend, tab default), color is per-driver identity only, and there is no
 * "fastest"/"best" label, badge, or sort control anywhere in this
 * component -- `RawLapTimeByCompound` itself carries no such field.
 *
 * The compound filter is a small local-state tab group (at most 5 FIA
 * compounds), not a dropdown -- more discoverable at this option count and
 * consistent with the dashboard's density (design note §8.6).
 */
export function DriverCompoundComparisonChart({
  rawLapTimesByCompound,
}: DriverCompoundComparisonChartProps) {
  const availableCompounds = sortByCompoundOrder(
    Array.from(new Set(rawLapTimesByCompound.map((entry) => entry.compound))).map((compound) => ({
      compound,
    })),
    (item) => item.compound,
  ).map((item) => item.compound);

  const [selectedCompound, setSelectedCompound] = useState<string | null>(
    availableCompounds[0] ?? null,
  );
  const effectiveCompound = selectedCompound ?? availableCompounds[0] ?? null;

  const containerRef = useEChartsInstance(
    () =>
      effectiveCompound
        ? buildDriverCompoundComparisonChartOption(rawLapTimesByCompound, effectiveCompound)
        : { series: [] },
    [rawLapTimesByCompound, effectiveCompound],
  );

  if (availableCompounds.length === 0) {
    return <EmptyState>No driver comparison data available for this session.</EmptyState>;
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.caption}>
        Raw lap times for each driver on one compound at a time, aligned by lap-in-stint index.
        Drivers are ordered alphabetically and colored by identity, not by pace &mdash; this is not
        a ranking.
      </p>
      <div className={styles.tabs} role="group" aria-label="Select compound">
        {availableCompounds.map((compound) => (
          <button
            key={compound}
            type="button"
            className={
              compound === effectiveCompound ? `${styles.tab} ${styles.tabActive}` : styles.tab
            }
            aria-pressed={compound === effectiveCompound}
            onClick={() => setSelectedCompound(compound)}
          >
            {compound}
          </button>
        ))}
      </div>
      <div
        ref={containerRef}
        role="img"
        aria-label={`Raw driver lap time comparison on ${effectiveCompound ?? ""}`}
        data-testid="driver-compound-comparison-chart"
        className={styles.chart}
        style={{ width: "100%", height: CHART_HEIGHT }}
      />
    </div>
  );
}
