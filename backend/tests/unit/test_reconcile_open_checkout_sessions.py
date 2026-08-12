"""Sélection sûre des sessions Checkout historiques encore ouvertes."""

import stripe

from scripts.reconcile_open_checkout_sessions import (
    legacy_open_subscription_session_ids,
)


def test_only_legacy_open_subscription_sessions_are_selected():
    sessions = [
        {
            "id": "cs_legacy",
            "status": "open",
            "mode": "subscription",
            "metadata": {"user_id": "user_test", "plan_name": "pro"},
            "success_url": "https://huntzenjobs.com/dashboard",
        },
        {
            "id": "cs_reserved",
            "status": "open",
            "mode": "subscription",
            "metadata": {"checkout_reservation_token": "claim_test"},
        },
        {
            "id": "cs_recruiter",
            "status": "open",
            "mode": "payment",
            "metadata": {},
        },
        {
            "id": "cs_expired",
            "status": "expired",
            "mode": "subscription",
            "metadata": {},
        },
    ]

    assert legacy_open_subscription_session_ids(sessions) == ["cs_legacy"]


def test_reserved_stripe_object_is_never_classified_as_legacy():
    """Un StripeObject moderne avec token ne doit jamais être expiré."""
    session = stripe.StripeObject.construct_from(
        {
            "id": "cs_modern",
            "status": "open",
            "mode": "subscription",
            "metadata": {
                "user_id": "user_test",
                "plan_name": "pro",
                "checkout_reservation_token": "claim_test",
            },
            "success_url": "https://huntzenjobs.com/dashboard",
        },
        key=None,
    )

    assert legacy_open_subscription_session_ids([session]) == []


def test_foreign_open_subscription_session_is_never_classified_as_huntzen():
    """Le nettoyage ne doit pas toucher un autre produit du compte Stripe."""
    session = {
        "id": "cs_foreign",
        "status": "open",
        "mode": "subscription",
        "metadata": {"user_id": "foreign", "plan_name": "enterprise"},
        "success_url": "https://another-product.example/success",
    }

    assert legacy_open_subscription_session_ids([session]) == []
