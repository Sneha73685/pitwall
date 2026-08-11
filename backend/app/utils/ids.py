"""Event-id derivation (M12 Phase 4).

Independently defined from `pitwall_pipeline.utils.ids`/`pitwall_pipeline.models`
per ADR-0009 -- the backend has no dependency on the pipeline package, the same
rule every other model pair in this codebase already follows. This is the
identical algorithm, not merely an equivalent one: it must reproduce the exact
same `event_id` the pipeline's `Event.event_id` computes for the same
`(season, event_name)` pair, since both sides need to agree on what identifies
one event without either importing the other. A cross-workspace parity test
(`backend/tests/test_ids.py`) guards against silent drift between the two
independent copies -- the same risk ADR-0009 already accepts for `SessionType`,
whose members are hand-duplicated in both `pitwall_pipeline.models.SessionType`
and `app.models.telemetry.SessionType`.
"""

import re


def slugify(text: str) -> str:
    """Lowercase and collapse `text` into the same slug
    `pitwall_pipeline.utils.ids.slugify` produces."""
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


def make_event_id(season: int, event_name: str) -> str:
    """Build the event identifier -- `(season, event slug)`, per
    docs/m12-design-review.md §6 -- matching
    `pitwall_pipeline.models.make_event_id`'s formula exactly. Every
    `Session.event_id` this backend serves is computed here, from the same
    `season`/`event_name` fields the session's own identity already carries
    (see docs/data-model.md) -- no new persisted field, no Event table
    (docs/m12-design-review.md §7: "do not persist an Event table yet
    unless... genuinely required").
    """
    return f"{season}_{slugify(event_name)}"
