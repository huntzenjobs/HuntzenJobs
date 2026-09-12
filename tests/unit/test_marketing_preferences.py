"""Contrats de mutation des préférences marketing."""

from datetime import UTC, datetime

from src.services.bulk_email import (
    newsletter_subscription_state,
    preference_update_payload,
)


def test_missing_profile_result_has_no_subscription_state() -> None:
    assert newsletter_subscription_state(None) is None


def test_opt_in_records_traceable_consent() -> None:
    now = datetime(2026, 9, 12, 20, 0, tzinfo=UTC)
    payload = preference_update_payload(subscribed=True, now=now)

    assert payload == {
        "newsletter_subscribed": True,
        "newsletter_consent_at": "2026-09-12T20:00:00+00:00",
        "newsletter_consent_source": "email_preferences_link",
        "newsletter_consent_version": "2026-09-v1",
        "newsletter_unsubscribed_at": None,
        "updated_at": "2026-09-12T20:00:00+00:00",
    }


def test_unsubscribe_is_idempotent_and_preserves_old_consent_evidence() -> None:
    now = datetime(2026, 9, 12, 20, 0, tzinfo=UTC)
    payload = preference_update_payload(subscribed=False, now=now)

    assert payload == {
        "newsletter_subscribed": False,
        "newsletter_unsubscribed_at": "2026-09-12T20:00:00+00:00",
        "updated_at": "2026-09-12T20:00:00+00:00",
    }
    assert "newsletter_consent_at" not in payload

    replayed = preference_update_payload(
        subscribed=False,
        now=datetime(2026, 9, 13, 20, 0, tzinfo=UTC),
        existing_unsubscribed_at=payload["newsletter_unsubscribed_at"],
    )
    assert replayed["newsletter_unsubscribed_at"] == payload["newsletter_unsubscribed_at"]
