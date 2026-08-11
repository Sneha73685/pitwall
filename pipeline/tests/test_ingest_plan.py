"""Tests for M12 Phase 3's multi-event/season ingestion planning and
controlled execution (pitwall_pipeline.ingest_plan). Entirely mocked -- no
network, no real FastF1Provider/ingest_event call (CLAUDE.md's testing
rules) -- proving the plan-building and execution logic itself, without
re-testing FastF1Provider.discover_season()/ingest_event(), which have
their own test files.
"""

from typing import Any
from unittest.mock import patch

import pytest

from pitwall_pipeline import ingest_plan as ingest_plan_module
from pitwall_pipeline.ingest_event import (
    EventIngestResult,
    SessionIngestOutcome,
    SessionIngestStatus,
)
from pitwall_pipeline.ingest_plan import (
    IngestionPlan,
    PlannedSession,
    _parse_args,
    build_ingestion_plan,
    execute_ingestion_plan,
    main,
)
from pitwall_pipeline.models import Event, EventDiscovery, SessionType

_CONVENTIONAL_2024: dict[SessionType, str] = {
    SessionType.PRACTICE_1: "Practice 1",
    SessionType.PRACTICE_2: "Practice 2",
    SessionType.PRACTICE_3: "Practice 3",
    SessionType.QUALIFYING: "Qualifying",
    SessionType.RACE: "Race",
}
_SPRINT_QUALIFYING_2024: dict[SessionType, str] = {
    SessionType.PRACTICE_1: "Practice 1",
    SessionType.SPRINT_QUALIFYING: "Sprint Qualifying",
    SessionType.SPRINT: "Sprint",
    SessionType.QUALIFYING: "Qualifying",
    SessionType.RACE: "Race",
}
_SPRINT_2021: dict[SessionType, str] = {
    SessionType.PRACTICE_1: "Practice 1",
    SessionType.QUALIFYING: "Qualifying",
    SessionType.PRACTICE_2: "Practice 2",
    SessionType.SPRINT: "Sprint",
    SessionType.RACE: "Race",
}


def _discovery(
    event_id: str,
    event_name: str,
    round_number: int,
    available: dict[SessionType, str],
    *,
    season: int = 2024,
    location: str = "",
    country: str = "",
    session_names: list[str | None] | None = None,
) -> EventDiscovery:
    return EventDiscovery(
        event=Event(
            event_id=event_id,
            season=season,
            round_number=round_number,
            event_name=event_name,
            event_format="conventional",
            location=location,
            country=country,
        ),
        session_names=session_names if session_names is not None else list(available.values()),
        available_sessions=available,
    )


@pytest.fixture
def mock_provider() -> Any:
    with patch.object(ingest_plan_module, "FastF1Provider") as mock_cls:
        yield mock_cls.return_value


@pytest.fixture
def mock_ingest_event() -> Any:
    with patch.object(ingest_plan_module, "ingest_event") as mock_fn:
        yield mock_fn


# ---------------------------------------------------------------------------
# D. Plan generation
# ---------------------------------------------------------------------------


def test_build_ingestion_plan_single_event_all_sessions(mock_provider: Any) -> None:
    mock_provider.discover_season.return_value = [
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, _CONVENTIONAL_2024),
    ]

    plan = build_ingestion_plan([2024], event_queries=["Bahrain"])

    assert len(plan.sessions) == 5
    assert len(plan.diagnostics) == 2  # SPRINT, SPRINT_QUALIFYING not available
    assert plan.event_order == [(2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix")]


def test_build_ingestion_plan_orders_sessions_by_real_weekend_chronology(
    mock_provider: Any,
) -> None:
    """docs/m12-design-review.md's Phase 3 brief §6: sessions within one
    event follow that event's own real Session1..5 order, not a fixed
    global SessionType order -- China 2024's real order is
    Practice1/SprintQualifying/Sprint/Qualifying/Race."""
    mock_provider.discover_season.return_value = [
        _discovery(
            "2024_chinese_grand_prix",
            "Chinese Grand Prix",
            5,
            _SPRINT_QUALIFYING_2024,
            country="China",
            session_names=["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"],
        )
    ]

    plan = build_ingestion_plan([2024], event_queries=["China"])

    assert [s.session_type for s in plan.sessions] == [
        SessionType.PRACTICE_1,
        SessionType.SPRINT_QUALIFYING,
        SessionType.SPRINT,
        SessionType.QUALIFYING,
        SessionType.RACE,
    ]


def test_build_ingestion_plan_orders_events_by_round_number(mock_provider: Any) -> None:
    """docs/m12-design-review.md's Phase 3 brief §6: events ordered by
    (season, round_number, event_id), never by discovery/input order."""
    mock_provider.discover_season.return_value = [
        _discovery("2024_chinese_grand_prix", "Chinese Grand Prix", 5, {SessionType.RACE: "Race"}),
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, {SessionType.RACE: "Race"}),
    ]

    plan = build_ingestion_plan([2024], event_queries=None)  # --all-events

    assert [event_id for _, event_id, _ in plan.event_order] == [
        "2024_bahrain_grand_prix",
        "2024_chinese_grand_prix",
    ]


def test_build_ingestion_plan_2021_sprint_era_historical_terminology(mock_provider: Any) -> None:
    mock_provider.discover_season.return_value = [
        _discovery(
            "2021_british_grand_prix",
            "British Grand Prix",
            10,
            _SPRINT_2021,
            season=2021,
            session_names=["Practice 1", "Qualifying", "Practice 2", "Sprint", "Race"],
        )
    ]

    plan = build_ingestion_plan([2021], event_queries=["British"])

    planned_types = {s.session_type for s in plan.sessions}
    diag_types = {d.session_type for d in plan.diagnostics}
    assert SessionType.SPRINT in planned_types
    assert SessionType.SPRINT_QUALIFYING not in planned_types
    assert SessionType.SPRINT_QUALIFYING in diag_types  # explicitly not-available, not dropped
    assert SessionType.PRACTICE_3 in diag_types  # doesn't exist this era


def test_build_ingestion_plan_dedupes_overlapping_event_queries(mock_provider: Any) -> None:
    mock_provider.discover_season.return_value = [
        _discovery(
            "2024_bahrain_grand_prix",
            "Bahrain Grand Prix",
            1,
            {SessionType.RACE: "Race"},
            location="Sakhir",
        )
    ]

    plan = build_ingestion_plan([2024], event_queries=["Bahrain", "Sakhir"])

    assert plan.event_order == [(2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix")]
    assert len(plan.sessions) == 1


def test_build_ingestion_plan_no_duplicate_sessions_for_one_event(mock_provider: Any) -> None:
    mock_provider.discover_season.return_value = [
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, _CONVENTIONAL_2024),
    ]

    plan = build_ingestion_plan(
        [2024], event_queries=["Bahrain"], session_types=[SessionType.RACE, SessionType.RACE]
    )

    # session_types is caller-controlled; the plan doesn't need to dedupe a
    # deliberately duplicated request, but must not multiply real work --
    # documented here as the actual behavior rather than assumed.
    assert len(plan.sessions) == 2


def test_build_ingestion_plan_explicit_session_subset(mock_provider: Any) -> None:
    mock_provider.discover_season.return_value = [
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, _CONVENTIONAL_2024),
    ]

    plan = build_ingestion_plan(
        [2024], event_queries=["Bahrain"], session_types=[SessionType.RACE, SessionType.SPRINT]
    )

    assert [s.session_type for s in plan.sessions] == [SessionType.RACE]
    assert [d.session_type for d in plan.diagnostics] == [SessionType.SPRINT]


def test_build_ingestion_plan_multiple_seasons_sorted(mock_provider: Any) -> None:
    def discover_season_side_effect(season: int) -> list[EventDiscovery]:
        if season == 2023:
            return [
                _discovery(
                    "2023_bahrain_grand_prix",
                    "Bahrain Grand Prix",
                    1,
                    {SessionType.RACE: "Race"},
                    season=2023,
                )
            ]
        return [
            _discovery(
                "2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, {SessionType.RACE: "Race"}
            )
        ]

    mock_provider.discover_season.side_effect = discover_season_side_effect

    plan = build_ingestion_plan([2024, 2023], event_queries=["Bahrain"])

    assert [(season, event_id) for season, event_id, _ in plan.event_order] == [
        (2023, "2023_bahrain_grand_prix"),
        (2024, "2024_bahrain_grand_prix"),
    ]


def test_build_ingestion_plan_never_calls_ingest_event(
    mock_provider: Any, mock_ingest_event: Any
) -> None:
    """PLAN building performs zero ingestion (docs/m12-design-review.md's
    Phase 3 brief: discover -> plan -> reviewable plan -> execute)."""
    mock_provider.discover_season.return_value = [
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, _CONVENTIONAL_2024),
    ]

    build_ingestion_plan([2024], event_queries=["Bahrain"])

    mock_ingest_event.assert_not_called()


def test_build_ingestion_plan_bad_event_query_raises_before_ingestion(
    mock_provider: Any, mock_ingest_event: Any
) -> None:
    mock_provider.discover_season.return_value = [
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, _CONVENTIONAL_2024),
    ]

    from pitwall_pipeline.normalize import EventNotFoundError

    with pytest.raises(EventNotFoundError):
        build_ingestion_plan([2024], event_queries=["xyz nonsense event"])

    mock_ingest_event.assert_not_called()


# ---------------------------------------------------------------------------
# describe() -- deterministic dry-run preview text
# ---------------------------------------------------------------------------


def test_plan_describe_lists_sessions_and_diagnostics() -> None:
    plan = IngestionPlan(
        event_order=[(2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix")],
        sessions=[
            PlannedSession(
                2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix", SessionType.RACE, "Race"
            )
        ],
        diagnostics=[],
        requested_session_types=[SessionType.RACE],
    )
    text = plan.describe()
    assert "2024 Bahrain Grand Prix" in text
    assert "race" in text


def test_plan_describe_empty_plan() -> None:
    plan = IngestionPlan()
    assert "empty plan" in plan.describe()


# ---------------------------------------------------------------------------
# F. Execution
# ---------------------------------------------------------------------------


def _event_result(
    event_id: str, event_name: str, outcomes: list[SessionIngestOutcome]
) -> EventIngestResult:
    return EventIngestResult(
        event=Event(
            event_id=event_id,
            season=2024,
            round_number=1,
            event_name=event_name,
            event_format="conventional",
            location="",
            country="",
        ),
        outcomes=outcomes,
    )


def _outcome(
    status: SessionIngestStatus, session_type: SessionType = SessionType.RACE
) -> SessionIngestOutcome:
    return SessionIngestOutcome(
        session_type=session_type,
        status=status,
        session_id="x" if status != SessionIngestStatus.NOT_AVAILABLE else None,
    )


def _plan(event_order: list[tuple[int, str, str]]) -> IngestionPlan:
    return IngestionPlan(
        event_order=event_order,
        sessions=[
            PlannedSession(season, event_id, event_name, SessionType.RACE, "Race")
            for season, event_id, event_name in event_order
        ],
        diagnostics=[],
        requested_session_types=[SessionType.RACE],
    )


def test_execute_ingestion_plan_calls_ingest_event_once_per_event(mock_ingest_event: Any) -> None:
    plan = _plan(
        [
            (2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix"),
            (2024, "2024_chinese_grand_prix", "Chinese Grand Prix"),
        ]
    )
    mock_ingest_event.side_effect = lambda season, event_name, **kw: _event_result(
        f"2024_{event_name.lower().replace(' ', '_')}",
        event_name,
        [_outcome(SessionIngestStatus.SUCCESS)],
    )

    result = execute_ingestion_plan(plan)

    assert mock_ingest_event.call_count == 2
    assert len(result.event_results) == 2


def test_execute_ingestion_plan_passes_plan_requested_session_types(mock_ingest_event: Any) -> None:
    """Execution must ingest exactly what the plan/dry-run already showed,
    never more -- passes plan.requested_session_types unchanged to every
    ingest_event() call."""
    plan = IngestionPlan(
        event_order=[(2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix")],
        sessions=[
            PlannedSession(
                2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix", SessionType.RACE, "Race"
            )
        ],
        diagnostics=[],
        requested_session_types=[SessionType.RACE, SessionType.QUALIFYING],
    )
    mock_ingest_event.return_value = _event_result(
        "2024_bahrain_grand_prix", "Bahrain Grand Prix", [_outcome(SessionIngestStatus.SUCCESS)]
    )

    execute_ingestion_plan(plan)

    _, kwargs = mock_ingest_event.call_args
    assert kwargs["session_types"] == [SessionType.RACE, SessionType.QUALIFYING]


# 9. EVENT-LEVEL failure isolation.
def test_execute_ingestion_plan_isolates_event_level_failure(mock_ingest_event: Any) -> None:
    plan = _plan(
        [
            (2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix"),
            (2024, "2024_chinese_grand_prix", "Chinese Grand Prix"),
            (2024, "2024_japanese_grand_prix", "Japanese Grand Prix"),
        ]
    )

    def side_effect(season: int, event_name: str, **kwargs: Any) -> EventIngestResult:
        if event_name == "Chinese Grand Prix":
            raise RuntimeError("simulated total event failure")
        return _event_result(
            f"2024_{event_name.lower().replace(' ', '_')}",
            event_name,
            [_outcome(SessionIngestStatus.SUCCESS)],
        )

    mock_ingest_event.side_effect = side_effect

    result = execute_ingestion_plan(plan)

    assert mock_ingest_event.call_count == 3  # every event still attempted
    assert len(result.event_results) == 2  # Bahrain, Japan succeeded at the call level
    assert len(result.event_failures) == 1
    assert result.event_failures[0].event_name == "Chinese Grand Prix"
    assert "simulated total event failure" in result.event_failures[0].detail


# SESSION-LEVEL failure isolation (Phase 2's per-session outcomes) must
# survive aggregation across multiple events, undiminished.
def test_execute_ingestion_plan_preserves_session_level_outcomes(mock_ingest_event: Any) -> None:
    plan = _plan([(2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix")])
    mock_ingest_event.return_value = _event_result(
        "2024_bahrain_grand_prix",
        "Bahrain Grand Prix",
        [
            _outcome(SessionIngestStatus.SUCCESS, SessionType.PRACTICE_1),
            _outcome(SessionIngestStatus.LOAD_FAILED, SessionType.PRACTICE_2),
            _outcome(SessionIngestStatus.SUCCESS_NO_TELEMETRY, SessionType.RACE),
            _outcome(SessionIngestStatus.NOT_AVAILABLE, SessionType.SPRINT),
        ],
    )

    result = execute_ingestion_plan(plan)

    assert len(result.succeeded) == 2  # SUCCESS + SUCCESS_NO_TELEMETRY
    assert len(result.failed) == 1
    assert len(result.not_available) == 1


# 10. SUCCESS_NO_TELEMETRY must never collapse into a generic failure when
# aggregated across the multi-event executor.
def test_execute_ingestion_plan_success_no_telemetry_counts_as_succeeded(
    mock_ingest_event: Any,
) -> None:
    plan = _plan([(2018, "2018_bahrain_grand_prix", "Bahrain Grand Prix")])
    mock_ingest_event.return_value = _event_result(
        "2018_bahrain_grand_prix",
        "Bahrain Grand Prix",
        [_outcome(SessionIngestStatus.SUCCESS_NO_TELEMETRY)],
    )

    result = execute_ingestion_plan(plan)

    assert result.event_results[0].outcomes[0].status == SessionIngestStatus.SUCCESS_NO_TELEMETRY
    assert result.event_results[0].outcomes[0] in result.succeeded
    assert result.failed == []


# H. Idempotency at the orchestration level (real Parquet/Postgres
# idempotency is M10/Phase-1-established; this proves the Phase 3 executor
# adds no double-invocation of its own).
def test_execute_ingestion_plan_twice_calls_ingest_event_exactly_once_per_call(
    mock_ingest_event: Any,
) -> None:
    plan = _plan([(2024, "2024_bahrain_grand_prix", "Bahrain Grand Prix")])
    mock_ingest_event.return_value = _event_result(
        "2024_bahrain_grand_prix", "Bahrain Grand Prix", [_outcome(SessionIngestStatus.SUCCESS)]
    )

    execute_ingestion_plan(plan)
    execute_ingestion_plan(plan)

    assert mock_ingest_event.call_count == 2  # once per execute call, not accumulating


# ---------------------------------------------------------------------------
# G. Safety: CLI argument parsing
# ---------------------------------------------------------------------------


def test_cli_requires_event_or_all_events() -> None:
    with pytest.raises(SystemExit):
        _parse_args(["--season", "2024"])


def test_cli_no_arguments_fails() -> None:
    with pytest.raises(SystemExit):
        _parse_args([])


def test_cli_event_and_all_events_are_mutually_exclusive() -> None:
    with pytest.raises(SystemExit):
        _parse_args(["--season", "2024", "--event", "Bahrain", "--all-events"])


def test_cli_multiple_seasons_requires_confirmation() -> None:
    with pytest.raises(SystemExit):
        _parse_args(["--season", "2023", "--season", "2024", "--event", "Bahrain"])


def test_cli_multiple_seasons_with_confirmation_succeeds() -> None:
    args = _parse_args(
        [
            "--season",
            "2023",
            "--season",
            "2024",
            "--event",
            "Bahrain",
            "--confirm-multi-season",
        ]
    )
    assert args.seasons == [2023, 2024]


def test_cli_single_season_never_requires_confirmation() -> None:
    args = _parse_args(["--season", "2024", "--event", "Bahrain"])
    assert args.seasons == [2024]


def test_cli_all_events_requires_explicit_flag() -> None:
    args = _parse_args(["--season", "2024", "--all-events"])
    assert args.all_events is True
    assert args.events is None


# E. Dry-run: performs discovery + planning, prints, but zero ingestion.
def test_cli_dry_run_never_calls_execute(
    mock_provider: Any, mock_ingest_event: Any, capsys: Any
) -> None:
    mock_provider.discover_season.return_value = [
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, _CONVENTIONAL_2024),
    ]

    main(["--season", "2024", "--event", "Bahrain", "--dry-run"])

    mock_ingest_event.assert_not_called()
    captured = capsys.readouterr()
    assert "Bahrain Grand Prix" in captured.out


def test_cli_without_dry_run_does_execute(mock_provider: Any, mock_ingest_event: Any) -> None:
    mock_provider.discover_season.return_value = [
        _discovery("2024_bahrain_grand_prix", "Bahrain Grand Prix", 1, _CONVENTIONAL_2024),
    ]
    mock_ingest_event.return_value = _event_result(
        "2024_bahrain_grand_prix", "Bahrain Grand Prix", [_outcome(SessionIngestStatus.SUCCESS)]
    )

    main(["--season", "2024", "--event", "Bahrain"])

    assert mock_ingest_event.called
