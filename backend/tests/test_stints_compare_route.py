"""Integration tests for GET /stints/compare (M15,
docs/m15-design-review.md).

Reuses tests/tyre_performance_fixtures.py's rich synthetic session
(STINT_PACE_SESSION_ID: VER with 3 stints/2 pit stops, HAM with 2
stints/1 pit stop) for one side, and writes a second, genuinely
independent session (own location/season/event) for the other -- the
same "reuse the shared fixture for one side, build a dedicated second
session for genuinely cross-session cases" pattern
test_laps_compare_route.py already established for M13.

Against real fixture Parquet data (ParquetRepository) plus an in-memory
FakeRaceContextRepository (no real Postgres needed at this layer, matching
test_tyre_performance_route.py's own precedent) -- this is a full-stack
contract test: real repository reads, real
app.services.tyre_performance.orchestration computation, real response
serialization.
"""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_race_context_repository, get_telemetry_repository
from app.main import app
from app.models.race_context import PitStop, Stint
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import FakeRaceContextRepository
from tests.tyre_performance_fixtures import (
    STINT_PACE_SESSION_ID,
    stint,
    stint_pace_race_context_repository,
    write_stint_pace_session_cache,
)

SECOND_SESSION_SAME_CIRCUIT_ID = "2024_second_test_grand_prix_race"
SECOND_SESSION_DIFFERENT_CIRCUIT_ID = "2024_different_circuit_race"


def _write_second_session(
    base_dir: Path,
    *,
    session_id: str,
    event_slug: str,
    location: str,
    country: str,
) -> None:
    """A second, independent session (own season/event/session_id), at
    either the same location as STINT_PACE_SESSION_ID ("Testville") or a
    different one, depending on the caller. One driver, "LEC", with a
    single one-stint, zero-pit-stop strategy -- a real no-stop-strategy
    shape, deliberately different from VER/HAM's multi-stint fixture so
    "no pit stops" (normal, not a warning) and "different stint count"
    (VER: 3, LEC: 1) are both exercised for free by comparing against it.
    """
    session_dir = base_dir / "2024" / event_slug / "race"
    session_dir.mkdir(parents=True)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "season": 2024,
                "event_name": event_slug,
                "round_number": 2,
                "location": location,
                "country": country,
                "session_type": "race",
                "session_date": None,
            }
        ]
    ).to_parquet(session_dir / "session.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "driver_id": "LEC",
                "driver_number": 16,
                "full_name": "Test Driver LEC",
                "team_name": "Test Team C",
            }
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "driver_id": "LEC",
                "lap_number": n,
                "lap_time_seconds": 92.0 + n * 0.1,
                "sector_1_seconds": None,
                "sector_2_seconds": None,
                "sector_3_seconds": None,
                "is_personal_best": False,
                "is_accurate": True,
                "compound": "MEDIUM",
            }
            for n in range(1, 6)
        ]
    ).to_parquet(session_dir / "laps.parquet", index=False)


def _combined_race_context_repository() -> FakeRaceContextRepository:
    """One fake repository instance carrying stint/pit-stop data for both
    STINT_PACE_SESSION_ID (VER/HAM, from tyre_performance_fixtures.py) and
    both locally-written second sessions (LEC, one stint, no pit stops) --
    a single `get_race_context_repository` override serves every session a
    given test's ParquetRepository also knows about, mirroring
    test_tyre_performance_route.py's `tyre_performance_client` pattern.
    """
    # Built via the public list_stints/list_pit_stops interface (no driver
    # filter -> every driver), not by reaching into the base repository's
    # internals, matching RaceContextRepository's own public contract.
    base = stint_pace_race_context_repository()
    combined_stints: dict[tuple[str, str], list[Stint]] = {}
    for driver_id in ("VER", "HAM"):
        combined_stints[(STINT_PACE_SESSION_ID, driver_id)] = base.list_stints(
            STINT_PACE_SESSION_ID, driver_id=driver_id
        )
    combined_pit_stops: dict[str, list[PitStop]] = {
        STINT_PACE_SESSION_ID: base.list_pit_stops(STINT_PACE_SESSION_ID),
    }

    for session_id in (SECOND_SESSION_SAME_CIRCUIT_ID, SECOND_SESSION_DIFFERENT_CIRCUIT_ID):
        combined_stints[(session_id, "LEC")] = [
            stint(
                driver_id="LEC",
                stint_number=1,
                compound="MEDIUM",
                start_lap=1,
                end_lap=5,
                tyre_life_at_start=1,
            ),
        ]
        combined_pit_stops[session_id] = []

    return FakeRaceContextRepository(
        stints_by_driver=combined_stints,
        pit_stops_by_session=combined_pit_stops,
    )


@pytest.fixture
def stint_compare_client(tmp_path: Path) -> Iterator[TestClient]:
    write_stint_pace_session_cache(tmp_path)
    _write_second_session(
        tmp_path,
        session_id=SECOND_SESSION_SAME_CIRCUIT_ID,
        event_slug="second_test_grand_prix",
        location="Testville",  # same circuit as STINT_PACE_SESSION_ID
        country="Testland",
    )
    _write_second_session(
        tmp_path,
        session_id=SECOND_SESSION_DIFFERENT_CIRCUIT_ID,
        event_slug="different_circuit",
        location="Monza",  # different circuit
        country="Italy",
    )
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    app.dependency_overrides[get_race_context_repository] = _combined_race_context_repository
    yield TestClient(app)
    app.dependency_overrides.clear()


# --- Normal successful comparison -------------------------------------------


def test_compare_stints_returns_the_full_contract_shape(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": SECOND_SESSION_SAME_CIRCUIT_ID,
            "driver_b": "LEC",
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["a"]["session_id"] == STINT_PACE_SESSION_ID
    assert body["a"]["driver_id"] == "VER"
    assert body["b"]["session_id"] == SECOND_SESSION_SAME_CIRCUIT_ID
    assert body["b"]["driver_id"] == "LEC"
    # Each side carries its own independent strategy/stints/pit_stops --
    # no merged or aligned shape.
    assert body["a"]["strategy"]["compound_sequence"] == ["SOFT", "HARD", "SOFT"]
    assert body["b"]["strategy"]["compound_sequence"] == ["MEDIUM"]
    assert len(body["a"]["pit_stops"]) == 2
    assert len(body["b"]["pit_stops"]) == 0
    # Same circuit ("Testville" both sides), both sides have stint data ->
    # no warnings at all.
    assert body["warnings"] == []


def test_compare_stints_stint_pace_fields_are_present_and_reused_unchanged(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "HAM",
        },
    )
    body = response.json()

    ver_stint_1 = next(s for s in body["a"]["stints"] if s["stint_number"] == 1)
    assert ver_stint_1["compound"] == "SOFT"
    assert ver_stint_1["start_lap"] == 1
    assert ver_stint_1["end_lap"] == 4
    assert ver_stint_1["eligible_lap_count"] == 3
    assert ver_stint_1["consistency_ms"] is not None


def test_compare_stints_response_never_includes_per_lap_data(
    stint_compare_client: TestClient,
) -> None:
    """Decision A (approved, docs/m15-design-review.md §4/§5): the response
    stays summary-level -- no StintPaceLap-shaped `laps` key anywhere."""
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "HAM",
        },
    )
    body = response.json()

    assert "laps" not in body["a"]
    assert "laps" not in body["b"]


def test_compare_stints_response_never_includes_computed_deltas(
    stint_compare_client: TestClient,
) -> None:
    """Decision B (approved): no computed strategy verdicts/deltas -- only
    'a'/'b'/'warnings' at the top level, and no delta-shaped field name
    anywhere in either side."""
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "HAM",
        },
    )
    body = response.json()

    assert set(body.keys()) == {"a", "b", "warnings"}
    forbidden_substrings = ("delta", "verdict", "better", "faster_than", "rank")
    for side_key in ("a", "b"):
        for field_name in body[side_key]:
            for forbidden in forbidden_substrings:
                assert forbidden not in field_name.lower()


# --- Different stint counts / no pit stops (both from the fixture data) -----


def test_compare_stints_handles_different_stint_counts_with_no_special_handling(
    stint_compare_client: TestClient,
) -> None:
    """VER has 3 stints, HAM has 2 -- no alignment concept applies (design
    §8); both full lists are simply returned independently."""
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "HAM",
        },
    )
    body = response.json()

    assert len(body["a"]["stints"]) == 3
    assert len(body["b"]["stints"]) == 2
    assert response.status_code == 200


def test_compare_stints_no_pit_stops_is_not_a_warning(
    stint_compare_client: TestClient,
) -> None:
    """LEC's fixture strategy has zero pit stops (a real no-stop-strategy
    shape) -- normal, not disclosed as a warning (design §9: distinct from
    "no stint data")."""
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": SECOND_SESSION_SAME_CIRCUIT_ID,
            "driver_b": "LEC",
        },
    )
    body = response.json()

    assert body["b"]["pit_stops"] == []
    assert body["b"]["stints"] != []
    assert all(w["code"] != "no_stint_data_b" for w in body["warnings"])


# --- Warnings: DIFFERENT_CIRCUIT --------------------------------------------


def test_compare_stints_different_circuit_emits_warning_and_still_computes(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,  # Testville
            "driver_a": "VER",
            "session_id_b": SECOND_SESSION_DIFFERENT_CIRCUIT_ID,  # Monza
            "driver_b": "LEC",
        },
    )

    assert response.status_code == 200
    body = response.json()
    warning_codes = [w["code"] for w in body["warnings"]]
    assert "different_circuit" in warning_codes
    # Disclose, don't block -- both sides are still fully populated.
    assert len(body["a"]["stints"]) == 3
    assert len(body["b"]["stints"]) == 1


def test_compare_stints_same_circuit_different_session_emits_no_circuit_warning(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,  # Testville
            "driver_a": "VER",
            "session_id_b": SECOND_SESSION_SAME_CIRCUIT_ID,  # Testville too
            "driver_b": "LEC",
        },
    )
    body = response.json()

    assert all(w["code"] != "different_circuit" for w in body["warnings"])


# --- Warnings: NO_STINT_DATA_{A,B} -------------------------------------------


def test_compare_stints_unknown_driver_b_returns_200_with_no_stint_data_warning(
    stint_compare_client: TestClient,
) -> None:
    """An unknown/typo'd driver_id is indistinguishable from a valid driver
    with genuinely no stint data (design §9) -- not a 404."""
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "XXX",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["b"]["stints"] == []
    assert body["b"]["strategy"]["stint_count"] == 0
    assert body["b"]["pit_stops"] == []
    warning_codes = [w["code"] for w in body["warnings"]]
    assert "no_stint_data_b" in warning_codes
    assert "no_stint_data_a" not in warning_codes


def test_compare_stints_driver_with_no_stint_data_on_side_a(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "YYY",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "VER",
        },
    )

    assert response.status_code == 200
    body = response.json()
    warning_codes = [w["code"] for w in body["warnings"]]
    assert "no_stint_data_a" in warning_codes
    assert "no_stint_data_b" not in warning_codes


def test_compare_stints_both_sides_missing_stint_data_emits_both_warnings(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "XXX",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "YYY",
        },
    )

    assert response.status_code == 200
    warning_codes = [w["code"] for w in response.json()["warnings"]]
    assert set(warning_codes) == {"no_stint_data_a", "no_stint_data_b"}


# --- Session not found -------------------------------------------------------


def test_compare_stints_session_a_not_found_returns_404(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": "2099_nowhere_race",
            "driver_a": "VER",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "HAM",
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Session A" in detail
    assert "2099_nowhere_race" in detail


def test_compare_stints_session_b_not_found_returns_404(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": "2099_nowhere_race",
            "driver_b": "HAM",
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Session B" in detail
    assert "2099_nowhere_race" in detail


def test_compare_stints_missing_required_query_params_returns_422(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get("/stints/compare")

    assert response.status_code == 422


# --- Degenerate but valid: identical session and driver on both sides ------


def test_compare_stints_identical_session_and_driver_on_both_sides_is_not_rejected(
    stint_compare_client: TestClient,
) -> None:
    response = stint_compare_client.get(
        "/stints/compare",
        params={
            "session_id_a": STINT_PACE_SESSION_ID,
            "driver_a": "VER",
            "session_id_b": STINT_PACE_SESSION_ID,
            "driver_b": "VER",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["a"] == body["b"]
    assert body["warnings"] == []


# --- OpenAPI schema -----------------------------------------------------


def test_openapi_includes_the_stints_compare_path(stint_compare_client: TestClient) -> None:
    schema = stint_compare_client.get("/openapi.json").json()

    assert "/stints/compare" in schema["paths"]


def test_openapi_stint_comparison_schema_has_no_per_lap_or_delta_fields(
    stint_compare_client: TestClient,
) -> None:
    schema = stint_compare_client.get("/openapi.json").json()
    side_schema = schema["components"]["schemas"]["DriverStintComparisonSide"]["properties"]

    assert set(side_schema.keys()) == {"session_id", "driver_id", "strategy", "stints", "pit_stops"}
