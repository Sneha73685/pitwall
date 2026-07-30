"""TrackPoint derivation.

Track geometry isn't a channel FastF1 (or any provider) reports directly --
it's derived by projecting one reference lap's telemetry down to its
distance/position channels. See docs/data-model.md for why a single
reference lap is sufficient for V1's static track map.
"""

from pitwall_pipeline.models import TelemetrySample, TrackPoint


def derive_track_points(
    reference_lap_telemetry: list[TelemetrySample], *, session_id: str
) -> list[TrackPoint]:
    """Project one lap's telemetry samples down to track geometry points.

    `reference_lap_telemetry` should be the samples for a single, complete,
    representative lap (typically the session's overall fastest lap) --
    mixing samples from multiple laps would produce a nonsensical track
    shape.
    """
    return [
        TrackPoint(session_id=session_id, distance_m=sample.distance_m, x=sample.x, y=sample.y)
        for sample in reference_lap_telemetry
    ]
