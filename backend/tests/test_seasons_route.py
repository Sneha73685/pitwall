"""API tests for /seasons discovery endpoints (M12 Phase 4). Builds its own
multi-session, multi-season Parquet cache (write_minimal_session) rather
than reusing conftest.py's single-session `client` fixture, since discovery
specifically needs more than one season/event/session to exercise grouping
and ordering.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_telemetry_repository
from app.main import app
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import write_minimal_session


@pytest.fixture
def multi_session_cache_dir(tmp_path: Path) -> Path:
    write_minimal_session(
        tmp_path,
        session_id="2024_bahrain_grand_prix_race",
        season=2024,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2024-03-02T15:00:00+00:00",
        include_telemetry=True,
    )
    write_minimal_session(
        tmp_path,
        session_id="2024_bahrain_grand_prix_qualifying",
        season=2024,
        event_slug="bahrain_grand_prix",
        session_type="qualifying",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2024-03-01T18:00:00+00:00",
        include_telemetry=True,
    )
    write_minimal_session(
        tmp_path,
        session_id="2024_chinese_grand_prix_sprint_qualifying",
        season=2024,
        event_slug="chinese_grand_prix",
        session_type="sprint_qualifying",
        event_name="Chinese Grand Prix",
        round_number=5,
        location="Shanghai",
        country="China",
        session_date="2024-04-19T15:30:00+00:00",
        include_telemetry=True,
    )
    write_minimal_session(
        tmp_path,
        session_id="2018_bahrain_grand_prix_race",
        season=2018,
        event_slug="bahrain_grand_prix",
        session_type="race",
        event_name="Bahrain Grand Prix",
        round_number=1,
        location="Sakhir",
        country="Bahrain",
        session_date="2018-04-08T15:10:00+00:00",
        # The real, verified 2018 finding (docs/m12-design-review.md
        # §19.2): laps/session metadata ingest fine, telemetry does not.
        include_telemetry=False,
    )
    return tmp_path


@pytest.fixture
def multi_client(multi_session_cache_dir: Path) -> Iterator[TestClient]:
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(
        multi_session_cache_dir
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


# A. Season discovery
def test_list_seasons_known_data(multi_client: TestClient) -> None:
    response = multi_client.get("/seasons")

    assert response.status_code == 200
    body = response.json()
    assert [s["season"] for s in body] == [2024, 2018]  # newest first
    season_2024 = next(s for s in body if s["season"] == 2024)
    assert season_2024["event_count"] == 2


def test_list_seasons_deterministic_ordering(multi_client: TestClient) -> None:
    first = multi_client.get("/seasons").json()
    second = multi_client.get("/seasons").json()
    assert first == second


def test_list_seasons_empty_cache_returns_empty_list(tmp_path: Path) -> None:
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    try:
        response = TestClient(app).get("/seasons")
        assert response.status_code == 200
        assert response.json() == []
    finally:
        app.dependency_overrides.clear()


# B. Event discovery
def test_list_events_for_season_multiple_events(multi_client: TestClient) -> None:
    response = multi_client.get("/seasons/2024/events")

    assert response.status_code == 200
    body = response.json()
    assert [e["event_id"] for e in body] == ["2024_bahrain_grand_prix", "2024_chinese_grand_prix"]


def test_list_events_for_season_correct_round_ordering(multi_client: TestClient) -> None:
    body = multi_client.get("/seasons/2024/events").json()
    assert [e["round_number"] for e in body] == [1, 5]


def test_list_events_for_season_correct_event_identity_and_metadata(
    multi_client: TestClient,
) -> None:
    body = multi_client.get("/seasons/2024/events").json()
    bahrain = next(e for e in body if e["event_id"] == "2024_bahrain_grand_prix")
    assert bahrain["event_name"] == "Bahrain Grand Prix"
    assert bahrain["location"] == "Sakhir"
    assert bahrain["country"] == "Bahrain"
    assert bahrain["session_count"] == 2
    assert set(bahrain["session_types"]) == {"race", "qualifying"}


def test_list_events_no_duplicate_events(multi_client: TestClient) -> None:
    body = multi_client.get("/seasons/2024/events").json()
    event_ids = [e["event_id"] for e in body]
    assert len(event_ids) == len(set(event_ids))


def test_list_events_for_unknown_season_returns_200_empty_list(multi_client: TestClient) -> None:
    response = multi_client.get("/seasons/2099/events")

    assert response.status_code == 200
    assert response.json() == []


def test_list_events_for_season_with_no_ingested_events(tmp_path: Path) -> None:
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    try:
        response = TestClient(app).get("/seasons/2024/events")
        assert response.status_code == 200
        assert response.json() == []
    finally:
        app.dependency_overrides.clear()


# C. Session discovery
def test_list_sessions_for_event_race(multi_client: TestClient) -> None:
    response = multi_client.get("/seasons/2024/events/2024_bahrain_grand_prix/sessions")

    assert response.status_code == 200
    body = response.json()
    assert {s["session_type"] for s in body} == {"race", "qualifying"}


def test_list_sessions_for_event_sprint_qualifying_historical_terminology(
    multi_client: TestClient,
) -> None:
    response = multi_client.get("/seasons/2024/events/2024_chinese_grand_prix/sessions")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["session_type"] == "sprint_qualifying"


def test_list_sessions_for_event_deterministic_ordering(multi_client: TestClient) -> None:
    body = multi_client.get("/seasons/2024/events/2024_bahrain_grand_prix/sessions").json()
    # Qualifying (2024-03-01) precedes Race (2024-03-02) chronologically.
    assert [s["session_type"] for s in body] == ["qualifying", "race"]


def test_list_sessions_for_unknown_event_returns_200_empty_list(multi_client: TestClient) -> None:
    response = multi_client.get("/seasons/2024/events/2024_monaco_grand_prix/sessions")

    assert response.status_code == 200
    assert response.json() == []


def test_sessions_include_event_id_and_canonical_identity(multi_client: TestClient) -> None:
    body = multi_client.get("/seasons/2024/events/2024_bahrain_grand_prix/sessions").json()
    for session in body:
        assert session["event_id"] == "2024_bahrain_grand_prix"
        assert session["session_id"].startswith("2024_bahrain_grand_prix_")


# E. Capability handling
def test_session_with_telemetry_reports_true(multi_client: TestClient) -> None:
    body = multi_client.get("/seasons/2024/events/2024_bahrain_grand_prix/sessions").json()
    race = next(s for s in body if s["session_type"] == "race")
    assert race["has_telemetry"] is True


def test_session_without_telemetry_reports_false_not_a_false_claim(
    multi_client: TestClient,
) -> None:
    """The real, verified 2018 finding (docs/m12-design-review.md §19.2):
    the API must not claim telemetry availability it doesn't actually
    have."""
    body = multi_client.get("/seasons/2018/events/2018_bahrain_grand_prix/sessions").json()
    assert len(body) == 1
    assert body[0]["has_telemetry"] is False


# F. API schema
def test_openapi_contains_new_routes(multi_client: TestClient) -> None:
    schema = multi_client.get("/openapi.json").json()
    paths = schema["paths"]
    assert "/seasons" in paths
    assert "/seasons/{season}/events" in paths
    assert "/seasons/{season}/events/{event_id}/sessions" in paths
