from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260910093108_extend_atomic_quota_reservations.sql"
)


def test_migration_extends_atomic_reservations_to_ats_and_matching():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "'ats_score'" in sql
    assert "'matching_score'" in sql
    assert "ats_scores_per_day" in sql
    assert "matching_scores_per_day" in sql
    assert "ats_scores_used" in sql
    assert "matching_scores_used" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "resource_id" in sql
    assert "drop constraint if exists ai_quota_reservations_feature_check" in sql
    assert "add constraint ai_quota_reservations_feature_check" in sql
    assert "feature in ('cv_adapt', 'cover_letter', 'ats_score', 'matching_score')" in sql
    assert "unique index" in sql
    assert "bind_ai_quota_reservation" in sql
    assert "to service_role" in sql
