"""Tests for app/services/session_analytics/filtering.py."""

from app.services.session_analytics.filtering import (
    classify_lap,
    filter_for_aggregate_stats,
    filter_valid_laps,
)
from tests.lap_comparison_fixtures import lap


def test_classify_lap_uses_is_accurate_for_validity() -> None:
    assert classify_lap(lap(is_accurate=True)).is_valid is True
    assert classify_lap(lap(is_accurate=False)).is_valid is False


def test_classify_lap_exclusion_reason_is_none_without_track_status_data() -> None:
    """`track_status` defaults to `None` (any session ingested before M36,
    docs/m36-design-review.md §7) -- exclusion_reason must never be
    fabricated, regardless of the lap's own accuracy.
    """
    assert classify_lap(lap(is_accurate=True)).exclusion_reason is None
    assert classify_lap(lap(is_accurate=False)).exclusion_reason is None


def test_filter_valid_laps_keeps_only_accurate_laps() -> None:
    laps = [
        lap(lap_number=1, is_accurate=True),
        lap(lap_number=2, is_accurate=False),
        lap(lap_number=3, is_accurate=True),
    ]

    valid = filter_valid_laps(laps)

    assert [lap_.lap_number for lap_ in valid] == [1, 3]


def test_filter_valid_laps_does_not_mutate_or_drop_from_the_caller_s_list() -> None:
    """Filtering must never silently shrink the caller's own list -- only
    the returned subset changes; the input list itself is untouched, and
    an excluded lap is still addressable by the caller (aggregation.py
    relies on this to keep every lap in its per-driver lap list, valid or
    not -- see test_session_analytics_aggregation.py).
    """
    laps = [lap(lap_number=1, is_accurate=True), lap(lap_number=2, is_accurate=False)]
    original_length = len(laps)

    filter_valid_laps(laps)

    assert len(laps) == original_length


def test_filter_for_aggregate_stats_matches_filter_valid_laps_without_track_status_data() -> None:
    """Without any track-status data (any session ingested before M36),
    the two filters must produce identical results -- yellow-flag
    exclusion has nothing to exclude.
    """
    laps = [
        lap(lap_number=1, is_accurate=True),
        lap(lap_number=2, is_accurate=False),
        lap(lap_number=3, is_accurate=True),
    ]

    assert filter_for_aggregate_stats(laps) == filter_valid_laps(laps)


def test_filter_functions_return_empty_list_for_no_laps() -> None:
    assert filter_valid_laps([]) == []
    assert filter_for_aggregate_stats([]) == []


# --- M36: yellow-flag/track-status exclusion (docs/m36-design-review.md) ---


def test_classify_lap_flags_excluded_track_status_codes() -> None:
    """'2' yellow, '4' Safety Car, '5' red flag, '6'/'7' VSC -- all map to
    the existing "yellow_flag" exclusion reason (§2's conservative,
    per-code reasoning). Includes a combined-code case ("241": a lap that
    saw yellow, then Safety Car, then clear) -- TrackStatus is a
    concatenated string, not a single code, per FastF1's own
    `_add_track_status_to_laps` algorithm (§2).
    """
    for code in ("2", "4", "5", "6", "7", "241"):
        assert classify_lap(lap(track_status=code)).exclusion_reason == "yellow_flag", code


def test_classify_lap_does_not_flag_clear_or_unknown_track_status() -> None:
    """'1' clear, '3' (FastF1's own "never seen so far, does not exist?"
    undocumented code -- deliberately not treated as excluded, §2), a
    combined non-excluded case ("31"), and "" (FastF1 recorded zero
    status events for the session) all resolve to no exclusion.
    """
    for code in ("1", "3", "31", ""):
        assert classify_lap(lap(track_status=code)).exclusion_reason is None, code


def test_filter_for_aggregate_stats_excludes_yellow_flag_but_filter_valid_laps_does_not() -> None:
    """The precedence-defining test: a yellow-flag-affected lap is still
    "valid" (filter_valid_laps keeps it, matching filtering.py's own
    documented design) but excluded from the stricter aggregate-stats
    population (filter_for_aggregate_stats drops it) -- the two filters
    must now genuinely diverge for a session with a flagged lap, proving
    §3's precedence claim with real assertions.
    """
    laps = [
        lap(lap_number=1, is_accurate=True, track_status="1"),
        lap(lap_number=2, is_accurate=True, track_status="4"),
    ]

    assert [lap_.lap_number for lap_ in filter_valid_laps(laps)] == [1, 2]
    assert [lap_.lap_number for lap_ in filter_for_aggregate_stats(laps)] == [1]


def test_classify_lap_exclusion_reason_is_independent_of_is_accurate() -> None:
    """A lap can be both inaccurate (is_valid=False) and yellow-flagged
    (exclusion_reason="yellow_flag") at the same time -- `classify_lap`
    computes the two independently, with no hidden precedence between
    them (§3), unchanged by this milestone.
    """
    validity = classify_lap(lap(is_accurate=False, track_status="4"))

    assert validity.is_valid is False
    assert validity.exclusion_reason == "yellow_flag"


# --- M40: track-limits exclusion (docs/m40-design-review.md) ---


def test_classify_lap_flags_deleted_lap_as_track_limits() -> None:
    """Any `deleted=True` lap classifies as "track_limits" unconditionally
    -- real evidence (docs/m40-design-review.md §17) found every FastF1
    deletion reason to be a track-limits infringement, so this is not
    gated on `deleted_reason`'s text.
    """
    assert classify_lap(lap(deleted=True)).exclusion_reason == "track_limits"
    assert (
        classify_lap(lap(deleted=True, deleted_reason="TRACK LIMITS AT TURN 9")).exclusion_reason
        == "track_limits"
    )


def test_classify_lap_does_not_flag_non_deleted_lap() -> None:
    """`deleted=False` (FastF1 recorded this lap, did not delete it) and
    `deleted=None` (no deletion data -- any session ingested before M40)
    both resolve to no track-limits exclusion.
    """
    assert classify_lap(lap(deleted=False)).exclusion_reason is None
    assert classify_lap(lap(deleted=None)).exclusion_reason is None


def test_classify_lap_track_limits_takes_precedence_over_yellow_flag() -> None:
    """The precedence decision (docs/m40-design-review.md §21): a lap that
    is both track-limits-deleted and yellow-flag-affected displays
    "track_limits", not "yellow_flag" -- a display-only choice, since both
    reasons already exclude the lap from aggregate stats identically.
    """
    assert classify_lap(lap(deleted=True, track_status="4")).exclusion_reason == "track_limits"


def test_classify_lap_yellow_flag_without_deletion_is_unchanged() -> None:
    """A yellow-flag-affected lap that was not deleted still classifies as
    "yellow_flag" -- M40 must not alter M36's existing behavior."""
    assert classify_lap(lap(deleted=False, track_status="4")).exclusion_reason == "yellow_flag"
    assert classify_lap(lap(deleted=None, track_status="4")).exclusion_reason == "yellow_flag"


def test_classify_lap_track_limits_exclusion_reason_is_independent_of_is_accurate() -> None:
    """`is_valid` remains derived solely from `is_accurate` -- a
    track-limits-deleted lap with clean telemetry (the real, confirmed
    case, docs/m40-design-review.md §17) is `is_valid=True` and
    `exclusion_reason="track_limits"` at the same time; a track-limits
    deletion must never be conflated with a telemetry-accuracy problem.
    """
    validity = classify_lap(lap(is_accurate=True, deleted=True))

    assert validity.is_valid is True
    assert validity.exclusion_reason == "track_limits"


def test_filter_for_aggregate_stats_excludes_track_limits_but_filter_valid_laps_does_not() -> None:
    """Mirrors the existing yellow-flag precedence test: a track-limits lap
    is still "valid" (filter_valid_laps keeps it) but excluded from the
    stricter aggregate-stats population (filter_for_aggregate_stats drops
    it) -- the same aggregate-vs-valid distinction M36 established, now
    proven for M40's own exclusion source.
    """
    laps = [
        lap(lap_number=1, is_accurate=True, deleted=False),
        lap(lap_number=2, is_accurate=True, deleted=True),
    ]

    assert [lap_.lap_number for lap_ in filter_valid_laps(laps)] == [1, 2]
    assert [lap_.lap_number for lap_ in filter_for_aggregate_stats(laps)] == [1]
