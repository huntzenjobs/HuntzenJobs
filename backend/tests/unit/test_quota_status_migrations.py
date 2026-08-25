"""Invariants SQL de la RPC qui alimente les compteurs de quotas."""

import re
from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260824153927_restore_recruiter_search_quota_status.sql"
)


def test_latest_quota_status_rpc_exposes_recruiter_search_securely() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "select 'recruiter_search', 'recruiter_searches_per_day'" in sql
    assert "u.recruiter_searches_used" in sql
    assert "select 'job_view', 'job_views'" in sql
    assert "u.job_views_used" in sql
    assert "us.status in ('active', 'trialing', 'past_due')" in sql
    assert "us.current_period_end is null or us.current_period_end > now()" in sql
    assert "case us.status" in sql
    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "revoke all on function public.get_quota_status(uuid)" in sql
    assert "grant execute on function public.get_quota_status(uuid) to service_role" in sql
    assert "to authenticated" not in sql


def test_latest_quota_status_rpc_returns_every_supported_feature_once() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    mapped_features = re.findall(r"select '([a-z_]+)'(?: as feature_name)?,", sql)

    assert mapped_features == [
        "job_search",
        "job_view",
        "ats_score",
        "matching_score",
        "assistant_messages",
        "cv_adapt",
        "cover_letter",
        "recruiter_search",
        "saved_jobs",
    ]
