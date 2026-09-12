"""Tests du découpage fiable des campagnes email Resend."""

import pytest
from src.services.bulk_email import (
    build_resend_batches,
    collect_paginated,
    create_preference_token,
    decode_preference_token,
    is_resend_quota_error,
    normalize_sender,
    render_campaign_email,
    send_resend_batches,
)


class FakeResendError(Exception):
    def __init__(self, error_type: str, message: str) -> None:
        super().__init__(message)
        self.error_type = error_type


def test_only_explicit_resend_quota_errors_are_deferred() -> None:
    assert is_resend_quota_error(
        FakeResendError("daily_quota_exceeded", "Daily quota reached")
    )
    assert is_resend_quota_error(
        FakeResendError("monthly_quota_exceeded", "Monthly quota reached")
    )
    assert not is_resend_quota_error(
        FakeResendError("rate_limit_exceeded", "Too many requests")
    )


def test_build_resend_batches_sends_every_unique_recipient() -> None:
    recipients = [f"personne-{index}@example.com" for index in range(205)]
    recipients += ["PERSONNE-0@example.com", " personne-1@example.com "]

    batches = build_resend_batches(
        recipients=recipients,
        sender="HuntzenJobs <bonjour@huntzenjobs.com>",
        subject="Votre prochaine opportunité vous attend",
        html="<p>Bonjour</p>",
    )

    assert [len(batch) for batch in batches] == [100, 100, 5]
    assert sum(len(batch) for batch in batches) == 205
    assert batches[0][0]["to"] == ["personne-0@example.com"]
    assert batches[-1][-1]["to"] == ["personne-204@example.com"]


def test_normalize_sender_preserves_professional_sender() -> None:
    assert normalize_sender("HuntzenJobs <bonjour@huntzenjobs.com>") == (
        "HuntzenJobs <bonjour@huntzenjobs.com>"
    )


def test_normalize_sender_adds_brand_to_plain_address() -> None:
    assert normalize_sender("bonjour@huntzenjobs.com") == (
        "Huntzen <bonjour@huntzenjobs.com>"
    )


@pytest.mark.asyncio
async def test_send_resend_batches_uses_stable_idempotency_keys() -> None:
    calls: list[tuple[list[dict[str, object]], dict[str, str]]] = []

    def fake_batch_sender(
        messages: list[dict[str, object]], options: dict[str, str]
    ) -> dict[str, object]:
        calls.append((messages, options))
        return {"data": [{"id": f"email-{len(calls)}"} for _ in messages]}

    batches = build_resend_batches(
        recipients=[f"personne-{index}@example.com" for index in range(205)],
        sender="bonjour@huntzenjobs.com",
        subject="Votre prochaine opportunité vous attend",
        html="<p>Bonjour</p>",
    )

    result = await send_resend_batches(
        batches=batches,
        campaign_id="reactivation-2026-09",
        batch_sender=fake_batch_sender,
        throttle_seconds=0,
    )

    assert result == {"sent": 205, "batches": 3}
    assert [options["idempotency_key"] for _, options in calls] == [
        "reactivation-2026-09-1",
        "reactivation-2026-09-2",
        "reactivation-2026-09-3",
    ]
    assert all(options["batch_validation"] == "permissive" for _, options in calls)


def test_collect_paginated_does_not_truncate_large_audience() -> None:
    records = [{"email": f"personne-{index}@example.com"} for index in range(1205)]
    requested_ranges: list[tuple[int, int]] = []

    def fetch_page(start: int, end: int) -> list[dict[str, str]]:
        requested_ranges.append((start, end))
        return records[start : end + 1]

    result = collect_paginated(fetch_page, page_size=500)

    assert result == records
    assert requested_ranges == [(0, 499), (500, 999), (1000, 1499)]


def test_service_update_is_relational_and_escapes_profile_data() -> None:
    rendered = render_campaign_email(
        campaign_type="service-update",
        language="fr",
        first_name='<script>alert("x")</script>',
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert rendered["subject"] == (
        "HuntZen a évolué : découvrez votre nouvel espace emploi"
    )
    assert "Choisir mes communications" in rendered["html"]
    assert "Découvrir les abonnements" not in rendered["html"]
    assert "tarif" not in rendered["html"].casefold()
    assert "<script>" not in rendered["html"]
    assert "&lt;script&gt;" in rendered["html"]
    assert rendered["headers"]["List-Unsubscribe-Post"] == (
        "List-Unsubscribe=One-Click"
    )


def test_marketing_template_uses_confirmed_social_proof_without_account_count() -> None:
    rendered = render_campaign_email(
        campaign_type="marketing-reactivation",
        language="fr",
        first_name="Wissem",
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert "Plus de 4 500 personnes" in rendered["html"]
    assert "Découvrir les abonnements" in rendered["html"]
    assert "abonné" not in rendered["html"].casefold()
    assert "inscrit" not in rendered["html"].casefold()


def test_non_french_language_uses_english_template() -> None:
    rendered = render_campaign_email(
        campaign_type="service-update",
        language="es",
        first_name=None,
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert rendered["subject"] == "HuntZen has evolved: discover your new job space"
    assert "Choose my communications" in rendered["html"]


def test_preference_token_is_scoped_and_expires() -> None:
    token = create_preference_token(
        user_id="b6ba55d3-8a75-45b3-94bf-97df74afea91",
        secret="test-secret-with-sufficient-length",
        expires_in_seconds=60,
    )

    claims = decode_preference_token(
        token=token,
        secret="test-secret-with-sufficient-length",
    )
    assert claims["sub"] == "b6ba55d3-8a75-45b3-94bf-97df74afea91"
    assert claims["purpose"] == "email-preferences"

    expired = create_preference_token(
        user_id="b6ba55d3-8a75-45b3-94bf-97df74afea91",
        secret="test-secret-with-sufficient-length",
        expires_in_seconds=-1,
    )
    with pytest.raises(ValueError, match="expired"):
        decode_preference_token(
            token=expired,
            secret="test-secret-with-sufficient-length",
        )
