"""Régressions du parcours de suppression de compte payant."""

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

# Le routeur FastAPI charge le générateur PDF au moment de l'import. Ce test ne
# dépend pas du rendu PDF et doit rester exécutable sans bibliothèques natives.
_weasyprint = ModuleType("weasyprint")
_weasyprint.HTML = object
_weasyprint_fonts = ModuleType("weasyprint.text.fonts")
_weasyprint_fonts.FontConfiguration = object
sys.modules["weasyprint"] = _weasyprint
sys.modules["weasyprint.text"] = ModuleType("weasyprint.text")
sys.modules["weasyprint.text.fonts"] = _weasyprint_fonts

from src.api.routes import account  # noqa: E402


class _Query:
    def __init__(self, database: "_Database", table_name: str):
        self.database = database
        self.table_name = table_name
        self.operation = "select"

    def select(self, *_args: object) -> "_Query":
        self.operation = "select"
        return self

    def update(self, _payload: dict[str, object]) -> "_Query":
        self.operation = "update"
        return self

    def delete(self) -> "_Query":
        self.operation = "delete"
        return self

    def eq(self, *_args: object) -> "_Query":
        return self

    def in_(self, *_args: object) -> "_Query":
        return self

    def execute(self) -> SimpleNamespace:
        self.database.operations.append((self.table_name, self.operation))
        if self.table_name == "user_subscriptions" and self.operation == "select":
            return SimpleNamespace(
                data=[{"stripe_subscription_id": "sub_test_paid", "status": "active"}]
            )
        return SimpleNamespace(data=[])


class _Database:
    def __init__(self) -> None:
        self.operations: list[tuple[str, str]] = []
        self.auth = SimpleNamespace(admin=SimpleNamespace(delete_user=Mock()))

    def table(self, table_name: str) -> _Query:
        return _Query(self, table_name)


@pytest.mark.asyncio
async def test_account_deletion_preserves_local_data_when_stripe_cancel_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un abonnement facturable ne doit jamais survivre sans compte local."""
    database = _Database()
    monkeypatch.setattr(
        account,
        "get_user_info_from_token",
        Mock(return_value={"id": "user_test", "email": "client@example.test"}),
    )
    monkeypatch.setattr(account, "get_supabase_client", Mock(return_value=database))
    monkeypatch.setattr(
        account,
        "get_settings",
        Mock(return_value=SimpleNamespace(get_stripe_secret_key=lambda: "sk_test")),
    )
    monkeypatch.setattr(
        account.stripe_lib.Subscription,
        "modify",
        Mock(side_effect=RuntimeError("Stripe unavailable")),
    )

    with pytest.raises(HTTPException) as exc_info:
        await account.delete_account(
            request=Request(
                {
                    "type": "http",
                    "method": "DELETE",
                    "path": "/api/account/delete",
                    "headers": [],
                    "client": ("127.0.0.1", 12345),
                }
            ),
            payload=account.DeleteAccountRequest(confirm=True),
            authorization="Bearer test",
        )

    assert exc_info.value.status_code == 502
    assert database.operations == [("user_subscriptions", "select")]
    database.auth.admin.delete_user.assert_not_called()
