"""Tests mock FastF1 entirely -- no test in this suite touches the
network or F1's live-timing archive (see CLAUDE.md testing rules)."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from pitwall_pipeline import smoke


def test_get_fastf1_version_returns_installed_version() -> None:
    with patch.object(smoke, "fastf1") as mock_fastf1:
        mock_fastf1.__version__ = "3.8.3"

        assert smoke.get_fastf1_version() == "3.8.3"


def test_enable_cache_creates_directory_and_calls_fastf1(tmp_path: Path) -> None:
    cache_dir = tmp_path / "fastf1_cache"

    with patch.object(smoke, "fastf1") as mock_fastf1:
        mock_fastf1.Cache = MagicMock()
        smoke.enable_cache(cache_dir)

        assert cache_dir.exists()
        mock_fastf1.Cache.enable_cache.assert_called_once_with(str(cache_dir))
