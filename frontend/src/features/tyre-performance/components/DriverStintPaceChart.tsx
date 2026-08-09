import * as echarts from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { StintPace, StintPaceLap } from "../../../api/client";
import { useEChartsInstance } from "../../../components/useEChartsInstance";
import { buildDriverStintPaceChartOption } from "./driverStintPaceChartOptions";
import styles from "./DriverStintPaceChart.module.css";

echarts.use([
  ScatterChart,
  LineChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const CHART_HEIGHT = 340;

interface DriverStintPaceChartProps {
  laps: StintPaceLap[];
  stints: StintPace[];
}

/**
 * One driver's lap time by lap number, segmented by stint (design note
 * §7.1): every lap is plotted (scatter), with a connected raw line drawn
 * only across a stint's own trend-eligible laps -- never bridging a pit
 * stop, never fitted or smoothed. Marker shape (not color) distinguishes
 * in-laps/out-laps/other-excluded laps from normal laps; color always
 * encodes compound via the reused `compoundColor`.
 */
export function DriverStintPaceChart({ laps, stints }: DriverStintPaceChartProps) {
  const containerRef = useEChartsInstance(
    () => buildDriverStintPaceChartOption(laps, stints),
    [laps, stints],
  );

  return (
    <div className={styles.wrapper}>
      <p className={styles.caption}>
        Lap time by lap number. Circles are normal laps; an upward triangle marks an out-lap and a
        downward triangle marks an in-lap; a diamond marks a lap excluded for another reason. All
        three are excluded from the connected line and from this stint&rsquo;s consistency figures.
        Color marks compound; the line never crosses a pit stop.
      </p>
      <div
        ref={containerRef}
        role="img"
        aria-label="Driver stint pace chart: lap time by lap number, segmented by stint"
        data-testid="driver-stint-pace-chart"
        className={styles.chart}
        style={{ width: "100%", height: CHART_HEIGHT }}
      />
    </div>
  );
}
