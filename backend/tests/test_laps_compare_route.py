"""Integration tests for GET /laps/compare (M6; generalized to two
independent sessions in M13, docs/m13-design-review.md).

Against real fixture Parquet data via conftest.py's `client` fixture
(ParquetRepository backed by a synthetic on-disk cache), not a mocked
service layer -- this is the full-stack contract test: real repository
reads, real app.services.lap_comparison computation, real response
serialization.

Fixture data (tests/fixtures.py): VER/lap 1 and LEC/lap 1 both have real
telemetry at distance_m=[50, 100] (LEC added specifically for this test
-- see fixtures.py's comment). LEC is slower at both points (time=1.1s/
2.65s vs VER's 1.0s/2.5s), which makes the sign convention checkable end
to end with exact, hand-computable numbers at resolution=3 (grid lands
exactly on [0, 50, 100] -- np.interp clamps to the d=50 value below it,
so distance 0 isn't a true d=0 invariant here; that's covered properly
with synthetic from-zero data in test_lap_comparison_delta.py).

M13 cross-session tests use their own local fixture sessions
(_write_second_session), following the same tmp_path +
app.dependency_overrides pattern _write_non_monotonic_session already
established in this file -- the shared `client` fixture only ever seeds
one session (tests/fixtures.py's "2023_monza_race"), which is enough for
same-session and single-side-error cases but not for genuinely
cross-session ones.
"""

from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_telemetry_repository
from app.main import app
from app.repositories.parquet_repository import ParquetRepository
from tests.fixtures import write_session_cache


def test_compare_laps_returns_the_full_contract_shape(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
            "resolution": 3,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["session_id_a"] == "2023_monza_race"
    assert body["session_id_b"] == "2023_monza_race"
    assert body["lap_a"]["driver_id"] == "VER"
    assert body["lap_b"]["driver_id"] == "LEC"
    assert body["distance_m"] == pytest.approx([0.0, 50.0, 100.0])
    assert body["compared_distance_m"] == pytest.approx(100.0)
    assert set(body["channels"]) == {
        "speed_kph",
        "throttle_pct",
        "brake_active",
        "rpm",
        "gear",
        "drs_active",
    }
    for series in body["channels"].values():
        assert len(series["a"]) == len(series["b"]) == 3
    assert len(body["sectors"]) == 3
    # Same session on both sides -> no DIFFERENT_CIRCUIT warning; both laps
    # are is_accurate=True in the fixture -> no invalid-lap warning either.
    assert body["warnings"] == []


def test_compare_laps_sign_convention_positive_when_a_is_faster(client: TestClient) -> None:
    # VER (a) is faster than LEC (b) at both known distance points in the
    # fixture -> delta_ms must be positive everywhere, per the same
    # convention test_lap_comparison_delta.py verifies at the unit level.
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
            "resolution": 3,
        },
    )

    delta_ms = response.json()["delta_ms"]

    # d=0 clamps to each lap's own d=50 sample (VER 1.0s, LEC 1.1s): 100ms.
    # d=50 (exact sample): VER 1.0s vs LEC 1.1s: 100ms.
    # d=100 (exact sample): VER 2.5s vs LEC 2.65s: 150ms.
    assert delta_ms == pytest.approx([100.0, 100.0, 150.0])
    assert all(value > 0 for value in delta_ms)


def test_compare_laps_sign_flips_when_a_and_b_are_swapped(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "LEC",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "VER",
            "lap_b": 1,
            "resolution": 3,
        },
    )

    delta_ms = response.json()["delta_ms"]

    assert delta_ms == pytest.approx([-100.0, -100.0, -150.0])
    assert all(value < 0 for value in delta_ms)


def test_compare_laps_session_a_not_found_returns_404(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2099_nowhere_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Session A" in detail
    assert "2099_nowhere_race" in detail


def test_compare_laps_session_b_not_found_returns_404(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2099_nowhere_race",
            "driver_b": "LEC",
            "lap_b": 1,
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Session B" in detail
    assert "2099_nowhere_race" in detail


def test_compare_laps_unknown_driver_a_returns_404(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "XXX",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Lap A" in detail
    assert "XXX" in detail


def test_compare_laps_unknown_driver_b_returns_404(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "XXX",
            "lap_b": 1,
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Lap B" in detail
    assert "XXX" in detail


def test_compare_laps_unknown_lap_number_a_returns_404(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 99,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Lap A" in detail
    assert "99" in detail


def test_compare_laps_unknown_lap_number_b_returns_404(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 99,
        },
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Lap B" in detail
    assert "99" in detail


def test_compare_laps_lap_with_no_telemetry_returns_404(client: TestClient) -> None:
    # VER/lap 2 exists in laps.parquet (fixtures.py) but has zero rows in
    # telemetry.parquet -- passes the lap-metadata lookup, fails the
    # telemetry fetch.
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 2,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
        },
    )

    assert response.status_code == 404
    assert "telemetry" in response.json()["detail"].lower()


def test_compare_laps_missing_required_query_params_returns_422(client: TestClient) -> None:
    response = client.get("/laps/compare")

    assert response.status_code == 422


def test_compare_laps_resolution_above_max_returns_422(client: TestClient) -> None:
    """The deferred Phase 1 validation test: resolution above
    MAX_COMPARE_RESOLUTION (2000) must be rejected -- moved here because
    it's a Query() constraint on the route, not testable at the schema
    level without a TestClient (see test_lap_comparison_models.py).
    """
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
            "resolution": 2001,
        },
    )

    assert response.status_code == 422


def test_compare_laps_resolution_below_one_returns_422(client: TestClient) -> None:
    response = client.get(
        "/laps/compare",
        params={
            "session_id_a": "2023_monza_race",
            "driver_a": "VER",
            "lap_a": 1,
            "session_id_b": "2023_monza_race",
            "driver_b": "LEC",
            "lap_b": 1,
            "resolution": 0,
        },
    )

    assert response.status_code == 422


def test_old_single_session_route_no_longer_exists(client: TestClient) -> None:
    """M13 retires GET /sessions/{session_id}/laps/compare outright rather
    than keeping it as a compatibility wrapper (docs/m13-design-review.md
    §4/§10's considered decision -- one internal consumer, no external API
    contract to preserve). FastAPI/Starlette returns a plain 404 for any
    undefined path, the same as it would for a typo'd URL.
    """
    response = client.get(
        "/sessions/2023_monza_race/laps/compare",
        params={"driver_a": "VER", "lap_a": 1, "driver_b": "LEC", "lap_b": 1},
    )

    assert response.status_code == 404


def _write_non_monotonic_session(base_dir: Path) -> None:
    """A separate, minimal session (own season/event, doesn't touch or
    collide with tests/fixtures.py's "2023_monza_race") containing one
    driver/lap whose telemetry spins: distance goes 0 -> 100 -> 60 in
    chronological (time) order, despite being written pre-sorted by
    distance like the real pipeline/repository always produce.
    """
    session_dir = base_dir / "2024" / "testcircuit" / "race"
    session_dir.mkdir(parents=True)

    pd.DataFrame(
        [
            {
                "session_id": "2024_testcircuit_race",
                "season": 2024,
                "event_name": "Test Circuit",
                "round_number": 1,
                "location": "Testville",
                "country": "Testland",
                "session_type": "race",
                "session_date": None,
            }
        ]
    ).to_parquet(session_dir / "session.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": "2024_testcircuit_race",
                "driver_id": "TST",
                "driver_number": 99,
                "full_name": "Test Driver",
                "team_name": "Test Team",
            }
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": "2024_testcircuit_race",
                "driver_id": "TST",
                "lap_number": 1,
                "lap_time_seconds": 90.0,
                "sector_1_seconds": 30.0,
                "sector_2_seconds": 30.0,
                "sector_3_seconds": 30.0,
                "is_personal_best": True,
                "is_accurate": True,
            }
        ]
    ).to_parquet(session_dir / "laps.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": "2024_testcircuit_race",
                "driver_id": "TST",
                "lap_number": 1,
                "distance_m": distance_m,
                "time_seconds": time_seconds,
                "speed_kph": 200.0,
                "throttle_pct": 100.0,
                "brake_active": False,
                "rpm": 10000.0,
                "gear": 6,
                "drs_active": False,
                "x": 0.0,
                "y": 0.0,
                "z": 0.0,
            }
            # Written in distance order, as the real pipeline/repository
            # would return it -- the spin (100 -> 60) is only visible once
            # re-sorted by time_seconds, exactly like
            # test_validate_monotonic_checks_chronological_order_not_input_order.
            for distance_m, time_seconds in [(0.0, 0.0), (60.0, 2.0), (100.0, 1.0)]
        ]
    ).to_parquet(session_dir / "telemetry.parquet", index=False)

    # No track.parquet -- /laps/compare never calls list_track_points(),
    # so it isn't needed for this test's code path.


def test_compare_laps_non_monotonic_distance_returns_422(tmp_path: Path) -> None:
    _write_non_monotonic_session(tmp_path)
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    try:
        local_client = TestClient(app)
        response = local_client.get(
            "/laps/compare",
            params={
                "session_id_a": "2024_testcircuit_race",
                "driver_a": "TST",
                "lap_a": 1,
                "session_id_b": "2024_testcircuit_race",
                "driver_b": "TST",
                "lap_b": 1,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "Lap A" in detail
    assert "non-monotonic" in detail


def _write_second_session(
    base_dir: Path,
    *,
    session_id: str,
    season: int,
    event_slug: str,
    location: str,
    country: str,
    time_offset_seconds: float = 0.0,
    track_status: str | None = None,
    deleted: bool | None = None,
) -> None:
    """A second, well-formed session (own season/event/session_id) for M13
    cross-session comparison tests -- distinct from
    _write_non_monotonic_session's deliberately-broken fixture. One driver
    (VER), one lap, telemetry at the same distance points as
    tests/fixtures.py's VER/lap 1 (50, 100) so cross-session delta math
    stays hand-computable; `time_offset_seconds` shifts every sample's
    time_seconds uniformly, giving a known, constant delta against
    fixtures.py's own VER/lap 1 when compared session-to-session.
    """
    session_dir = base_dir / str(season) / event_slug / "race"
    session_dir.mkdir(parents=True)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "season": season,
                "event_name": event_slug,
                "round_number": 1,
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
                "driver_id": "VER",
                "driver_number": 1,
                "full_name": "Max Verstappen",
                "team_name": "Red Bull Racing",
            }
        ]
    ).to_parquet(session_dir / "drivers.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "driver_id": "VER",
                "lap_number": 1,
                "lap_time_seconds": 95.0 + time_offset_seconds,
                "sector_1_seconds": 30.0,
                "sector_2_seconds": 35.0,
                "sector_3_seconds": 30.0 + time_offset_seconds,
                "is_personal_best": True,
                "is_accurate": True,
                "track_status": track_status,
                "deleted": deleted,
            }
        ]
    ).to_parquet(session_dir / "laps.parquet", index=False)

    pd.DataFrame(
        [
            {
                "session_id": session_id,
                "driver_id": "VER",
                "lap_number": 1,
                "distance_m": distance_m,
                "time_seconds": time_seconds + time_offset_seconds,
                "speed_kph": 250.0,
                "throttle_pct": 100.0,
                "brake_active": False,
                "rpm": 11000.0,
                "gear": 6,
                "drs_active": False,
                "x": 0.0,
                "y": 0.0,
                "z": 0.0,
            }
            for distance_m, time_seconds in [(50.0, 1.0), (100.0, 2.5)]
        ]
    ).to_parquet(session_dir / "telemetry.parquet", index=False)

    # No track.parquet -- same reasoning as _write_non_monotonic_session.


def test_compare_laps_different_session_same_circuit_succeeds(tmp_path: Path) -> None:
    """Session A (tests/fixtures.py's "2023_monza_race", location "Monza")
    vs. a second, different session_id also at "Monza" -- the core M13
    workflow: same circuit, different session (e.g. a different year).
    """

    write_session_cache(tmp_path)
    _write_second_session(
        tmp_path,
        session_id="2024_monza_race",
        season=2024,
        event_slug="monza",
        location="Monza",
        country="Italy",
        time_offset_seconds=0.5,
    )
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    try:
        local_client = TestClient(app)
        response = local_client.get(
            "/laps/compare",
            params={
                "session_id_a": "2023_monza_race",
                "driver_a": "VER",
                "lap_a": 1,
                "session_id_b": "2024_monza_race",
                "driver_b": "VER",
                "lap_b": 1,
                "resolution": 2,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["session_id_a"] == "2023_monza_race"
    assert body["session_id_b"] == "2024_monza_race"
    # Same circuit -> no DIFFERENT_CIRCUIT warning.
    assert all(w["code"] != "different_circuit" for w in body["warnings"])
    # 2024_monza_race's VER lap is uniformly 0.5s slower -> B took longer
    # -> positive delta (A faster) everywhere, per the existing sign
    # convention (delta_ms = (b.time - a.time) * 1000).
    assert all(value > 0 for value in body["delta_ms"])


def test_compare_laps_different_circuit_emits_warning_and_allows_comparison(
    tmp_path: Path,
) -> None:
    """Session A at "Monza" vs. session B at a different location ("Spa")
    -- comparison still succeeds (docs/m13-design-review.md §9: warn, not
    reject), and the response carries a DIFFERENT_CIRCUIT warning the
    frontend uses to hide TrackMapDelta.
    """

    write_session_cache(tmp_path)
    _write_second_session(
        tmp_path,
        session_id="2024_spa_race",
        season=2024,
        event_slug="spa",
        location="Spa",
        country="Belgium",
    )
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    try:
        local_client = TestClient(app)
        response = local_client.get(
            "/laps/compare",
            params={
                "session_id_a": "2023_monza_race",
                "driver_a": "VER",
                "lap_a": 1,
                "session_id_b": "2024_spa_race",
                "driver_b": "VER",
                "lap_b": 1,
                "resolution": 2,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    warning_codes = [w["code"] for w in body["warnings"]]
    assert "different_circuit" in warning_codes
    # Comparison output is still fully populated, not blocked.
    assert len(body["delta_ms"]) == 2
    assert len(body["sectors"]) > 0


def test_compare_laps_yellow_flag_lap_emits_warning_end_to_end(tmp_path: Path) -> None:
    """M43 (docs/m43-design-review.md): a lap whose `track_status` marks it
    yellow-flag-affected surfaces `YELLOW_FLAG_LAP_B` all the way through
    the real endpoint -- proving the new WarningCode values serialize
    correctly, not just that `collect_warnings()` returns them in
    isolation (already covered by test_lap_comparison_validation.py).
    """

    write_session_cache(tmp_path)
    _write_second_session(
        tmp_path,
        session_id="2024_monza_race",
        season=2024,
        event_slug="monza",
        location="Monza",
        country="Italy",
        track_status="2",
    )
    app.dependency_overrides[get_telemetry_repository] = lambda: ParquetRepository(tmp_path)
    try:
        local_client = TestClient(app)
        response = local_client.get(
            "/laps/compare",
            params={
                "session_id_a": "2023_monza_race",
                "driver_a": "VER",
                "lap_a": 1,
                "session_id_b": "2024_monza_race",
                "driver_b": "VER",
                "lap_b": 1,
                "resolution": 2,
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    warning_codes = [w["code"] for w in body["warnings"]]
    assert warning_codes == ["yellow_flag_lap_b"]
