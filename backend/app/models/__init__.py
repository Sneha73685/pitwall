"""PitWall's own Pydantic response/request models.

This is the anti-corruption boundary described in
docs/adr/0009-internal-api-schema-boundary.md. Real telemetry/session/
lap models land in M2 -- empty in M0 by design.
"""
