"""Régressions sur la résolution des droits de fonctionnalités."""

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from src.api import deps
from src.api.routes import branding


class _QueryResult:
    def __init__(self, data: dict | None) -> None:
        self.data = data


class _FeatureFlagQuery:
    def __init__(self, table_name: str) -> None:
        self.table_name = table_name

    def select(self, _columns: str) -> "_FeatureFlagQuery":
        return self

    def eq(self, _column: str, _value: str) -> "_FeatureFlagQuery":
        return self

    def maybe_single(self) -> "_FeatureFlagQuery":
        return self

    def execute(self) -> _QueryResult:
        if self.table_name == "user_subscriptions":
            return _QueryResult(
                {"subscription_plans": {"feature_flags": {"has_interview_sim": True}}}
            )
        return _QueryResult(None)


class _FeatureFlagSupabase:
    def table(self, table_name: str) -> _FeatureFlagQuery:
        return _FeatureFlagQuery(table_name)


@pytest.mark.parametrize(
    ("feature", "expected"),
    [
        ("interview_sim", "has_interview_sim"),
        ("pdf_export", "has_pdf_export"),
        ("visual_score", "has_visual_score"),
        ("advanced_filters", "has_advanced_filters"),
        ("favorites", "has_favorites"),
        ("cv_history", "has_cv_history"),
        ("email_alerts", "has_email_alerts"),
        ("personalized_advice", "has_personalized_advice"),
        ("coach_history", "has_coach_history"),
    ],
)
def test_canonical_feature_flag_maps_historical_names(feature: str, expected: str) -> None:
    assert deps._canonical_feature_flag(feature) == expected


def test_canonical_feature_flag_keeps_unknown_name() -> None:
    assert deps._canonical_feature_flag("future_feature") == "future_feature"


@pytest.mark.asyncio
async def test_check_feature_flag_reads_canonical_plan_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deps, "get_supabase_client", _FeatureFlagSupabase)

    assert await deps.check_feature_flag("user-123", "interview_sim") is True


def test_sync_feature_flag_check_reads_canonical_plan_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deps, "get_supabase_client", _FeatureFlagSupabase)

    try:
        deps._require_feature_flag_sync("user-123", "interview_sim")
    except HTTPException as error:
        pytest.fail(f"Le plan autorisé a été refusé: {error.detail}")


@pytest.mark.asyncio
async def test_branding_chat_is_available_to_authenticated_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        branding,
        "_require_feature_flag_sync",
        lambda *_args, **_kwargs: pytest.fail("Branding ne doit pas dépendre d'un plan premium"),
        raising=False,
    )
    monkeypatch.setattr(branding, "get_session_history", lambda _session_id, **_kwargs: [])
    monkeypatch.setattr(branding, "update_session_history", lambda *_args, **_kwargs: None)
    agent = AsyncMock()
    agent.run.return_value = {
        "success": True,
        "response": "Commençons par vos objectifs.",
        "language": "fr",
        "branding_state": {"step": "onboarding"},
    }
    request = Request({"type": "http", "method": "POST", "path": "/api/branding/chat"})

    response = await branding.branding_chat(
        request=request,
        data=branding.BrandingRequest(
            message="Je veux travailler mon profil LinkedIn.",
            session_id="12345678-1234-1234-1234-123456789abc",
        ),
        agent=agent,
        current_user={"id": "user-123"},
    )

    assert response.success is True
    assert response.response == "Commençons par vos objectifs."
