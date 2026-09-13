"""Contrats de sécurité des campagnes administrateur."""

from uuid import UUID

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from src.services.bulk_email import (
    CampaignSendRequest,
    campaign_content_hash,
    is_campaign_recipient_eligible,
    validate_frozen_campaign,
)
from src.utils import helpers


def test_chunk_values_limits_supabase_in_filter_size() -> None:
    values = [f"user-{index}" for index in range(205)]
    chunk_values = getattr(helpers, "chunk_values", None)

    assert callable(chunk_values)
    assert [len(chunk) for chunk in chunk_values(values, 100)] == [100, 100, 5]
    assert [value for chunk in chunk_values(values, 100) for value in chunk] == values


def test_campaign_send_requires_a_uuid_and_a_non_negative_confirmation() -> None:
    request = CampaignSendRequest(
        campaign_id="6cfc4dde-6101-48d2-bd05-c75a34c7ff62",
        confirmed_recipient_count=0,
        editor_mode="simple",
        subject="Nouveautés HuntzenJobs",
        main_text="Découvrez les nouveautés.",
    )
    assert request.campaign_id == UUID("6cfc4dde-6101-48d2-bd05-c75a34c7ff62")

    with pytest.raises(ValidationError):
        CampaignSendRequest(campaign_id="not-a-uuid", confirmed_recipient_count=-1)


def test_campaign_send_rejects_header_injection_and_unsafe_html() -> None:
    with pytest.raises(ValidationError, match="Sujet invalide"):
        CampaignSendRequest(
            campaign_id="6cfc4dde-6101-48d2-bd05-c75a34c7ff62",
            confirmed_recipient_count=1,
            editor_mode="simple",
            subject="Sujet\nBcc: victime@example.com",
            main_text="Texte",
        )

    with pytest.raises(ValidationError, match="balise interdite"):
        CampaignSendRequest(
            campaign_id="6cfc4dde-6101-48d2-bd05-c75a34c7ff62",
            confirmed_recipient_count=1,
            editor_mode="html",
            subject="Sujet",
            html_template=(
                '<html><script>alert(1)</script><a href="{{unsubscribe_url}}">Stop</a></html>'
            ),
        )

    malicious_templates = [
        '<img src="https://example.com/x" onerror="alert(1)"><a href="{{unsubscribe_url}}">Stop</a>',
        '<a href="javascript:alert(1)">Piège</a><a href="{{unsubscribe_url}}">Stop</a>',
        '<img src="https://tracker.example/pixel?u={{unsubscribe_url}}"><a href="https://example.com">Stop</a>',
        '<img src="https://tracker.example/pixel?u={{preferences_url}}"><a href="{{unsubscribe_url}}">Stop</a>',
        '<p style="background-image:u\\72l(https://evil.test/x)">Texte</p>',
        '<body style="height:0;overflow:hidden"><p>Texte</p></body>',
        '<body style="position:absolute;left:-9999px"><p>Texte</p></body>',
        '<html style="transform:scale(0)"><body><p>Texte</p></body></html>',
    ]
    for template in malicious_templates:
        with pytest.raises(ValidationError):
            CampaignSendRequest(
                campaign_id="6cfc4dde-6101-48d2-bd05-c75a34c7ff62",
                confirmed_recipient_count=1,
                editor_mode="html",
                subject="Sujet",
                html_template=template,
            )

    duplicate_attribute = CampaignSendRequest(
        campaign_id="6cfc4dde-6101-48d2-bd05-c75a34c7ff62",
        confirmed_recipient_count=1,
        editor_mode="html",
        subject="Sujet",
        html_template=(
            '<a href="javascript:alert(1)" href="https://huntzenjobs.com">Stop</a>'
        ),
    )
    assert "javascript:" not in (duplicate_attribute.html_template or "")

    conditional_comment = CampaignSendRequest(
        campaign_id="6cfc4dde-6101-48d2-bd05-c75a34c7ff62",
        confirmed_recipient_count=1,
        editor_mode="html",
        subject="Sujet",
        html_template=(
            '<!--[if mso]><object data="https://evil.test/x"></object><![endif]-->'
            "<p>Contenu sûr</p>"
        ),
    )
    assert "object" not in (conditional_comment.html_template or "")


def test_marketing_recipient_requires_current_traceable_consent() -> None:
    base = {
        "status": "active",
        "newsletter_subscribed": True,
        "newsletter_unsubscribed_at": None,
    }
    assert not is_campaign_recipient_eligible(
        "marketing-reactivation",
        {**base, "newsletter_consent_at": None},
    )
    assert is_campaign_recipient_eligible(
        "marketing-reactivation",
        {**base, "newsletter_consent_at": "2026-09-12T20:00:00Z"},
    )


def test_all_active_marketing_excludes_only_explicit_unsubscribes() -> None:
    assert is_campaign_recipient_eligible(
        "marketing-reactivation-all",
        {
            "status": "active",
            "newsletter_subscribed": False,
            "newsletter_consent_at": None,
            "newsletter_unsubscribed_at": None,
        },
    )
    assert not is_campaign_recipient_eligible(
        "marketing-reactivation-all",
        {
            "status": "active",
            "newsletter_subscribed": True,
            "newsletter_consent_at": "2026-09-12T20:00:00Z",
            "newsletter_unsubscribed_at": "2026-09-13T08:00:00Z",
        },
    )
    assert not is_campaign_recipient_eligible(
        "marketing-reactivation-all",
        {
            "status": "deleted",
            "newsletter_unsubscribed_at": None,
        },
    )


def test_service_update_only_requires_an_active_account() -> None:
    assert is_campaign_recipient_eligible(
        "service-update",
        {"status": "active", "newsletter_subscribed": False},
    )
    assert not is_campaign_recipient_eligible(
        "service-update",
        {"status": "deleted", "newsletter_subscribed": True},
    )


def test_existing_campaign_never_accepts_a_new_audience_or_type() -> None:
    frozen = {
        "campaign_type": "service-update",
        "audience_total": 836,
        "audience_frozen_at": "2026-09-12T20:00:00Z",
        "template_version": "2026-09-v1",
        "content_hash": "hash-1",
        "editor_mode": "simple",
        "email_subject": "Sujet",
        "email_content": "Texte",
    }
    frozen["content_hash"] = campaign_content_hash(
        editor_mode="simple", subject="Sujet", content="Texte"
    )
    validate_frozen_campaign(
        frozen,
        "service-update",
        836,
        "2026-09-v1",
        content_hash=frozen["content_hash"],
    )

    with pytest.raises(HTTPException, match="confirmation"):
        validate_frozen_campaign(frozen, "service-update", 835, "2026-09-v1")
    with pytest.raises(HTTPException, match="type"):
        validate_frozen_campaign(
            frozen, "marketing-reactivation", 836, "2026-09-v1"
        )
    with pytest.raises(HTTPException, match="version"):
        validate_frozen_campaign(frozen, "service-update", 836, "2026-10-v1")
    with pytest.raises(HTTPException, match="contenu"):
        validate_frozen_campaign(
            frozen,
            "service-update",
            836,
            "2026-09-v1",
            content_hash="b" * 64,
        )


def test_legacy_frozen_campaign_can_resume_with_the_locked_renderer() -> None:
    legacy = {
        "campaign_type": "service-update",
        "audience_total": 10,
        "audience_frozen_at": "2026-09-13T20:00:00Z",
        "template_version": "2026-09-v1",
        "editor_mode": None,
        "email_subject": None,
        "email_content": None,
        "content_hash": None,
    }

    validate_frozen_campaign(
        legacy,
        "service-update",
        10,
        "2026-09-v1",
        content_hash="a" * 64,
    )
