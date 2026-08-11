"""Tests for M12 Phase 2's safe event matching
(pitwall_pipeline.normalize.find_event_row).

This is the function that replaces FastF1's own fuzzy/edit-distance event
matching for any query PitWall ingestion accepts -- docs/m12-design-
review.md §19.3's "CRITICAL FUZZY-MATCHING SAFETY RULE": garbage input must
never silently resolve to a real but unrelated event.
"""

import pandas as pd
import pytest

from pitwall_pipeline.normalize import AmbiguousEventError, EventNotFoundError, find_event_row

# Minimal, real-shaped schedule fixture -- only the columns find_event_row
# reads (RoundNumber, EventName, Location, Country), reproducing real 2024
# season values verified in docs/m12-design-review.md.
SCHEDULE = pd.DataFrame(
    [
        {
            "RoundNumber": 1,
            "EventName": "Bahrain Grand Prix",
            "Location": "Sakhir",
            "Country": "Bahrain",
        },
        {
            "RoundNumber": 4,
            "EventName": "Azerbaijan Grand Prix",
            "Location": "Baku",
            "Country": "Azerbaijan",
        },
        {
            "RoundNumber": 5,
            "EventName": "Chinese Grand Prix",
            "Location": "Shanghai",
            "Country": "China",
        },
        {
            "RoundNumber": 14,
            "EventName": "Italian Grand Prix",
            "Location": "Monza",
            "Country": "Italy",
        },
        {
            "RoundNumber": 10,
            "EventName": "British Grand Prix",
            "Location": "Silverstone",
            "Country": "UK",
        },
    ]
)


def test_exact_round_number_match() -> None:
    row = find_event_row(SCHEDULE, 1)
    assert row["EventName"] == "Bahrain Grand Prix"


def test_round_number_as_numeric_string_match() -> None:
    row = find_event_row(SCHEDULE, "5")
    assert row["EventName"] == "Chinese Grand Prix"


def test_unknown_round_number_raises_not_found() -> None:
    with pytest.raises(EventNotFoundError):
        find_event_row(SCHEDULE, 99)


def test_unique_substring_match_against_event_name() -> None:
    row = find_event_row(SCHEDULE, "Bahrain")
    assert row["EventName"] == "Bahrain Grand Prix"


def test_unique_substring_match_against_location() -> None:
    # "Monza" is the Location, not part of EventName ("Italian Grand Prix")
    row = find_event_row(SCHEDULE, "Monza")
    assert row["EventName"] == "Italian Grand Prix"


def test_unique_substring_match_against_country() -> None:
    # "China" is the Country; NOT a literal substring of "Chinese Grand
    # Prix" (EventName) -- proves the matcher checks Country too, not just
    # EventName/Location.
    row = find_event_row(SCHEDULE, "China")
    assert row["EventName"] == "Chinese Grand Prix"


def test_full_event_name_matches() -> None:
    row = find_event_row(SCHEDULE, "Italian Grand Prix")
    assert row["EventName"] == "Italian Grand Prix"


def test_match_is_case_insensitive() -> None:
    row = find_event_row(SCHEDULE, "bahrain")
    assert row["EventName"] == "Bahrain Grand Prix"


# 7. Garbage event input must NEVER silently resolve to another event.
def test_garbage_input_raises_not_found_never_silently_substitutes() -> None:
    """The exact real-world failure mode docs/m12-design-review.md §19.3
    proved: FastF1's own get_event(2024, "xyz nonsense event") silently
    resolved to "Chinese Grand Prix". find_event_row must fail loudly
    instead."""
    with pytest.raises(EventNotFoundError):
        find_event_row(SCHEDULE, "xyz nonsense event")


# 8. Nonexistent event produces an explicit error.
def test_empty_query_raises_not_found() -> None:
    with pytest.raises(EventNotFoundError):
        find_event_row(SCHEDULE, "")


def test_typo_does_not_fuzzy_match() -> None:
    """Deliberately stricter than FastF1's own fuzzy matching -- a typo'd
    name fails loudly rather than silently correcting itself (design
    review §19.3's documented, deliberate trade-off)."""
    with pytest.raises(EventNotFoundError):
        find_event_row(SCHEDULE, "Bahrein Grand Prix")


def test_ambiguous_query_raises_ambiguous_error() -> None:
    """ "Grand Prix" matches every event's EventName -- must fail, not pick
    one arbitrarily."""
    with pytest.raises(AmbiguousEventError) as exc_info:
        find_event_row(SCHEDULE, "Grand Prix")
    assert "Bahrain Grand Prix" in str(exc_info.value)
    assert "Chinese Grand Prix" in str(exc_info.value)
