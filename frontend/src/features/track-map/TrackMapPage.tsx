import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getSession,
  getTelemetry,
  getTrackPoints,
  listLaps,
  type Lap,
  type Session,
  type TelemetrySample,
  type TrackPoint,
} from "../../api/client";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useSelectionStore } from "../../state/selectionStore";
import { TelemetryCharts } from "../telemetry-charts/TelemetryCharts";
import { TopSummaryPanel } from "./components/TopSummaryPanel";
import { useTrackMapCursorStore } from "./cursorStore";
import { detectCorners } from "./detectCorners";
import { nearestTrackPointAt } from "./nearestTrackPointAt";
import { TrackMap } from "./TrackMap";
import styles from "./TrackMapPage.module.css";

/**
 * /sessions/:sessionId/drivers/:driverId/laps/:lapNumber: the selected lap's
 * static track map (M4) plus its distance-aligned telemetry channel traces
 * (M5) -- both driven by the same `getTelemetry` fetch (docs/releases/
 * m4-summary.md's "next milestone" note).
 *
 * M9 adds a top summary panel (driver/lap/session context) sourced from
 * `getSession`/`listLaps` -- both already-existing API client calls, no new
 * endpoints -- fetched alongside the track/telemetry data.
 *
 * M14 (docs/m14-design-review.md §5/§6.1): hovering `TelemetryCharts`
 * synchronizes `TrackMap`'s marker via `useTrackMapCursorStore`, this
 * page's sibling to `comparisonStore`. The store is cleared on mount and
 * whenever `sessionId`/`driverId`/`lapNumber` changes -- the same
 * dependency array the data-fetch effect below already uses -- so a stale
 * marker from the previous lap never appears on the next one.
 *
 * M22 (docs/m22-design-review.md §6/§11): corner regions are computed once
 * per `trackPoints` fetch (`useMemo`, not per render), from this session's
 * own already-fetched track geometry -- no new fetch, no backend change.
 * Passed to both `TrackMap` and `TelemetryCharts` so the same regions
 * appear on both surfaces, by construction (one array, one source).
 */
export function TrackMapPage() {
  const { sessionId, driverId, lapNumber } = useParams<{
    sessionId: string;
    driverId: string;
    lapNumber: string;
  }>();
  const setLap = useSelectionStore((state) => state.setLap);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[] | null>(null);
  const [lapPoints, setLapPoints] = useState<TelemetrySample[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [laps, setLaps] = useState<Lap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cursorDistanceM = useTrackMapCursorStore((state) => state.distanceM);
  const clearCursor = useTrackMapCursorStore((state) => state.clearCursor);
  const corners = useMemo(() => (trackPoints ? detectCorners(trackPoints) : []), [trackPoints]);

  useEffect(() => {
    clearCursor();
  }, [sessionId, driverId, lapNumber, clearCursor]);

  useEffect(() => {
    if (!sessionId || !driverId || !lapNumber) {
      return;
    }
    setLap(lapNumber);
    Promise.all([
      getTrackPoints(sessionId),
      getTelemetry(sessionId, driverId, Number(lapNumber)),
      getSession(sessionId),
      listLaps(sessionId, driverId),
    ])
      .then(([track, lap, sessionInfo, driverLaps]) => {
        setTrackPoints(track);
        setLapPoints(lap);
        setSession(sessionInfo);
        setLaps(driverLaps);
      })
      .catch(() => setError("Could not load track map."));
  }, [sessionId, driverId, lapNumber, setLap]);

  if (error) {
    return <ErrorState>{error}</ErrorState>;
  }

  if (trackPoints === null || lapPoints === null || session === null || laps === null) {
    return <LoadingState>Loading track map...</LoadingState>;
  }

  const currentLap = laps.find((lap) => lap.lap_number === Number(lapNumber)) ?? null;
  const cursorPoint = nearestTrackPointAt(lapPoints, cursorDistanceM);

  return (
    <section className={styles.workspace}>
      <TopSummaryPanel driver={driverId ?? ""} session={session} lap={currentLap} laps={laps} />
      <Card title="Track Map">
        <TrackMap
          trackPoints={trackPoints}
          lapPoints={lapPoints}
          cursorPoint={cursorPoint}
          cornerRegions={corners}
        />
      </Card>
      <Card title="Telemetry">
        <TelemetryCharts
          samples={lapPoints}
          cursorStore={useTrackMapCursorStore}
          corners={corners}
        />
      </Card>
    </section>
  );
}
