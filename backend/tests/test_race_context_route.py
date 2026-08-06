"""Integration tests for GET /sessions/{session_id}/drivers/{driver_id}/stints
and GET /sessions/{session_id}/pit-stops (M10, Phase 4).

Overrides `get_telemetry_repository` with the real `ParquetRepository`
against the shared synthetic fixture (tests/fixtures.py's "2023_monza_race",
the same pattern test_sessions_api.py/test_laps_compare_route.py use) so
the existing-session-vs-404 check has something real to check against, and
overrides `get_race_context_repository` with a fake in-memory
`RaceContextRepository` -- no real Postgres needed at this layer
(docs/m10-implementation-plan.md Phase 4).
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.main import app
from app.models.race_context import PitStop, Stint
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import SESSION_ID, FakeRaceContextRepository, write_session_cache


@pytest.fixture
def race_context_client(tmp_path: Path) -> Iterator[TestClient]:
    write_session_cache(tmp_path)
    fake_repository = FakeRaceContextRepository(
        stints_by_driver={
            (SESSION_ID, "VER"): [
                Stint(
                    stint_number=1,
                    compound="SOFT",
                    start_lap=1,
                    end_lap=17,
                    tyre_life_at_start=4,
                ),
                Stint(
                    stint_number=2,
                    compound="HARD",
                    start_lap=18,
                    end_lap=37,
                    tyre_life_at_start=1,
                ),
            ],
        },
        pit_stops_by_session={
            SESSION_ID: [
                PitStop(
                    driver_id="VER", stop_number=1, lap_number=17, pit_lane_time_seconds=25.088
                ),
                PitStop(driver_id="LEC", stop_number=1, lap_number=20, pit_lane_time_seconds=23.5),
            ],
        },
    )
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    app.dependency_overrides[get_race_context_repository] = lambda: fake_repository
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_stints_returns_data_for_a_driver_with_stints(
    race_context_client: TestClient,
) -> None:
    response = race_context_client.get(f"/sessions/{SESSION_ID}/drivers/VER/stints")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["stint_number"] == 1
    assert body[0]["compound"] == "SOFT"
    assert body[0]["start_lap"] == 1
    assert body[0]["end_lap"] == 17
    assert body[0]["tyre_life_at_start"] == 4
    assert body[1]["compound"] == "HARD"


def test_list_stints_driver_with_no_stints_returns_empty_list_not_404(
    race_context_client: TestClient,
) -> None:
    # LEC exists in this session (per write_session_cache) but the fake has
    # no stint data seeded for them -- absence is data, not failure
    # (ADR-0011, Implementation Constraints).
    response = race_context_client.get(f"/sessions/{SESSION_ID}/drivers/LEC/stints")

    assert response.status_code == 200
    assert response.json() == []


def test_list_stints_session_not_found_returns_404(race_context_client: TestClient) -> None:
    response = race_context_client.get("/sessions/2099_nowhere_race/drivers/VER/stints")

    assert response.status_code == 404


def test_list_pit_stops_without_filter_returns_all_drivers(
    race_context_client: TestClient,
) -> None:
    response = race_context_client.get(f"/sessions/{SESSION_ID}/pit-stops")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert {p["driver_id"] for p in body} == {"VER", "LEC"}


def test_list_pit_stops_with_driver_filter(race_context_client: TestClient) -> None:
    response = race_context_client.get(
        f"/sessions/{SESSION_ID}/pit-stops", params={"driver_id": "VER"}
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["driver_id"] == "VER"
    assert body[0]["lap_number"] == 17
    assert body[0]["pit_lane_time_seconds"] == pytest.approx(25.088)


def test_list_pit_stops_filter_matching_nothing_returns_empty_list_not_404(
    race_context_client: TestClient,
) -> None:
    response = race_context_client.get(
        f"/sessions/{SESSION_ID}/pit-stops", params={"driver_id": "XXX"}
    )

    assert response.status_code == 200
    assert response.json() == []


def test_list_pit_stops_session_not_found_returns_404(race_context_client: TestClient) -> None:
    response = race_context_client.get("/sessions/2099_nowhere_race/pit-stops")

    assert response.status_code == 404


def test_openapi_includes_new_routes_and_compound_field(race_context_client: TestClient) -> None:
    schema = race_context_client.get("/openapi.json").json()

    assert "/sessions/{session_id}/drivers/{driver_id}/stints" in schema["paths"]
    assert "/sessions/{session_id}/pit-stops" in schema["paths"]

    lap_schema = schema["components"]["schemas"]["Lap"]
    assert "compound" in lap_schema["properties"]
