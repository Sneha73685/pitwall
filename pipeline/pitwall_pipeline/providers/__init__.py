"""TelemetryProvider interface and implementations (e.g. FastF1Provider).

See docs/adr/0005-telemetry-provider-abstraction.md for the rationale and
docs/data-model.md for the normalized schema this interface is shaped around.
"""

from pitwall_pipeline.providers.base import TelemetryProvider
from pitwall_pipeline.providers.fastf1_provider import FastF1Provider

__all__ = ["TelemetryProvider", "FastF1Provider"]
