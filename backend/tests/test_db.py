"""Connectivity smoke test for the backend's PostgreSQL connection pool
(Phase 1, M10). Requires a real PostgreSQL instance reachable via
`PITWALL_DATABASE_URL` (or the default local-dev connection string) -- see
docs/m10-implementation-plan.md Phase 1 "Testing required". No stint/pit-stop
table or row is touched here; `RaceContextRepository` has no concrete
implementation yet (that's Phase 3).
"""

from app.config import get_settings
from app.db import get_pool


def test_pool_connects_to_postgres() -> None:
    get_settings.cache_clear()
    get_pool.cache_clear()

    pool = get_pool()
    try:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            assert cur.fetchone() == (1,)
    finally:
        pool.close()
