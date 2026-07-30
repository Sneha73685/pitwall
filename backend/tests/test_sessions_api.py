"""API tests for /sessions endpoints. See conftest.py for the `client` fixture."""

from fastapi.testclient import TestClient


def test_list_sessions_returns_ingested_session(client: TestClient) -> None:
    response = client.get("/sessions")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["session_id"] == "2023_monza_race"


def test_get_session_returns_session_detail(client: TestClient) -> None:
    response = client.get("/sessions/2023_monza_race")

    assert response.status_code == 200
    assert response.json()["event_name"] == "Italian Grand Prix"


def test_get_session_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/sessions/2099_nowhere_race")

    assert response.status_code == 404


def test_list_drivers_returns_both_drivers(client: TestClient) -> None:
    response = client.get("/sessions/2023_monza_race/drivers")

    assert response.status_code == 200
    assert {d["driver_id"] for d in response.json()} == {"VER", "LEC"}


def test_list_drivers_session_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/sessions/2099_nowhere_race/drivers")

    assert response.status_code == 404


def test_list_laps_filters_by_driver_id(client: TestClient) -> None:
    response = client.get("/sessions/2023_monza_race/laps", params={"driver_id": "LEC"})

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["driver_id"] == "LEC"


def test_list_laps_without_filter_returns_all_drivers(client: TestClient) -> None:
    response = client.get("/sessions/2023_monza_race/laps")

    assert response.status_code == 200
    assert len(response.json()) == 3


def test_list_laps_session_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/sessions/2099_nowhere_race/laps")

    assert response.status_code == 404
