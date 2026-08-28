"""Tests du rapport de réconciliation Stripe/Supabase."""

import pytest

from scripts.reconcile_stripe_subscriptions import build_parser, main, reconcile_subscriptions


def test_reconcile_classifies_mismatches_without_personal_data():
    stripe_rows = [
        {
            "stripe_subscription_id": "sub_synced",
            "status": "active",
            "stripe_price_id": "price_pro",
            "current_period_start": 1_786_291_200,
            "current_period_end": 1_788_969_600,
            "customer_email": "must-not-leak@example.test",
        },
        {
            "stripe_subscription_id": "sub_missing_db",
            "status": "past_due",
            "stripe_price_id": "price_pro",
            "current_period_start": 1_786_291_200,
            "current_period_end": 1_788_969_600,
        },
        {
            "stripe_subscription_id": "sub_cancelled_history",
            "status": "canceled",
            "stripe_price_id": "price_pro",
            "current_period_start": 1_786_291_200,
            "current_period_end": 1_788_969_600,
        },
    ]
    database_rows = [
        {
            "stripe_subscription_id": "sub_synced",
            "status": "active",
            "stripe_price_id": "price_pro",
            "current_period_start": "2026-08-09T16:00:00+00:00",
            "current_period_end": "2026-09-09T16:00:00+00:00",
            "user_id": "must-not-leak",
        },
        {
            "stripe_subscription_id": "sub_missing_stripe",
            "status": "active",
            "stripe_price_id": "price_old",
            "current_period_start": None,
            "current_period_end": None,
        },
        {
            "stripe_subscription_id": "admin_granted:manual-access",
            "status": "active",
            "stripe_price_id": None,
            "current_period_start": None,
            "current_period_end": None,
        },
        {
            "stripe_subscription_id": "archived:sub_old:duplicate-row",
            "status": "canceled",
            "stripe_price_id": "price_old",
            "current_period_start": None,
            "current_period_end": None,
        },
        {
            "stripe_subscription_id": "load_test:synthetic-user",
            "status": "active",
            "stripe_price_id": None,
            "current_period_start": None,
            "current_period_end": None,
        },
    ]

    report = reconcile_subscriptions(stripe_rows, database_rows)

    assert report["mode"] == "dry-run"
    assert report["counts"] == {
        "database_missing_active": 1,
        "database_missing_cancelled_history": 1,
        "local_non_stripe": 3,
        "stripe_missing": 1,
        "synchronized": 1,
    }
    rendered = str(report)
    assert "must-not-leak" not in rendered
    assert "customer_email" not in rendered
    assert "user_id" not in rendered


def test_cli_is_dry_run_by_default():
    args = build_parser().parse_args([])
    assert args.apply is False


def test_cli_refuses_apply_before_accessing_external_services():
    with pytest.raises(SystemExit, match="Écriture désactivée"):
        main(["--apply"])
