"""Tests for M12 Phase 1's canonical session-type resolution
(pitwall_pipeline.normalize.resolve_session_identifier/available_session_types).

Fixture session-name lists reproduce the real shapes verified directly
against fastf1==3.8.3 in docs/m12-design-review.md §3.2/§3.3/§4/§19 (a
normal non-sprint event, and all three real historical sprint-weekend
formats) -- not invented independently of that evidence.
"""

import pytest

from pitwall_pipeline.models import SessionType
from pitwall_pipeline.normalize import (
    SessionNotAvailableError,
    available_session_types,
    resolve_session_identifier,
)

# Real Session1..5 name shapes, per docs/m12-design-review.md §3.2's table.
CONVENTIONAL = ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"]
SPRINT_2021_2022 = ["Practice 1", "Qualifying", "Practice 2", "Sprint", "Race"]
SPRINT_SHOOTOUT_2023 = ["Practice 1", "Qualifying", "Sprint Shootout", "Sprint", "Race"]
SPRINT_QUALIFYING_2024_PLUS = ["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"]
TESTING = ["Practice 1", "Practice 2", "Practice 3", None, None]


# 1. Normal non-sprint event.
def test_resolves_every_type_for_a_conventional_event() -> None:
    assert resolve_session_identifier(CONVENTIONAL, SessionType.PRACTICE_1) == "Practice 1"
    assert resolve_session_identifier(CONVENTIONAL, SessionType.PRACTICE_2) == "Practice 2"
    assert resolve_session_identifier(CONVENTIONAL, SessionType.PRACTICE_3) == "Practice 3"
    assert resolve_session_identifier(CONVENTIONAL, SessionType.QUALIFYING) == "Qualifying"
    assert resolve_session_identifier(CONVENTIONAL, SessionType.RACE) == "Race"


# 2. Sprint weekend (all three real historical formats).
def test_resolves_sprint_2021_2022_era() -> None:
    assert resolve_session_identifier(SPRINT_2021_2022, SessionType.SPRINT) == "Sprint"
    assert resolve_session_identifier(SPRINT_2021_2022, SessionType.QUALIFYING) == "Qualifying"
    assert resolve_session_identifier(SPRINT_2021_2022, SessionType.PRACTICE_2) == "Practice 2"


def test_resolves_sprint_shootout_2023_era() -> None:
    assert (
        resolve_session_identifier(SPRINT_SHOOTOUT_2023, SessionType.SPRINT_QUALIFYING)
        == "Sprint Shootout"
    )
    assert resolve_session_identifier(SPRINT_SHOOTOUT_2023, SessionType.SPRINT) == "Sprint"


def test_resolves_sprint_qualifying_2024_plus_era() -> None:
    assert (
        resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.SPRINT_QUALIFYING)
        == "Sprint Qualifying"
    )
    assert resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.SPRINT) == "Sprint"
    assert (
        resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.QUALIFYING)
        == "Qualifying"
    )


# 3-6. Practice / Qualifying / Sprint / Race individually, across a
# non-conventional slot ordering (sprint_qualifying era reorders Qualifying
# to Session4 and has no Practice 2/3 at all -- resolution must not assume
# fixed slot positions).
def test_practice_qualifying_sprint_race_resolve_regardless_of_slot_order() -> None:
    assert (
        resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.PRACTICE_1)
        == "Practice 1"
    )
    assert (
        resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.QUALIFYING)
        == "Qualifying"
    )
    assert resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.SPRINT) == "Sprint"
    assert resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.RACE) == "Race"


# 7. Historical sprint terminology aliasing.
def test_sprint_qualifying_canonical_type_covers_both_real_display_names() -> None:
    """One PitWall SessionType, two real, era-specific FastF1 display
    names -- docs/m12-design-review.md §5's core taxonomy decision."""
    assert (
        resolve_session_identifier(SPRINT_SHOOTOUT_2023, SessionType.SPRINT_QUALIFYING)
        == "Sprint Shootout"
    )
    assert (
        resolve_session_identifier(SPRINT_QUALIFYING_2024_PLUS, SessionType.SPRINT_QUALIFYING)
        == "Sprint Qualifying"
    )


# 11. Invalid/unknown session type handling -- the real, verified defect
# docs/m12-design-review.md §3.3 found: 2021/2022 sprint weekends have no
# session at all matching any SPRINT_QUALIFYING alias.
def test_raises_not_available_when_no_matching_session_exists() -> None:
    with pytest.raises(SessionNotAvailableError) as exc_info:
        resolve_session_identifier(SPRINT_2021_2022, SessionType.SPRINT_QUALIFYING)
    # Error message names the requested type and what the event actually has,
    # rather than a bare exception with no diagnostic content.
    assert "sprint_qualifying" in str(exc_info.value)
    assert "Sprint" in str(exc_info.value)


def test_raises_not_available_for_practice_3_on_a_sprint_weekend() -> None:
    """Sprint-format weekends have no Practice 3 at all (only FP1/FP2) --
    same "genuinely absent, not a bug" case as SPRINT_QUALIFYING above."""
    with pytest.raises(SessionNotAvailableError):
        resolve_session_identifier(SPRINT_2021_2022, SessionType.PRACTICE_3)


def test_none_entries_in_session_names_are_skipped_not_matched() -> None:
    """A testing event's missing Session4/5 slots (None) must never satisfy
    a resolution -- only a real string can match an alias."""
    with pytest.raises(SessionNotAvailableError):
        resolve_session_identifier(TESTING, SessionType.QUALIFYING)
    with pytest.raises(SessionNotAvailableError):
        resolve_session_identifier(TESTING, SessionType.RACE)
    # but the three real Practice sessions still resolve
    assert resolve_session_identifier(TESTING, SessionType.PRACTICE_1) == "Practice 1"


# 12. Canonicalization of FastF1 sprint-session aliases -- alias-table
# completeness: every canonical SessionType has at least one known alias,
# and SPRINT_QUALIFYING is the only one with more than one (the only slot
# with a real historical renaming, per docs/m12-design-review.md §3.2).
def test_every_session_type_has_at_least_one_alias() -> None:
    for session_type in SessionType:
        resolved_somewhere = any(
            resolve_session_identifier([alias], session_type) == alias
            for alias in _all_aliases_for(session_type)
        )
        assert resolved_somewhere, f"{session_type} has no resolvable alias"


def _all_aliases_for(session_type: SessionType) -> list[str]:
    # Exercised indirectly through resolve_session_identifier rather than
    # importing the private alias table directly, so this test breaks if
    # the public resolution behavior regresses, not just if the private
    # table's shape changes.
    candidates = [
        "Practice 1",
        "Practice 2",
        "Practice 3",
        "Qualifying",
        "Sprint Qualifying",
        "Sprint Shootout",
        "Sprint",
        "Race",
    ]
    matches = []
    for candidate in candidates:
        try:
            if resolve_session_identifier([candidate], session_type) == candidate:
                matches.append(candidate)
        except SessionNotAvailableError:
            continue
    return matches


def test_sprint_qualifying_is_the_only_type_with_two_real_aliases() -> None:
    multi_alias_types = [st for st in SessionType if len(_all_aliases_for(st)) > 1]
    assert multi_alias_types == [SessionType.SPRINT_QUALIFYING]


# 15. Multiple sessions belonging to one event.
def test_available_session_types_for_conventional_event() -> None:
    available = available_session_types(CONVENTIONAL)
    assert set(available) == {
        SessionType.PRACTICE_1,
        SessionType.PRACTICE_2,
        SessionType.PRACTICE_3,
        SessionType.QUALIFYING,
        SessionType.RACE,
    }
    assert SessionType.SPRINT not in available
    assert SessionType.SPRINT_QUALIFYING not in available


def test_available_session_types_for_2021_sprint_event_excludes_sprint_qualifying() -> None:
    available = available_session_types(SPRINT_2021_2022)
    assert SessionType.SPRINT in available
    assert SessionType.SPRINT_QUALIFYING not in available
    assert SessionType.PRACTICE_3 not in available  # only FP1/FP2 exist this era


def test_available_session_types_for_2024_sprint_qualifying_event() -> None:
    available = available_session_types(SPRINT_QUALIFYING_2024_PLUS)
    assert set(available) == {
        SessionType.PRACTICE_1,
        SessionType.SPRINT_QUALIFYING,
        SessionType.SPRINT,
        SessionType.QUALIFYING,
        SessionType.RACE,
    }
    assert available[SessionType.SPRINT_QUALIFYING] == "Sprint Qualifying"


def test_available_session_types_for_testing_event_is_practice_only() -> None:
    available = available_session_types(TESTING)
    assert set(available) == {
        SessionType.PRACTICE_1,
        SessionType.PRACTICE_2,
        SessionType.PRACTICE_3,
    }
