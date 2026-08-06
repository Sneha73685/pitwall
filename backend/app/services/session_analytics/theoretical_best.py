"""Per-driver theoretical-best-lap computation (M8 §8.2).

Needs only per-lap sector *times* (`sector_1_seconds`/`sector_2_seconds`/
`sector_3_seconds` on `Lap`) -- confirmed to already exist directly on the
schema in Phase 0 (plan §0.2 Q1), unlike M6's Open Question 1 about sector
*distances*, which this metric never needed in the first place.
"""

from app.models.telemetry import Lap

_SECTOR_FIELDS = ("sector_1_seconds", "sector_2_seconds", "sector_3_seconds")


def theoretical_best_lap_ms(laps: list[Lap]) -> float | None:
    """Sum of the best time in each sector, each sector's best chosen
    independently across `laps` (§8.2). `laps` must already be filtered to
    the population this should be computed over (aggregate-stats-eligible
    laps -- see filtering.py), not a driver's full raw lap list.

    Returns `None` if any sector has no non-null value across every lap
    given: an unknown sector can't be summed into a lower bound -- treating
    it as `0` would silently understate the theoretical best, and skipping
    it would silently overstate it by omission.
    """
    best_per_sector_seconds: list[float] = []
    for field in _SECTOR_FIELDS:
        sector_times = [value for lap in laps if (value := getattr(lap, field)) is not None]
        if not sector_times:
            return None
        best_per_sector_seconds.append(min(sector_times))
    return sum(best_per_sector_seconds) * 1000.0


def theoretical_best_delta_ms(
    best_lap_ms: float | None, theoretical_best_lap_ms: float | None
) -> float | None:
    """`best_lap_ms - theoretical_best_lap_ms`, always >= 0 by construction:
    the theoretical best is a lower bound, since best-of-each-sector can
    never be slower than any single actual lap's own sector sum (this
    assumes `lap_time_seconds` and that lap's own three sector times agree,
    which holds for well-formed timing data). `None` if either input is
    unavailable.

    This is the M8 equivalent of M6's delta-sign-convention risk: a subtle
    bug here (e.g. accidentally including an invalid lap in the
    "best sector" search) produces a plausible-looking but wrong result --
    see the dedicated invariant test in test_theoretical_best.py.
    """
    if best_lap_ms is None or theoretical_best_lap_ms is None:
        return None
    return best_lap_ms - theoretical_best_lap_ms
