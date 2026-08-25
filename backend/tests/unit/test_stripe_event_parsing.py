"""Tests de compatibilité des payloads Stripe Billing."""

import pytest
import stripe

from src.services import stripe as stripe_service
from tests.fixtures.stripe_events import (
    CLOVER_INVOICE,
    CLOVER_SUBSCRIPTION,
    INCOMPLETE_SUBSCRIPTION,
    INVOICE_WITHOUT_SUBSCRIPTION,
    LEGACY_INVOICE,
    LEGACY_SUBSCRIPTION,
    MIXED_SUBSCRIPTION,
)


@pytest.mark.parametrize(
    "subscription",
    [
        CLOVER_SUBSCRIPTION,
        stripe.StripeObject.construct_from(CLOVER_SUBSCRIPTION, key=None),
    ],
)
def test_extract_subscription_period_reads_clover_item(subscription):
    """Une période déplacée sur l'item Clover ne doit pas expirer immédiatement."""
    assert stripe_service.extract_subscription_period(subscription) == (
        1_786_291_200,
        1_788_969_600,
    )


def test_extract_subscription_period_supports_legacy_payload():
    """Les événements Stripe historiques restent rejouables."""
    assert stripe_service.extract_subscription_period(LEGACY_SUBSCRIPTION) == (
        1_786_291_200,
        1_788_969_600,
    )


def test_extract_subscription_period_prefers_clover_item():
    """Le format Clover est la source prioritaire quand les deux formats existent."""
    assert stripe_service.extract_subscription_period(MIXED_SUBSCRIPTION) == (
        1_786_291_200,
        1_788_969_600,
    )


def test_extract_subscription_period_rejects_missing_dates():
    """Une période absente ne doit jamais être remplacée silencieusement par maintenant."""
    with pytest.raises(ValueError, match="période Stripe absente"):
        stripe_service.extract_subscription_period(INCOMPLETE_SUBSCRIPTION)


@pytest.mark.parametrize(
    ("invoice", "expected"),
    [
        (CLOVER_INVOICE, "sub_test_clover"),
        (LEGACY_INVOICE, "sub_test_legacy"),
        (INVOICE_WITHOUT_SUBSCRIPTION, None),
    ],
)
def test_extract_invoice_subscription_id_supports_billing_formats(invoice, expected):
    """Une facture Clover ou historique doit retrouver le bon abonnement."""
    assert stripe_service._extract_invoice_subscription_id(invoice) == expected
