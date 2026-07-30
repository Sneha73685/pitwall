"""API tests for /sessions/{session_id}/telemetry. See conftest.py for the `client` fixture."""

from fastapi.testclient import TestClient


def test_get_telemetry_returns_samples_sorted_by_distance(client: TestClient) -> None:
    response = client.get(
        "/sessions/2023_monza_race/telemetry",
        params={"driver_id": "VER", "lap_number": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert [sample["distance_m"] for sample in body] == [50.0, 100.0]


def test_get_telemetry_unknown_lap_returns_404(client: TestClient) -> None:
    response = client.get(
        "/sessions/2023_monza_race/telemetry",
        params={"driver_id": "VER", "lap_number": 99},
    )

    assert response.status_code == 404


def test_get_telemetry_missing_query_params_returns_422(client: TestClient) -> None:
    response = client.get("/sessions/2023_monza_race/telemetry")

    assert response.status_code == 422
