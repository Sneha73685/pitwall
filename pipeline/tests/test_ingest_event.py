"""Tests for M12 Phase 2's event-level discovery/ingestion orchestration
(pitwall_pipeline.ingest_event). Entirely mocked -- no network, no real
FastF1Provider/ingest_session call (CLAUDE.md's testing rules) -- proving
the orchestration logic itself (discovery -> per-session loop -> structured
result) without re-testing FastF1Provider/ingest_session, which have their
own test files.
"""

from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from pitwall_pipeline import ingest_event as ingest_event_module
from pitwall_pipeline.ingest import IngestResult
from pitwall_pipeline.ingest_event import (
    SessionIngestStatus,
    discover_event,
    discover_sessions,
    ingest_event,
)
from pitwall_pipeline.models import Event, EventDiscovery, SessionType
from pitwall_pipeline.normalize import EventNotFoundError

_CONVENTIONAL_AVAILABLE: dict[SessionType, str] = {
    SessionType.PRACTICE_1: "Practice 1",
    SessionType.PRACTICE_2: "Practice 2",
    SessionType.PRACTICE_3: "Practice 3",
    SessionType.QUALIFYING: "Qualifying",
    SessionType.RACE: "Race",
}


def _event(
    event_id: str = "2024_bahrain_grand_prix", event_name: str = "Bahrain Grand Prix"
) -> Event:
    return Event(
        event_id=event_id,
        season=2024,
        round_number=1,
        event_name=event_name,
        event_format="conventional",
        location="Sakhir",
        country="Bahrain",
    )


def _discovery(available: dict[SessionType, str], *, event: Event | None = None) -> EventDiscovery:
    return EventDiscovery(
        event=event or _event(),
        session_names=list(available.values()),
        available_sessions=available,
    )


def _result(
    session_id: str, tmp_path: Path, *, lap_count: int = 1, telemetry: int = 1
) -> IngestResult:
    return IngestResult(
        session_id=session_id,
        output_dir=tmp_path / session_id,
        lap_count=lap_count,
        telemetry_sample_count=telemetry,
    )


@pytest.fixture
def mock_provider() -> Any:
    with patch.object(ingest_event_module, "FastF1Provider") as mock_cls:
        yield mock_cls.return_value


@pytest.fixture
def mock_ingest_session() -> Any:
    with patch.object(ingest_event_module, "ingest_session") as mock_fn:
        yield mock_fn


# 9/13. Event with multiple session types; structured per-session results.
def test_ingest_event_ingests_every_available_session(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    mock_provider.discover_sessions.return_value = _discovery(_CONVENTIONAL_AVAILABLE)
    mock_ingest_session.side_effect = lambda season, event, session_type, **kw: _result(
        f"2024_bahrain_grand_prix_{session_type.value}", tmp_path
    )

    result = ingest_event(2024, "Bahrain")

    assert len(result.outcomes) == len(SessionType)  # every canonical type is reported
    assert len(result.succeeded) == 5
    assert len(result.not_available) == 2  # SPRINT, SPRINT_QUALIFYING
    assert mock_ingest_session.call_count == 5


# 10. Event with missing session types -- reported, not silently skipped.
def test_ingest_event_reports_not_available_for_missing_types(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    mock_provider.discover_sessions.return_value = _discovery(_CONVENTIONAL_AVAILABLE)
    mock_ingest_session.return_value = _result("2024_bahrain_grand_prix_race", tmp_path)

    result = ingest_event(2024, "Bahrain")

    outcome = next(o for o in result.outcomes if o.session_type == SessionType.SPRINT_QUALIFYING)
    assert outcome.status == SessionIngestStatus.NOT_AVAILABLE
    assert outcome.session_id is None


def test_ingest_event_with_explicit_requested_subset_still_reports_missing_type(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    """docs/m12-design-review.md §3.2's real 2021-era case: SPRINT_QUALIFYING
    requested but absent for a 2021 sprint event -- reported explicitly,
    ingest_session never called for it."""
    mock_provider.discover_sessions.return_value = _discovery(
        {SessionType.SPRINT: "Sprint", SessionType.RACE: "Race"},
        event=_event(event_id="2021_british_grand_prix", event_name="British Grand Prix"),
    )
    mock_ingest_session.return_value = _result("2021_british_grand_prix_race", tmp_path)

    result = ingest_event(
        2021, "British", session_types=[SessionType.SPRINT_QUALIFYING, SessionType.RACE]
    )

    statuses = {o.session_type: o.status for o in result.outcomes}
    assert statuses[SessionType.SPRINT_QUALIFYING] == SessionIngestStatus.NOT_AVAILABLE
    assert statuses[SessionType.RACE] == SessionIngestStatus.SUCCESS
    mock_ingest_session.assert_called_once()


# 11. One-session failure does not stop later sessions.
def test_ingest_event_isolates_one_session_failure(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    mock_provider.discover_sessions.return_value = _discovery(_CONVENTIONAL_AVAILABLE)

    def side_effect(
        season: int, event: str, session_type: SessionType, **kwargs: Any
    ) -> IngestResult:
        if session_type == SessionType.PRACTICE_3:
            raise RuntimeError("simulated FastF1 load failure (real 2018 Monza case)")
        return _result(f"2024_bahrain_grand_prix_{session_type.value}", tmp_path)

    mock_ingest_session.side_effect = side_effect

    result = ingest_event(2024, "Bahrain")

    statuses = {o.session_type: o.status for o in result.outcomes}
    assert statuses[SessionType.PRACTICE_3] == SessionIngestStatus.LOAD_FAILED
    assert "simulated FastF1 load failure" in (
        next(o for o in result.outcomes if o.session_type == SessionType.PRACTICE_3).detail or ""
    )
    # every other requested-and-available session still attempted, not aborted
    assert statuses[SessionType.PRACTICE_1] == SessionIngestStatus.SUCCESS
    assert statuses[SessionType.PRACTICE_2] == SessionIngestStatus.SUCCESS
    assert statuses[SessionType.QUALIFYING] == SessionIngestStatus.SUCCESS
    assert statuses[SessionType.RACE] == SessionIngestStatus.SUCCESS
    assert mock_ingest_session.call_count == 5
    assert len(result.failed) == 1


# 12. Existing ingest_session() is reused, not duplicated -- and always
# called with the exact, safely-matched event name, never the caller's raw
# query (M12 Phase 2's CRITICAL FUZZY-MATCHING SAFETY RULE).
def test_ingest_event_calls_ingest_session_with_exact_matched_event_name(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    mock_provider.discover_sessions.return_value = _discovery(
        {SessionType.RACE: "Race"}, event=_event(event_name="Bahrain Grand Prix")
    )
    mock_ingest_session.return_value = _result("2024_bahrain_grand_prix_race", tmp_path)

    ingest_event(2024, "Bahrain", session_types=[SessionType.RACE])

    args, kwargs = mock_ingest_session.call_args
    assert args[0] == 2024
    assert args[1] == "Bahrain Grand Prix"  # exact matched name, not "Bahrain"
    assert args[2] == SessionType.RACE


# 14. 2018-style telemetry limitation represented honestly, not as failure.
def test_ingest_event_reports_success_no_telemetry(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    """docs/m12-design-review.md §19.2's real, verified 2018 finding: laps
    ingest correctly, telemetry does not -- must be SUCCESS_NO_TELEMETRY,
    never LOAD_FAILED and never plain SUCCESS."""
    mock_provider.discover_sessions.return_value = _discovery(
        {SessionType.RACE: "Race"},
        event=_event(event_id="2018_bahrain_grand_prix", event_name="Bahrain Grand Prix"),
    )
    mock_ingest_session.return_value = _result(
        "2018_bahrain_grand_prix_race", tmp_path, lap_count=998, telemetry=0
    )

    result = ingest_event(2018, "Bahrain", session_types=[SessionType.RACE])

    outcome = result.outcomes[0]
    assert outcome.status == SessionIngestStatus.SUCCESS_NO_TELEMETRY
    assert outcome in result.succeeded  # usable data, not treated as a failure


def test_ingest_event_reports_plain_success_with_telemetry(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    mock_provider.discover_sessions.return_value = _discovery({SessionType.RACE: "Race"})
    mock_ingest_session.return_value = _result(
        "2024_bahrain_grand_prix_race", tmp_path, lap_count=57, telemetry=840934
    )

    result = ingest_event(2024, "Bahrain", session_types=[SessionType.RACE])

    assert result.outcomes[0].status == SessionIngestStatus.SUCCESS


# Garbage input: discovery itself must reject it before any ingestion.
def test_ingest_event_rejects_garbage_input_before_any_ingestion(
    mock_provider: Any, mock_ingest_session: Any
) -> None:
    """docs/m12-design-review.md §19.3's CRITICAL FUZZY-MATCHING SAFETY
    RULE: a bad query must never reach ingest_session() at all."""
    mock_provider.discover_sessions.side_effect = EventNotFoundError(
        "No event matching 'xyz nonsense event' in this season's schedule"
    )

    with pytest.raises(EventNotFoundError):
        ingest_event(2024, "xyz nonsense event")

    mock_ingest_session.assert_not_called()


# Defense-in-depth safety check: even if ingest_session ever returned a
# session belonging to a different event, ingest_event() must refuse to
# report it as successful rather than silently accept it.
def test_ingest_event_raises_if_ingested_session_belongs_to_a_different_event(
    mock_provider: Any, mock_ingest_session: Any, tmp_path: Path
) -> None:
    mock_provider.discover_sessions.return_value = _discovery(
        {SessionType.RACE: "Race"}, event=_event(event_id="2024_bahrain_grand_prix")
    )
    mock_ingest_session.return_value = _result("2024_chinese_grand_prix_race", tmp_path)

    with pytest.raises(RuntimeError, match="Safety check failed"):
        ingest_event(2024, "Bahrain", session_types=[SessionType.RACE])


# Thin discovery wrappers delegate correctly.
def test_discover_event_delegates_to_provider(mock_provider: Any) -> None:
    mock_provider.discover_event.return_value = _event()

    event = discover_event(2024, "Bahrain")

    assert event.event_id == "2024_bahrain_grand_prix"
    mock_provider.discover_event.assert_called_once_with(2024, "Bahrain")


def test_discover_sessions_delegates_to_provider(mock_provider: Any) -> None:
    mock_provider.discover_sessions.return_value = _discovery(_CONVENTIONAL_AVAILABLE)

    discovery = discover_sessions(2024, "Bahrain")

    assert discovery.event.event_id == "2024_bahrain_grand_prix"
    mock_provider.discover_sessions.assert_called_once_with(2024, "Bahrain")
