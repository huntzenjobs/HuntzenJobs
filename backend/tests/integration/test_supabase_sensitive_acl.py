"""Contrats ACL à exécuter uniquement contre la base Supabase staging."""

import os
from urllib.parse import urlparse

import psycopg
import pytest


@pytest.fixture(scope="module")
def staging_connection():
    database_url = os.getenv("SUPABASE_STAGING_DATABASE_URL")
    project_ref = os.getenv("SUPABASE_STAGING_PROJECT_REF")
    if not database_url or not project_ref:
        pytest.skip("Supabase staging non configuré pour ce test d'intégration")

    hostname = urlparse(database_url).hostname or ""
    assert project_ref in hostname, "Le test refuse toute base qui n'est pas le staging attendu"

    with psycopg.connect(database_url) as connection:
        connection.execute("BEGIN READ ONLY")
        yield connection
        connection.rollback()


def _has_table_privilege(connection, role: str, table: str, privilege: str) -> bool:
    row = connection.execute(
        "SELECT has_table_privilege(%s, %s, %s)",
        (role, f"public.{table}", privilege),
    ).fetchone()
    assert row is not None
    return bool(row[0])


def _has_column_privilege(
    connection,
    role: str,
    table: str,
    column: str,
    privilege: str,
) -> bool:
    row = connection.execute(
        "SELECT has_column_privilege(%s, %s, %s, %s)",
        (role, f"public.{table}", column, privilege),
    ).fetchone()
    assert row is not None
    return bool(row[0])


def test_anon_has_no_privilege_on_sensitive_tables(staging_connection) -> None:
    for table in (
        "cv_analyses",
        "recruiter_cache",
        "recruiter_requests",
        "profiles",
        "stripe_payments",
        "usage_quotas",
        "user_sessions",
        "user_subscriptions",
    ):
        for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"):
            assert not _has_table_privilege(
                staging_connection,
                "anon",
                table,
                privilege,
            ), f"anon conserve {privilege} sur {table}"


def test_authenticated_cannot_mutate_subscription_financial_fields(
    staging_connection,
) -> None:
    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
        assert not _has_table_privilege(
            staging_connection,
            "authenticated",
            "user_subscriptions",
            privilege,
        )

    assert _has_table_privilege(
        staging_connection,
        "authenticated",
        "user_subscriptions",
        "SELECT",
    )


def test_authenticated_cannot_mutate_usage_quotas(staging_connection) -> None:
    for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"):
        assert not _has_table_privilege(
            staging_connection,
            "authenticated",
            "usage_quotas",
            privilege,
        )


def test_authenticated_cannot_mutate_recruiter_payment_or_workflow(
    staging_connection,
) -> None:
    assert _has_table_privilege(
        staging_connection,
        "authenticated",
        "recruiter_requests",
        "SELECT",
    )

    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
        assert not _has_table_privilege(
            staging_connection,
            "authenticated",
            "recruiter_requests",
            privilege,
        )

    for column in (
        "amount_cents",
        "assigned_recruiter_id",
        "notes",
        "payment_intent_id",
        "payment_status",
        "scheduled_at",
        "status",
        "stripe_checkout_session_id",
    ):
        assert not _has_column_privilege(
            staging_connection,
            "authenticated",
            "recruiter_requests",
            column,
            "UPDATE",
        ), f"authenticated conserve UPDATE sur recruiter_requests.{column}"


def test_authenticated_profile_updates_are_limited_to_safe_columns(
    staging_connection,
) -> None:
    allowed_columns = {
        "avatar_url",
        "email_notifications",
        "full_name",
        "newsletter_subscribed",
        "preferred_language",
        "updated_at",
    }
    protected_columns = {
        "coach_messages_used",
        "cv_analyses_used",
        "is_admin",
        "job_searches_used",
        "status",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_subscription_status",
        "subscription_tier",
    }

    for column in allowed_columns:
        assert _has_column_privilege(
            staging_connection,
            "authenticated",
            "profiles",
            column,
            "UPDATE",
        )

    for column in protected_columns:
        assert not _has_column_privilege(
            staging_connection,
            "authenticated",
            "profiles",
            column,
            "UPDATE",
        ), f"authenticated conserve UPDATE sur profiles.{column}"
