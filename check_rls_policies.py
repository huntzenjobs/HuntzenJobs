"""
Script pour vérifier les RLS policies directement dans Supabase
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from supabase import create_client
from src.config.settings import get_settings

settings = get_settings()

# Create Supabase client with service role
supabase = create_client(
    settings.supabase_url,
    settings.get_supabase_service_role_key()
)

print("=" * 80)
print("AUDIT RLS POLICIES - SUPABASE")
print("=" * 80)

# Query all RLS policies on profiles table
query = """
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'user_subscriptions', 'usage_quotas')
ORDER BY tablename, cmd, policyname;
"""

try:
    # Execute raw SQL query
    result = supabase.rpc('exec_sql', {'query': query}).execute()

    if result.data:
        print(f"\n✅ Found {len(result.data)} RLS policies\n")

        current_table = None
        for policy in result.data:
            if policy['tablename'] != current_table:
                current_table = policy['tablename']
                print(f"\n{'='*80}")
                print(f"TABLE: {policy['tablename']}")
                print(f"{'='*80}")

            print(f"\nPolicy: {policy['policyname']}")
            print(f"  Command: {policy['cmd']}")
            print(f"  Roles: {policy['roles']}")
            print(f"  USING: {policy['qual']}")
            if policy['with_check']:
                print(f"  WITH CHECK: {policy['with_check']}")
    else:
        print("\n⚠️ No policies found or query failed")

except Exception as e:
    print(f"\n❌ Error querying policies: {e}")
    print("\nTrying alternative method...")

    # Alternative: Query pg_catalog directly
    try:
        query2 = """
        SELECT
            polname as policy_name,
            polcmd as command,
            polroles::regrole[] as roles
        FROM pg_policy
        WHERE polrelid = 'public.profiles'::regclass;
        """

        result2 = supabase.rpc('exec_sql', {'query': query2}).execute()
        print(f"\nAlternative query result: {result2}")

    except Exception as e2:
        print(f"Alternative query also failed: {e2}")

print("\n" + "=" * 80)
print("END AUDIT")
print("=" * 80)
