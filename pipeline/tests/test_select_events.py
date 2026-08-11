"""Tests for M12 Phase 3's in-memory multi-event selection
(pitwall_pipeline.normalize.select_events) -- the same safe, non-fuzzy
matching semantics as Phase 2's find_event_row (docs/m12-design-review.md
§19.3), applied to an already-discovered season's event list instead of a
raw FastF1 schedule DataFrame.
"""

import pytest

from pitwall_pipeline.models import Event, EventDiscovery, SessionType
from pitwall_pipeline.normalize import AmbiguousEventError, EventNotFoundError, select_events


def _discovery(
    event_id: str, event_name: str, round_number: int, location: str, country: str
) -> EventDiscovery:
    return EventDiscovery(
        event=Event(
            event_id=event_id,
            season=2024,
            round_number=round_number,
            event_name=event_name,
            event_format="conventional",
            location=location,
            country=country,
        ),
        session_names=["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"],
        available_sessions={SessionType.RACE: "Race"},
    )


DISCOVERIES = [
    _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, "Sakhir", "Bahrain"),
    _discovery("2024_chinese_grand_prix", "Chinese Grand Prix", 5, "Shanghai", "China"),
    _discovery("2024_italian_grand_prix", "Italian Grand Prix", 14, "Monza", "Italy"),
]


def test_none_selects_every_event_sorted_by_round_number() -> None:
    selected = select_events(DISCOVERIES, None)
    assert [d.event.event_id for d in selected] == [
        "2024_bahrain_grand_prix",
        "2024_chinese_grand_prix",
        "2024_italian_grand_prix",
    ]


def test_none_sorts_regardless_of_input_order() -> None:
    shuffled = [DISCOVERIES[2], DISCOVERIES[0], DISCOVERIES[1]]
    selected = select_events(shuffled, None)
    assert [d.event.round_number for d in selected] == [1, 5, 14]


def test_single_query_selects_one_event() -> None:
    selected = select_events(DISCOVERIES, ["Bahrain"])
    assert [d.event.event_id for d in selected] == ["2024_bahrain_grand_prix"]


def test_multiple_queries_selected_and_sorted_by_round_number_not_query_order() -> None:
    # Query order deliberately reversed from round-number order.
    selected = select_events(DISCOVERIES, ["Italian Grand Prix", "China", "Bahrain"])
    assert [d.event.round_number for d in selected] == [1, 5, 14]


def test_round_number_query() -> None:
    selected = select_events(DISCOVERIES, ["5"])
    assert [d.event.event_id for d in selected] == ["2024_chinese_grand_prix"]


def test_overlapping_queries_dedupe_by_event_id() -> None:
    selected = select_events(DISCOVERIES, ["Bahrain", "Sakhir"])
    assert len(selected) == 1
    assert selected[0].event.event_id == "2024_bahrain_grand_prix"


def test_nonexistent_query_raises_not_found() -> None:
    with pytest.raises(EventNotFoundError):
        select_events(DISCOVERIES, ["Monaco"])


def test_garbage_query_never_silently_selects_an_unrelated_event() -> None:
    with pytest.raises(EventNotFoundError):
        select_events(DISCOVERIES, ["xyz nonsense event"])


def test_ambiguous_query_raises() -> None:
    with pytest.raises(AmbiguousEventError):
        select_events(DISCOVERIES, ["Grand Prix"])


def test_one_bad_query_among_several_still_raises() -> None:
    """A mixed valid+invalid multi-event request must fail entirely, not
    silently ingest the valid ones and drop the bad one."""
    with pytest.raises(EventNotFoundError):
        select_events(DISCOVERIES, ["Bahrain", "Nonexistent Grand Prix"])
