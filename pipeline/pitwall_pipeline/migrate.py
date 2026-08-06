"""Migration runner: applies pitwall_pipeline/migrations/*.sql against the
race-context PostgreSQL database.

Run as `python -m pitwall_pipeline.migrate`, mirroring `ingest.py`'s
`python -m pitwall_pipeline.ingest` CLI-entrypoint style.

Plain versioned SQL files, not Alembic -- two tables and one bookkeeping
table don't justify a migration framework's autogenerate/reflection
machinery (docs/m10-design-review.md §9, docs/adr/0011-hybrid-storage-
architecture.md). Applied files are recorded in a `schema_migrations`
bookkeeping table so re-running this command is a no-op once the schema is
up to date.
"""

import logging
from pathlib import Path

from pitwall_pipeline.db import get_connection

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"

_CREATE_BOOKKEEPING_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def apply_pending_migrations() -> list[str]:
    """Apply every migrations/*.sql file not yet recorded, in filename order.

    Returns the filenames actually applied (empty if the schema was already
    up to date). Each migration is applied and recorded in one transaction.
    """
    applied: list[str] = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(_CREATE_BOOKKEEPING_TABLE)
        conn.commit()

        with conn.cursor() as cur:
            cur.execute("SELECT filename FROM schema_migrations")
            already_applied = {row[0] for row in cur.fetchall()}

        for migration_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if migration_file.name in already_applied:
                continue
            with conn.cursor() as cur:
                cur.execute(migration_file.read_text())
                cur.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s)",
                    (migration_file.name,),
                )
            conn.commit()
            applied.append(migration_file.name)
            logger.info("Applied migration %s", migration_file.name)

    return applied


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    applied = apply_pending_migrations()
    if applied:
        logger.info("Applied %d migration(s): %s", len(applied), ", ".join(applied))
    else:
        logger.info("No pending migrations.")


if __name__ == "__main__":
    main()
