"""FastF1Provider: the sole V1 TelemetryProvider implementation.

This is the only module allowed to call FastF1's live/cached API directly
(ADR-0005). It fetches raw session data and delegates all shape conversion
to pitwall_pipeline.normalize and pitwall_pipeline.track.
"""

import logging
from pathlib import Path

import fastf1
import pandas as pd

from pitwall_pipeline.models import NormalizedSessionData, SessionType, TelemetrySample, TrackPoint
from pitwall_pipeline.normalize import (
    normalize_drivers,
    normalize_laps,
    normalize_session,
    normalize_telemetry,
)
from pitwall_pipeline.providers.base import TelemetryProvider
from pitwall_pipeline.track import derive_track_points

logger = logging.getLogger(__name__)

# Maps our SessionType vocabulary to the identifier strings FastF1's
# get_session() accepts (fastf1.events._SESSION_TYPE_ABBREVIATIONS).
_SESSION_TYPE_TO_FASTF1_IDENTIFIER: dict[SessionType, str] = {
    SessionType.PRACTICE_1: "FP1",
    SessionType.PRACTICE_2: "FP2",
    SessionType.PRACTICE_3: "FP3",
    SessionType.QUALIFYING: "Q",
    SessionType.SPRINT_QUALIFYING: "SQ",
    SessionType.SPRINT: "S",
    SessionType.RACE: "R",
}


class FastF1Provider(TelemetryProvider):
    """Fetches and normalizes one FastF1 session."""

    def __init__(self, cache_dir: Path) -> None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        fastf1.Cache.enable_cache(str(cache_dir))

    def load_session(
        self, season: int, event: str, session_type: SessionType
    ) -> NormalizedSessionData:
        identifier = _SESSION_TYPE_TO_FASTF1_IDENTIFIER[session_type]
        ff1_session = fastf1.get_session(season, event, identifier)
        ff1_session.load()

        session_date = None
        if ff1_session.date is not None and not pd.isna(ff1_session.date):
            session_date = ff1_session.date.isoformat()

        session = normalize_session(
            season=season,
            event_name=str(ff1_session.event["EventName"]),
            round_number=int(ff1_session.event["RoundNumber"]),
            location=str(ff1_session.event["Location"]),
            country=str(ff1_session.event["Country"]),
            session_type=session_type,
            session_date=session_date,
        )

        drivers = normalize_drivers(ff1_session.results, session_id=session.session_id)
        laps = normalize_laps(ff1_session.laps, session_id=session.session_id)

        telemetry: list[TelemetrySample] = []
        for driver in drivers:
            driver_laps = ff1_session.laps.pick_drivers(driver.driver_id)
            for _, lap in driver_laps.iterlaps():
                lap_number = int(lap["LapNumber"])
                try:
                    lap_telemetry = lap.get_telemetry()
                except Exception:
                    logger.warning(
                        "Skipping telemetry for %s lap %d in %s: could not be loaded",
                        driver.driver_id,
                        lap_number,
                        session.session_id,
                        exc_info=True,
                    )
                    continue
                telemetry.extend(
                    normalize_telemetry(
                        lap_telemetry,
                        session_id=session.session_id,
                        driver_id=driver.driver_id,
                        lap_number=lap_number,
                    )
                )

        track_points = self._derive_track_points(ff1_session, session_id=session.session_id)

        return NormalizedSessionData(
            session=session,
            drivers=drivers,
            laps=laps,
            telemetry=telemetry,
            track_points=track_points,
        )

    @staticmethod
    def _derive_track_points(
        ff1_session: fastf1.core.Session, *, session_id: str
    ) -> list[TrackPoint]:
        fastest = ff1_session.laps.pick_fastest()
        if fastest is None:
            logger.warning("No fastest lap found for %s; track points will be empty", session_id)
            return []
        try:
            fastest_telemetry = fastest.get_telemetry()
        except Exception:
            logger.warning(
                "Could not load fastest-lap telemetry for %s; track points will be empty",
                session_id,
                exc_info=True,
            )
            return []
        reference_samples = normalize_telemetry(
            fastest_telemetry,
            session_id=session_id,
            driver_id=str(fastest["Driver"]),
            lap_number=int(fastest["LapNumber"]),
        )
        return derive_track_points(reference_samples, session_id=session_id)
