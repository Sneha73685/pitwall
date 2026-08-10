"""Integration tests for GET /sessions/{session_id}/drivers/{driver_id}/stint-pace
and GET /sessions/{session_id}/tyre-performance (M11, Phase 2).

Overrides `get_telemetry_repository` with the real `ParquetRepository`
against a dedicated synthetic cache (`write_stint_pace_session_cache`,
richer than `tests/fixtures.py`'s shared "2023_monza_race" fixture -- see
that function's docstring for why) and overrides `get_race_context_repository`
with a fake in-memory `RaceContextRepository` -- no real Postgres needed at
this layer, the same pattern `test_race_context_route.py` already
established.
"""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.main import app
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import SESSION_ID as MONZA_SESSION_ID
from tests.fixtures import FakeRaceContextRepository, write_session_cache
from tests.tyre_performance_fixtures import (
    STINT_PACE_SESSION_ID,
    stint_pace_race_context_repository,
    write_stint_pace_session_cache,
)

FORBIDDEN_FIELD_SUBSTRINGS = (
    "degradation",
    "slope",
    "coefficient",
    "regression",
    "fitted_value",
    "pace_score",
    "performance_score",
    "rank",
    "faster_than",
    "best_compound",
    "normalized_pace",
    "fuel_corrected_pace",
    "traffic_adjusted_pace",
    "safety_car_adjusted_pace",
)


def _collect_keys(node: Any) -> set[str]:
    """Recursively collect every dict key appearing anywhere in `node`."""
    keys: set[str] = set()
    if isinstance(node, dict):
        for key, value in node.items():
            keys.add(str(key))
            keys |= _collect_keys(value)
    elif isinstance(node, list):
        for item in node:
            keys |= _collect_keys(item)
    return keys


@pytest.fixture
def tyre_performance_client(tmp_path: Path) -> Iterator[TestClient]:
    write_stint_pace_session_cache(tmp_path)
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    app.dependency_overrides[get_race_context_repository] = stint_pace_race_context_repository
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def empty_strategy_client(tmp_path: Path) -> Iterator[TestClient]:
    """A session that exists (Parquet) but has no stint/pit-stop data at
    all -- ADR-0011's "absence is data, not failure," reused from M10."""
    write_session_cache(tmp_path)
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    app.dependency_overrides[get_race_context_repository] = FakeRaceContextRepository
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- A. stint-pace ----------------------------------------------------------


def test_stint_pace_returns_200_for_a_valid_driver_with_multi_stint_data(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/VER/stint-pace"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == STINT_PACE_SESSION_ID
    assert body["driver_id"] == "VER"
    assert len(body["laps"]) == 10
    assert len(body["stints"]) == 3


def test_stint_pace_raw_lap_carries_stint_context(tyre_performance_client: TestClient) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/VER/stint-pace"
    )
    laps_by_number = {lap["lap_number"]: lap for lap in response.json()["laps"]}

    lap_1 = laps_by_number[1]
    assert lap_1["compound"] == "SOFT"
    assert lap_1["stint_number"] == 1
    assert lap_1["lap_in_stint_index"] == 1
    assert lap_1["is_valid"] is True
    assert lap_1["is_in_lap"] is False
    assert lap_1["is_out_lap"] is False
    assert lap_1["is_trend_eligible"] is True


def test_stint_pace_flags_an_in_lap(tyre_performance_client: TestClient) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/VER/stint-pace"
    )
    laps_by_number = {lap["lap_number"]: lap for lap in response.json()["laps"]}

    lap_4 = laps_by_number[4]  # VER's first pit-in lap
    assert lap_4["is_in_lap"] is True
    assert lap_4["is_trend_eligible"] is False


def test_stint_pace_flags_an_out_lap(tyre_performance_client: TestClient) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/VER/stint-pace"
    )
    laps_by_number = {lap["lap_number"]: lap for lap in response.json()["laps"]}

    lap_5 = laps_by_number[5]  # stint 2's start_lap, not VER's first stint
    assert lap_5["is_out_lap"] is True
    assert lap_5["is_trend_eligible"] is False


def test_stint_pace_excluded_observations_are_not_dropped_from_the_response(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/VER/stint-pace"
    )
    lap_numbers = {lap["lap_number"] for lap in response.json()["laps"]}

    # Every raw lap (1-10), including the boundary laps (4, 5, 7, 8), must
    # still be present -- boundary/eligibility exclusion only affects
    # trend/consistency computation, never the raw per-lap listing.
    assert lap_numbers == set(range(1, 11))


def test_stint_pace_consistency_present_when_two_or_more_eligible_laps(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/VER/stint-pace"
    )
    stints_by_number = {stint["stint_number"]: stint for stint in response.json()["stints"]}

    stint_1 = stints_by_number[1]  # laps 1-4, minus in-lap 4 -> 3 eligible
    assert stint_1["eligible_lap_count"] == 3
    assert stint_1["consistency_ms"] is not None
    assert stint_1["consistency_cv"] is not None

    stint_3 = stints_by_number[3]  # laps 8-10, minus out-lap 8 -> 2 eligible
    assert stint_3["eligible_lap_count"] == 2
    assert stint_3["consistency_ms"] is not None


def test_stint_pace_consistency_absent_for_exactly_one_eligible_lap(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/VER/stint-pace"
    )
    stints_by_number = {stint["stint_number"]: stint for stint in response.json()["stints"]}

    stint_2 = stints_by_number[2]  # laps 5-7: 5 out-lap, 7 in-lap -> only lap 6
    assert stint_2["eligible_lap_count"] == 1
    assert stint_2["consistency_ms"] is None
    assert stint_2["consistency_cv"] is None


def test_stint_pace_returns_200_with_empty_lists_for_a_driver_with_no_strategy_data(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(
        f"/sessions/{STINT_PACE_SESSION_ID}/drivers/XXX/stint-pace"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["laps"] == []
    assert body["stints"] == []


def test_stint_pace_nonexistent_session_returns_404(tyre_performance_client: TestClient) -> None:
    response = tyre_performance_client.get("/sessions/2099_nowhere_race/drivers/VER/stint-pace")

    assert response.status_code == 404


# --- B. tyre-performance -----------------------------------------------------


def test_tyre_performance_returns_200_for_a_valid_session(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(f"/sessions/{STINT_PACE_SESSION_ID}/tyre-performance")

    assert response.status_code == 200
    assert response.json()["session_id"] == STINT_PACE_SESSION_ID


def test_tyre_performance_includes_per_driver_strategy_summaries(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(f"/sessions/{STINT_PACE_SESSION_ID}/tyre-performance")
    strategies_by_driver = {
        strategy["driver_id"]: strategy for strategy in response.json()["driver_strategies"]
    }

    ver = strategies_by_driver["VER"]
    assert ver["stint_count"] == 3
    assert ver["compound_sequence"] == ["SOFT", "HARD", "SOFT"]
    assert ver["stint_lengths"] == [4, 3, 3]

    ham = strategies_by_driver["HAM"]
    assert ham["stint_count"] == 2
    assert ham["compound_sequence"] == ["MEDIUM", "HARD"]


def test_tyre_performance_covers_multiple_compounds(tyre_performance_client: TestClient) -> None:
    response = tyre_performance_client.get(f"/sessions/{STINT_PACE_SESSION_ID}/tyre-performance")
    body = response.json()

    compound_usage = {c["compound"] for c in body["compound_usage"]}
    compound_aggregates = {c["compound"] for c in body["compound_aggregates"]}
    assert compound_usage == {"SOFT", "HARD", "MEDIUM"}
    assert compound_aggregates == {"SOFT", "HARD", "MEDIUM"}


def test_tyre_performance_compound_aggregate_pools_across_both_drivers(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(f"/sessions/{STINT_PACE_SESSION_ID}/tyre-performance")
    by_compound = {c["compound"]: c for c in response.json()["compound_aggregates"]}

    hard = by_compound["HARD"]
    assert hard["driver_count"] == 2  # both VER and HAM ran HARD
    # VER's eligible HARD laps (just lap 6) + HAM's eligible HARD laps (7-10).
    assert hard["lap_count"] == 1 + 4


def test_tyre_performance_raw_comparison_covers_multiple_drivers_per_compound(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(f"/sessions/{STINT_PACE_SESSION_ID}/tyre-performance")
    raw = response.json()["raw_lap_times_by_compound"]

    pairs = {(r["driver_id"], r["compound"]) for r in raw}
    assert pairs == {("VER", "SOFT"), ("VER", "HARD"), ("HAM", "MEDIUM"), ("HAM", "HARD")}


def test_tyre_performance_response_has_no_ranking_or_degradation_semantics(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get(f"/sessions/{STINT_PACE_SESSION_ID}/tyre-performance")
    keys = _collect_keys(response.json())

    for forbidden in FORBIDDEN_FIELD_SUBSTRINGS:
        matching = {key for key in keys if forbidden in key.lower()}
        assert not matching, f"forbidden field(s) {matching} found in tyre-performance response"


def test_tyre_performance_returns_200_with_empty_data_for_a_session_with_no_strategy_data(
    empty_strategy_client: TestClient,
) -> None:
    response = empty_strategy_client.get(f"/sessions/{MONZA_SESSION_ID}/tyre-performance")

    assert response.status_code == 200
    body = response.json()
    assert body["compound_usage"] == []
    assert body["compound_aggregates"] == []
    assert body["raw_lap_times_by_compound"] == []


def test_tyre_performance_nonexistent_session_returns_404(
    tyre_performance_client: TestClient,
) -> None:
    response = tyre_performance_client.get("/sessions/2099_nowhere_race/tyre-performance")

    assert response.status_code == 404


# --- OpenAPI ------------------------------------------------------------


def test_openapi_includes_the_two_new_tyre_performance_paths(
    tyre_performance_client: TestClient,
) -> None:
    schema = tyre_performance_client.get("/openapi.json").json()

    assert "/sessions/{session_id}/drivers/{driver_id}/stint-pace" in schema["paths"]
    assert "/sessions/{session_id}/tyre-performance" in schema["paths"]


def test_openapi_response_models_expose_the_expected_descriptive_fields(
    tyre_performance_client: TestClient,
) -> None:
    schema = tyre_performance_client.get("/openapi.json").json()
    components = schema["components"]["schemas"]

    stint_pace_lap = components["StintPaceLap"]["properties"]
    for field in ("lap_number", "compound", "stint_number", "lap_in_stint_index"):
        assert field in stint_pace_lap

    stint_pace = components["StintPace"]["properties"]
    for field in ("stint_number", "compound", "consistency_ms", "consistency_cv"):
        assert field in stint_pace

    compound_aggregate = components["CompoundAggregate"]["properties"]
    for field in ("compound", "lap_times_ms", "median_lap_time_ms"):
        assert field in compound_aggregate


def test_openapi_schema_has_no_forbidden_modeling_or_ranking_fields(
    tyre_performance_client: TestClient,
) -> None:
    """The safety boundary from docs/m11-design-review.md §8 is part of
    the API contract itself -- this scans the whole OpenAPI schema, not
    just one response body, so a forbidden field added to any model (even
    one never exercised by another test) is still caught."""
    schema = tyre_performance_client.get("/openapi.json").json()
    keys = _collect_keys(schema["components"]["schemas"])

    for forbidden in FORBIDDEN_FIELD_SUBSTRINGS:
        matching = {key for key in keys if forbidden in key.lower()}
        assert not matching, f"forbidden field(s) {matching} found in the OpenAPI schema"
