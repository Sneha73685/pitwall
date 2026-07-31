"""Shared synthetic Lap/TelemetrySample builders for the M6 domain-logic
test suite (test_lap_comparison_{validation,alignment,delta,sectors}.py).

Pure in-memory Pydantic objects -- no Parquet, no repository, no network,
matching this module's own pure-function scope (app/services/lap_comparison/
takes/returns plain objects, never touches the filesystem).
"""

from app.models.telemetry import Lap, TelemetrySample


def lap(**overrides: object) -> Lap:
    defaults: dict[str, object] = {
        "driver_id": "VER",
        "lap_number": 1,
        "lap_time_seconds": 90.0,
        "sector_1_seconds": 30.0,
        "sector_2_seconds": 30.0,
        "sector_3_seconds": 30.0,
        "is_personal_best": True,
        "is_accurate": True,
    }
    defaults.update(overrides)
    return Lap(**defaults)  # type: ignore[arg-type]


def sample(**overrides: object) -> TelemetrySample:
    defaults: dict[str, object] = {
        "distance_m": 0.0,
        "time_seconds": 0.0,
        "speed_kph": 250.0,
        "throttle_pct": 100.0,
        "brake_active": False,
        "rpm": 11000.0,
        "gear": 7,
        "drs_active": False,
        "x": 0.0,
        "y": 0.0,
        "z": 0.0,
    }
    defaults.update(overrides)
    return TelemetrySample(**defaults)  # type: ignore[arg-type]


def constant_speed_lap(
    *, distance_step: float, time_step: float, count: int
) -> list[TelemetrySample]:
    """A lap with a perfectly linear distance<->time relationship (constant
    speed), sorted ascending by distance -- matching ParquetRepository's
    actual return order, and the simplest possible input with an exactly
    known analytic interpolation result.
    """
    return [sample(distance_m=i * distance_step, time_seconds=i * time_step) for i in range(count)]
