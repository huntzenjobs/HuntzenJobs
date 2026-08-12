"""Rapport de réconciliation Stripe/Supabase, strictement en lecture seule."""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import stripe
from supabase import create_client

from src.services.stripe import extract_subscription_period


def _stripe_value(payload: Any, key: str, default: Any = None) -> Any:
    if isinstance(payload, dict):
        return payload.get(key, default)
    try:
        return payload[key]
    except (KeyError, TypeError):
        return getattr(payload, key, default)


def normalize_stripe_subscription(subscription: Any) -> dict[str, Any]:
    """Projeter uniquement les champs techniques nécessaires au rapprochement."""
    period_start, period_end = extract_subscription_period(subscription)
    items = _stripe_value(_stripe_value(subscription, "items", {}), "data", []) or []
    price = _stripe_value(items[0], "price", {}) if items else {}
    return {
        "stripe_subscription_id": _stripe_value(subscription, "id"),
        "status": _stripe_value(subscription, "status"),
        "stripe_price_id": _stripe_value(price, "id"),
        "current_period_start": period_start,
        "current_period_end": period_end,
    }


def _timestamp(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if not isinstance(value, str) or not value:
        return None
    from datetime import datetime

    try:
        return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
    except ValueError:
        return None


def reconcile_subscriptions(
    stripe_subscriptions: Iterable[dict[str, Any]],
    database_subscriptions: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    """Classer les écarts sans exposer d'identité client."""
    stripe_by_id = {
        row["stripe_subscription_id"]: row
        for row in stripe_subscriptions
        if row.get("stripe_subscription_id")
    }
    database_by_id = {
        row["stripe_subscription_id"]: row
        for row in database_subscriptions
        if row.get("stripe_subscription_id")
    }
    items: list[dict[str, Any]] = []

    for subscription_id, stripe_row in stripe_by_id.items():
        database_row = database_by_id.get(subscription_id)
        issues: list[str] = []
        if database_row is None:
            issues.append("database_missing")
        else:
            if database_row.get("status") != stripe_row.get("status"):
                issues.append("status_mismatch")
            if database_row.get("stripe_price_id") != stripe_row.get("stripe_price_id"):
                issues.append("price_mismatch")
            if _timestamp(database_row.get("current_period_start")) != stripe_row.get(
                "current_period_start"
            ) or _timestamp(database_row.get("current_period_end")) != stripe_row.get(
                "current_period_end"
            ):
                issues.append("period_mismatch")
        items.append(
            {
                "stripe_subscription_id": subscription_id,
                "classification": issues or ["synchronized"],
            }
        )

    for subscription_id in database_by_id.keys() - stripe_by_id.keys():
        items.append(
            {
                "stripe_subscription_id": subscription_id,
                "classification": ["stripe_missing"],
            }
        )

    counts = Counter(issue for item in items for issue in item["classification"])
    return {
        "mode": "dry-run",
        "counts": dict(sorted(counts.items())),
        "items": sorted(items, key=lambda item: item["stripe_subscription_id"]),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Chemin du rapport JSON anonymisé")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Réservé à la phase de réparation validée (désactivé dans cet outil)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.apply:
        raise SystemExit(
            "Écriture désactivée : exécuter d'abord le dry-run puis obtenir une "
            "autorisation de production ciblée."
        )

    stripe_key = os.getenv("STRIPE_SECRET_KEY", "")
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not stripe_key or not supabase_url or not supabase_key:
        raise SystemExit("Variables Stripe/Supabase manquantes pour le rapport en lecture seule.")

    stripe.api_key = stripe_key
    database = create_client(supabase_url, supabase_key)
    stripe_rows = [
        normalize_stripe_subscription(subscription)
        for subscription in stripe.Subscription.list(status="all", limit=100).auto_paging_iter()
    ]
    database_result = database.table("user_subscriptions").select(
        "stripe_subscription_id,status,stripe_price_id,current_period_start,current_period_end"
    ).execute()
    database_rows = [
        dict(row)
        for row in (database_result.data or [])
        if isinstance(row, dict)
    ]
    report = reconcile_subscriptions(stripe_rows, database_rows)
    serialized = json.dumps(report, ensure_ascii=False, indent=2)

    if args.output:
        args.output.write_text(serialized + "\n", encoding="utf-8")
    else:
        print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
