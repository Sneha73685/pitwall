"""API tests for /sessions/{session_id}/track. See conftest.py for the `client` fixture."""

from fastapi.testclient import TestClient


def test_list_track_points_returns_points_sorted_by_distance(client: TestClient) -> None:
    response = client.get("/sessions/2023_monza_race/track")

    assert response.status_code == 200
    body = response.json()
    assert [point["distance_m"] for point in body] == [50.0, 100.0]


def test_list_track_points_session_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/sessions/2099_nowhere_race/track")

    assert response.status_code == 404
