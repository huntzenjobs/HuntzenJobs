from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20260911122053_disable_unavailable_interview_simulator_entitlement.sql"
)


def test_paid_plans_no_longer_grant_the_unavailable_interview_simulator() -> None:
    sql = MIGRATION.read_text()

    assert "has_interview_sim" in sql
    assert "'false'::jsonb" in sql
    assert "LEFT JOIN LATERAL" in sql
    assert "WHERE name IN ('pro', 'premium')" in sql
