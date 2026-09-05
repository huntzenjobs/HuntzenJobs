"""Validation transactionnelle de la migration des droits admin expirés."""

from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "20260905230243_expire_stale_admin_grants.sql"
)


def _migration_sql(schema: str, statement_timeout: str = "30s") -> str:
    return (
        MIGRATION_PATH.read_text(encoding="utf-8")
        .replace(
            "public.user_subscriptions",
            f'"{schema}".user_subscriptions',
        )
        .replace("'30s'", f"'{statement_timeout}'")
    )


def test_expire_stale_admin_grants_is_scoped_and_idempotent() -> None:
    """Une mauvaise clause WHERE expirerait un abonnement Stripe ou futur."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL absent")

    schema = f"migration_test_{uuid4().hex}"
    migration_sql = _migration_sql(schema)

    with (
        psycopg.connect(database_url) as connection,
        connection.transaction(force_rollback=True),
        connection.cursor() as cursor,
    ):
        cursor.execute("SET lock_timeout = '17s'; SET statement_timeout = '19s'")
        cursor.execute(
            "SELECT current_setting('lock_timeout'), current_setting('statement_timeout')"
        )
        original_timeouts = cursor.fetchone()
        cursor.execute(f'CREATE SCHEMA "{schema}"')
        cursor.execute(
            f"""
            CREATE TABLE "{schema}".user_subscriptions (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                current_period_end TIMESTAMPTZ,
                stripe_subscription_id TEXT,
                metadata JSONB,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cursor.execute(
            f"""
            INSERT INTO "{schema}".user_subscriptions (
                id,
                status,
                current_period_end,
                stripe_subscription_id,
                metadata
            )
            VALUES
                ('expired-admin', 'active', NOW() - INTERVAL '1 day',
                 'admin_granted:expired', '{{"source": "admin"}}'),
                ('future-admin', 'active', NOW() + INTERVAL '1 day',
                 'admin_granted:future', '{{}}'),
                ('canceled-admin', 'canceled', NOW() - INTERVAL '1 day',
                 'admin_granted:canceled', '{{}}'),
                ('lookalike-admin', 'active', NOW() - INTERVAL '1 day',
                 'adminXgranted:expired', '{{}}'),
                ('expired-stripe', 'active', NOW() - INTERVAL '1 day',
                 'sub_live_current', '{{}}')
            """
        )

        cursor.execute(migration_sql)
        cursor.execute(migration_sql)
        cursor.execute(
            "SELECT current_setting('lock_timeout'), current_setting('statement_timeout')"
        )
        restored_timeouts = cursor.fetchone()
        cursor.execute(
            f"""
            SELECT id, status, metadata
            FROM "{schema}".user_subscriptions
            ORDER BY id
            """
        )
        rows = {
            row[0]: {"status": row[1], "metadata": row[2]}
            for row in cursor.fetchall()
        }

    assert rows["expired-admin"]["status"] == "expired"
    assert rows["expired-admin"]["metadata"] == {
        "source": "admin",
        "previous_status": "active",
        "reconciled_by": "20260905230243_expire_stale_admin_grants",
    }
    assert rows["future-admin"]["status"] == "active"
    assert rows["canceled-admin"]["status"] == "canceled"
    assert rows["lookalike-admin"]["status"] == "active"
    assert rows["expired-stripe"]["status"] == "active"
    assert restored_timeouts == original_timeouts


def test_expire_stale_admin_grants_enforces_statement_timeout() -> None:
    """Le garde doit interrompre l'UPDATE et préserver la session."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL absent")

    schema = f"migration_timeout_test_{uuid4().hex}"
    migration_sql = _migration_sql(schema, statement_timeout="100ms")

    with (
        psycopg.connect(database_url) as connection,
        connection.transaction(force_rollback=True),
        connection.cursor() as cursor,
    ):
        cursor.execute("SET lock_timeout = '17s'; SET statement_timeout = '19s'")
        cursor.execute(f'CREATE SCHEMA "{schema}"')
        cursor.execute(
            f"""
            CREATE TABLE "{schema}".user_subscriptions (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                current_period_end TIMESTAMPTZ,
                stripe_subscription_id TEXT,
                metadata JSONB,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE FUNCTION "{schema}".slow_update() RETURNS TRIGGER AS $$
            BEGIN
              PERFORM PG_SLEEP(0.5);
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER slow_update
              BEFORE UPDATE ON "{schema}".user_subscriptions
              FOR EACH ROW EXECUTE FUNCTION "{schema}".slow_update();
            INSERT INTO "{schema}".user_subscriptions (
                id, status, current_period_end, stripe_subscription_id
            ) VALUES (
                'expired-admin', 'active', NOW() - INTERVAL '1 day',
                'admin_granted:expired'
            )
            """
        )

        with pytest.raises(psycopg.errors.QueryCanceled), connection.transaction():
            cursor.execute(migration_sql)

        cursor.execute(
            "SELECT current_setting('lock_timeout'), current_setting('statement_timeout')"
        )
        assert cursor.fetchone() == ("17s", "19s")
        cursor.execute(
            f'SELECT status FROM "{schema}".user_subscriptions WHERE id = %s',
            ("expired-admin",),
        )
        assert cursor.fetchone() == ("active",)
