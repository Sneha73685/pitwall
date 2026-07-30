from pitwall_pipeline.utils.ids import slugify


def test_slugify_lowercases_and_collapses_separators() -> None:
    assert slugify("Italian Grand Prix") == "italian_grand_prix"


def test_slugify_strips_leading_and_trailing_separators() -> None:
    assert slugify("  São Paulo Grand Prix!! ") == "s_o_paulo_grand_prix"
