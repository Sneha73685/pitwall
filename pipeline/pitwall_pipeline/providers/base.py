"""TelemetryProvider interface.

See docs/adr/0005-telemetry-provider-abstraction.md and docs/data-model.md.
Shaped around PitWall's normalized internal schema (pitwall_pipeline.models),
not around any single provider's native API -- FastF1Provider is the sole V1
implementation, but nothing here may reference FastF1 types.
"""

from abc import ABC, abstractmethod

from pitwall_pipeline.models import NormalizedSessionData, SessionType


class TelemetryProvider(ABC):
    """Fetches and normalizes one full session's telemetry data."""

    @abstractmethod
    def load_session(
        self, season: int, event: str, session_type: SessionType
    ) -> NormalizedSessionData:
        """Fetch and normalize one session, identified by season/event/session type."""
        raise NotImplementedError
