"""Payloads Stripe anonymes couvrant les formats Clover et historique."""

CLOVER_SUBSCRIPTION = {
    "id": "sub_test_clover",
    "status": "active",
    "items": {
        "data": [
            {
                "id": "si_test_clover",
                "current_period_start": 1_786_291_200,
                "current_period_end": 1_788_969_600,
                "price": {"id": "price_test_monthly"},
            }
        ]
    },
}

LEGACY_SUBSCRIPTION = {
    "id": "sub_test_legacy",
    "status": "active",
    "current_period_start": 1_786_291_200,
    "current_period_end": 1_788_969_600,
    "items": {"data": [{"price": {"id": "price_test_monthly"}}]},
}

MIXED_SUBSCRIPTION = {
    "id": "sub_test_mixed",
    "status": "active",
    "current_period_start": 1_700_000_000,
    "current_period_end": 1_700_000_001,
    "items": {
        "data": [
            {
                "current_period_start": 1_786_291_200,
                "current_period_end": 1_788_969_600,
                "price": {"id": "price_test_monthly"},
            }
        ]
    },
}

INCOMPLETE_SUBSCRIPTION = {
    "id": "sub_test_incomplete",
    "status": "active",
    "items": {"data": [{"price": {"id": "price_test_monthly"}}]},
}

CLOVER_INVOICE = {
    "id": "in_test_clover",
    "amount_paid": 0,
    "amount_due": 1_390,
    "billing_reason": "subscription_cycle",
    "currency": "eur",
    "customer_email": "client@example.test",
    "parent": {
        "type": "subscription_details",
        "subscription_details": {"subscription": "sub_test_clover"},
    },
}

LEGACY_INVOICE = {
    "id": "in_test_legacy",
    "subscription": "sub_test_legacy",
}

INVOICE_WITHOUT_SUBSCRIPTION = {
    "id": "in_test_standalone",
    "parent": None,
}
