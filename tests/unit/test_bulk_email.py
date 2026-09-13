"""Tests du découpage fiable des campagnes email Resend."""

import pytest
from src.services.bulk_email import (
    CAMPAIGN_TEMPLATE_VERSIONS,
    build_resend_batches,
    campaign_content_hash,
    collect_paginated,
    create_preference_token,
    decode_preference_token,
    default_campaign_editor_content,
    default_campaign_html_template,
    is_resend_quota_error,
    normalize_sender,
    render_campaign_email,
    render_editable_campaign_email,
    send_resend_batches,
    validate_campaign_html,
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
        "HuntzenJobs <bonjour@huntzenjobs.com>"
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
    assert 'src="https://huntzenjobs.com/logo.png"' in rendered["html"]
    assert "Choisir mes communications" not in rendered["html"]
    assert "Se désabonner" in rendered["html"]
    assert 'href="https://huntzenjobs.com/api/marketing/preferences?token=signed-token"' in rendered["html"]
    assert rendered["headers"]["List-Unsubscribe"] == (
        "<https://huntzenjobs.com/api/marketing/unsubscribe?token=signed-token>"
    )
    assert "Découvrir les abonnements" not in rendered["html"]
    assert "tarif" not in rendered["html"].casefold()
    assert "<script>" not in rendered["html"]
    assert "&lt;script&gt;" in rendered["html"]
    assert rendered["headers"]["List-Unsubscribe-Post"] == (
        "List-Unsubscribe=One-Click"
    )


def test_marketing_template_promotes_subscriptions_without_unverified_count() -> None:
    rendered = render_campaign_email(
        campaign_type="marketing-reactivation",
        language="fr",
        first_name="Wissem",
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert "Découvrir les abonnements" in rendered["html"]
    assert "4 500" not in rendered["html"]
    assert "abonné" not in rendered["html"].casefold()
    assert "inscrit" not in rendered["html"].casefold()


def test_all_active_campaign_uses_the_validated_marketing_template() -> None:
    rendered = render_campaign_email(
        campaign_type="marketing-reactivation-all",
        language="fr",
        first_name="Wissem",
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert rendered["subject"] == "Votre prochaine opportunité vous attend sur HuntZen"
    assert "Découvrir les abonnements" in rendered["html"]
    assert "4 500" not in rendered["html"]


def test_non_french_language_uses_english_template() -> None:
    rendered = render_campaign_email(
        campaign_type="service-update",
        language="es",
        first_name=None,
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert rendered["subject"] == "HuntZen has evolved: discover your new job space"
    assert "Choose my communications" not in rendered["html"]
    assert "Unsubscribe" in rendered["html"]


def test_simple_editor_keeps_the_branded_layout_and_escapes_content() -> None:
    rendered = render_editable_campaign_email(
        campaign_type="marketing-reactivation-all",
        editor_mode="simple",
        subject="Revenez sur HuntzenJobs",
        content='Une nouveauté <script>alert("x")</script>\nUn second paragraphe.',
        language="fr",
        first_name="Wissem",
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert rendered["subject"] == "Revenez sur HuntzenJobs"
    assert "HuntzenJobs" in rendered["html"]
    assert "&lt;script&gt;" in rendered["html"]
    assert "<script>" not in rendered["html"]
    assert ">Accéder à mon espace</a>" in rendered["html"]
    assert "signed-token" in rendered["html"]


def test_new_marketing_campaigns_use_the_v3_template() -> None:
    assert CAMPAIGN_TEMPLATE_VERSIONS["service-update"] == "2026-09-v1"
    assert CAMPAIGN_TEMPLATE_VERSIONS["marketing-reactivation"] == "2026-09-v3"
    assert CAMPAIGN_TEMPLATE_VERSIONS["marketing-reactivation-all"] == (
        "2026-09-v3"
    )


def test_service_update_v1_keeps_its_existing_visual_renderer() -> None:
    template = default_campaign_html_template(
        "service-update",
        "https://www.huntzenjobs.com",
    )
    rendered = render_editable_campaign_email(
        campaign_type="service-update",
        editor_mode="simple",
        subject="HuntzenJobs a évolué",
        content="Découvrez votre nouvel espace.",
        language="fr",
        first_name="Wissem",
        app_url="https://www.huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert 'src="https://www.huntzenjobs.com/logo.png"' in template
    assert 'src="https://www.huntzenjobs.com/logo.png"' in rendered["html"]


def test_default_marketing_content_leads_with_a_clear_reason_to_return() -> None:
    subject, main_text = default_campaign_editor_content(
        "marketing-reactivation-all",
        "fr",
    )

    assert subject == "Du nouveau sur HuntzenJobs"
    assert "HuntzenJobs" in main_text
    assert "offres adaptées" in main_text
    assert "CV" in main_text
    assert "assistants carrière" in main_text
    assert "L’équipe HuntzenJobs" in main_text
    assert "abonné" not in main_text.casefold()
    assert "4 500" not in main_text


def test_default_marketing_html_is_branded_actionable_and_email_safe() -> None:
    template = default_campaign_html_template(
        "marketing-reactivation-all",
        "https://www.huntzenjobs.com",
    )

    validated = validate_campaign_html(template)
    assert "HuntzenJobs" in validated
    assert 'src="https://www.huntzenjobs.com/logo.png"' not in validated
    assert "Du nouveau sur HuntzenJobs" in validated
    assert "Cela fait peut-être un moment" in validated
    assert "L’équipe HuntzenJobs" in validated
    assert 'href="{{app_url}}/jobs"' in validated
    assert 'href="{{app_url}}/assistant"' in validated
    assert 'href="{{app_url}}/cv-analysis"' in validated
    assert 'href="{{app_url}}/dashboard"' in validated
    assert 'href="{{app_url}}/pricing"' in validated
    assert ">Accéder à mon espace</a>" in validated
    assert ">Voir les formules</a>" in validated
    assert "{{first_name}}" in validated
    assert "unsubscribe" not in validated.casefold()
    assert "font-family:Arial,Helvetica,sans-serif" in validated
    assert "Et si votre prochaine candidature" not in validated
    assert "Reprenez là où" not in validated
    assert "background:#071426" not in validated


def test_html_editor_adds_mandatory_footer_and_replaces_safe_placeholders() -> None:
    template = """<!doctype html><html><body>
<p>Bonjour {{first_name}}</p>
<a href="{{app_url}}/pricing">Voir les offres</a>
</body></html>"""
    rendered = render_editable_campaign_email(
        campaign_type="marketing-reactivation-all",
        editor_mode="html",
        subject="Offres HuntzenJobs",
        content=template,
        language="fr",
        first_name='<img src=x onerror="alert(1)">',
        app_url="https://huntzenjobs.com",
        preferences_token="signed-token",
    )

    assert "{{" not in rendered["html"]
    assert "&lt;img" in rendered["html"]
    assert 'href="https://huntzenjobs.com/pricing"' in rendered["html"]
    assert "/api/marketing/preferences?token=signed-token" in rendered["html"]
    assert rendered["headers"]["List-Unsubscribe"].endswith(
        "/api/marketing/unsubscribe?token=signed-token>"
    )


def test_campaign_content_hash_changes_when_content_changes() -> None:
    first = campaign_content_hash(
        editor_mode="simple", subject="Sujet", content="Premier texte"
    )
    second = campaign_content_hash(
        editor_mode="simple", subject="Sujet", content="Second texte"
    )

    assert first != second
    assert len(first) == 64


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
