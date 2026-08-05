"""Session-wide driver performance analytics endpoints (M8). See
docs/api-model.md and docs/m8-implementation-plan.md for the design.

GET, no query params on the summary endpoint -- matching the existing
GET-for-multi-parameter-reads precedent (`/laps`, `/telemetry`,
`/laps/compare`) and plan §0.1 B3's decision to drop `min_valid_laps` as a
server param (the frontend derives ranking-eligibility from
`valid_lap_count` itself, already present in every response).

Thin route layer: fetches via the existing TelemetryRepository (no new
repository methods), delegates all computation to
app.services.session_analytics.aggregation, and maps its plain dataclasses
onto the Pydantic response models in app.models.session_analytics -- the
anti-corruption boundary (ADR-0009). Same error-response shape as every
other route in this API (HTTPException(status_code, detail), see
app/api/sessions.py) -- no new error envelope invented for this module. An
unknown `driver` path segment (session exists, driver doesn't) is not a
404: `TelemetryRepository.list_laps` already returns an empty list for a
`driver_id` filter that matches nothing (docs/api-model.md's existing
`/laps` convention), and that empty-laps input naturally produces an
all-`None`/empty-`laps` response via the same aggregation path a real
0-valid-lap driver would -- no special-casing needed.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_telemetry_repository
from app.models.session_analytics import (
    DriverLapMetrics,
    DriverLapsResponse,
    DriverSummary,
    SessionAnalyticsResponse,
    SessionAnalyticsWarning,
    SessionAnalyticsWarningCode,
)
from app.repositories import TelemetryRepository
from app.services.session_analytics.aggregation import DriverSummary as DriverSummaryResult
from app.services.session_analytics.aggregation import summarize_driver

router = APIRouter(prefix="/sessions", tags=["session-analytics"])

INSUFFICIENT_LAPS_THRESHOLD = 1
"""A driver with exactly this many valid laps gets an `insufficient_laps`
warning: consistency needs >= 2 points to be defined (see
app/services/session_analytics/consistency.py), so exactly 1 valid lap is
the case worth flagging -- 0 valid laps is already self-evident from
`valid_lap_count: 0` and doesn't need a warning to explain a null
consistency figure. Matches plan §0.4's example warning text verbatim
("1 valid lap; consistency metrics omitted").
"""


def _fetch_driver_summary(
    repository: TelemetryRepository, session_id: str, driver_id: str
) -> DriverSummaryResult:
    laps = repository.list_laps(session_id, driver_id=driver_id)
    telemetry_by_lap = {
        lap.lap_number: repository.get_telemetry(session_id, driver_id, lap.lap_number)
        for lap in laps
    }
    return summarize_driver(driver_id, laps, telemetry_by_lap)


def _to_driver_summary_model(summary: DriverSummaryResult) -> DriverSummary:
    return DriverSummary(
        driver=summary.driver_id,
        valid_lap_count=summary.valid_lap_count,
        best_lap_ms=summary.best_lap_ms,
        theoretical_best_lap_ms=summary.theoretical_best_lap_ms,
        theoretical_best_delta_ms=summary.theoretical_best_delta_ms,
        median_lap_ms=summary.median_lap_ms,
        consistency_ms=summary.consistency_ms,
        consistency_cv=summary.consistency_cv,
        full_throttle_pct=summary.full_throttle_pct,
        outlier_lap_count=summary.outlier_lap_count,
    )


def _insufficient_laps_warning(summary: DriverSummaryResult) -> SessionAnalyticsWarning | None:
    if summary.valid_lap_count != INSUFFICIENT_LAPS_THRESHOLD:
        return None
    return SessionAnalyticsWarning(
        code=SessionAnalyticsWarningCode.INSUFFICIENT_LAPS,
        driver=summary.driver_id,
        detail="1 valid lap; consistency metrics omitted",
    )


@router.get(
    "/{session_id}/analytics/drivers",
    response_model=SessionAnalyticsResponse,
    summary="Session-wide per-driver performance summary",
)
def get_session_analytics(
    session_id: str,
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> SessionAnalyticsResponse:
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    drivers = repository.list_drivers(session_id)
    summaries = [
        _fetch_driver_summary(repository, session_id, driver.driver_id) for driver in drivers
    ]

    # Max lap number reached by anyone in the session, not the sum of
    # every driver's own lap count (plan §0.4's explicit "NOT sum of
    # driver lap records" note) -- the closest derivable proxy for the
    # session's total lap distance, since no dedicated field for a
    # session's scheduled/actual lap count exists anywhere in the schema
    # (Session carries no lap-count field -- see app/models/telemetry.py).
    all_laps = repository.list_laps(session_id)
    session_lap_count = max((lap.lap_number for lap in all_laps), default=0)

    warnings = [
        warning
        for summary in summaries
        if (warning := _insufficient_laps_warning(summary)) is not None
    ]

    return SessionAnalyticsResponse(
        session_id=session_id,
        session_lap_count=session_lap_count,
        drivers=[_to_driver_summary_model(summary) for summary in summaries],
        warnings=warnings,
    )


@router.get(
    "/{session_id}/analytics/drivers/{driver}/laps",
    response_model=DriverLapsResponse,
    summary="One driver's lap-by-lap session-analytics metrics",
)
def get_driver_lap_metrics(
    session_id: str,
    driver: str,
    repository: TelemetryRepository = Depends(get_telemetry_repository),
) -> DriverLapsResponse:
    if repository.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    summary = _fetch_driver_summary(repository, session_id, driver)
    warning = _insufficient_laps_warning(summary)

    return DriverLapsResponse(
        session_id=session_id,
        driver=driver,
        laps=[
            DriverLapMetrics(
                lap_number=lap_metrics.lap_number,
                lap_time_ms=lap_metrics.lap_time_ms,
                is_valid=lap_metrics.is_valid,
                exclusion_reason=lap_metrics.exclusion_reason,
                is_outlier=lap_metrics.is_outlier,
                delta_to_theoretical_best_ms=lap_metrics.delta_to_theoretical_best_ms,
                delta_to_own_median_ms=lap_metrics.delta_to_own_median_ms,
                full_throttle_pct=lap_metrics.full_throttle_pct,
                brake_event_count=lap_metrics.brake_event_count,
            )
            for lap_metrics in summary.laps
        ],
        warnings=[warning] if warning is not None else [],
    )
