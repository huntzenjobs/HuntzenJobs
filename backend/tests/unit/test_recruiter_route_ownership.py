"""Contrôles d'accès des demandes de consultation recruteur."""

from dataclasses import dataclass
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import stripe
from fastapi import HTTPException

from src.api.routes import recruiter as recruiter_routes


@dataclass
class _Response:
    data: object


class _OwnedQuery:
    def __init__(self, owner_id: str):
        self.owner_id = owner_id
        self.filters: dict[str, str] = {}

    def select(self, *_args):
        return self

    def eq(self, key: str, value: str):
        self.filters[key] = value
        return self

    def execute(self):
        if self.filters.get("user_id") != self.owner_id:
            return _Response([])
        return _Response(
            [
                {
                    "id": "request_test",
                    "user_id": self.owner_id,
                    "email": "owner@example.test",
                    "payment_status": "pending",
                    "status": "new",
                    "created_at": "2026-08-10T12:00:00Z",
                }
            ]
        )


class _OwnedSupabase:
    def __init__(self, owner_id: str):
        self.query = _OwnedQuery(owner_id)

    def table(self, table_name: str):
        assert table_name == "recruiter_requests"
        return self.query


@pytest.mark.asyncio
async def test_create_payment_cannot_access_another_users_request(monkeypatch):
    fake_supabase = _OwnedSupabase("owner_user")
    stripe_create = Mock()
    monkeypatch.setattr(recruiter_routes, "supabase", fake_supabase)
    monkeypatch.setattr(
        recruiter_routes,
        "get_user_id_from_header",
        Mock(return_value="other_user"),
    )
    monkeypatch.setattr(
        recruiter_routes.stripe.checkout.Session,
        "create",
        stripe_create,
    )

    with pytest.raises(HTTPException) as exc_info:
        await recruiter_routes.create_payment_session(
            recruiter_routes.PaymentSessionCreate(request_id="request_test"),
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 404
    assert fake_supabase.query.filters["user_id"] == "other_user"
    stripe_create.assert_not_called()


@pytest.mark.asyncio
async def test_status_cannot_access_another_users_request(monkeypatch):
    fake_supabase = _OwnedSupabase("owner_user")
    monkeypatch.setattr(recruiter_routes, "supabase", fake_supabase)
    monkeypatch.setattr(
        recruiter_routes,
        "get_user_id_from_header",
        Mock(return_value="other_user"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await recruiter_routes.get_request_status(
            "request_test",
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 404
    assert fake_supabase.query.filters["user_id"] == "other_user"


@pytest.mark.asyncio
async def test_recruiter_routes_require_authentication(monkeypatch):
    monkeypatch.setattr(
        recruiter_routes,
        "get_user_id_from_header",
        Mock(return_value=None),
    )

    with pytest.raises(HTTPException) as exc_info:
        await recruiter_routes.create_payment_session(
            recruiter_routes.PaymentSessionCreate(request_id="request_test"),
            authorization=None,
        )

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_create_payment_reuses_open_checkout_session(monkeypatch):
    class _Query:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def execute(self):
            return _Response(
                [
                    {
                        "id": "request_test",
                        "user_id": "owner_user",
                        "email": "owner@example.test",
                        "payment_status": "pending",
                        "stripe_checkout_session_id": "cs_existing",
                    }
                ]
            )

    class _Supabase:
        def table(self, table_name: str):
            assert table_name == "recruiter_requests"
            return _Query()

    create = Mock()
    monkeypatch.setattr(recruiter_routes, "supabase", _Supabase())
    monkeypatch.setattr(
        recruiter_routes,
        "get_user_id_from_header",
        Mock(return_value="owner_user"),
    )
    monkeypatch.setattr(
        recruiter_routes.stripe.checkout.Session,
        "retrieve",
        Mock(
            return_value=SimpleNamespace(
                id="cs_existing",
                status="open",
                url="https://checkout.stripe.test/existing",
            )
        ),
    )
    monkeypatch.setattr(
        recruiter_routes.stripe.checkout.Session,
        "create",
        create,
    )

    result = await recruiter_routes.create_payment_session(
        recruiter_routes.PaymentSessionCreate(request_id="request_test"),
        authorization="Bearer token",
    )

    assert result.session_id == "cs_existing"
    assert result.checkout_url == "https://checkout.stripe.test/existing"
    create.assert_not_called()


@pytest.mark.asyncio
async def test_create_payment_uses_stable_idempotency_key(monkeypatch):
    class _Query:
        def __init__(self):
            self.operation = "select"

        def select(self, *_args):
            self.operation = "select"
            return self

        def update(self, *_args):
            self.operation = "update"
            return self

        def eq(self, *_args):
            return self

        def execute(self):
            if self.operation == "update":
                return _Response([{"id": "request_test"}])
            return _Response(
                [
                    {
                        "id": "request_test",
                        "user_id": "owner_user",
                        "email": "owner@example.test",
                        "payment_status": "pending",
                        "stripe_checkout_session_id": None,
                    }
                ]
            )

    class _Supabase:
        def table(self, table_name: str):
            assert table_name == "recruiter_requests"
            return _Query()

    create = Mock(
        return_value=SimpleNamespace(
            id="cs_new",
            url="https://checkout.stripe.test/new",
        )
    )
    monkeypatch.setattr(recruiter_routes, "supabase", _Supabase())
    monkeypatch.setattr(
        recruiter_routes,
        "get_user_id_from_header",
        Mock(return_value="owner_user"),
    )
    monkeypatch.setattr(
        recruiter_routes.stripe.checkout.Session,
        "create",
        create,
    )

    await recruiter_routes.create_payment_session(
        recruiter_routes.PaymentSessionCreate(request_id="request_test"),
        authorization="Bearer token",
    )

    assert create.call_args.kwargs["idempotency_key"] == (
        "recruiter-checkout:request_test"
    )


@pytest.mark.asyncio
async def test_create_payment_does_not_replace_session_on_ambiguous_stripe_error(
    monkeypatch,
):
    class _Query:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def execute(self):
            return _Response(
                [
                    {
                        "id": "request_test",
                        "user_id": "owner_user",
                        "email": "owner@example.test",
                        "payment_status": "pending",
                        "stripe_checkout_session_id": "cs_existing",
                    }
                ]
            )

    class _Supabase:
        def table(self, table_name: str):
            assert table_name == "recruiter_requests"
            return _Query()

    create = Mock()
    monkeypatch.setattr(recruiter_routes, "supabase", _Supabase())
    monkeypatch.setattr(
        recruiter_routes,
        "get_user_id_from_header",
        Mock(return_value="owner_user"),
    )
    monkeypatch.setattr(
        recruiter_routes.stripe.checkout.Session,
        "retrieve",
        Mock(side_effect=stripe.error.APIConnectionError("network timeout")),
    )
    monkeypatch.setattr(
        recruiter_routes.stripe.checkout.Session,
        "create",
        create,
    )

    with pytest.raises(HTTPException) as exc_info:
        await recruiter_routes.create_payment_session(
            recruiter_routes.PaymentSessionCreate(request_id="request_test"),
            authorization="Bearer token",
        )

    assert exc_info.value.status_code == 502
    create.assert_not_called()
