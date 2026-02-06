#!/usr/bin/env python3
"""
Apply auth migration to Supabase database
"""
import os
import sys
import psycopg
from pathlib import Path
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Database URL from .env
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ DATABASE_URL not found in .env")
    sys.exit(1)

def apply_migration():
    """Apply the auth setup migration"""
    migration_file = Path("supabase/migrations/20260128000301_setup_auth_adapted.sql")

    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        sys.exit(1)

    print(f"📁 Reading migration: {migration_file}")
    migration_sql = migration_file.read_text()

    print("🔌 Connecting to Supabase...")

    try:
        # Connect to database
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                print("✅ Connected to database")
                print("🚀 Executing migration...")

                # Execute migration
                cur.execute(migration_sql)
                conn.commit()

                print("✅ Migration applied successfully!")

                # Verify profiles table exists
                cur.execute("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'profiles';
                """)

                if cur.fetchone():
                    print("✅ profiles table created")

                    # Check columns
                    cur.execute("""
                        SELECT column_name, data_type
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                        AND table_name = 'profiles'
                        ORDER BY ordinal_position;
                    """)

                    columns = cur.fetchall()
                    print(f"\n📋 Profiles table columns ({len(columns)}):")
                    for col_name, col_type in columns:
                        print(f"  - {col_name}: {col_type}")

                    # Check RLS
                    cur.execute("""
                        SELECT tablename, rowsecurity
                        FROM pg_tables
                        WHERE schemaname = 'public'
                        AND tablename IN ('profiles', 'cv_analyses', 'coach_conversations');
                    """)

                    rls_tables = cur.fetchall()
                    print(f"\n🔒 RLS Status:")
                    for table, rls_enabled in rls_tables:
                        status = "✅ Enabled" if rls_enabled else "❌ Disabled"
                        print(f"  - {table}: {status}")

                else:
                    print("❌ profiles table not found after migration")

    except psycopg.Error as e:
        print(f"\n❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

    print("\n🎉 Auth system setup complete!")
    print("\n📝 Next steps:")
    print("  1. Enable Email provider in Supabase Dashboard")
    print("  2. Create backend auth endpoints (SA-2)")
    print("  3. Create frontend auth UI (SA-3)")


if __name__ == "__main__":
    apply_migration()
