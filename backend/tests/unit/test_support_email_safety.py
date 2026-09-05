"""Sécurité HTML et idempotence Resend des emails support."""

from typing import Any

from src.services import email as email_service


def test_admin_support_email_escapes_user_values_and_uses_dedupe_key(monkeypatch) -> None:
    sent: list[tuple[dict[str, Any], dict[str, str] | None]] = []
    monkeypatch.setattr(
        email_service,
        "send_email",
        lambda params, options=None: sent.append((params, options)) or {"id": "email"},
    )

    result = email_service.send_support_ticket_notification(
        ticket_id="<ticket>",
        subject="<script>alert(1)</script>",
        category="question",
        priority="normal",
        user_name="<b>Alice</b>",
        user_email='alice@example.test"><img src=x>',
        user_plan="<pro>",
        page_url='"><script>boom</script>',
        description="<svg onload=alert(1)>",
        idempotency_key="support:dedupe-admin",
    )

    assert result is True
    params, options = sent[0]
    assert "<script>" not in params["html"]
    assert "<svg" not in params["html"]
    assert "&lt;script&gt;" in params["html"]
    assert options == {"idempotency_key": "support:dedupe-admin"}


def test_user_support_reply_escapes_content_and_links_existing_profile(monkeypatch) -> None:
    sent: list[tuple[dict[str, Any], dict[str, str] | None]] = []
    monkeypatch.setattr(
        email_service,
        "send_email",
        lambda params, options=None: sent.append((params, options)) or {"id": "email"},
    )

    result = email_service.send_support_ticket_reply(
        user_email="alice@example.test",
        user_name="<Alice>",
        ticket_id="<ticket>",
        ticket_subject="<img src=x onerror=alert(1)>",
        admin_reply="<script>alert(1)</script>",
        idempotency_key="support:dedupe-reply",
    )

    assert result is True
    params, options = sent[0]
    assert "<script>" not in params["html"]
    assert "<img src=x" not in params["html"]
    assert "&lt;script&gt;" in params["html"]
    assert "/profile?support=open" in params["html"]
    assert options == {"idempotency_key": "support:dedupe-reply"}
