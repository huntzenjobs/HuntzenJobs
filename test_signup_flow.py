"""
Test du flow signup pour identifier le problème RLS
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from supabase import create_client
from src.config.settings import get_settings

settings = get_settings()

# Client avec SERVICE_ROLE (bypass RLS)
supabase_service = create_client(
    settings.supabase_url,
    settings.get_supabase_service_role_key()
)

# Client avec ANON key (respects RLS)
supabase_anon = create_client(
    settings.supabase_url,
    settings.get_supabase_key()
)

print("=" * 80)
print("TEST SIGNUP FLOW - Diagnostic RLS")
print("=" * 80)

# Test 1: Vérifier si RLS est activé sur profiles
print("\n1️⃣ Vérification RLS sur table profiles...")
try:
    # Query using service role
    result = supabase_service.table("profiles").select("id").limit(1).execute()
    print(f"✅ Service role peut lire profiles (RLS bypassed)")
except Exception as e:
    print(f"❌ Erreur service role: {e}")

try:
    # Query using anon key (should fail if RLS is enabled and no public policy)
    result = supabase_anon.table("profiles").select("id").limit(1).execute()
    if result.data:
        print(f"⚠️ Anon key peut lire profiles - RLS trop permissif ou désactivé!")
    else:
        print(f"✅ Anon key ne peut pas lire profiles (RLS actif)")
except Exception as e:
    print(f"✅ Anon key bloqué par RLS: {e}")

# Test 2: Vérifier le trigger handle_new_user
print("\n2️⃣ Vérification du trigger handle_new_user...")
try:
    query = """
    SELECT
        tgname,
        tgenabled,
        proname as function_name
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE tgname = 'on_auth_user_created';
    """

    # Use service role to query system tables
    result = supabase_service.rpc('get_trigger_info').execute()
    print(f"Result: {result}")
except Exception as e:
    print(f"⚠️ Impossible de vérifier le trigger via RPC: {e}")
    print("   → Vérification manuelle requise dans Supabase Dashboard")

# Test 3: Simuler l'insertion d'un profile (comme le ferait le trigger)
print("\n3️⃣ Test insertion profile avec service role (simulation trigger)...")
test_user_id = str(uuid.uuid4())
test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"

try:
    result = supabase_service.table("profiles").insert({
        "id": test_user_id,
        "email": test_email,
        "full_name": "Test User",
        "subscription_tier": "free",
        "cv_analyses_used": 0,
        "cv_analyses_limit": 1,
        "coach_messages_used": 0,
        "coach_messages_limit": 5,
        "job_searches_used": 0,
        "job_searches_limit": 10
    }).execute()

    print(f"✅ Insertion profile réussie avec service role")
    print(f"   → Test user ID: {test_user_id}")

    # Cleanup
    supabase_service.table("profiles").delete().eq("id", test_user_id).execute()
    print(f"✅ Test profile supprimé")

except Exception as e:
    print(f"❌ Erreur insertion: {e}")
    print("   → Le trigger handle_new_user() pourrait échouer!")

# Test 4: Vérifier les user_subscriptions et usage_quotas
print("\n4️⃣ Vérification des tables subscription...")
for table in ["user_subscriptions", "usage_quotas", "subscription_plans"]:
    try:
        result = supabase_service.table(table).select("*").limit(1).execute()
        print(f"✅ Table {table} accessible")
    except Exception as e:
        print(f"❌ Table {table} erreur: {e}")

print("\n" + "=" * 80)
print("RÉSUMÉ DU DIAGNOSTIC")
print("=" * 80)
print("\n📋 Actions à vérifier dans Supabase Dashboard:")
print("   1. Authentication → Triggers → Vérifier 'on_auth_user_created' actif")
print("   2. Database → profiles → RLS Policies → Vérifier policies existantes")
print("   3. SQL Editor → Exécuter: SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';")
print("\n")
