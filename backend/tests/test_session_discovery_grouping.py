"""Tests for app.services.session_discovery.grouping -- pure functions,
hand-built Session fixtures, no repository/I/O involved (M12 Phase 4).
"""

from app.models.telemetry import Session, SessionType
from app.services.session_discovery import (
    list_events_for_season,
    list_seasons,
    list_sessions_for_driver_season,
    list_sessions_for_event,
)


def _session(
    session_id: str,
    *,
    season: int,
    event_name: str,
    event_id: str,
    round_number: int,
    session_type: SessionType,
    session_date: str | None = None,
    location: str = "Sakhir",
    country: str = "Bahrain",
    has_telemetry: bool = True,
) -> Session:
    return Session(
        session_id=session_id,
        season=season,
        event_name=event_name,
        event_id=event_id,
        round_number=round_number,
        location=location,
        country=country,
        session_type=session_type,
        session_date=session_date,
        has_telemetry=has_telemetry,
    )


BAHRAIN_2024_RACE = _session(
    "2024_bahrain_grand_prix_race",
    season=2024,
    event_name="Bahrain Grand Prix",
    event_id="2024_bahrain_grand_prix",
    round_number=1,
    session_type=SessionType.RACE,
    session_date="2024-03-02T15:00:00+00:00",
)
BAHRAIN_2024_QUALIFYING = _session(
    "2024_bahrain_grand_prix_qualifying",
    season=2024,
    event_name="Bahrain Grand Prix",
    event_id="2024_bahrain_grand_prix",
    round_number=1,
    session_type=SessionType.QUALIFYING,
    session_date="2024-03-01T18:00:00+00:00",
)
CHINA_2024_SPRINT_QUALIFYING = _session(
    "2024_chinese_grand_prix_sprint_qualifying",
    season=2024,
    event_name="Chinese Grand Prix",
    event_id="2024_chinese_grand_prix",
    round_number=5,
    session_type=SessionType.SPRINT_QUALIFYING,
    session_date="2024-04-19T15:30:00+00:00",
    location="Shanghai",
    country="China",
)
BAHRAIN_2023_RACE = _session(
    "2023_bahrain_grand_prix_race",
    season=2023,
    event_name="Bahrain Grand Prix",
    event_id="2023_bahrain_grand_prix",
    round_number=1,
    session_type=SessionType.RACE,
    session_date="2023-03-05T15:00:00+00:00",
)

ALL_SESSIONS = [
    BAHRAIN_2024_RACE,
    BAHRAIN_2024_QUALIFYING,
    CHINA_2024_SPRINT_QUALIFYING,
    BAHRAIN_2023_RACE,
]


# A. Season discovery
def test_list_seasons_returns_distinct_seasons_newest_first() -> None:
    summaries = list_seasons(ALL_SESSIONS)
    assert [s.season for s in summaries] == [2024, 2023]


def test_list_seasons_counts_distinct_events() -> None:
    summaries = list_seasons(ALL_SESSIONS)
    season_2024 = next(s for s in summaries if s.season == 2024)
    assert season_2024.event_count == 2  # Bahrain + China


def test_list_seasons_empty_input_returns_empty_list() -> None:
    assert list_seasons([]) == []


def test_list_seasons_deterministic_regardless_of_input_order() -> None:
    reversed_sessions = list(reversed(ALL_SESSIONS))
    assert list_seasons(reversed_sessions) == list_seasons(ALL_SESSIONS)


# B. Event discovery
def test_list_events_for_season_returns_events_in_round_order() -> None:
    events = list_events_for_season(ALL_SESSIONS, 2024)
    assert [e.event_id for e in events] == ["2024_bahrain_grand_prix", "2024_chinese_grand_prix"]


def test_list_events_for_season_reports_correct_metadata() -> None:
    events = list_events_for_season(ALL_SESSIONS, 2024)
    bahrain = next(e for e in events if e.event_id == "2024_bahrain_grand_prix")
    assert bahrain.event_name == "Bahrain Grand Prix"
    assert bahrain.round_number == 1
    assert bahrain.location == "Sakhir"
    assert bahrain.country == "Bahrain"
    assert bahrain.session_count == 2
    assert set(bahrain.session_types) == {SessionType.RACE, SessionType.QUALIFYING}


def test_list_events_for_season_no_duplicate_events() -> None:
    events = list_events_for_season(ALL_SESSIONS, 2024)
    assert len({e.event_id for e in events}) == len(events)


def test_list_events_for_unknown_season_returns_empty_list() -> None:
    """No persisted season catalogue to 404 against -- absence is data,
    not failure (app/api/seasons.py's own documented reasoning)."""
    assert list_events_for_season(ALL_SESSIONS, 2099) == []


def test_list_events_for_season_with_no_ingested_events_returns_empty_list() -> None:
    assert list_events_for_season([], 2024) == []


def test_list_events_for_season_deterministic_regardless_of_input_order() -> None:
    shuffled = [CHINA_2024_SPRINT_QUALIFYING, BAHRAIN_2024_QUALIFYING, BAHRAIN_2024_RACE]
    assert list_events_for_season(shuffled, 2024) == list_events_for_season(ALL_SESSIONS, 2024)


# C. Session discovery
def test_list_sessions_for_event_orders_by_session_date() -> None:
    sessions = list_sessions_for_event(ALL_SESSIONS, 2024, "2024_bahrain_grand_prix")
    assert [s.session_type for s in sessions] == [SessionType.QUALIFYING, SessionType.RACE]


def test_list_sessions_for_event_race() -> None:
    sessions = list_sessions_for_event(ALL_SESSIONS, 2024, "2024_bahrain_grand_prix")
    assert SessionType.RACE in [s.session_type for s in sessions]


def test_list_sessions_for_event_sprint_qualifying_historical_terminology() -> None:
    """The canonical SPRINT_QUALIFYING type round-trips correctly regardless
    of which real-world display name (Sprint Qualifying/Sprint Shootout) it
    was ingested from -- the backend only ever sees the canonical enum
    value (docs/m12-design-review.md §5)."""
    sessions = list_sessions_for_event(ALL_SESSIONS, 2024, "2024_chinese_grand_prix")
    assert sessions[0].session_type == SessionType.SPRINT_QUALIFYING


def test_list_sessions_for_unknown_event_returns_empty_list() -> None:
    assert list_sessions_for_event(ALL_SESSIONS, 2024, "2024_nonexistent_grand_prix") == []


def test_list_sessions_for_event_with_no_sessions_returns_empty_list() -> None:
    assert list_sessions_for_event([], 2024, "2024_bahrain_grand_prix") == []


def test_list_sessions_for_event_null_session_date_falls_back_to_canonical_order() -> None:
    dated = _session(
        "2024_bahrain_grand_prix_race",
        season=2024,
        event_name="Bahrain Grand Prix",
        event_id="2024_bahrain_grand_prix",
        round_number=1,
        session_type=SessionType.RACE,
        session_date="2024-03-02T15:00:00+00:00",
    )
    undated = _session(
        "2024_bahrain_grand_prix_practice_1",
        season=2024,
        event_name="Bahrain Grand Prix",
        event_id="2024_bahrain_grand_prix",
        round_number=1,
        session_type=SessionType.PRACTICE_1,
        session_date=None,
    )
    sessions = list_sessions_for_event([dated, undated], 2024, "2024_bahrain_grand_prix")
    # Undated sessions sort after every dated one, never crashing on a
    # None comparison and never silently dropped.
    assert [s.session_id for s in sessions] == [
        "2024_bahrain_grand_prix_race",
        "2024_bahrain_grand_prix_practice_1",
    ]


def test_list_sessions_for_event_mixed_structures_no_cross_contamination() -> None:
    """A session-type collision (two different events both having a RACE
    session) must not blend results between events."""
    sessions = list_sessions_for_event(ALL_SESSIONS, 2023, "2023_bahrain_grand_prix")
    assert [s.session_id for s in sessions] == ["2023_bahrain_grand_prix_race"]


# D. Driver-season pace-trend filtering (M17, docs/m17-design-review.md §5.3/§6)


def test_list_sessions_for_driver_season_filters_by_season_and_type() -> None:
    sessions = list_sessions_for_driver_season(ALL_SESSIONS, 2024, SessionType.RACE)

    assert [s.session_id for s in sessions] == ["2024_bahrain_grand_prix_race"]


def test_list_sessions_for_driver_season_excludes_other_session_types() -> None:
    sessions = list_sessions_for_driver_season(ALL_SESSIONS, 2024, SessionType.RACE)

    assert BAHRAIN_2024_QUALIFYING not in sessions
    assert CHINA_2024_SPRINT_QUALIFYING not in sessions


def test_list_sessions_for_driver_season_excludes_other_seasons() -> None:
    sessions = list_sessions_for_driver_season(ALL_SESSIONS, 2024, SessionType.RACE)

    assert BAHRAIN_2023_RACE not in sessions


def test_list_sessions_for_driver_season_orders_by_session_date_not_round_number() -> None:
    """Later round, earlier date -- proves round_number is not the primary
    sort key (M12 §18 Q2 stays open; this function doesn't depend on
    round-number stability, docs/m17-design-review.md §6)."""
    later_round_earlier_date = _session(
        "2024_early_date_round_9_race",
        season=2024,
        event_name="Early Date Grand Prix",
        event_id="2024_early_date_grand_prix",
        round_number=9,
        session_type=SessionType.RACE,
        session_date="2024-01-01T15:00:00+00:00",
    )
    sessions = list_sessions_for_driver_season(
        [BAHRAIN_2024_RACE, later_round_earlier_date], 2024, SessionType.RACE
    )

    assert [s.session_id for s in sessions] == [
        "2024_early_date_round_9_race",
        "2024_bahrain_grand_prix_race",
    ]


def test_list_sessions_for_driver_season_undated_session_falls_back_to_round_number() -> None:
    undated = _session(
        "2024_undated_round_2_race",
        season=2024,
        event_name="Undated Grand Prix",
        event_id="2024_undated_grand_prix",
        round_number=2,
        session_type=SessionType.RACE,
        session_date=None,
    )
    sessions = list_sessions_for_driver_season([BAHRAIN_2024_RACE, undated], 2024, SessionType.RACE)

    # Dated session (round 1) sorts before the undated one (round 2),
    # regardless of the undated session's own round number.
    assert [s.session_id for s in sessions] == [
        "2024_bahrain_grand_prix_race",
        "2024_undated_round_2_race",
    ]


def test_list_sessions_for_driver_season_unknown_season_returns_empty_list() -> None:
    assert list_sessions_for_driver_season(ALL_SESSIONS, 2099, SessionType.RACE) == []


def test_list_sessions_for_driver_season_empty_input_returns_empty_list() -> None:
    assert list_sessions_for_driver_season([], 2024, SessionType.RACE) == []


def test_list_sessions_for_driver_season_deterministic_regardless_of_input_order() -> None:
    shuffled = list(reversed(ALL_SESSIONS))
    assert list_sessions_for_driver_season(
        shuffled, 2024, SessionType.RACE
    ) == list_sessions_for_driver_season(ALL_SESSIONS, 2024, SessionType.RACE)
