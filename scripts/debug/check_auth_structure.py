#!/usr/bin/env python3
"""Check existing auth structure"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        # Check user_subscriptions structure
        print("📋 user_subscriptions table:")
        cur.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'user_subscriptions'
            ORDER BY ordinal_position;
        """)
        for col in cur.fetchall():
            print(f"  - {col[0]}: {col[1]} ({col[2]})")

        print("\n📋 usage_quotas table:")
        cur.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'usage_quotas'
            ORDER BY ordinal_position;
        """)
        for col in cur.fetchall():
            print(f"  - {col[0]}: {col[1]} ({col[2]})")

        print("\n📋 subscription_plans table:")
        cur.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'subscription_plans'
            ORDER BY ordinal_position;
        """)
        for col in cur.fetchall():
            print(f"  - {col[0]}: {col[1]} ({col[2]})")

        # Check if profiles table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'profiles'
            );
        """)
        profiles_exists = cur.fetchone()[0]
        print(f"\n🔍 profiles table exists: {profiles_exists}")

        # Check RLS status
        print("\n🔒 RLS Status:")
        cur.execute("""
            SELECT tablename, rowsecurity
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        """)
        for table, rls in cur.fetchall():
            status = "✅ Enabled" if rls else "❌ Disabled"
            print(f"  {table}: {status}")
