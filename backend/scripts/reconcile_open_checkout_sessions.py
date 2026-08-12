"""Lister puis, avec double confirmation, expirer les anciens Checkouts ouverts."""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Iterable
from typing import Any
from urllib.parse import urlparse

import stripe


def _value(resource: Any, key: str, default: Any = None) -> Any:
    if isinstance(resource, dict):
        return resource.get(key, default)
    return getattr(resource, key, default)


def legacy_open_subscription_session_ids(
    sessions: Iterable[Any],
    *,
    allowed_host: str = "huntzenjobs.com",
) -> list[str]:
    """Garder uniquement les anciens Checkouts HuntZen identifiables."""
    session_ids: list[str] = []
    for session in sessions:
        metadata = _value(session, "metadata", {})
        session_id = _value(session, "id")
        user_id = _value(metadata, "user_id")
        plan_name = _value(metadata, "plan_name")
        reservation_token = _value(metadata, "checkout_reservation_token")
        success_url = _value(session, "success_url")
        success_host = (
            urlparse(success_url).hostname
            if isinstance(success_url, str) and success_url
            else None
        )
        huntzen_host = success_host == allowed_host or (
            isinstance(success_host, str)
            and success_host.endswith(f".{allowed_host}")
        )
        if (
            _value(session, "status") == "open"
            and _value(session, "mode") == "subscription"
            and isinstance(session_id, str)
            and session_id
            and isinstance(user_id, str)
            and bool(user_id)
            and plan_name in {"starter", "pro", "premium"}
            and huntzen_host
            and not reservation_token
        ):
            session_ids.append(session_id)
    return sorted(set(session_ids))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--confirm-expire-open-subscription-sessions",
        action="store_true",
        help="Confirmation obligatoire en plus de --apply.",
    )
    parser.add_argument(
        "--allowed-host",
        default="huntzenjobs.com",
        help="Domaine HuntZen attendu dans success_url.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    stripe_key = os.getenv("STRIPE_SECRET_KEY", "")
    if not stripe_key:
        raise SystemExit("STRIPE_SECRET_KEY manquante")
    if args.apply and not args.confirm_expire_open_subscription_sessions:
        raise SystemExit("Refus : ajouter la confirmation explicite après le dry-run")

    stripe_client = stripe.StripeClient(stripe_key)
    sessions = stripe_client.v1.checkout.sessions.list(
        params={"status": "open", "limit": 100}
    )
    session_rows = list(sessions.auto_paging_iter())
    legacy_ids = legacy_open_subscription_session_ids(
        session_rows,
        allowed_host=args.allowed_host,
    )
    legacy_details = [
        {
            "id": session_id,
            "customer": _value(session, "customer"),
            "created": _value(session, "created"),
            "success_url": _value(session, "success_url"),
        }
        for session in session_rows
        if (session_id := _value(session, "id")) in legacy_ids
    ]
    expired_ids: list[str] = []
    if args.apply:
        for session_id in legacy_ids:
            stripe_client.v1.checkout.sessions.expire(session_id)
            expired_ids.append(session_id)

    print(
        json.dumps(
            {
                "mode": "apply" if args.apply else "dry-run",
                "legacy_open_subscription_sessions": legacy_ids,
                "legacy_session_details": legacy_details,
                "expired_sessions": expired_ids,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
