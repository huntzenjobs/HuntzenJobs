"""Contrats des écrans administrateur de parrainage."""

from dataclasses import dataclass
from typing import Any
from unittest.mock import Mock

import pytest

from src.api.routes import admin


@dataclass
class _Response:
    data: Any


class _Query:
    def __init__(self, table_name: str) -> None:
        self.table_name = table_name

    def select(self, *_args: object, **_kwargs: object) -> "_Query":
        return self

    def eq(self, *_args: object) -> "_Query":
        return self

    def order(self, *_args: object, **_kwargs: object) -> "_Query":
        return self

    def limit(self, *_args: object) -> "_Query":
        return self

    def in_(self, *_args: object) -> "_Query":
        return self

    def execute(self) -> _Response:
        if self.table_name == "referrals":
            return _Response(
                data=[
                    {
                        "id": "referral-1",
                        "referral_code": "HZN-ABC123",
                        "total_clicks": 4,
                        "total_signups": 2,
                        "total_conversions": 1,
                        "referrer_id": "user-1",
                    }
                ]
            )
        if self.table_name == "profiles":
            return _Response(
                data=[
                    {
                        "id": "user-1",
                        "email": "user@example.com",
                        "full_name": "Utilisateur Test",
                    }
                ]
            )
        if self.table_name == "user_subscriptions":
            return _Response(
                data=[
                    {
                        "user_id": "user-1",
                        "status": "active",
                        "subscription_plans": {"name": "pro"},
                    }
                ]
            )
        if self.table_name == "referral_signups":
            return _Response(data=[])
        raise AssertionError(f"Table inattendue: {self.table_name}")


class _Supabase:
    def table(self, table_name: str) -> _Query:
        return _Query(table_name)


@pytest.mark.asyncio
async def test_referral_leaderboard_reads_plan_from_subscription_relation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le leaderboard doit suivre plan_id au lieu d'une colonne plan_name absente."""
    monkeypatch.setattr(
        admin,
        "get_supabase_client",
        Mock(return_value=_Supabase()),
    )

    result = await admin.get_referral_leaderboard(
        admin={"id": "admin"},
        limit=20,
    )

    assert result["leaderboard"][0]["referrer_plan"] == "pro"

