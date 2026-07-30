"""TelemetryRepository interface.

See docs/adr/0006-telemetry-repository-abstraction.md and docs/api-model.md.
Shaped around the API's actual read patterns, not a generic CRUD interface --
ParquetRepository is the sole V1 implementation, but nothing here may
reference Parquet, pandas, or a file path.
"""

from abc import ABC, abstractmethod

from app.models import Driver, Lap, Session, TelemetrySample, TrackPoint


class TelemetryRepository(ABC):
    """Reads ingested session data for the API to serve."""

    @abstractmethod
    def list_sessions(self) -> list[Session]:
        """Return every ingested session in the cache."""
        raise NotImplementedError

    @abstractmethod
    def get_session(self, session_id: str) -> Session | None:
        """Return one session by ID, or None if it doesn't exist."""
        raise NotImplementedError

    @abstractmethod
    def list_drivers(self, session_id: str) -> list[Driver]:
        """Return every driver who competed in one session."""
        raise NotImplementedError

    @abstractmethod
    def list_laps(self, session_id: str, driver_id: str | None = None) -> list[Lap]:
        """Return laps for one session, optionally filtered to one driver."""
        raise NotImplementedError

    @abstractmethod
    def get_telemetry(
        self, session_id: str, driver_id: str, lap_number: int
    ) -> list[TelemetrySample]:
        """Return one driver's one lap's telemetry samples, ordered by distance."""
        raise NotImplementedError

    @abstractmethod
    def list_track_points(self, session_id: str) -> list[TrackPoint]:
        """Return one session's track geometry, ordered by distance."""
        raise NotImplementedError
