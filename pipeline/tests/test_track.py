from pitwall_pipeline.models import TelemetrySample
from pitwall_pipeline.track import derive_track_points


def _sample(distance_m: float, x: float, y: float) -> TelemetrySample:
    return TelemetrySample(
        session_id="2023_monza_race",
        driver_id="VER",
        lap_number=5,
        distance_m=distance_m,
        time_seconds=distance_m / 50.0,
        speed_kph=300.0,
        throttle_pct=100.0,
        brake_active=False,
        rpm=11000.0,
        gear=7,
        drs_active=True,
        x=x,
        y=y,
        z=0.0,
    )


def test_derive_track_points_projects_distance_and_xy() -> None:
    telemetry = [_sample(0.0, 10.0, 20.0), _sample(100.0, 15.0, 25.0)]

    points = derive_track_points(telemetry, session_id="2023_monza_race")

    assert [p.distance_m for p in points] == [0.0, 100.0]
    assert [(p.x, p.y) for p in points] == [(10.0, 20.0), (15.0, 25.0)]
    assert all(p.session_id == "2023_monza_race" for p in points)


def test_derive_track_points_empty_input_returns_empty_list() -> None:
    assert derive_track_points([], session_id="2023_monza_race") == []
