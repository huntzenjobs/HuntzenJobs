from typing import Any

from src.services import email as email_service


def test_staging_redirige_tout_email_vers_le_sink_resend(monkeypatch) -> None:
    sent: list[dict[str, Any]] = []

    monkeypatch.setattr(email_service.settings, "environment", "staging")
    monkeypatch.setattr(
        email_service.resend.Emails,
        "send",
        lambda params, *args: sent.append(params) or {"id": "email_test"},
    )

    assert email_service.send_payment_failed_email("cliente@example.com") is True
    assert sent[0]["to"] == ["delivered@resend.dev"]
    assert "cliente@example.com" not in sent[0]["to"]


def test_production_conserve_le_destinataire_reel(monkeypatch) -> None:
    sent: list[dict[str, Any]] = []

    monkeypatch.setattr(email_service.settings, "environment", "production")
    monkeypatch.setattr(
        email_service.resend.Emails,
        "send",
        lambda params, *args: sent.append(params) or {"id": "email_live"},
    )

    assert email_service.send_payment_failed_email("cliente@example.com") is True
    assert sent[0]["to"] == ["cliente@example.com"]
