"""Validation exécutable de la migration des campagnes email."""

from pathlib import Path
from uuid import uuid4

import psycopg


MIGRATION = (
    Path(__file__).parents[2]
    / "supabase/migrations/20260912230000_email_campaign_ledger.sql"
)
LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def test_email_campaign_migration_is_transactionally_valid() -> None:
    """La migration crée le ledger et sa prise de lots, puis est annulée."""
    sql = MIGRATION.read_text(encoding="utf-8")

    with psycopg.connect(LOCAL_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            cursor.execute(
                """
                select
                  to_regclass('public.email_campaigns')::text,
                  to_regclass('public.email_campaign_deliveries')::text,
                  to_regprocedure(
                    'public.claim_email_campaign_deliveries(uuid,integer)'
                  )::text,
                  to_regprocedure(
                    'public.set_newsletter_preference(boolean)'
                  )::text,
                  to_regprocedure(
                    'public.freeze_email_campaign(uuid,text,text,uuid,integer)'
                  )::text,
                  to_regprocedure(
                    'public.set_newsletter_preference_for_user(uuid,boolean)'
                  )::text
                """
            )
            assert cursor.fetchone() == (
                "email_campaigns",
                "email_campaign_deliveries",
                "claim_email_campaign_deliveries(uuid,integer)",
                "set_newsletter_preference(boolean)",
                "freeze_email_campaign(uuid,text,text,uuid,integer)",
                "set_newsletter_preference_for_user(uuid,boolean)",
            )

            cursor.execute(
                """
                select column_name
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'profiles'
                  and column_name in (
                    'newsletter_consent_at',
                    'newsletter_consent_source',
                    'newsletter_consent_version',
                    'newsletter_unsubscribed_at'
                  )
                order by column_name
                """
            )
            assert [row[0] for row in cursor.fetchall()] == [
                "newsletter_consent_at",
                "newsletter_consent_source",
                "newsletter_consent_version",
                "newsletter_unsubscribed_at",
            ]
            cursor.execute(
                """
                select pg_get_functiondef(
                  'public.claim_email_campaign_deliveries(uuid,integer)'::regprocedure
                )
                """
            )
            claim_definition = cursor.fetchone()[0]
            assert "status = 'running'" in claim_definition
            assert "FOR UPDATE SKIP LOCKED" in claim_definition

            cursor.execute(
                """
                select count(*)
                from public.profiles
                where status = 'active'
                  and nullif(btrim(email), '') is not null
                """
            )
            audience_total = cursor.fetchone()[0]
            campaign_id = uuid4()
            cursor.execute(
                """
                select status, audience_total, audience_frozen_at is not null
                from public.freeze_email_campaign(%s, %s, %s, %s, %s)
                """,
                (
                    campaign_id,
                    "service-update",
                    "test-v1",
                    None,
                    audience_total,
                ),
            )
            assert cursor.fetchone() == ("ready", audience_total, True)
            cursor.execute(
                """
                select count(*)
                from public.email_campaign_deliveries
                where campaign_id = %s
                """,
                (campaign_id,),
            )
            assert cursor.fetchone()[0] == audience_total
        connection.rollback()
