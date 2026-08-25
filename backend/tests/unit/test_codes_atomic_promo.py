"""Réservation atomique des codes promotionnels."""

from dataclasses import dataclass
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from src.api.routes import codes as codes_routes


@dataclass
class _Response:
    data: object


class _PromoSupabase:
    def __init__(self, response: object):
        self.response = response
        self.rpc_name: str | None = None
        self.rpc_params: dict[str, str] | None = None

    def rpc(self, name: str, params: dict[str, str]):
        self.rpc_name = name
        self.rpc_params = params
        return self

    def execute(self):
        return _Response(self.response)


@pytest.mark.asyncio
async def test_apply_code_claims_promo_atomically(monkeypatch):
    supabase = _PromoSupabase(
        {
            "status": "claimed",
            "promo_id": "promo_test",
            "promo_link_id": "link_test",
            "discount_type": "percent",
            "discount_value": 20,
            "plan": "pro",
        }
    )
    monkeypatch.setattr(codes_routes, "get_supabase_client", Mock(return_value=supabase))
    monkeypatch.setattr(
        codes_routes,
        "get_user_id_from_token",
        Mock(return_value="user_test"),
    )
    invalidate = AsyncMock()
    monkeypatch.setattr(codes_routes, "invalidate_user_quota_cache", invalidate)

    result = await codes_routes.apply_code.__wrapped__(
        request=Mock(),
        body=codes_routes.ApplyCodeRequest(code=" summer20 "),
        authorization="Bearer token",
    )

    assert result["ok"] is True
    assert result["status"] == "pending"
    assert result["applied"] is False
    assert result["promo_link_id"] == "link_test"
    assert supabase.rpc_name == "claim_promo_code"
    assert supabase.rpc_params == {
        "p_user_id": "user_test",
        "p_code": "SUMMER20",
    }
    invalidate.assert_awaited_once_with("user_test")


@pytest.mark.asyncio
async def test_apply_code_reports_free_days_as_queued(monkeypatch):
    """Une récompense outbox ne doit pas être annoncée comme déjà appliquée."""
    supabase = _PromoSupabase(
        {
            "status": "claimed",
            "promo_id": "promo_free_days",
            "promo_link_id": "link_free_days",
            "discount_type": "free_days",
            "discount_value": 7,
            "plan": "pro",
        }
    )
    monkeypatch.setattr(codes_routes, "get_supabase_client", Mock(return_value=supabase))
    monkeypatch.setattr(
        codes_routes,
        "get_user_id_from_token",
        Mock(return_value="user_test"),
    )
    monkeypatch.setattr(
        codes_routes,
        "invalidate_user_quota_cache",
        AsyncMock(),
    )

    result = await codes_routes.apply_code.__wrapped__(
        request=Mock(),
        body=codes_routes.ApplyCodeRequest(code="FREE7"),
        authorization="Bearer token",
    )

    assert result == {
        "ok": True,
        "status": "queued",
        "applied": False,
        "promo_id": "promo_free_days",
        "promo_link_id": "link_free_days",
        "message": "Code promo pris en compte.",
    }


@pytest.mark.asyncio
async def test_apply_code_rejects_already_claimed_promo(monkeypatch):
    supabase = _PromoSupabase({"status": "already_claimed"})
    monkeypatch.setattr(codes_routes, "get_supabase_client", Mock(return_value=supabase))
    monkeypatch.setattr(
        codes_routes,
        "get_user_id_from_token",
        Mock(return_value="user_test"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await codes_routes.apply_code.__wrapped__(
            request=Mock(),
            body=codes_routes.ApplyCodeRequest(code="SUMMER20"),
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_apply_code_rejects_exhausted_promo(monkeypatch):
    supabase = _PromoSupabase({"status": "limit_reached"})
    monkeypatch.setattr(codes_routes, "get_supabase_client", Mock(return_value=supabase))
    monkeypatch.setattr(
        codes_routes,
        "get_user_id_from_token",
        Mock(return_value="user_test"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await codes_routes.apply_code.__wrapped__(
            request=Mock(),
            body=codes_routes.ApplyCodeRequest(code="SUMMER20"),
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 400
    assert "limite" in exc_info.value.detail
