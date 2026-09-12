"""Préparation des envois groupés via l'API Batch de Resend."""

import asyncio
from collections.abc import Callable, Iterable
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any, Literal, TypedDict, TypeVar, cast
from urllib.parse import quote
from uuid import UUID

import jwt
from fastapi import HTTPException
from pydantic import BaseModel, Field

RESEND_BATCH_SIZE = 100
Record = TypeVar("Record")
CampaignType = Literal["service-update", "marketing-reactivation"]


class RenderedCampaignEmail(TypedDict):
    subject: str
    html: str
    headers: dict[str, str]


CAMPAIGN_TEMPLATE_VERSIONS: dict[CampaignType, str] = {
    "service-update": "2026-09-v1",
    "marketing-reactivation": "2026-09-v1",
}


class CampaignSendRequest(BaseModel):
    campaign_id: UUID
    confirmed_recipient_count: int = Field(ge=0)


def is_campaign_recipient_eligible(
    campaign_type: CampaignType,
    profile: dict[str, Any],
) -> bool:
    """Réévalue l'éligibilité juste avant l'envoi."""
    if profile.get("status") != "active":
        return False
    if campaign_type == "service-update":
        return True
    return bool(
        profile.get("newsletter_subscribed") is True
        and profile.get("newsletter_consent_at")
        and not profile.get("newsletter_unsubscribed_at")
    )


def validate_frozen_campaign(
    campaign: dict[str, Any],
    campaign_type: CampaignType,
    confirmed_recipient_count: int,
    template_version: str,
) -> None:
    """Empêche une reprise de modifier le type ou l'audience figée."""
    if campaign.get("campaign_type") != campaign_type:
        raise HTTPException(status_code=409, detail="Le type de campagne ne correspond pas")
    if campaign.get("audience_total") != confirmed_recipient_count:
        raise HTTPException(status_code=409, detail="La confirmation du nombre est périmée")
    if campaign.get("template_version") != template_version:
        raise HTTPException(status_code=409, detail="La version du modèle a changé")
    if not campaign.get("audience_frozen_at"):
        raise HTTPException(status_code=409, detail="L'audience n'est pas figée")


def preference_update_payload(
    *,
    subscribed: bool,
    now: datetime | None = None,
    existing_unsubscribed_at: str | None = None,
) -> dict[str, Any]:
    """Produit une mutation cohérente et rejouable de la préférence marketing."""
    timestamp = (now or datetime.now(UTC)).isoformat()
    if subscribed:
        return {
            "newsletter_subscribed": True,
            "newsletter_consent_at": timestamp,
            "newsletter_consent_source": "email_preferences_link",
            "newsletter_consent_version": "2026-09-v1",
            "newsletter_unsubscribed_at": None,
            "updated_at": timestamp,
        }
    return {
        "newsletter_subscribed": False,
        "newsletter_unsubscribed_at": existing_unsubscribed_at or timestamp,
        "updated_at": timestamp,
    }


def normalize_sender(from_email: str) -> str:
    """Conserve un expéditeur nommé ou ajoute le nom Huntzen à une adresse brute."""
    sender = from_email.strip()
    if "<" in sender and sender.endswith(">"):
        return sender
    return f"Huntzen <{sender}>"


def _unique_emails(recipients: Iterable[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for recipient in recipients:
        email = recipient.strip()
        key = email.casefold()
        if not email or key in seen:
            continue
        seen.add(key)
        unique.append(email)
    return unique


def create_preference_token(
    *,
    user_id: str,
    secret: str,
    expires_in_seconds: int = 30 * 24 * 60 * 60,
) -> str:
    """Signe un jeton limité à la gestion des communications email."""
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": user_id,
            "purpose": "email-preferences",
            "iat": now,
            "exp": now + timedelta(seconds=expires_in_seconds),
        },
        secret,
        algorithm="HS256",
    )


def decode_preference_token(*, token: str, secret: str) -> dict[str, Any]:
    """Valide la signature, l'expiration et l'usage exclusif du jeton."""
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["sub", "purpose", "exp", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Preference token expired") from exc
    except jwt.PyJWTError as exc:
        raise ValueError("Invalid preference token") from exc
    if claims.get("purpose") != "email-preferences":
        raise ValueError("Invalid preference token purpose")
    return cast(dict[str, Any], claims)


def _email_shell(*, title: str, content: str, footer: str) -> str:
    return f"""<!doctype html>
<html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="padding:28px 32px;background:#071426;color:#fff"><strong style="font-size:24px">HuntZen</strong></td></tr>
<tr><td style="padding:32px"><h1 style="font-size:28px;line-height:1.2;margin:0 0 20px">{title}</h1>{content}</td></tr>
<tr><td style="padding:20px 32px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.6">{footer}</td></tr>
</table></td></tr></table></body></html>"""


def render_campaign_email(
    *,
    campaign_type: CampaignType,
    language: str | None,
    first_name: str | None,
    app_url: str,
    preferences_token: str,
    preferences_base_url: str | None = None,
) -> RenderedCampaignEmail:
    """Rend l'un des deux modèles verrouillés et localisés côté serveur."""
    if campaign_type not in CAMPAIGN_TEMPLATE_VERSIONS:
        raise ValueError("Unknown campaign type")

    is_french = bool(language and language.casefold().startswith("fr"))
    safe_name = escape((first_name or "").strip())
    encoded_token = quote(preferences_token, safe="")
    public_base = (preferences_base_url or app_url).rstrip("/")
    application_base = app_url.rstrip("/")
    preferences_url = f"{public_base}/api/marketing/preferences?token={encoded_token}"
    unsubscribe_url = f"{public_base}/api/marketing/unsubscribe?token={encoded_token}"

    if is_french:
        greeting = f"Bonjour {safe_name}," if safe_name else "Bonjour,"
        manage_label = "Choisir mes communications"
        footer = (
            "Vous recevez cet email au sujet de votre compte HuntZen. "
            f'<a href="{preferences_url}" style="color:#475569">{manage_label}</a> · '
            f'<a href="{preferences_url}" style="color:#475569">Se désabonner</a>'
        )
        if campaign_type == "service-update":
            subject = "HuntZen a évolué : découvrez votre nouvel espace emploi"
            title = "Votre recherche d’emploi prend un nouvel élan"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">HuntZen a évolué pour vous aider à chercher plus efficacement : recherche d’offres améliorée, assistants carrière, analyse de CV et suivi de candidatures.</p>
<p style="font-size:16px;line-height:1.7">Revenez découvrir votre nouvel espace et choisissez les communications que vous souhaitez recevoir.</p>
<p style="margin:28px 0"><a href="{application_base}/dashboard" style="background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Découvrir les nouveautés</a></p>
<p><a href="{preferences_url}" style="color:#0f6f80;font-weight:700">{manage_label}</a></p>"""
        else:
            subject = "Votre prochaine opportunité vous attend sur HuntZen"
            title = "Prêt à relancer votre recherche d’emploi ?"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">Plus de 4 500 personnes ont déjà trouvé un emploi avec HuntZen. Cette réussite nous encourage à aller encore plus loin pour vous.</p>
<p style="font-size:16px;line-height:1.7">Retrouvez vos assistants carrière, les offres adaptées à votre profil et les outils pour renforcer vos candidatures.</p>
<p style="margin:28px 0"><a href="{application_base}/pricing" style="background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Découvrir les abonnements</a></p>"""
    else:
        greeting = f"Hello {safe_name}," if safe_name else "Hello,"
        manage_label = "Choose my communications"
        footer = (
            "You are receiving this email about your HuntZen account. "
            f'<a href="{preferences_url}" style="color:#475569">{manage_label}</a> · '
            f'<a href="{preferences_url}" style="color:#475569">Unsubscribe</a>'
        )
        if campaign_type == "service-update":
            subject = "HuntZen has evolved: discover your new job space"
            title = "Give your job search new momentum"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">HuntZen has evolved to help you search more effectively with improved job search, career assistants, CV analysis and application tracking.</p>
<p style="font-size:16px;line-height:1.7">Come back to discover your new space and choose the communications you want to receive.</p>
<p style="margin:28px 0"><a href="{application_base}/dashboard" style="background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Discover what’s new</a></p>
<p><a href="{preferences_url}" style="color:#0f6f80;font-weight:700">{manage_label}</a></p>"""
        else:
            subject = "Your next opportunity is waiting on HuntZen"
            title = "Ready to restart your job search?"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">More than 4,500 people have already found a job with HuntZen. Their success encourages us to do even more for you.</p>
<p style="font-size:16px;line-height:1.7">Return to your career assistants, tailored job listings and tools that strengthen your applications.</p>
<p style="margin:28px 0"><a href="{application_base}/pricing" style="background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Discover subscriptions</a></p>"""

    return {
        "subject": subject,
        "html": _email_shell(title=title, content=content, footer=footer),
        "headers": {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    }


def collect_paginated(
    fetch_page: Callable[[int, int], list[Record]],
    *,
    page_size: int = 500,
) -> list[Record]:
    """Collecte toutes les pages d'une requête Supabase sans plafond implicite."""
    records: list[Record] = []
    start = 0
    while True:
        page = fetch_page(start, start + page_size - 1)
        records.extend(page)
        if len(page) < page_size:
            return records
        start += page_size


def build_resend_batches(
    *,
    recipients: Iterable[str],
    sender: str,
    subject: str,
    html: str,
) -> list[list[dict[str, Any]]]:
    """Construit des lots Resend de 100 destinataires individuels maximum."""
    messages = [
        {
            "from": normalize_sender(sender),
            "to": [email],
            "subject": subject,
            "html": html,
        }
        for email in _unique_emails(recipients)
    ]
    return [
        messages[index : index + RESEND_BATCH_SIZE]
        for index in range(0, len(messages), RESEND_BATCH_SIZE)
    ]


async def send_resend_batches(
    *,
    batches: list[list[dict[str, Any]]],
    campaign_id: str,
    batch_sender: Callable[[list[dict[str, Any]], dict[str, str]], dict[str, Any]],
    throttle_seconds: float = 0.25,
) -> dict[str, int]:
    """Envoie les lots avec une clé stable et moins de cinq requêtes par seconde."""
    sent = 0
    for index, batch in enumerate(batches, start=1):
        response = await asyncio.to_thread(
            batch_sender,
            batch,
            {
                "idempotency_key": f"{campaign_id}-{index}",
                "batch_validation": "permissive",
            },
        )
        sent += len(response.get("data") or [])
        if throttle_seconds and index < len(batches):
            await asyncio.sleep(throttle_seconds)
    return {"sent": sent, "batches": len(batches)}
