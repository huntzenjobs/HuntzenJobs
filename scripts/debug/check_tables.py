#!/usr/bin/env python3
"""Check existing tables in Supabase"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)

        tables = [row[0] for row in cur.fetchall()]

        print(f"📊 Found {len(tables)} tables in public schema:\n")
        for table in tables:
            print(f"  ✓ {table}")

        # Check specific tables we need
        needed_tables = ['cv_analyses', 'coach_conversations', 'coach_conversation_metadata', 'job_searches']
        print(f"\n🔍 Checking required tables:")
        for table in needed_tables:
            exists = table in tables
            status = "✅" if exists else "❌"
            print(f"  {status} {table}")
