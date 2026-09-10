from pathlib import Path

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20260910093054_sync_ai_language_and_ats_provenance_guardrails.sql"
)


def test_prompt_migration_is_additive_idempotent_and_self_verifying() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "rtrim(content) ||" in sql
    assert sql.count("[HUNTZEN_ATS_PROVENANCE_V1]") >= 3
    assert sql.count("[HUNTZEN_OUTPUT_LANGUAGE_V1]") >= 3
    assert "position('[HUNTZEN_ATS_PROVENANCE_V1]' IN content) = 0" in sql
    assert "position('[HUNTZEN_OUTPUT_LANGUAGE_V1]' IN content) = 0" in sql
    assert "previous assistant message" in sql
    assert "Every human-readable string value" in sql
    assert "DO $verify$" in sql
