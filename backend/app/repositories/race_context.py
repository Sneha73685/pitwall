"""RaceContextRepository interface.

See docs/adr/0011-hybrid-storage-architecture.md. A second, separate
repository interface from `TelemetryRepository` (docs/adr/0006-telemetry-
repository-abstraction.md) -- not an extension of it. Stints and pit stops
are genuinely relational (a stint is a range of laps bounded by pit
events), which is exactly what motivated introducing PostgreSQL as a
second backing store alongside Parquet in the first place; folding these
methods into `TelemetryRepository` would force that interface's sole
implementation to also know about a storage engine it has no other reason
to touch. `PostgresRaceContextRepository` (Phase 3) is its sole
implementation. Nothing here may reference psycopg, SQL, or a connection
object.
"""

from abc import ABC, abstractmethod

from app.models.race_context import PitStop, Stint


class RaceContextRepository(ABC):
    """Reads relational race-strategy data (stints, pit stops) for the API to serve."""

    @abstractmethod
    def list_stints(self, session_id: str, driver_id: str | None = None) -> list[Stint]:
        """Return stints for one session, optionally filtered to one driver,
        ordered by driver then stint number (docs/m11-design-review.md §6.1
        -- mirrors `list_pit_stops`'s existing optional-filter shape rather
        than a second method)."""
        raise NotImplementedError

    @abstractmethod
    def list_pit_stops(self, session_id: str, driver_id: str | None = None) -> list[PitStop]:
        """Return pit stops for one session, optionally filtered to one driver."""
        raise NotImplementedError
