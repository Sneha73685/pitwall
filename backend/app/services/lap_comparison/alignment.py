"""Distance-grid alignment for two-lap comparison (M6).

Builds a common distance grid spanning both laps' overlapping distance
range and interpolates each lap's time/telemetry onto it via np.interp --
the approved M6 interpolation implementation (linear only; spline
overshoot near hard-braking transients is a real correctness risk, not
just a theoretical one -- see docs/m6-design-review.md §8.3).

No separate "distance computation" utility exists to reuse (Phase 0
finding): distance_m is already a plain field on every TelemetrySample
the repository returns -- FastF1 provides it directly and the pipeline
passes it through unchanged. This module only interpolates what callers
already have; it does not derive distance from anything else.

Callers must run validation.validate_monotonic() on each lap's samples
before calling align_lap() -- np.interp silently produces meaningless
results if its x-array (distance) isn't ascending, and this module does
not re-check that itself.
"""

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from app.models.lap_comparison import COMPARE_CHANNELS
from app.models.telemetry import TelemetrySample

FloatArray = npt.NDArray[np.float64]


@dataclass(frozen=True)
class AlignedLap:
    """One lap's time and telemetry channels, interpolated onto a shared distance grid."""

    time_seconds: FloatArray
    channels: dict[str, FloatArray]


def _channel_value(sample: TelemetrySample, channel: str) -> float:
    """Read one channel's numeric value off a sample, converting booleans to
    0.0/1.0 -- matching the M5 frontend's own boolean-channel convention
    (frontend/src/features/telemetry-charts/chartOptions.ts's channelValue()),
    so a distance-realigned boolean trace behaves the same way on both sides
    of the API boundary.
    """
    raw = getattr(sample, channel)
    if isinstance(raw, bool):
        return 1.0 if raw else 0.0
    return float(raw)


def max_distance(samples: list[TelemetrySample]) -> float:
    """The furthest distance_m reached in a lap's telemetry."""
    return max(sample.distance_m for sample in samples)


def build_distance_grid(
    max_distance_a: float, max_distance_b: float, resolution: int
) -> FloatArray:
    """`resolution` evenly-spaced points from 0 to the shorter of the two
    laps' max distance (docs/m6-design-review.md §8.2 step 2) -- e.g. one
    lap's telemetry being truncated (an out-lap/in-lap) doesn't extrapolate
    the other lap past what it actually covers.
    """
    shorter_max_distance = min(max_distance_a, max_distance_b)
    return np.linspace(0.0, shorter_max_distance, resolution).astype(np.float64)


def align_lap(samples: list[TelemetrySample], grid: FloatArray) -> AlignedLap:
    """Interpolate one lap's time and telemetry channels onto `grid`.

    `samples` must be sorted ascending by distance_m (ParquetRepository's
    default return order already satisfies this) and must have already
    passed validate_monotonic() -- see module docstring.
    """
    distance = np.array([sample.distance_m for sample in samples], dtype=np.float64)
    time = np.array([sample.time_seconds for sample in samples], dtype=np.float64)

    aligned_time = np.interp(grid, distance, time)
    aligned_channels = {
        channel: np.interp(
            grid,
            distance,
            np.array([_channel_value(sample, channel) for sample in samples], dtype=np.float64),
        )
        for channel in COMPARE_CHANNELS
    }
    return AlignedLap(time_seconds=aligned_time, channels=aligned_channels)
