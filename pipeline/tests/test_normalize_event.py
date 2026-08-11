"""Tests for M12 Phase 1's Event identity: pitwall_pipeline.models.make_event_id
and pitwall_pipeline.normalize.normalize_event.

See docs/m12-design-review.md §6 for the identity model these tests pin:
Event identity is (season, event slug); round_number is metadata, not
identity.
"""

from pitwall_pipeline.models import Event, SessionType, make_event_id, make_session_id
from pitwall_pipeline.normalize import normalize_event


def _event(**overrides: object) -> Event:
    defaults: dict[str, object] = {
        "season": 2024,
        "round_number": 1,
        "event_name": "Bahrain Grand Prix",
        "event_format": "conventional",
        "location": "Sakhir",
        "country": "Bahrain",
        "event_date": "2024-03-02T00:00:00",
    }
    defaults.update(overrides)
    return normalize_event(**defaults)  # type: ignore[arg-type]


# 14. Event identity generation.
def test_make_event_id_combines_season_and_slug() -> None:
    assert make_event_id(2024, "Bahrain Grand Prix") == "2024_bahrain_grand_prix"


def test_normalize_event_builds_stable_event_id() -> None:
    event = _event()
    assert event.event_id == "2024_bahrain_grand_prix"
    assert event.season == 2024
    assert event.round_number == 1
    assert event.event_format == "conventional"
    assert event.event_date == "2024-03-02T00:00:00"


# 13. Stable session_id generation (determinism).
def test_make_session_id_is_deterministic() -> None:
    first = make_session_id(2024, "Bahrain Grand Prix", SessionType.RACE)
    second = make_session_id(2024, "Bahrain Grand Prix", SessionType.RACE)
    assert first == second == "2024_bahrain_grand_prix_race"


def test_make_event_id_is_deterministic() -> None:
    assert make_event_id(2024, "Bahrain Grand Prix") == make_event_id(2024, "Bahrain Grand Prix")


# 8. Same event name across different seasons.
def test_same_event_name_different_seasons_yields_different_event_ids() -> None:
    event_2023 = make_event_id(2023, "Bahrain Grand Prix")
    event_2024 = make_event_id(2024, "Bahrain Grand Prix")
    assert event_2023 != event_2024
    assert event_2023 == "2023_bahrain_grand_prix"
    assert event_2024 == "2024_bahrain_grand_prix"


def test_same_event_name_different_seasons_yields_different_session_ids() -> None:
    session_2023 = make_session_id(2023, "Bahrain Grand Prix", SessionType.RACE)
    session_2024 = make_session_id(2024, "Bahrain Grand Prix", SessionType.RACE)
    assert session_2023 != session_2024


# 9. Same session type across different events.
def test_same_session_type_different_events_yields_different_session_ids() -> None:
    bahrain_race = make_session_id(2024, "Bahrain Grand Prix", SessionType.RACE)
    china_race = make_session_id(2024, "Chinese Grand Prix", SessionType.RACE)
    assert bahrain_race != china_race
    assert bahrain_race == "2024_bahrain_grand_prix_race"
    assert china_race == "2024_chinese_grand_prix_race"


# 10. Testing-event/round-number collision proving round_number is not
# identity -- reproducing the real, verified 2022 case from
# docs/m12-design-review.md §3.7: two real events sharing round_number == 0.
def test_round_number_collision_does_not_collide_event_ids() -> None:
    track_session = _event(
        round_number=0,
        event_name="Pre-Season Track Session",
        event_format="testing",
    )
    pre_season_test = _event(
        round_number=0,
        event_name="Pre-Season Test",
        event_format="testing",
    )

    assert track_session.round_number == pre_season_test.round_number == 0
    assert track_session.event_id != pre_season_test.event_id
    assert track_session.event_id == "2024_pre_season_track_session"
    assert pre_season_test.event_id == "2024_pre_season_test"


# 15. Multiple sessions belonging to one event -- an Event's sessions are
# exactly the session_ids sharing its event_id as a prefix.
def test_event_id_is_the_shared_prefix_of_its_sessions_session_ids() -> None:
    event = _event(event_name="Bahrain Grand Prix", season=2024)
    session_ids = [
        make_session_id(2024, "Bahrain Grand Prix", session_type)
        for session_type in (
            SessionType.PRACTICE_1,
            SessionType.PRACTICE_2,
            SessionType.PRACTICE_3,
            SessionType.QUALIFYING,
            SessionType.RACE,
        )
    ]
    assert all(session_id.startswith(event.event_id + "_") for session_id in session_ids)
    assert len(set(session_ids)) == 5  # every session under this event is distinct
