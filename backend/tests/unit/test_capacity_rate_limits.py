"""Contrats de sécurité des appels de fond utilisés par le dashboard."""

from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MIDDLEWARE = BACKEND_ROOT / "src" / "api" / "middleware.py"
AUTH_ROUTE = BACKEND_ROOT / "src" / "api" / "routes" / "auth.py"
PRESENCE_ROUTE = BACKEND_ROOT / "src" / "api" / "routes" / "presence.py"


def test_auth_rate_limit_combines_coarse_ip_and_validated_user_guards() -> None:
    """Les faux Bearer restent par IP, les JWT signés sont isolés par utilisateur."""
    middleware = MIDDLEWARE.read_text(encoding="utf-8")
    auth_route = AUTH_ROUTE.read_text(encoding="utf-8")

    assert "def get_verified_supabase_user_rate_limit_key(request: Request) -> str:" in middleware
    assert 'algorithm not in {"ES256", "RS256"}' in middleware
    assert "jwks_client.get_signing_keys(refresh=False)" in middleware
    assert "jwt.decode(" in middleware
    assert "return get_remote_address(request)" in middleware
    assert (
        '@limiter.limit("60/minute", key_func=get_verified_supabase_user_rate_limit_key)'
        in auth_route
    )
    assert 'rate_key = f"ratelimit:auth_me:user:{user_id}"' in auth_route
    assert "request_count = await redis.incr(rate_key)" in auth_route
    assert "request_count > AUTH_ME_USER_LIMIT" in auth_route
    assert 'headers={"Retry-After": str(AUTH_ME_USER_WINDOW_SECONDS)}' in auth_route


def test_presence_dimensions_and_liveness_window_are_bounded() -> None:
    presence_route = PRESENCE_ROUTE.read_text(encoding="utf-8")

    assert "page: Literal[" in presence_route
    assert 'feature: Literal["coach", "cv_analysis", "job_scout"] | None' in presence_route
    assert presence_route.count("expire_at = now - 120") == 2
    assert "await redis.expire(page_key, 180)" in presence_route
    assert 'return {"ok": True, "recorded": False, "reason": "rate_limited"}' in presence_route
    assert 'return {"ok": True, "recorded": True}' in presence_route
