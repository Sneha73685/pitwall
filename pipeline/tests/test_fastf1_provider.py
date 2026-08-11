"""FastF1Provider tests -- entirely mocked, no network (see CLAUDE.md's testing rules).

Stands in for FastF1's own Laps/Lap wrapper types (fastf1.core.Laps/Lap) with minimal fakes
that support just the calls FastF1Provider makes (pick_drivers, iterlaps, pick_fastest,
get_telemetry, __getitem__), built on top of the same fixtures.py DataFrames normalize.py's
tests use.
"""

from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from pitwall_pipeline.models import SessionType
from pitwall_pipeline.normalize import EventNotFoundError, SessionNotAvailableError
from pitwall_pipeline.providers import fastf1_provider as fastf1_provider_module
from pitwall_pipeline.providers.fastf1_provider import FastF1Provider
from tests.fixtures import (
    build_laps_df,
    build_laps_df_with_pit_stop,
    build_results_df,
    build_telemetry_df,
)


class FakeLap:
    def __init__(
        self, row: "pd.Series[Any]", *, telemetry: pd.DataFrame | None, telemetry_error: bool
    ) -> None:
        self._row = row
        self._telemetry = telemetry
        self._telemetry_error = telemetry_error

    def __getitem__(self, key: str) -> Any:
        return self._row[key]

    def get_telemetry(self) -> pd.DataFrame:
        if self._telemetry_error:
            raise RuntimeError("simulated telemetry fetch failure")
        assert self._telemetry is not None
        return self._telemetry


class FakeLaps:
    """Stands in for fastf1.core.Laps: a DataFrame plus pick_drivers/iterlaps/pick_fastest."""

    def __init__(
        self,
        df: pd.DataFrame,
        telemetry_by_key: dict[tuple[str, int], pd.DataFrame],
        *,
        telemetry_error_keys: frozenset[tuple[str, int]] = frozenset(),
    ) -> None:
        self._df = df
        self._telemetry_by_key = telemetry_by_key
        self._telemetry_error_keys = telemetry_error_keys

    def iterrows(self) -> Any:
        return self._df.iterrows()

    def pick_drivers(self, driver_id: str) -> "FakeLaps":
        filtered = self._df[self._df["Driver"] == driver_id]
        return FakeLaps(
            filtered, self._telemetry_by_key, telemetry_error_keys=self._telemetry_error_keys
        )

    def _fake_lap_for_row(self, row: "pd.Series[Any]") -> FakeLap:
        key = (str(row["Driver"]), int(row["LapNumber"]))
        return FakeLap(
            row,
            telemetry=self._telemetry_by_key.get(key),
            telemetry_error=key in self._telemetry_error_keys,
        )

    def iterlaps(self) -> Any:
        for idx, row in self._df.iterrows():
            yield idx, self._fake_lap_for_row(row)

    def pick_fastest(self) -> FakeLap | None:
        if self._df.empty:
            return None
        idx = self._df["LapTime"].idxmin()
        row = self._df.loc[idx]
        assert isinstance(row, pd.Series)
        return self._fake_lap_for_row(row)


def _fake_session(laps: FakeLaps) -> SimpleNamespace:
    return SimpleNamespace(
        event={
            "EventName": "Italian Grand Prix",
            "RoundNumber": 16,
            "Location": "Monza",
            "Country": "Italy",
        },
        date=pd.Timestamp("2023-09-03T13:00:00Z"),
        results=build_results_df(),
        laps=laps,
        load=MagicMock(),
    )


class FakeEvent:
    """Stands in for fastf1.events.Event (a pandas Series subclass):
    dict-style __getitem__/get() for schedule fields, including SessionN
    columns -- verified byte-identical to the real get_session_name(n)
    method (docs/m12-design-review.md Phase 2 audit), so
    _event_session_names() reads SessionN directly, the only access
    pattern this fake needs to support."""

    def __init__(self, data: dict[str, Any], session_names: list[str | None]) -> None:
        self._data = {**data, **{f"Session{i + 1}": name for i, name in enumerate(session_names)}}

    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)


def _fake_conventional_event() -> FakeEvent:
    """A normal, non-sprint event -- every canonical SessionType except
    SPRINT/SPRINT_QUALIFYING is available, matching every real conventional-
    format event verified in docs/m12-design-review.md §3.2."""
    return FakeEvent(
        {
            "EventName": "Italian Grand Prix",
            "RoundNumber": 16,
            "EventFormat": "conventional",
            "Location": "Monza",
            "Country": "Italy",
            "EventDate": pd.Timestamp("2023-09-03T00:00:00"),
        },
        ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"],
    )


@pytest.fixture
def patched_fastf1() -> Any:
    with patch.object(fastf1_provider_module, "fastf1") as mock_fastf1:
        mock_fastf1.Cache = MagicMock()
        mock_fastf1.get_event.return_value = _fake_conventional_event()
        yield mock_fastf1


def test_load_session_returns_fully_normalized_data(tmp_path: Path, patched_fastf1: Any) -> None:
    laps_df = build_laps_df()
    telemetry_by_key = {
        ("VER", 1): build_telemetry_df(num_samples=3),
        ("HAM", 1): build_telemetry_df(num_samples=2),
    }
    fake_session = _fake_session(FakeLaps(laps_df, telemetry_by_key))
    patched_fastf1.get_session.return_value = fake_session

    provider = FastF1Provider(tmp_path)
    data = provider.load_session(2023, "Italian Grand Prix", SessionType.RACE)

    patched_fastf1.get_event.assert_called_once_with(2023, "Italian Grand Prix")
    # M12 Phase 1: resolved via the event's own real session name, not a
    # static abbreviation -- see resolve_session_identifier.
    patched_fastf1.get_session.assert_called_once_with(2023, "Italian Grand Prix", "Race")
    fake_session.load.assert_called_once()

    assert data.session.session_id == "2023_italian_grand_prix_race"
    assert data.session.round_number == 16
    assert [d.driver_id for d in data.drivers] == ["VER", "HAM"]
    assert len(data.laps) == 2
    assert len(data.telemetry) == 5  # 3 VER samples + 2 HAM samples
    # VER has the faster LapTime, so VER's lap is the reference for track points.
    assert len(data.track_points) == 3
    assert all(tp.session_id == data.session.session_id for tp in data.track_points)


def test_load_session_skips_lap_when_telemetry_fetch_fails(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    laps_df = build_laps_df()
    telemetry_by_key = {("HAM", 1): build_telemetry_df(num_samples=2)}
    fake_laps = FakeLaps(laps_df, telemetry_by_key, telemetry_error_keys=frozenset({("VER", 1)}))
    fake_session = _fake_session(fake_laps)
    patched_fastf1.get_session.return_value = fake_session

    provider = FastF1Provider(tmp_path)
    data = provider.load_session(2023, "Italian Grand Prix", SessionType.RACE)

    # VER's lap telemetry failed to load and is skipped; HAM's is kept.
    assert len(data.telemetry) == 2
    assert all(sample.driver_id == "HAM" for sample in data.telemetry)


def test_load_session_with_no_laps_returns_empty_track_points(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    empty_laps_df = build_laps_df().iloc[0:0]
    fake_session = _fake_session(FakeLaps(empty_laps_df, {}))
    patched_fastf1.get_session.return_value = fake_session

    provider = FastF1Provider(tmp_path)
    data = provider.load_session(2023, "Italian Grand Prix", SessionType.RACE)

    assert data.laps == []
    assert data.telemetry == []
    assert data.track_points == []


def test_load_session_returns_stints_and_pit_stops(tmp_path: Path, patched_fastf1: Any) -> None:
    """M10, Phase 2: load_session()'s returned NormalizedSessionData includes
    non-empty stints/pit_stops, read from the same Laps frame already
    fetched for normalize_laps -- no new FastF1 call.
    """
    laps_df = build_laps_df_with_pit_stop()
    telemetry_by_key = {
        ("VER", 1): build_telemetry_df(num_samples=2),
        ("VER", 2): build_telemetry_df(num_samples=2),
        ("VER", 3): build_telemetry_df(num_samples=2),
    }
    fake_session = _fake_session(FakeLaps(laps_df, telemetry_by_key))
    patched_fastf1.get_session.return_value = fake_session

    provider = FastF1Provider(tmp_path)
    data = provider.load_session(2023, "Italian Grand Prix", SessionType.RACE)

    assert len(data.stints) == 2
    assert {s.stint_number for s in data.stints} == {1, 2}
    assert all(s.driver_id == "VER" for s in data.stints)

    assert len(data.pit_stops) == 1
    assert data.pit_stops[0].driver_id == "VER"
    assert data.pit_stops[0].lap_number == 2
    assert data.pit_stops[0].pit_lane_time_seconds is not None


def test_load_session_resolves_sprint_qualifying_2024_era(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    """M12 Phase 1: a 2024-era sprint_qualifying event resolves
    SPRINT_QUALIFYING to its real "Sprint Qualifying" session name, per
    docs/m12-design-review.md §3.2/§4."""
    patched_fastf1.get_event.return_value = FakeEvent(
        {
            "EventName": "Chinese Grand Prix",
            "RoundNumber": 5,
            "EventFormat": "sprint_qualifying",
            "Location": "Shanghai",
            "Country": "China",
            "EventDate": pd.Timestamp("2024-04-21T00:00:00"),
        },
        ["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"],
    )
    fake_session = _fake_session(FakeLaps(build_laps_df(), {}))
    patched_fastf1.get_session.return_value = fake_session

    provider = FastF1Provider(tmp_path)
    provider.load_session(2024, "Chinese Grand Prix", SessionType.SPRINT_QUALIFYING)

    patched_fastf1.get_session.assert_called_once_with(
        2024, "Chinese Grand Prix", "Sprint Qualifying"
    )


def test_load_session_resolves_sprint_shootout_2023_era(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    """M12 Phase 1: a 2023-era sprint_shootout event resolves
    SPRINT_QUALIFYING to its real "Sprint Shootout" session name -- a
    different real display name for the same canonical PitWall type,
    per docs/m12-design-review.md §3.2/§5."""
    patched_fastf1.get_event.return_value = FakeEvent(
        {
            "EventName": "Azerbaijan Grand Prix",
            "RoundNumber": 4,
            "EventFormat": "sprint_shootout",
            "Location": "Baku",
            "Country": "Azerbaijan",
            "EventDate": pd.Timestamp("2023-04-30T00:00:00"),
        },
        ["Practice 1", "Qualifying", "Sprint Shootout", "Sprint", "Race"],
    )
    fake_session = _fake_session(FakeLaps(build_laps_df(), {}))
    patched_fastf1.get_session.return_value = fake_session

    provider = FastF1Provider(tmp_path)
    provider.load_session(2023, "Azerbaijan Grand Prix", SessionType.SPRINT_QUALIFYING)

    patched_fastf1.get_session.assert_called_once_with(
        2023, "Azerbaijan Grand Prix", "Sprint Shootout"
    )


def test_load_session_raises_when_sprint_qualifying_not_available_2021_era(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    """M12 Phase 1: closes the real, verified defect in
    docs/m12-design-review.md §3.3 -- a 2021/2022-era sprint event has no
    session matching any SPRINT_QUALIFYING alias at all (only Practice 1,
    Qualifying, Practice 2, Sprint, Race). Requesting it must raise
    SessionNotAvailableError, never silently resolve to the Sprint session
    itself (the old static "SQ" abbreviation's real, observed failure
    mode) and never call fastf1.get_session() at all."""
    patched_fastf1.get_event.return_value = FakeEvent(
        {
            "EventName": "British Grand Prix",
            "RoundNumber": 10,
            "EventFormat": "sprint",
            "Location": "Silverstone",
            "Country": "UK",
            "EventDate": pd.Timestamp("2021-07-18T00:00:00"),
        },
        ["Practice 1", "Qualifying", "Practice 2", "Sprint", "Race"],
    )

    provider = FastF1Provider(tmp_path)
    with pytest.raises(SessionNotAvailableError):
        provider.load_session(2021, "British Grand Prix", SessionType.SPRINT_QUALIFYING)

    patched_fastf1.get_session.assert_not_called()


def test_load_session_resolves_sprint_2021_era(tmp_path: Path, patched_fastf1: Any) -> None:
    """The 2021/2022 event above still resolves SPRINT correctly -- only
    the sprint-qualifying slot is absent, not the Sprint session itself."""
    patched_fastf1.get_event.return_value = FakeEvent(
        {
            "EventName": "British Grand Prix",
            "RoundNumber": 10,
            "EventFormat": "sprint",
            "Location": "Silverstone",
            "Country": "UK",
            "EventDate": pd.Timestamp("2021-07-18T00:00:00"),
        },
        ["Practice 1", "Qualifying", "Practice 2", "Sprint", "Race"],
    )
    fake_session = _fake_session(FakeLaps(build_laps_df(), {}))
    patched_fastf1.get_session.return_value = fake_session

    provider = FastF1Provider(tmp_path)
    provider.load_session(2021, "British Grand Prix", SessionType.SPRINT)

    patched_fastf1.get_session.assert_called_once_with(2021, "British Grand Prix", "Sprint")


def _fake_schedule() -> pd.DataFrame:
    """A small, real-shaped multi-event schedule (M12 Phase 2) -- one
    conventional event, one 2024-era sprint_qualifying event, and one
    2021-era sprint event, reproducing docs/m12-design-review.md §4's
    matrix directly as DataFrame rows (SessionN as plain string columns,
    verified equivalent to the real Event type, Phase 2 audit)."""
    return pd.DataFrame(
        [
            {
                "RoundNumber": 1,
                "EventName": "Bahrain Grand Prix",
                "EventFormat": "conventional",
                "Location": "Sakhir",
                "Country": "Bahrain",
                "EventDate": pd.Timestamp("2024-03-02T00:00:00"),
                "Session1": "Practice 1",
                "Session2": "Practice 2",
                "Session3": "Practice 3",
                "Session4": "Qualifying",
                "Session5": "Race",
            },
            {
                "RoundNumber": 5,
                "EventName": "Chinese Grand Prix",
                "EventFormat": "sprint_qualifying",
                "Location": "Shanghai",
                "Country": "China",
                "EventDate": pd.Timestamp("2024-04-21T00:00:00"),
                "Session1": "Practice 1",
                "Session2": "Sprint Qualifying",
                "Session3": "Sprint",
                "Session4": "Qualifying",
                "Session5": "Race",
            },
            {
                "RoundNumber": 10,
                "EventName": "British Grand Prix",
                "EventFormat": "sprint",
                "Location": "Silverstone",
                "Country": "UK",
                "EventDate": pd.Timestamp("2021-07-18T00:00:00"),
                "Session1": "Practice 1",
                "Session2": "Qualifying",
                "Session3": "Practice 2",
                "Session4": "Sprint",
                "Session5": "Race",
            },
        ]
    )


def test_discover_event_resolves_conventional_event(tmp_path: Path, patched_fastf1: Any) -> None:
    patched_fastf1.get_event_schedule.return_value = _fake_schedule()

    provider = FastF1Provider(tmp_path)
    event = provider.discover_event(2024, "Bahrain")

    patched_fastf1.get_event_schedule.assert_called_once_with(2024, include_testing=False)
    assert event.event_id == "2024_bahrain_grand_prix"
    assert event.round_number == 1
    assert event.event_format == "conventional"
    # discover_event() never loads a session -- schedule-only.
    patched_fastf1.get_session.assert_not_called()


def test_discover_sessions_for_conventional_event(tmp_path: Path, patched_fastf1: Any) -> None:
    patched_fastf1.get_event_schedule.return_value = _fake_schedule()

    provider = FastF1Provider(tmp_path)
    discovery = provider.discover_sessions(2024, "Bahrain")

    assert discovery.event.event_id == "2024_bahrain_grand_prix"
    assert set(discovery.available_sessions) == {
        SessionType.PRACTICE_1,
        SessionType.PRACTICE_2,
        SessionType.PRACTICE_3,
        SessionType.QUALIFYING,
        SessionType.RACE,
    }
    assert SessionType.SPRINT not in discovery.available_sessions
    assert SessionType.SPRINT_QUALIFYING not in discovery.available_sessions


def test_discover_sessions_for_2024_sprint_qualifying_event(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    patched_fastf1.get_event_schedule.return_value = _fake_schedule()

    provider = FastF1Provider(tmp_path)
    discovery = provider.discover_sessions(2024, "China")

    assert discovery.event.event_id == "2024_chinese_grand_prix"
    assert discovery.available_sessions[SessionType.SPRINT_QUALIFYING] == "Sprint Qualifying"
    assert discovery.available_sessions[SessionType.SPRINT] == "Sprint"


def test_discover_sessions_for_2021_sprint_event_excludes_sprint_qualifying(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    """Historical sprint terminology: the 2021-era sprint format has no
    session matching any SPRINT_QUALIFYING alias at all -- discovery must
    report it absent, not misresolve it to Sprint (the real, verified
    docs/m12-design-review.md §3.3 defect this whole model exists to
    close)."""
    patched_fastf1.get_event_schedule.return_value = _fake_schedule()

    provider = FastF1Provider(tmp_path)
    discovery = provider.discover_sessions(2021, "British")

    assert SessionType.SPRINT in discovery.available_sessions
    assert SessionType.SPRINT_QUALIFYING not in discovery.available_sessions
    assert SessionType.PRACTICE_3 not in discovery.available_sessions


def test_discover_event_rejects_garbage_input_without_calling_get_session(
    tmp_path: Path, patched_fastf1: Any
) -> None:
    """M12 Phase 2's CRITICAL FUZZY-MATCHING SAFETY RULE: garbage input
    must raise, and must never reach fastf1.get_session() at all --
    proving no ingestion can be triggered by an unmatched query, closing
    docs/m12-design-review.md §19.3's real, verified finding
    ("xyz nonsense event" silently resolving to "Chinese Grand Prix")."""
    patched_fastf1.get_event_schedule.return_value = _fake_schedule()

    provider = FastF1Provider(tmp_path)
    with pytest.raises(EventNotFoundError):
        provider.discover_event(2024, "xyz nonsense event")

    patched_fastf1.get_session.assert_not_called()
    patched_fastf1.get_event.assert_not_called()


# M12 Phase 3: discover_season() -- discover_sessions() for every event in
# a season, from one schedule fetch, no per-event get_event() call.
class _FakeScheduleFrame:
    """Stands in for the real fastf1.events.EventSchedule DataFrame just
    enough for discover_season()'s `for _, row in schedule.iterrows()`
    loop -- yields FakeEvent rows, matching the real type's own iterrows()
    behavior (verified, docs/m12-design-review.md Phase 3 audit)."""

    def __init__(self, rows: list[FakeEvent]) -> None:
        self._rows = rows

    def iterrows(self) -> Any:
        return enumerate(self._rows)


def test_discover_season_returns_one_discovery_per_event(
    patched_fastf1: Any, tmp_path: Path
) -> None:
    schedule_df = _fake_schedule()
    rows = [
        FakeEvent(dict(row), [row.get(f"Session{n}") for n in range(1, 6)])
        for _, row in schedule_df.iterrows()
    ]
    patched_fastf1.get_event_schedule.return_value = _FakeScheduleFrame(rows)

    provider = FastF1Provider(tmp_path)
    discoveries = provider.discover_season(2024)

    patched_fastf1.get_event_schedule.assert_called_once_with(2024, include_testing=False)
    # discover_season(2024) applies the requested season uniformly to
    # every row it's given -- event_id reflects the call's season
    # argument, not any per-row data (the fixture mixes real formats from
    # different eras purely for test coverage, same as _fake_schedule()'s
    # other uses in this file).
    assert [d.event.event_id for d in discoveries] == [
        "2024_bahrain_grand_prix",
        "2024_chinese_grand_prix",
        "2024_british_grand_prix",
    ]
    bahrain = discoveries[0]
    assert SessionType.RACE in bahrain.available_sessions
    china = discoveries[1]
    assert china.available_sessions[SessionType.SPRINT_QUALIFYING] == "Sprint Qualifying"
    british = discoveries[2]
    assert SessionType.SPRINT_QUALIFYING not in british.available_sessions


def test_discover_season_empty_schedule_returns_empty_list(
    patched_fastf1: Any, tmp_path: Path
) -> None:
    patched_fastf1.get_event_schedule.return_value = _FakeScheduleFrame([])

    provider = FastF1Provider(tmp_path)
    discoveries = provider.discover_season(2099)

    assert discoveries == []
