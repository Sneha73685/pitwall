import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getTelemetry,
  getTrackPoints,
  type TelemetrySample,
  type TrackPoint,
} from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { TelemetryCharts } from "../telemetry-charts/TelemetryCharts";
import { TrackMap } from "./TrackMap";

/**
 * /sessions/:sessionId/drivers/:driverId/laps/:lapNumber: the selected lap's
 * static track map (M4) plus its distance-aligned telemetry channel traces
 * (M5) -- both driven by the same `getTelemetry` fetch (docs/releases/
 * m4-summary.md's "next milestone" note). Static only; hover-driven sync is V2.
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !driverId || !lapNumber) {
      return;
    }
    setLap(lapNumber);
    Promise.all([getTrackPoints(sessionId), getTelemetry(sessionId, driverId, Number(lapNumber))])
      .then(([track, lap]) => {
        setTrackPoints(track);
        setLapPoints(lap);
      })
      .catch(() => setError("Could not load track map."));
  }, [sessionId, driverId, lapNumber, setLap]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (trackPoints === null || lapPoints === null) {
    return <p>Loading track map...</p>;
  }

  return (
    <section>
      <h2>Track map</h2>
      <TrackMap trackPoints={trackPoints} lapPoints={lapPoints} />
      <h2>Telemetry</h2>
      <TelemetryCharts samples={lapPoints} />
    </section>
  );
}
