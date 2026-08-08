"""Per-driver strategy shape and session-wide compound-usage facts (M11
§4.1 #3, #4, docs/m11-design-review.md §5.1).

Strictly factual: a compound sequence like `["SOFT", "HARD", "HARD"]` is
valid output. A judgement like "best strategy" is not, and nothing here
computes one.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.models.race_context import Stint


@dataclass(frozen=True)
class DriverStrategySummary:
    """One driver's stint sequence and compound choices for this session.
    `compound_sequence`/`stint_lengths` are aligned 1:1, ordered by
    `stint_number`."""

    driver_id: str
    stint_count: int
    compound_sequence: list[str]
    stint_lengths: list[int]


@dataclass(frozen=True)
class CompoundUsageCount:
    """Session-wide usage of one compound across every driver's stints --
    counts only, no ranking of compounds against each other."""

    compound: str
    stint_count: int
    driver_count: int
    total_laps: int


def driver_strategy_summary(driver_id: str, stints: Sequence[Stint]) -> DriverStrategySummary:
    """`stints` must already be scoped to one driver (same precondition as
    `stint_join.join_laps_to_stints`)."""
    ordered = sorted(stints, key=lambda stint: stint.stint_number)
    return DriverStrategySummary(
        driver_id=driver_id,
        stint_count=len(ordered),
        compound_sequence=[stint.compound for stint in ordered],
        stint_lengths=[stint.end_lap - stint.start_lap + 1 for stint in ordered],
    )


def session_compound_usage(
    stints_by_driver: Mapping[str, Sequence[Stint]],
) -> list[CompoundUsageCount]:
    """One `CompoundUsageCount` per compound present in the input, sorted
    alphabetically by compound name -- not by usage count, so list order
    cannot be misread as a ranking."""
    stint_counts: dict[str, int] = {}
    drivers_by_compound: dict[str, set[str]] = {}
    total_laps_by_compound: dict[str, int] = {}

    for driver_id, stints in stints_by_driver.items():
        for stint in stints:
            stint_counts[stint.compound] = stint_counts.get(stint.compound, 0) + 1
            drivers_by_compound.setdefault(stint.compound, set()).add(driver_id)
            stint_length = stint.end_lap - stint.start_lap + 1
            total_laps_by_compound[stint.compound] = (
                total_laps_by_compound.get(stint.compound, 0) + stint_length
            )

    return [
        CompoundUsageCount(
            compound=compound,
            stint_count=stint_counts[compound],
            driver_count=len(drivers_by_compound[compound]),
            total_laps=total_laps_by_compound[compound],
        )
        for compound in sorted(stint_counts)
    ]
