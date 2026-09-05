"""Contrats SQL des checkpoints de livraison et du nettoyage Storage."""

import re
from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260905090000_checkpoint_support_deliveries.sql"
)


def _sql() -> str:
    return re.sub(r"\s+", " ", MIGRATION.read_text(encoding="utf-8").lower()).strip()


def test_attachment_delete_is_limited_to_the_authenticated_users_folder() -> None:
    sql = _sql()

    assert 'create policy "user_delete_own_support"' in sql
    assert "on storage.objects for delete to authenticated" in sql
    assert "bucket_id = 'support-attachments'" in sql
    assert "(storage.foldername(name))[1] = (select auth.uid())::text" in sql
    assert "delete from storage.objects" not in sql


def test_outbox_persists_each_delivery_channel_before_processing_the_next_one() -> None:
    sql = _sql()

    assert "add column if not exists email_delivered_at timestamptz" in sql
    assert "add column if not exists notification_delivered_at timestamptz" in sql
    assert "function public.mark_support_delivery_channel_succeeded" in sql
    assert "p_channel not in ('email', 'notification')" in sql
    assert "status = 'processing'" in sql
    assert "lease_owner = p_worker_id" in sql
    assert "email_delivered_at = case" in sql
    assert "notification_delivered_at = case" in sql
    assert (
        "revoke all on function public.mark_support_delivery_channel_succeeded(uuid, uuid, text)"
        in sql
    )
    assert (
        "grant execute on function public.mark_support_delivery_channel_succeeded(uuid, uuid, text) "
        "to service_role"
    ) in sql


def test_migration_is_additive_and_documents_a_non_destructive_rollback() -> None:
    sql = _sql()

    assert "rollback non destructif" in sql
    assert "drop table" not in sql
    assert "delete from public." not in sql
