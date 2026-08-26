"""Invariants SQL de l'atomicité conversations et quotas IA."""

from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260826140857_atomic_conversations_and_ai_quota_reservations.sql"
)
COMMIT_FIX_MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260826143243_fix_ai_quota_commit_search_path.sql"
)


def _migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_conversation_append_is_atomic_owned_and_bounded() -> None:
    sql = _migration_sql()

    assert "unique (user_id, session_id)" in sql
    assert "on conflict (user_id, session_id) do update" in sql
    assert "jsonb_array_elements" in sql
    assert "order by ordinal desc" in sql
    assert "limit 50" in sql
    assert "security invoker" in sql
    assert "set search_path = ''" in sql
    assert "revoke all on function public.append_coach_conversation_messages" in sql
    assert "grant execute on function public.append_coach_conversation_messages" in sql
    assert "to service_role" in sql


def test_quota_reservations_are_atomic_idempotent_and_private() -> None:
    sql = _migration_sql()

    assert "create table public.ai_quota_reservations" in sql
    assert "alter table public.ai_quota_reservations enable row level security" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "unique (\n    user_id,\n    feature,\n    request_key" in sql
    assert "for update" in sql
    assert "public.increment_usage" in sql
    assert "status = 'committed'" in sql
    assert "status = 'released'" in sql
    assert "revoke all on table public.ai_quota_reservations" in sql
    assert "grant select, insert, update on table public.ai_quota_reservations" in sql
    assert "to service_role" in sql
    for function_name in (
        "reserve_ai_quota",
        "commit_ai_quota_reservation",
        "release_ai_quota_reservation",
    ):
        assert f"revoke all on function public.{function_name}" in sql
        assert f"grant execute on function public.{function_name}" in sql


def test_quota_reservations_use_current_cv_lm_plan_keys() -> None:
    sql = _migration_sql()

    assert "cv_adapt_per_day" in sql
    assert "cover_letter_per_day" in sql
    assert "cv_adapt_used" in sql
    assert "cover_letter_used" in sql


def test_quota_commit_keeps_an_empty_search_path_with_qualified_tables() -> None:
    sql = COMMIT_FIX_MIGRATION.read_text(encoding="utf-8").lower()

    assert "set search_path = ''" in sql
    assert "insert into public.usage_quotas" in sql
    assert "public.usage_quotas.cv_adapt_used" in sql
    assert "public.usage_quotas.cover_letter_used" in sql
    assert "public.increment_usage" not in sql
    assert "for update" in sql
