"""Tests for app.utils.ids -- including a cross-workspace parity check
against pitwall_pipeline's independently-defined equivalent (M12 Phase 4).
Per ADR-0009 the two must never import each other, but must still agree on
the same event_id for the same (season, event_name) -- this test is the
guard against silent drift between the two copies.
"""

from app.utils.ids import make_event_id, slugify


def test_slugify_lowercases_and_collapses_separators() -> None:
    assert slugify("Bahrain Grand Prix") == "bahrain_grand_prix"


def test_slugify_strips_leading_and_trailing_separators() -> None:
    assert slugify("  Sao Paulo Grand Prix!! ") == "sao_paulo_grand_prix"


def test_make_event_id_combines_season_and_slug() -> None:
    assert make_event_id(2024, "Bahrain Grand Prix") == "2024_bahrain_grand_prix"


def test_make_event_id_is_deterministic() -> None:
    assert make_event_id(2024, "Bahrain Grand Prix") == make_event_id(2024, "Bahrain Grand Prix")


def test_make_event_id_differs_by_season() -> None:
    assert make_event_id(2023, "Bahrain Grand Prix") != make_event_id(2024, "Bahrain Grand Prix")


def test_make_event_id_matches_pipeline_values() -> None:
    """Parity check: these exact values are asserted independently in
    pipeline/tests/test_normalize_event.py against
    pitwall_pipeline.models.make_event_id. Neither workspace imports the
    other (ADR-0009) -- this pins the backend's copy to the same real
    values so a change to one side that silently diverges from the other
    is caught here, not discovered later as a session a client can't match
    to the event it actually belongs to.
    """
    assert make_event_id(2024, "Bahrain Grand Prix") == "2024_bahrain_grand_prix"
    assert make_event_id(2023, "Bahrain Grand Prix") == "2023_bahrain_grand_prix"
    assert make_event_id(2024, "Chinese Grand Prix") == "2024_chinese_grand_prix"
    assert make_event_id(2024, "Pre-Season Track Session") == "2024_pre_season_track_session"
