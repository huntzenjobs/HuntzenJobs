from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
MIGRATION = (
    REPOSITORY_ROOT
    / "supabase"
    / "migrations"
    / "20260831180900_atomic_support_ticket_rate_limit.sql"
)


def _compact_sql() -> str:
    return " ".join(MIGRATION.read_text(encoding="utf-8").lower().split())


def test_rate_limit_is_enforced_inside_the_transactional_creation_rpc() -> None:
    sql = _compact_sql()

    assert "create or replace function public.create_support_ticket_idempotent" in sql
    assert "pg_catalog.pg_advisory_xact_lock" in sql
    assert "pg_catalog.hashtextextended(p_user_id::text, 0)" in sql
    assert "interval '1 hour'" in sql
    assert "recent_ticket_count >= 5" in sql
    assert "support_ticket_rate_limit_exceeded" in sql


def test_idempotent_replay_is_checked_before_consuming_the_hourly_limit() -> None:
    sql = _compact_sql()
    replay_lookup = sql.index("where existing_ticket.request_id = p_request_id")
    rate_count = sql.index("select pg_catalog.count(*)")

    assert replay_lookup < rate_count
    assert "return ticket;" in sql[replay_lookup:rate_count]


def test_follow_up_migration_is_non_destructive_and_preserves_acl() -> None:
    sql = _compact_sql()

    assert "delete from public.support_tickets" not in sql
    assert "drop table" not in sql
    assert "grant execute on function public.create_support_ticket_idempotent" in sql
    assert "revoke all on function public.create_support_ticket_idempotent" in sql
