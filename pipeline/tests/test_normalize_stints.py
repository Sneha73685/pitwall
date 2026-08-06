import pandas as pd

from pitwall_pipeline.normalize import normalize_stints
from tests.fixtures import build_laps_df, build_laps_df_with_pit_stop


def test_normalize_stints_single_lap_stints() -> None:
    stints = normalize_stints(build_laps_df(), session_id="2023_monza_race")

    assert len(stints) == 2
    ver_stint = next(s for s in stints if s.driver_id == "VER")
    assert ver_stint.session_id == "2023_monza_race"
    assert ver_stint.stint_number == 1
    assert ver_stint.compound == "SOFT"
    assert ver_stint.start_lap == 1
    assert ver_stint.end_lap == 1
    assert ver_stint.tyre_life_at_start == 2

    ham_stint = next(s for s in stints if s.driver_id == "HAM")
    assert ham_stint.compound == "MEDIUM"


def test_normalize_stints_groups_multiple_laps_into_one_stint() -> None:
    stints = normalize_stints(build_laps_df_with_pit_stop(), session_id="2023_monza_race")

    assert len(stints) == 2
    first, second = sorted(stints, key=lambda s: s.stint_number)

    assert first.stint_number == 1
    assert first.compound == "SOFT"
    assert first.start_lap == 1
    assert first.end_lap == 2
    assert first.tyre_life_at_start == 4  # from lap 1, the first lap of the stint

    assert second.stint_number == 2
    assert second.compound == "HARD"
    assert second.start_lap == 3
    assert second.end_lap == 3
    assert second.tyre_life_at_start == 1


def test_normalize_stints_skips_lap_with_missing_stint_number() -> None:
    """A lap with no Stint value (e.g. a data-quality gap around a red flag
    or formation lap, design review §7) must not crash normalization --
    it's simply excluded from stint aggregation.
    """
    laps_df = build_laps_df()
    laps_df.loc[0, "Stint"] = float("nan")

    stints = normalize_stints(laps_df, session_id="2023_monza_race")

    # VER's only lap had its Stint blanked out -- VER contributes no stint;
    # HAM's is unaffected.
    assert len(stints) == 1
    assert stints[0].driver_id == "HAM"


def test_normalize_stints_skips_lap_with_missing_compound() -> None:
    laps_df = build_laps_df()
    laps_df.loc[0, "Compound"] = None

    stints = normalize_stints(laps_df, session_id="2023_monza_race")

    assert len(stints) == 1
    assert stints[0].driver_id == "HAM"


def test_normalize_stints_handles_missing_tyre_life() -> None:
    laps_df = build_laps_df()
    laps_df.loc[0, "TyreLife"] = pd.NA

    stints = normalize_stints(laps_df, session_id="2023_monza_race")

    ver_stint = next(s for s in stints if s.driver_id == "VER")
    assert ver_stint.tyre_life_at_start is None
