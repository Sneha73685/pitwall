"""Schema tests for the M6 lap comparison response models.

No route or repository involved -- pure Pydantic validation, matching
Phase 1's scope (schemas + constants only; domain logic is Phase 2, the
route is Phase 3).
"""

import pytest
from pydantic import ValidationError

from app.models.lap_comparison import (
    COMPARE_CHANNELS,
    DEFAULT_COMPARE_RESOLUTION,
    MAX_COMPARE_RESOLUTION,
    ChannelSeries,
    ComparisonWarning,
    LapComparisonResponse,
    SectorDelta,
    WarningCode,
)
from app.models.telemetry import Lap


def _lap(**overrides: object) -> Lap:
    defaults: dict[str, object] = {
        "driver_id": "VER",
        "lap_number": 1,
        "lap_time_seconds": 91.234,
        "sector_1_seconds": 30.1,
        "sector_2_seconds": 31.0,
        "sector_3_seconds": 30.134,
        "is_personal_best": True,
        "is_accurate": True,
    }
    defaults.update(overrides)
    return Lap(**defaults)  # type: ignore[arg-type]


def _valid_payload() -> dict[str, object]:
    return {
        "session_id": "2023_monza_race",
        "lap_a": _lap(driver_id="VER"),
        "lap_b": _lap(driver_id="LEC", is_personal_best=False),
        "compared_distance_m": 5793.0,
        "distance_m": [0.0, 100.0, 200.0],
        "delta_ms": [0.0, 12.5, -4.0],
        "channels": {
            "speed_kph": ChannelSeries(a=[250.0, 251.0, 252.0], b=[249.0, 250.0, 253.0]),
        },
        "sectors": [SectorDelta(sector=1, delta_ms=45.0, faster="a")],
        "warnings": [],
    }


def test_valid_payload_parses() -> None:
    response = LapComparisonResponse(**_valid_payload())  # type: ignore[arg-type]

    assert response.session_id == "2023_monza_race"
    assert response.lap_a.driver_id == "VER"
    assert response.lap_b.driver_id == "LEC"
    assert response.delta_ms == [0.0, 12.5, -4.0]
    assert response.sectors[0].faster == "a"
    assert response.warnings == []


def test_missing_required_field_is_rejected() -> None:
    payload = _valid_payload()
    del payload["delta_ms"]

    with pytest.raises(ValidationError):
        LapComparisonResponse(**payload)  # type: ignore[arg-type]


def test_sector_delta_faster_rejects_values_other_than_a_or_b() -> None:
    with pytest.raises(ValidationError):
        SectorDelta(sector=1, delta_ms=10.0, faster="c")  # type: ignore[arg-type]


def test_sector_delta_rejects_sector_outside_one_to_three() -> None:
    with pytest.raises(ValidationError):
        SectorDelta(sector=4, delta_ms=10.0, faster="a")  # type: ignore[arg-type]


def test_comparison_warning_requires_a_known_code() -> None:
    warning = ComparisonWarning(code=WarningCode.INVALID_LAP_A, detail="lap 2 not accurate")

    assert warning.code == WarningCode.INVALID_LAP_A
    assert warning.detail == "lap 2 not accurate"

    with pytest.raises(ValidationError):
        ComparisonWarning(code="not_a_real_code")  # type: ignore[arg-type]


def test_delta_ms_field_description_states_the_sign_convention() -> None:
    """Guards against someone quietly deleting the sign-convention docs
    (docs/m6-implementation-plan.md §0.4) -- this is the single highest-risk
    line in the whole milestone, and it must stay documented in the schema,
    not just in a comment that can drift from the code.
    """
    description = LapComparisonResponse.model_fields["delta_ms"].description

    assert description is not None
    assert "lap A is faster" in description


def test_compare_channels_matches_telemetry_sample_fields() -> None:
    assert COMPARE_CHANNELS == (
        "speed_kph",
        "throttle_pct",
        "brake_active",
        "rpm",
        "gear",
        "drs_active",
    )


def test_resolution_constants_are_sane() -> None:
    assert 0 < DEFAULT_COMPARE_RESOLUTION <= MAX_COMPARE_RESOLUTION
    assert MAX_COMPARE_RESOLUTION == 2000
