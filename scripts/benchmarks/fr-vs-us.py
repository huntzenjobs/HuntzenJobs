"""
Benchmark FR vs US contre la PROD avec un user temporaire Premium.

Workflow :
1. Crée un user temporaire via auth.admin.create_user
2. Insère une ligne user_subscriptions avec plan Premium (admin_granted, 30j)
3. Signe un JWT pour ce user
4. Lance 6 requêtes /api/jobs/search (3 queries × 2 pays, espacées 7s)
5. Cleanup : delete subscription + delete user (toujours, même si erreur)
"""
import asyncio
import os
import sys
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import jwt
from dotenv import load_dotenv
from supabase import Client, create_client

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env", override=True)

PROD_URL = "https://huntzenjobs-production.up.railway.app"
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]

PREMIUM_PLAN_ID = None  # résolu dynamiquement

QUERIES_BY_COUNTRY = {
    "fr": ["développeur", "responsable marketing", "analyste de données"],
    "us": ["software engineer", "marketing manager", "data analyst"],
}


def get_premium_plan_id(sb: Client) -> str:
    plans = sb.table("subscription_plans").select("id, name").eq("name", "premium").execute()
    if not plans.data:
        raise RuntimeError("Plan Premium introuvable")
    return plans.data[0]["id"]


def create_temp_user(sb: Client) -> tuple[str, str]:
    """Crée un user temp et retourne (user_id, email)."""
    suffix = uuid.uuid4().hex[:8]
    email = f"benchmark-temp-{suffix}@huntzen.test"
    password = uuid.uuid4().hex
    resp = sb.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"benchmark_temp": True, "created_by": "benchmark_script"},
    })
    user = resp.user if hasattr(resp, "user") else resp
    uid = getattr(user, "id", None) or user.get("id")
    return str(uid), email


def grant_premium(sb: Client, user_id: str, plan_id: str) -> str:
    """Insère une subscription Premium pour le user. Retourne sub_id."""
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=30)
    payload = {
        "user_id": user_id,
        "plan_id": plan_id,
        "status": "active",
        "current_period_start": now.isoformat(),
        "current_period_end": end.isoformat(),
        "cancel_at_period_end": False,
        "stripe_subscription_id": "benchmark_temp",
        "stripe_customer_id": None,
    }
    res = sb.table("user_subscriptions").insert(payload).execute()
    return res.data[0]["id"]


def cleanup_user(sb: Client, user_id: str, sub_id: str | None) -> None:
    """Supprime sub + user. Best-effort, log les erreurs."""
    if sub_id:
        try:
            sb.table("user_subscriptions").delete().eq("id", sub_id).execute()
            print(f"  ✓ subscription {sub_id[:8]}... supprimée")
        except Exception as e:
            print(f"  ⚠️  delete subscription échoué: {e}")
    try:
        sb.auth.admin.delete_user(user_id)
        print(f"  ✓ user {user_id[:8]}... supprimé")
    except Exception as e:
        print(f"  ⚠️  delete user échoué: {e}")


def sign_supabase_jwt(user_id: str, email: str, ttl: int = 900) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + ttl,
        "iss": f"{SUPABASE_URL}/auth/v1",
        "user_metadata": {},
        "app_metadata": {"provider": "email", "providers": ["email"]},
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")


async def search_one(client: httpx.AsyncClient, token: str, country: str, query: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    params = {"q": query, "country": country, "limit": 200, "include_remote": "true"}
    r = await client.get(f"{PROD_URL}/api/jobs/search", headers=headers, params=params, timeout=120.0)
    if r.status_code != 200:
        return {"error": f"HTTP {r.status_code}: {r.text[:300]}"}
    data = r.json()
    jobs = data.get("jobs", [])
    metadata = data.get("metadata", {})
    by_source: dict[str, int] = {}
    for j in jobs:
        s = j.get("source", "?")
        by_source[s] = by_source.get(s, 0) + 1
    return {
        "total": len(jobs),
        "by_source": by_source,
        "cached": metadata.get("from_cache", False),
        "metadata": metadata,
    }


async def run_benchmark(token: str) -> list[dict]:
    pairs = list(zip(QUERIES_BY_COUNTRY["fr"], QUERIES_BY_COUNTRY["us"]))
    results = []
    async with httpx.AsyncClient() as client:
        for i, (q_fr, q_us) in enumerate(pairs):
            for c, q in (("fr", q_fr), ("us", q_us)):
                print(f"→ [{c.upper()}] '{q}'...", flush=True)
                try:
                    r = await search_one(client, token, c, q)
                    if "error" in r:
                        print(f"  ✗ {r['error']}", flush=True)
                        results.append({"country": c, "query": q, **r, "total": 0, "by_source": {}})
                    else:
                        cache_tag = " [CACHE]" if r.get("cached") else ""
                        print(f"  ✓ {r['total']} jobs{cache_tag} | {r['by_source']}", flush=True)
                        results.append({"country": c, "query": q, **r})
                except Exception as e:
                    print(f"  ✗ {e}", flush=True)
                    results.append({"country": c, "query": q, "total": 0, "by_source": {}, "error": str(e)})
                if not (i == len(pairs) - 1 and c == "us"):
                    await asyncio.sleep(7)
    return results


def print_report(results: list[dict]) -> None:
    print("\n" + "=" * 95)
    print(f"{'QUERY':<25} {'CTRY':<6} {'TOTAL':<7} {'CACHE':<7} BREAKDOWN")
    print("=" * 95)
    for r in results:
        breakdown = ", ".join(f"{k}={v}" for k, v in sorted(r["by_source"].items()))
        cache = "yes" if r.get("cached") else "no"
        print(f"{r['query']:<25} {r['country'].upper():<6} {r['total']:<7} {cache:<7} {breakdown}")

    ft_total = sum(r["by_source"].get("france_travail", 0) for r in results if r["country"] == "fr")
    print("\n" + "=" * 95)
    print(f"🇫🇷 France Travail (prod) : {ft_total} offres cumulées sur 3 requêtes FR")
    if ft_total == 0:
        print("   ⚠️  France Travail ne répond PAS en prod → vérifier creds Railway")
    else:
        print("   ✓ France Travail OK en prod")

    fr_total = sum(r["total"] for r in results if r["country"] == "fr")
    us_total = sum(r["total"] for r in results if r["country"] == "us")
    print(f"\nFR total : {fr_total}")
    print(f"US total : {us_total}")
    if fr_total > us_total:
        diff = ((fr_total - us_total) / max(us_total, 1)) * 100
        print(f"→ FR a +{fr_total - us_total} offres (+{diff:.0f}%)")
    elif us_total > fr_total:
        diff = ((us_total - fr_total) / max(fr_total, 1)) * 100
        print(f"→ US a +{us_total - fr_total} offres (+{diff:.0f}%)")


async def main():
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    print("→ Résolution plan Premium...")
    plan_id = get_premium_plan_id(sb)
    print(f"  ✓ premium plan_id = {plan_id[:8]}...")

    print("→ Création user temporaire...")
    user_id, email = create_temp_user(sb)
    print(f"  ✓ user créé: {email} (id={user_id[:8]}...)")

    sub_id = None
    try:
        print("→ Grant Premium (30j)...")
        sub_id = grant_premium(sb, user_id, plan_id)
        print(f"  ✓ subscription Premium créée: {sub_id[:8]}...")

        token = sign_supabase_jwt(user_id, email)
        print(f"  ✓ JWT signé\n")

        print("=== BENCHMARK PROD ===\n")
        results = await run_benchmark(token)
        print_report(results)

    finally:
        print("\n=== CLEANUP ===")
        cleanup_user(sb, user_id, sub_id)


if __name__ == "__main__":
    asyncio.run(main())
