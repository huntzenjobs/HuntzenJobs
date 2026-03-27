#!/usr/bin/env python3
"""
Apply Missing Migrations to Supabase
=====================================

This script applies critical migrations that are missing from Supabase production,
which are causing the "Impossible de récupérer vos informations d'abonnement" error.

Usage:
    python scripts/apply_missing_migrations.py

Requirements:
    - SUPABASE_URL environment variable
    - SUPABASE_SERVICE_ROLE_KEY environment variable
    - supabase-py package: pip install supabase
"""

import os
import sys
from pathlib import Path
from supabase import create_client, Client

# Critical migrations in order
CRITICAL_MIGRATIONS = [
    "20260128000000_subscription_infrastructure.sql",
    "20260128000100_quota_functions.sql",
    "20260210000001_deprecate_profiles_subscription.sql",
    "20260210000002_webhook_idempotency.sql",
    "20260210000003_stripe_price_config.sql",
    "20260211000002_auto_assign_free_plan.sql",
]


def get_supabase_client() -> Client:
    """Get Supabase client with service role key."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        print("\nUsage:")
        print("  export SUPABASE_URL='https://your-project.supabase.co'")
        print("  export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'")
        print("  python scripts/apply_missing_migrations.py")
        sys.exit(1)

    return create_client(url, key)


def check_function_exists(client: Client, function_name: str) -> bool:
    """Check if a PostgreSQL function exists."""
    query = f"""
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name = '{function_name}'
    """

    try:
        result = client.rpc("sql", {"query": query}).execute()
        return len(result.data) > 0
    except Exception as e:
        print(f"⚠️  Warning: Could not check function existence: {e}")
        return False


def run_diagnostic(client: Client) -> dict:
    """Run diagnostic to check missing functions and tables."""
    print("\n" + "="*70)
    print("DIAGNOSTIC: Checking for missing database objects")
    print("="*70 + "\n")

    critical_functions = [
        "get_user_current_subscription",
        "get_quota_status",
        "increment_usage",
        "assign_free_plan_to_new_user",
    ]

    missing_functions = []

    for func in critical_functions:
        exists = check_function_exists(client, func)
        status = "✅ EXISTS" if exists else "❌ MISSING"
        print(f"  {func:40s} {status}")

        if not exists:
            missing_functions.append(func)

    print()

    return {
        "missing_functions": missing_functions,
        "needs_migration": len(missing_functions) > 0
    }


def apply_migration(client: Client, migration_path: Path) -> bool:
    """Apply a single migration file."""
    print(f"\n📄 Applying migration: {migration_path.name}")

    try:
        sql_content = migration_path.read_text(encoding="utf-8")

        # Execute SQL via Supabase PostgREST SQL endpoint
        # Note: This might not work for all SQL statements (DDL)
        # Better to use psycopg2 or apply via Dashboard

        print(f"   SQL content length: {len(sql_content)} characters")
        print(f"   ⚠️  This migration must be applied via Supabase Dashboard SQL Editor")
        print(f"   Dashboard URL: {os.getenv('SUPABASE_URL')}/project/_/sql/new")

        return False  # Return False to indicate manual application needed

    except Exception as e:
        print(f"   ❌ Error reading migration: {e}")
        return False


def main():
    """Main execution function."""
    print("\n" + "="*70)
    print("SUPABASE MISSING MIGRATIONS DIAGNOSTIC & FIX")
    print("="*70)

    # Get Supabase client
    client = get_supabase_client()

    # Run diagnostic
    diagnostic = run_diagnostic(client)

    if not diagnostic["needs_migration"]:
        print("\n✅ All critical functions exist! No migrations needed.")
        return

    print("\n" + "="*70)
    print("SOLUTION: Apply the following migrations manually")
    print("="*70 + "\n")

    migrations_dir = Path(__file__).parent.parent / "supabase" / "migrations"

    print("Go to your Supabase Dashboard SQL Editor:")
    print(f"  {os.getenv('SUPABASE_URL')}/project/_/sql/new\n")
    print("Then copy-paste and execute each migration in this order:\n")

    for i, migration_file in enumerate(CRITICAL_MIGRATIONS, 1):
        migration_path = migrations_dir / migration_file

        if not migration_path.exists():
            print(f"  {i}. ⚠️  {migration_file} (NOT FOUND)")
        else:
            print(f"  {i}. {migration_file}")
            print(f"     Path: {migration_path}")
            print()

    print("\nAfter applying all migrations, run this script again to verify.\n")

    # Check if user wants to see the SQL content
    print("\n" + "="*70)
    print("Would you like to see the SQL for each migration? (y/n)")
    choice = input("> ").strip().lower()

    if choice == "y":
        for migration_file in CRITICAL_MIGRATIONS:
            migration_path = migrations_dir / migration_file

            if migration_path.exists():
                print("\n" + "="*70)
                print(f"MIGRATION: {migration_file}")
                print("="*70)
                print(migration_path.read_text(encoding="utf-8"))
                print("\n" + "="*70)
                input("Press Enter to continue to next migration...")


if __name__ == "__main__":
    main()
