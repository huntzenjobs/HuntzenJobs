"""Consommateur durable et idempotent des livraisons support."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any
from uuid import UUID, uuid4, uuid5

from src.services.email import (
    send_support_ticket_notification,
    send_support_ticket_reply,
)

logger = logging.getLogger(__name__)

MAX_BATCH_SIZE = 100
MAX_LEASE_SECONDS = 3_600
MAX_EFFECT_TIMEOUT_SECONDS = 60


def _response_data(response: object) -> object:
    return getattr(response, "data", None)


def _execute_rpc(supabase: Any, name: str, params: dict[str, Any]) -> object:
    return supabase.rpc(name, params).execute()


def _single_row(data: object) -> dict[str, Any]:
    if isinstance(data, list):
        data = data[0] if data else None
    return data if isinstance(data, dict) else {}


def _retry_seconds(attempt_count: int) -> int:
    """Appliquer un backoff borné entre 30 secondes et une heure."""
    exponent = max(0, min(attempt_count - 1, 7))
    return min(3_600, 30 * (2**exponent))


def _create_notification_once(
    supabase: Any,
    *,
    user_id: str,
    ticket_id: str,
    dedupe_key: str,
    notification_type: str,
    title: str,
    message: str,
) -> bool:
    """Dédupliquer atomiquement via un UUIDv5 stable et la clé primaire."""
    notification_id = str(uuid5(UUID(dedupe_key), "support-notification"))
    (
        supabase.table("user_notifications")
        .upsert(
            {
                "id": notification_id,
                "user_id": user_id,
                "type": notification_type,
                "title": title,
                "body": message,
                "data": {
                    "support_dedupe_key": dedupe_key,
                    "ticket_id": ticket_id,
                },
                "read": False,
            },
            on_conflict="id",
            ignore_duplicates=True,
        )
        .execute()
    )
    return True


def _checkpoint_delivery_channel(
    supabase: Any,
    *,
    delivery_id: str,
    worker_id: str,
    channel: str,
) -> bool:
    checkpoint = _execute_rpc(
        supabase,
        "mark_support_delivery_channel_succeeded",
        {
            "p_delivery_id": delivery_id,
            "p_worker_id": worker_id,
            "p_channel": channel,
        },
    )
    return _single_row(_response_data(checkpoint)).get("updated") is True


def _load_effect_context(
    supabase: Any,
    *,
    ticket_id: str,
    message_id: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    ticket_response = (
        supabase.table("support_tickets")
        .select(
            "id, user_id, user_email, user_name, user_plan, page_url, category, "
            "priority, subject, description, status"
        )
        .eq("id", ticket_id)
        .maybe_single()
        .execute()
    )
    ticket = _single_row(_response_data(ticket_response))
    if not ticket:
        raise RuntimeError("support ticket context missing")

    message_response = (
        supabase.table("support_ticket_messages")
        .select("id, ticket_id, author_role, content")
        .eq("ticket_id", ticket_id)
        .eq("id", message_id)
        .maybe_single()
        .execute()
    )
    message = _single_row(_response_data(message_response))
    if not message:
        raise RuntimeError("support message context missing")
    return ticket, message


async def deliver_support_effect(supabase: Any, effect: dict[str, Any]) -> None:
    """Livrer un effet support; toute livraison partielle reste rejouable."""
    ticket_id = str(effect.get("ticket_id") or "")
    message_id = str(effect.get("message_id") or "")
    delivery_kind = str(effect.get("delivery_kind") or "")
    dedupe_key = str(effect.get("dedupe_key") or "")
    delivery_id = str(effect.get("id") or "")
    worker_id = str(effect.get("lease_owner") or "")
    if not all((ticket_id, message_id, delivery_kind, dedupe_key, delivery_id, worker_id)):
        raise RuntimeError("invalid support delivery")

    ticket, message = await asyncio.to_thread(
        _load_effect_context,
        supabase,
        ticket_id=ticket_id,
        message_id=message_id,
    )
    user_id = str(ticket.get("user_id") or "")
    if not user_id:
        raise RuntimeError("support delivery user missing")

    short_id = ticket_id[:8].upper()
    resend_key = f"support:{dedupe_key}"
    email_function: Callable[..., bool] | None = None
    email_kwargs: dict[str, Any] = {}
    if delivery_kind == "ticket_created":
        email_function = send_support_ticket_notification
        email_kwargs = {
            "ticket_id": short_id,
            "subject": str(ticket.get("subject") or ""),
            "category": str(ticket.get("category") or ""),
            "priority": str(ticket.get("priority") or ""),
            "user_name": str(ticket.get("user_name") or ""),
            "user_email": str(ticket.get("user_email") or ""),
            "user_plan": str(ticket.get("user_plan") or "free"),
            "page_url": str(ticket.get("page_url") or ""),
            "description": str(ticket.get("description") or ""),
            "idempotency_key": resend_key,
        }
        notification_type = "support_ticket_received"
        notification_title = f"Ticket #{short_id} reçu"
        notification_message = "Votre demande a bien été transmise à notre équipe."
    elif delivery_kind == "admin_reply":
        email_function = send_support_ticket_reply
        email_kwargs = {
            "user_email": str(ticket.get("user_email") or ""),
            "user_name": str(ticket.get("user_name") or ""),
            "ticket_id": short_id,
            "ticket_subject": str(ticket.get("subject") or ""),
            "admin_reply": str(message.get("content") or ""),
            "idempotency_key": resend_key,
        }
        notification_type = "support_ticket_reply"
        notification_title = f"Réponse au ticket #{short_id}"
        notification_message = "Notre équipe support vous a répondu."
    elif delivery_kind == "ticket_status_changed":
        status = str((effect.get("payload") or {}).get("status") or ticket.get("status") or "")
        notification_type = "support_ticket_reply"
        notification_title = f"Ticket #{short_id} mis à jour"
        notification_message = f"Le statut de votre ticket est maintenant : {status}."
    else:
        raise RuntimeError("unsupported support delivery kind")

    if email_function is not None and not effect.get("email_delivered_at"):
        email_sent = await asyncio.to_thread(email_function, **email_kwargs)
        if not email_sent:
            raise RuntimeError("email delivery failed")
        email_checkpointed = await asyncio.to_thread(
            _checkpoint_delivery_channel,
            supabase,
            delivery_id=delivery_id,
            worker_id=worker_id,
            channel="email",
        )
        if not email_checkpointed:
            raise RuntimeError("email delivery checkpoint rejected")

    if not effect.get("notification_delivered_at"):
        notification_created = await asyncio.to_thread(
            _create_notification_once,
            supabase,
            user_id=user_id,
            ticket_id=ticket_id,
            dedupe_key=dedupe_key,
            notification_type=notification_type,
            title=notification_title,
            message=notification_message,
        )
        if not notification_created:
            raise RuntimeError("notification delivery failed")
        notification_checkpointed = await asyncio.to_thread(
            _checkpoint_delivery_channel,
            supabase,
            delivery_id=delivery_id,
            worker_id=worker_id,
            channel="notification",
        )
        if not notification_checkpointed:
            raise RuntimeError("notification delivery checkpoint rejected")


async def process_support_deliveries(
    supabase: Any,
    *,
    limit: int = 20,
    lease_seconds: int = 300,
    effect_timeout_seconds: int = 20,
) -> dict[str, int]:
    """Réserver puis traiter un lot borné sans concurrencer les slots IA."""
    if not 1 <= limit <= MAX_BATCH_SIZE:
        raise ValueError("limit must be between 1 and 100")
    if not 30 <= lease_seconds <= MAX_LEASE_SECONDS:
        raise ValueError("lease_seconds must be between 30 and 3600")
    if not 1 <= effect_timeout_seconds <= MAX_EFFECT_TIMEOUT_SECONDS:
        raise ValueError("effect_timeout_seconds must be between 1 and 60")

    worker_id = str(uuid4())
    claimed_response = await asyncio.to_thread(
        _execute_rpc,
        supabase,
        "claim_support_deliveries",
        {
            "p_worker_id": worker_id,
            "p_limit": limit,
            "p_lease_seconds": lease_seconds,
        },
    )
    claimed_data = _response_data(claimed_response)
    effects = claimed_data if isinstance(claimed_data, list) else []
    summary = {"claimed": len(effects), "succeeded": 0, "retried": 0, "dead": 0}

    for effect in effects:
        effect_id = str(effect.get("id") or "") if isinstance(effect, dict) else ""
        if not effect_id or effect.get("lease_owner") != worker_id:
            raise RuntimeError("support delivery lease ownership mismatch")

        try:
            async with asyncio.timeout(effect_timeout_seconds):
                await deliver_support_effect(supabase, effect)
            marked = await asyncio.to_thread(
                _execute_rpc,
                supabase,
                "mark_support_delivery_succeeded",
                {
                    "p_delivery_id": effect_id,
                    "p_worker_id": worker_id,
                },
            )
            if _response_data(marked) is not True:
                raise RuntimeError("support delivery success transition rejected")
            summary["succeeded"] += 1
        except Exception as exc:
            error_type = type(exc).__name__
            attempt_count = int(effect.get("attempt_count") or 1)
            failed = await asyncio.to_thread(
                _execute_rpc,
                supabase,
                "fail_support_delivery",
                {
                    "p_delivery_id": effect_id,
                    "p_worker_id": worker_id,
                    "p_error": error_type,
                    "p_retry_seconds": _retry_seconds(attempt_count),
                },
            )
            failure = _single_row(_response_data(failed))
            if failure.get("updated") is not True:
                raise RuntimeError("support delivery failure transition rejected") from None
            target = "dead" if failure.get("status") == "dead" else "retried"
            summary[target] += 1
            logger.warning(
                "Support delivery failed",
                extra={"effect_id": effect_id, "error_type": error_type},
            )

    return summary
