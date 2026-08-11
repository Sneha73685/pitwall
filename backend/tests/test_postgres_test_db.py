"""Unit tests for `resolve_test_database_url` -- the pure URL-derivation
logic behind the test-database isolation fix (M12 Phase 6 finding). No real
PostgreSQL connection is needed for these; the connection-level regression
test lives in
`test_postgres_race_context_repository.test_pool_fixture_never_targets_the_real_app_database`.
"""

import pytest

from tests.postgres_test_db import resolve_test_database_url


def test_resolve_test_database_url_appends_suffix_to_the_database_name() -> None:
    result = resolve_test_database_url("postgresql://pitwall:pitwall@localhost:5432/pitwall")

    assert result == "postgresql://pitwall:pitwall@localhost:5432/pitwall_test"


def test_resolve_test_database_url_preserves_host_user_and_password() -> None:
    result = resolve_test_database_url("postgresql://pitwall:pitwall@localhost:5432/pitwall")

    assert result.startswith("postgresql://pitwall:pitwall@localhost:5432/")


def test_resolve_test_database_url_never_equals_its_input() -> None:
    app_url = "postgresql://pitwall:pitwall@localhost:5432/pitwall"

    assert resolve_test_database_url(app_url) != app_url


def test_resolve_test_database_url_works_against_a_differently_named_database() -> None:
    # Confirms this isn't hardcoded to the literal string "pitwall" --
    # matters for CI, which resolves the same default but could in
    # principle be pointed at a differently-named database.
    result = resolve_test_database_url("postgresql://user:pw@db-host:5432/some_other_name")

    assert result == "postgresql://user:pw@db-host:5432/some_other_name_test"


def test_resolve_test_database_url_rejects_a_url_with_no_database_name() -> None:
    with pytest.raises(ValueError, match="Cannot derive a test database name"):
        resolve_test_database_url("postgresql://pitwall:pitwall@localhost:5432/")
