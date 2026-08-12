"""Invariants SQL du parcours d'inscription Supabase Auth."""

from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "supabase" / "migrations"


def test_legacy_free_plan_signup_trigger_is_removed_by_forward_migration():
    """Un seul trigger doit initialiser profil, abonnement et quotas."""
    migrations = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(MIGRATIONS_DIR.glob("*.sql"))
    ).lower()

    create_position = migrations.rfind(
        "create trigger trigger_assign_free_plan_new_user"
    )
    drop_position = migrations.rfind(
        "drop trigger if exists trigger_assign_free_plan_new_user on auth.users"
    )

    assert create_position >= 0
    assert drop_position > create_position
