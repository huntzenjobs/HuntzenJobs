"""Validation exécutable de la migration des campagnes email."""

import hashlib
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest

MIGRATION = (
    Path(__file__).parents[2]
    / "supabase/migrations/20260912230000_email_campaign_ledger.sql"
)
EDITABLE_MIGRATION = (
    Path(__file__).parents[2]
    / "supabase/migrations/20260913214556_editable_email_campaigns.sql"
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


def test_editable_campaign_migration_freezes_exact_content() -> None:
    """Le contenu personnalisé et son hash sont figés avec l'audience."""
    with psycopg.connect(LOCAL_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(MIGRATION.read_text(encoding="utf-8"))
            cursor.execute(EDITABLE_MIGRATION.read_text(encoding="utf-8"))
            cursor.execute(
                """
                select column_name
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'email_campaigns'
                  and column_name in (
                    'editor_mode', 'email_subject', 'email_content', 'content_hash'
                  )
                order by column_name
                """
            )
            assert [row[0] for row in cursor.fetchall()] == [
                "content_hash",
                "editor_mode",
                "email_content",
                "email_subject",
            ]
            cursor.execute(
                """
                select to_regprocedure(
                  'public.freeze_editable_email_campaign(uuid,text,text,uuid,integer,text,text,text,text)'
                )::text
                """
            )
            assert cursor.fetchone()[0] == (
                "freeze_editable_email_campaign(uuid,text,text,uuid,integer,text,text,text,text)"
            )
            cursor.execute(
                """
                select to_regprocedure(
                  'public.freeze_email_campaign(uuid,text,text,uuid,integer)'
                )::text
                """
            )
            assert cursor.fetchone()[0] == (
                "freeze_email_campaign(uuid,text,text,uuid,integer)"
            )

            cursor.execute(
                """
                select count(*)
                from public.profiles
                where status = 'active'
                  and nullif(btrim(email), '') is not null
                """
            )
            audience_total = cursor.fetchone()[0]
            cursor.execute("savepoint before_null_hash")
            with pytest.raises(psycopg.errors.RaiseException, match="Invalid campaign content"):
                cursor.execute(
                    """
                    select * from public.freeze_editable_email_campaign(
                      %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (
                        uuid4(),
                        "service-update",
                        "test-editable-v1",
                        None,
                        audience_total,
                        "simple",
                        "Sujet",
                        "Texte",
                        None,
                    ),
                )
            cursor.execute("rollback to savepoint before_null_hash")

            campaign_id = uuid4()
            content_hash = hashlib.sha256(
                b"simple\nSujet HuntzenJobs\nTexte exact"
            ).hexdigest()
            arguments = (
                campaign_id,
                "service-update",
                "test-editable-v1",
                None,
                audience_total,
                "simple",
                "Sujet HuntzenJobs",
                "Texte exact",
                content_hash,
            )
            cursor.execute(
                """
                select status, audience_total, editor_mode, email_subject,
                       email_content, content_hash
                from public.freeze_editable_email_campaign(
                  %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                """,
                arguments,
            )
            assert cursor.fetchone() == (
                "ready",
                audience_total,
                "simple",
                "Sujet HuntzenJobs",
                "Texte exact",
                content_hash,
            )
            cursor.execute(
                """
                select status, content_hash
                from public.freeze_editable_email_campaign(
                  %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                """,
                arguments,
            )
            assert cursor.fetchone() == ("ready", content_hash)

            cursor.execute("savepoint before_hash_mismatch")
            with pytest.raises(psycopg.errors.RaiseException, match="content mismatch"):
                changed_content = "Autre texte"
                changed_hash = hashlib.sha256(
                    f"simple\nSujet HuntzenJobs\n{changed_content}".encode()
                ).hexdigest()
                cursor.execute(
                    """
                    select * from public.freeze_editable_email_campaign(
                      %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    (*arguments[:-2], changed_content, changed_hash),
                )
            cursor.execute("rollback to savepoint before_hash_mismatch")

            cursor.execute("savepoint before_frozen_update")
            with pytest.raises(psycopg.errors.RaiseException, match="cannot be changed"):
                cursor.execute(
                    "update public.email_campaigns set email_content = 'modifié' where id = %s",
                    (campaign_id,),
                )
            cursor.execute("rollback to savepoint before_frozen_update")

            legacy_campaign_id = uuid4()
            cursor.execute(
                """
                select status from public.freeze_email_campaign(%s, %s, %s, %s, %s)
                """,
                (
                    legacy_campaign_id,
                    "service-update",
                    "test-editable-v1",
                    None,
                    audience_total,
                ),
            )
            assert cursor.fetchone() == ("ready",)
            cursor.execute(
                """
                select editor_mode, email_subject, email_content, content_hash
                from public.freeze_editable_email_campaign(
                  %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                """,
                (
                    legacy_campaign_id,
                    "service-update",
                    "test-editable-v1",
                    None,
                    audience_total,
                    "simple",
                    "Nouveau sujet",
                    "Nouveau texte",
                    hashlib.sha256(
                        b"simple\nNouveau sujet\nNouveau texte"
                    ).hexdigest(),
                ),
            )
            assert cursor.fetchone() == (None, None, None, None)
        connection.rollback()
