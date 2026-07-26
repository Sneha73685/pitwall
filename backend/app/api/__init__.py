"""API route modules, one per resource.

Every response returned from this package must be a PitWall-defined
Pydantic model (see docs/adr/0009-internal-api-schema-boundary.md) --
never a repository- or provider-shaped object passed straight through.
"""
