import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getTelemetry,
  getTrackPoints,
  type TelemetrySample,
  type TrackPoint,
} from "../../api/client";
import { useSelectionStore } from "../../state/selectionStore";
import { TrackMap } from "./TrackMap";

/**
 * /sessions/:sessionId/drivers/:driverId/laps/:lapNumber: the M4 track map --
 * the session's track shape with the selected lap's line and start point
 * plotted over it. Static only; hover-driven sync is V2.
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
    </section>
  );
}
