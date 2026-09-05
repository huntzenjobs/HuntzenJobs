"""Contrats SQL du workflow support durable et privé."""

import re
from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260831141313_harden_support_ticket_workflow.sql"
)


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8").lower()


def _compact(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _table_definition(sql: str, table_name: str) -> str:
    match = re.search(
        rf"create table public\.{re.escape(table_name)}\s*\((.*?)\n\);",
        sql,
        re.DOTALL,
    )
    assert match is not None, f"table public.{table_name} absente"
    return _compact(match.group(1))


def _function_definition(sql: str, function_name: str) -> str:
    match = re.search(
        rf"create or replace function public\.{re.escape(function_name)}\s*\(.*?\)"
        rf"\s*returns .*?as \$\$(.*?)\$\$;",
        sql,
        re.DOTALL,
    )
    assert match is not None, f"fonction public.{function_name} absente"
    return _compact(match.group(0))


def _policies_for(sql: str, table_name: str) -> list[str]:
    policies = re.findall(r"create policy .*?;", sql, re.DOTALL)
    return [
        _compact(policy)
        for policy in policies
        if f"on public.{table_name}" in _compact(policy)
    ]


def test_support_tickets_become_read_only_for_owners_without_losing_rows() -> None:
    sql = _sql()
    policies = _policies_for(sql, "support_tickets")

    assert 'drop policy if exists "users_own_tickets" on public.support_tickets' in sql
    assert "add column if not exists request_id uuid" in sql
    assert "unique (request_id)" in sql
    assert "delete from public.support_tickets" not in sql
    assert "drop table public.support_tickets" not in sql
    assert "alter table public.support_tickets enable row level security" in sql
    assert any(
        "for select to authenticated" in policy
        and "(select auth.uid()) = user_id" in policy
        for policy in policies
    )
    assert not any(
        "to authenticated" in policy
        and any(operation in policy for operation in ("for all", "for insert", "for update"))
        for policy in policies
    )
    assert any(
        "for all to service_role" in policy
        and "using (true)" in policy
        and "with check (true)" in policy
        for policy in policies
    )
    compact_sql = _compact(sql)
    assert (
        "revoke all on table public.support_tickets from public, anon, authenticated"
        in compact_sql
    )
    assert "grant select on table public.support_tickets to authenticated" in compact_sql


def test_message_history_is_append_only_owned_and_backfills_legacy_replies() -> None:
    sql = _sql()
    table = _table_definition(sql, "support_ticket_messages")
    policies = _policies_for(sql, "support_ticket_messages")

    assert "ticket_id uuid not null references public.support_tickets(id)" in table
    assert "author_id uuid references auth.users(id)" in table
    assert "author_role text not null" in table
    assert "content text not null" in table
    assert "created_at timestamptz not null" in table
    assert "request_id uuid not null unique" in table
    assert "unique (ticket_id, id)" in table
    assert "author_role in ('user', 'admin', 'system')" in table
    assert any(
        "for select to authenticated" in policy
        and "from public.support_tickets" in policy
        and "ticket.user_id = (select auth.uid())" in policy
        for policy in policies
    )
    assert not any("to authenticated" in policy and "for select" not in policy for policy in policies)
    compact_sql = _compact(sql)
    assert (
        "revoke all on table public.support_ticket_messages from public, anon, authenticated"
        in compact_sql
    )
    assert "grant select on table public.support_ticket_messages to authenticated" in compact_sql
    assert "where ticket.admin_reply is not null" in compact_sql
    assert "'admin'" in compact_sql
    assert "ticket.admin_reply" in compact_sql
    assert "drop column admin_reply" not in sql
    assert "on public.support_ticket_messages (author_id)" in compact_sql


def test_delivery_outbox_is_private_deduplicated_bounded_and_claimable() -> None:
    sql = _sql()
    table = _table_definition(sql, "support_delivery_outbox")
    policies = _policies_for(sql, "support_delivery_outbox")
    claim = _function_definition(sql, "claim_support_deliveries")
    failure = _function_definition(sql, "fail_support_delivery")

    assert "dedupe_key uuid not null unique" in table
    assert "message_id uuid not null" in table
    assert "foreign key (ticket_id, message_id)" in table
    assert "references public.support_ticket_messages(ticket_id, id)" in table
    assert "status in ('pending', 'processing', 'delivered', 'dead')" in table
    assert "attempt_count integer not null default 0" in table
    assert "attempt_count >= 0" in table
    assert "lease_owner uuid" in table
    assert "lease_expires_at timestamptz" in table
    assert "next_attempt_at timestamptz not null" in table
    assert "char_length(last_error) <= 1000" in table
    assert not any("to authenticated" in policy or "to anon" in policy for policy in policies)
    compact_sql = _compact(sql)
    assert (
        "revoke all on table public.support_delivery_outbox from public, anon, authenticated"
        in compact_sql
    )
    assert "for update skip locked" in claim
    assert "status = 'processing'" in claim
    assert "attempt_count = delivery.attempt_count + 1" in claim
    assert "lease_owner = p_worker_id" in claim
    assert "status = 'dead'" in claim
    assert "p_limit is null" in claim
    assert "p_lease_seconds is null" in claim
    assert "status = 'pending'" in failure
    assert "status = 'dead'" in failure
    assert "pg_catalog.left(p_error, 1000)" in failure


def test_support_rpcs_are_transactional_idempotent_and_service_role_only() -> None:
    sql = _sql()
    signatures = {
        "create_support_ticket_idempotent": "uuid, uuid, text, text, text, text, text, text, text, text, text",
        "reply_support_ticket_idempotent": "uuid, uuid, text, uuid",
        "set_support_ticket_status_idempotent": "uuid, uuid, text, uuid, text",
        "claim_support_deliveries": "uuid, integer, integer",
        "mark_support_delivery_succeeded": "uuid, uuid",
        "fail_support_delivery": "uuid, uuid, text, integer",
    }
    compact_sql = _compact(sql)

    for function_name, signature in signatures.items():
        function = _function_definition(sql, function_name)
        assert "security definer" in function
        assert "set search_path = ''" in function
        assert f"revoke all on function public.{function_name}({signature})" in compact_sql
        assert "from public, anon, authenticated" in compact_sql
        assert f"grant execute on function public.{function_name}({signature})" in compact_sql
        assert "to service_role" in compact_sql

    creation = _function_definition(sql, "create_support_ticket_idempotent")
    reply = _function_definition(sql, "reply_support_ticket_idempotent")
    status = _function_definition(sql, "set_support_ticket_status_idempotent")
    success = _function_definition(sql, "mark_support_delivery_succeeded")

    assert "on conflict (request_id) do nothing" in creation
    assert "insert into public.support_ticket_messages" in creation
    assert "insert into public.support_delivery_outbox" in creation
    assert "on conflict (request_id) do nothing" in reply
    assert "admin_reply = p_content" in reply
    assert "on conflict (request_id) do nothing" in status
    assert "status = p_status" in status
    assert status.count("payload ->> 'status' is distinct from p_status") == 2
    assert "status = 'delivered'" in success


def test_support_indexes_and_attachment_limits_match_the_workflow() -> None:
    sql = _sql()
    compact_sql = _compact(sql)

    assert (
        "on public.support_tickets (user_id, created_at desc, id)" in compact_sql
    )
    assert (
        "on public.support_ticket_messages (ticket_id, created_at, id)" in compact_sql
    )
    assert (
        "on public.support_delivery_outbox (next_attempt_at, lease_expires_at, created_at)"
        in compact_sql
    )
    assert "on public.support_delivery_outbox (ticket_id)" in compact_sql
    assert "on public.support_delivery_outbox (message_id)" in compact_sql
    assert "where status in ('pending', 'processing')" in compact_sql
    assert "update storage.buckets" in compact_sql
    assert "file_size_limit = 5242880" in compact_sql
    for mime_type in (
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
    ):
        assert f"'{mime_type}'" in compact_sql
    assert "where id = 'support-attachments'" in compact_sql
    assert "drop policy" not in "\n".join(
        line for line in sql.splitlines() if "storage.objects" in line
    )


def test_rollback_guidance_is_non_destructive_and_keeps_owner_reads_only() -> None:
    sql = _sql()
    rollback_marker = "rollback non destructif"

    assert rollback_marker in sql
    rollback = sql.split(rollback_marker, maxsplit=1)[1]
    assert "drop table" not in rollback
    assert "drop column" not in rollback
    assert "delete from" not in rollback
    assert "for all to authenticated" not in rollback
    assert "conserver la policy select" in rollback
