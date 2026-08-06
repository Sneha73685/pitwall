"""Per-lap and pooled-per-driver driving-style metrics (M8 §8.3):
full-throttle percentage and brake-event (rising-edge) counting.
"""

from app.models.telemetry import TelemetrySample

FULL_THROTTLE_THRESHOLD_PCT = 99.0
"""`throttle_pct >= 99`, not `== 100`: absorbs sensor noise near full
throttle without a fitted/learned threshold (design doc §8.3's explicit
"threshold-based, not modeled" decision). A fixed, documented constant,
not a magic number re-typed elsewhere.
"""


def _full_throttle_sample_counts(samples: list[TelemetrySample]) -> tuple[int, int]:
    """`(full_throttle_sample_count, total_sample_count)` for one lap's
    telemetry -- the raw counts pooled aggregation needs (see
    `pooled_full_throttle_pct`), not an already-divided per-lap percentage.
    """
    total = len(samples)
    full_throttle = sum(
        1 for sample in samples if sample.throttle_pct >= FULL_THROTTLE_THRESHOLD_PCT
    )
    return full_throttle, total


def full_throttle_pct(samples: list[TelemetrySample]) -> float | None:
    """One lap's full-throttle percentage. `None` (not `0.0`) if the lap
    has no telemetry samples at all -- "no data" and "never at full
    throttle" are different things.
    """
    full_throttle, total = _full_throttle_sample_counts(samples)
    if total == 0:
        return None
    return full_throttle / total * 100.0


def pooled_full_throttle_pct(samples_by_lap: list[list[TelemetrySample]]) -> float | None:
    """Driver/session-level full-throttle percentage, pooled across laps:
    `(total full-throttle samples across all given laps) / (total samples
    across all given laps) * 100` -- NOT a mean of each lap's own
    percentage (plan §0.5's explicit decision), since an unweighted
    mean-of-means would over/under-weight laps with different sample
    counts.
    """
    total_full_throttle = 0
    total_samples = 0
    for samples in samples_by_lap:
        full_throttle, total = _full_throttle_sample_counts(samples)
        total_full_throttle += full_throttle
        total_samples += total
    if total_samples == 0:
        return None
    return total_full_throttle / total_samples * 100.0


def brake_event_count(samples: list[TelemetrySample]) -> int:
    """Count of `brake_active` rising edges (`False -> True` transitions)
    over one lap, in chronological order.

    No threshold or debounce window is needed: `brake_active` is already a
    clean boolean signal (Phase 0 finding, plan §0.2 Q2 -- confirmed
    against `TelemetrySample.brake_active: bool`), unlike the continuous/
    pressure channel the design doc's §8.3 treated as a live possibility.

    Samples are re-sorted by `time_seconds` before counting:
    `ParquetRepository.get_telemetry()` returns samples sorted by
    `distance_m`, and a "rising edge" is only a meaningful concept in
    chronological order -- the same caveat `validate_monotonic` and
    `compute_sector_deltas` already document elsewhere in this codebase.
    """
    ordered = sorted(samples, key=lambda sample: sample.time_seconds)
    count = 0
    was_braking = False
    for sample in ordered:
        if sample.brake_active and not was_braking:
            count += 1
        was_braking = sample.brake_active
    return count
