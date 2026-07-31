"""Comparability validation for two-lap comparison (M6): monotonicity
checks (reject, never repair) and structured warnings.

No FastAPI import here, or anywhere under app/services/lap_comparison/
(pure functions and exceptions, testable without spinning up the app).
The API route (Phase 3) is responsible for catching LapComparisonError
subclasses and translating them into the appropriate HTTPException.

Deliberately does not check for a "mismatched circuit"/session mismatch
(docs/m6-design-review.md §10): the API is scoped to a single session_id
path parameter (both laps are always fetched from the same session), and
TelemetrySample/Lap carry no session_id field to check even if it wanted
to (dropped per the URL-implied-field convention, docs/api-model.md) --
so there is nothing for this endpoint to violate, structurally.
"""

from app.models.lap_comparison import ComparisonWarning, WarningCode
from app.models.telemetry import Lap, TelemetrySample


class LapComparisonError(Exception):
    """Base class for comparison-validation failures."""


class EmptyTelemetryError(LapComparisonError):
    """Raised when a lap has no telemetry samples to compare."""

    def __init__(self, lap_label: str) -> None:
        self.lap_label = lap_label
        super().__init__(f"Lap {lap_label} has no telemetry samples to compare.")


class NonMonotonicDistanceError(LapComparisonError):
    """Raised when a lap's distance decreases somewhere in chronological order."""

    def __init__(
        self, lap_label: str, index: int, distance_m: float, previous_distance_m: float
    ) -> None:
        self.lap_label = lap_label
        self.index = index
        self.distance_m = distance_m
        self.previous_distance_m = previous_distance_m
        super().__init__(
            f"Lap {lap_label}: distance is non-monotonic at telemetry sample "
            f"{index} (distance dropped from {previous_distance_m:.1f}m to "
            f"{distance_m:.1f}m). This usually means a spin, off-track "
            "excursion, or a data glitch; the comparison has been rejected "
            "rather than silently repaired."
        )


def validate_monotonic(samples: list[TelemetrySample], *, lap_label: str) -> None:
    """Reject (never repair) a lap whose distance decreases anywhere in
    chronological order.

    ParquetRepository.get_telemetry() returns samples sorted by distance_m
    (for the track map / single-lap chart's own needs), not by time --
    distance-sorted data is trivially "monotonic" no matter what actually
    happened during the lap, so this re-sorts by time_seconds first to
    recover chronological order, which is the only order "distance went
    backwards" is a meaningful statement in.
    """
    if not samples:
        raise EmptyTelemetryError(lap_label)

    ordered = sorted(samples, key=lambda sample: sample.time_seconds)
    previous = ordered[0]
    for index, sample in enumerate(ordered[1:], start=1):
        if sample.distance_m < previous.distance_m:
            raise NonMonotonicDistanceError(
                lap_label, index, sample.distance_m, previous.distance_m
            )
        previous = sample


def collect_warnings(lap_a: Lap, lap_b: Lap) -> list[ComparisonWarning]:
    """Structured, non-blocking warnings about this comparison.

    Only `is_accurate` is checked -- it is the only lap-quality signal
    that exists anywhere in the current schema (Phase 0 finding: no
    yellow-flag or pit-lane/track-status data exists in the Parquet cache
    or the Lap model). WarningCode defines codes for those conditions for
    forward-compatibility, but this function never emits them -- they are
    not fabricated from data that doesn't exist.
    """
    warnings: list[ComparisonWarning] = []
    if not lap_a.is_accurate:
        warnings.append(
            ComparisonWarning(
                code=WarningCode.INVALID_LAP_A, detail="Lap A is not marked accurate."
            )
        )
    if not lap_b.is_accurate:
        warnings.append(
            ComparisonWarning(
                code=WarningCode.INVALID_LAP_B, detail="Lap B is not marked accurate."
            )
        )
    return warnings
