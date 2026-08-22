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
from app.services.session_analytics.filtering import classify_lap


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


_EXCLUSION_WARNING_CODES: dict[str, tuple[WarningCode, WarningCode]] = {
    "yellow_flag": (WarningCode.YELLOW_FLAG_LAP_A, WarningCode.YELLOW_FLAG_LAP_B),
    "track_limits": (WarningCode.TRACK_LIMITS_LAP_A, WarningCode.TRACK_LIMITS_LAP_B),
}


def collect_warnings(lap_a: Lap, lap_b: Lap) -> list[ComparisonWarning]:
    """Structured, non-blocking warnings about this comparison.

    `is_accurate` (FastF1's telemetry-integrity heuristic) and
    `classify_lap(lap).exclusion_reason` (M36/M40's yellow-flag/
    track-limits classification, app/services/session_analytics/
    filtering.py) are checked independently, per that module's own
    documented rule that a track-limits deletion is an official-validity
    ruling, not a telemetry-quality signal -- so an exclusion warning
    never suppresses an accuracy warning for the same lap, or vice versa
    (docs/m43-design-review.md). `classify_lap` is imported, not
    reimplemented, following the same cross-service precedent M41 already
    established (app/services/tyre_performance/stint_eligibility.py).

    `exclusion_reason` is `None` for every lap ingested before M36/M40, or
    otherwise unaffected -- those laps emit no exclusion warning, matching
    this function's pre-M43 behavior exactly (docs/m43-design-review.md
    §7). A lap can never be both `"yellow_flag"` and `"track_limits"`:
    `classify_lap` already resolves that precedence (track_limits wins,
    docs/m40-design-review.md §21) before this function ever sees it.
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

    exclusion_reason_a = classify_lap(lap_a).exclusion_reason
    if exclusion_reason_a is not None:
        code_a, _ = _EXCLUSION_WARNING_CODES[exclusion_reason_a]
        warnings.append(
            ComparisonWarning(code=code_a, detail=f"Lap A is affected by {exclusion_reason_a}.")
        )

    exclusion_reason_b = classify_lap(lap_b).exclusion_reason
    if exclusion_reason_b is not None:
        _, code_b = _EXCLUSION_WARNING_CODES[exclusion_reason_b]
        warnings.append(
            ComparisonWarning(code=code_b, detail=f"Lap B is affected by {exclusion_reason_b}.")
        )

    return warnings
