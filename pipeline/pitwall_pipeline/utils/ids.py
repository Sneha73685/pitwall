"""Slug generation shared by session ID construction and the Parquet cache layout.

Kept out of models.py so it stays a plain string utility, not part of the
frozen domain model (see docs/data-model.md) -- pitwall_pipeline.models.make_session_id
and pitwall_pipeline.cache_writer both consume this rather than each
re-deriving their own slugging rule.
"""

import re


def slugify(text: str) -> str:
    """Lowercase and collapse `text` into a filesystem/Parquet-partition-safe slug."""
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")
