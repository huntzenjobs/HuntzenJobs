"""Sécurité du rendu HTML des e-mails recruteur."""

from unittest.mock import Mock

from src.services import email as email_service


def test_recruiter_admin_email_escapes_user_fields(monkeypatch):
    send = Mock(return_value={"id": "email_test"})
    monkeypatch.setattr(email_service.resend.Emails, "send", send)

    result = email_service.send_recruiter_request_notification(
        request_id="request_test",
        full_name='<img src=x onerror="alert(1)">',
        email='client@example.test" onclick="alert(1)',
        phone="<script>alert(1)</script>",
        sector="Data & IA",
        experience_level="<b>Senior</b>",
        message="<script>document.cookie</script>",
        preferred_date="<svg/onload=alert(1)>",
        idempotency_key="event:test",
    )

    assert result is True
    html = send.call_args.args[0]["html"]
    assert "<script>" not in html
    assert "<img src=x" not in html
    assert "<svg/onload" not in html
    assert "&lt;script&gt;document.cookie&lt;/script&gt;" in html
    assert "Data &amp; IA" in html


def test_recruiter_confirmation_escapes_user_fields(monkeypatch):
    send = Mock(return_value={"id": "email_test"})
    monkeypatch.setattr(email_service.resend.Emails, "send", send)

    result = email_service.send_recruiter_request_confirmation(
        to_email="client@example.test",
        full_name="<b>Client</b>",
        sector="Data & IA",
        experience_level='<img src=x onerror="alert(1)">',
        preferred_date="<script>alert(1)</script>",
        idempotency_key="event:test",
    )

    assert result is True
    html = send.call_args.args[0]["html"]
    assert "<script>alert(1)</script>" not in html
    assert "<img src=x" not in html
    assert "&lt;b&gt;Client&lt;/b&gt;" in html
