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


@pytest.fixture
def patched_fastf1() -> Any:
    with patch.object(fastf1_provider_module, "fastf1") as mock_fastf1:
        mock_fastf1.Cache = MagicMock()
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

    patched_fastf1.get_session.assert_called_once_with(2023, "Italian Grand Prix", "R")
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
