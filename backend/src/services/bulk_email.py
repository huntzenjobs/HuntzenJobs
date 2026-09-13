"""Préparation des envois groupés via l'API Batch de Resend."""

import asyncio
import hashlib
import re
from collections.abc import Callable, Iterable
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any, Literal, TypedDict, TypeVar, cast
from urllib.parse import quote
from uuid import UUID

import jwt
from bs4 import BeautifulSoup, Comment
from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

RESEND_BATCH_SIZE = 100
Record = TypeVar("Record")
CampaignType = Literal[
    "service-update",
    "marketing-reactivation",
    "marketing-reactivation-all",
]


class RenderedCampaignEmail(TypedDict):
    subject: str
    html: str
    headers: dict[str, str]


CAMPAIGN_TEMPLATE_VERSIONS: dict[CampaignType, str] = {
    "service-update": "2026-09-v1",
    "marketing-reactivation": "2026-09-v3",
    "marketing-reactivation-all": "2026-09-v3",
}


class CampaignSendRequest(BaseModel):
    campaign_id: UUID
    confirmed_recipient_count: int = Field(ge=0)
    editor_mode: Literal["simple", "html"] = "simple"
    subject: str | None = Field(default=None, max_length=200)
    main_text: str | None = Field(default=None, max_length=10_000)
    html_template: str | None = Field(default=None, max_length=200_000)

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, value: str | None) -> str | None:
        if value is None:
            return None
        subject = value.strip()
        if not subject or "\r" in subject or "\n" in subject:
            raise ValueError("Sujet invalide")
        return subject

    @model_validator(mode="after")
    def validate_editor_content(self) -> "CampaignSendRequest":
        has_custom_content = any(
            value is not None
            for value in (self.subject, self.main_text, self.html_template)
        )
        if not has_custom_content:
            return self
        if self.subject is None:
            raise ValueError("Sujet requis")
        if self.editor_mode == "simple":
            if not self.main_text or not self.main_text.strip():
                raise ValueError("Texte principal requis")
            if self.html_template is not None:
                raise ValueError("Le HTML libre est réservé au mode HTML")
            self.main_text = self.main_text.strip()
            return self
        if not self.html_template or not self.html_template.strip():
            raise ValueError("HTML requis")
        if self.main_text is not None:
            raise ValueError("Le texte simple est réservé au mode simple")
        self.html_template = validate_campaign_html(self.html_template)
        return self


def is_campaign_recipient_eligible(
    campaign_type: CampaignType,
    profile: dict[str, Any],
) -> bool:
    """Réévalue l'éligibilité juste avant l'envoi."""
    if profile.get("status") != "active":
        return False
    if campaign_type == "service-update":
        return True
    if campaign_type == "marketing-reactivation-all":
        return not profile.get("newsletter_unsubscribed_at")
    return bool(
        profile.get("newsletter_subscribed") is True
        and profile.get("newsletter_consent_at")
        and not profile.get("newsletter_unsubscribed_at")
    )


def newsletter_subscription_state(result: Any) -> bool | None:
    """Lit l'état newsletter d'une réponse Supabase éventuellement absente."""
    data = getattr(result, "data", None)
    if not isinstance(data, dict):
        return None
    return bool(data.get("newsletter_subscribed"))


def is_resend_quota_error(error: Exception) -> bool:
    """Distingue une limite de volume explicite d'un échec d'envoi ambigu."""
    return getattr(error, "error_type", None) in {
        "daily_quota_exceeded",
        "monthly_quota_exceeded",
    }


def validate_frozen_campaign(
    campaign: dict[str, Any],
    campaign_type: CampaignType,
    confirmed_recipient_count: int,
    template_version: str,
    *,
    content_hash: str | None = None,
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
    if content_hash is not None:
        stored_mode = campaign.get("editor_mode")
        stored_subject = campaign.get("email_subject")
        stored_content = campaign.get("email_content")
        legacy_fields = (
            stored_mode,
            stored_subject,
            stored_content,
            campaign.get("content_hash"),
        )
        if all(value is None for value in legacy_fields):
            return
        if not all(isinstance(value, str) for value in legacy_fields):
            raise HTTPException(status_code=409, detail="Le contenu gelé est incomplet")
        stored_hash = campaign_content_hash(
            editor_mode=stored_mode,
            subject=stored_subject,
            content=stored_content,
        )
        if stored_hash != campaign.get("content_hash") or stored_hash != content_hash:
            raise HTTPException(status_code=409, detail="Le contenu de la campagne a changé")


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
    """Conserve un expéditeur nommé ou ajoute le nom HuntzenJobs."""
    sender = from_email.strip()
    if "<" in sender and sender.endswith(">"):
        return sender
    return f"HuntzenJobs <{sender}>"


def campaign_content_hash(*, editor_mode: str, subject: str, content: str) -> str:
    """Calcule l'empreinte canonique utilisée pour sécuriser les reprises."""
    canonical = "\n".join((editor_mode, subject.strip(), content.strip()))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_campaign_html(html_template: str) -> str:
    """Valide puis canonise l'arbre HTML avec une liste blanche email."""
    allowed_tags = {
        "a", "b", "blockquote", "body", "br", "center", "div", "em",
        "h1", "h2", "h3", "h4", "h5", "h6", "head", "hr", "html",
        "i", "img", "li", "meta", "ol", "p", "span", "strong", "table",
        "tbody", "td", "tfoot", "th", "thead", "title", "tr", "u", "ul",
    }
    allowed_attributes = {
        "align", "alt", "bgcolor", "border", "cellpadding", "cellspacing",
        "charset", "class", "colspan", "height", "href", "id", "name",
        "rel", "role", "rowspan", "src", "style", "target", "title",
        "valign", "width",
    }
    soup = BeautifulSoup(html_template, "html.parser")
    for comment in soup.find_all(string=lambda value: isinstance(value, Comment)):
        comment.extract()
    for element in soup.find_all(True):
        if element.name not in allowed_tags:
            raise ValueError("Le HTML contient une balise interdite")
        if element.name in {"html", "body"} and element.attrs:
            raise ValueError("Les conteneurs HTML ne peuvent pas être masqués")
        for attribute, raw_value in element.attrs.items():
            if attribute.casefold().startswith("on") or attribute not in allowed_attributes:
                raise ValueError("Le HTML contient un attribut interdit")
            value = " ".join(raw_value) if isinstance(raw_value, list) else str(raw_value)
            lowered = value.strip().casefold()
            if attribute in {"href", "src"}:
                allowed_protocol = (
                    lowered.startswith(("https://", "http://", "mailto:", "cid:"))
                    or lowered.startswith("{{app_url}}/")
                    or (attribute == "href" and lowered.startswith("#"))
                )
                if not allowed_protocol:
                    raise ValueError("Le HTML contient une URL interdite")
            if attribute == "style" and re.search(
                r"(?:\\|javascript\s*:|expression\s*\(|url\s*\(|@import|var\s*\(|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|font-size\s*:\s*0(?:\D|$))",
                value,
                re.I,
            ):
                raise ValueError("Le HTML contient un style interdit")
    reserved_markers = {"unsubscribe_url", "preferences_url"}
    markers = set(re.findall(r"{{\s*([a-z_]+)\s*}}", str(soup)))
    if markers & reserved_markers:
        raise ValueError("Le désabonnement est ajouté automatiquement")
    if not markers.issubset({"first_name", "app_url"}):
        raise ValueError("Le HTML contient un marqueur inconnu")
    return str(soup)


def default_campaign_editor_content(
    campaign_type: CampaignType,
    language: str | None,
) -> tuple[str, str]:
    """Retourne le sujet et le texte simple proposés par défaut."""
    is_french = bool(language and language.casefold().startswith("fr"))
    if is_french:
        if campaign_type == "service-update":
            return (
                "HuntzenJobs a évolué : découvrez votre nouvel espace emploi",
                "HuntzenJobs a évolué pour vous aider à chercher plus efficacement : "
                "recherche d’offres améliorée, assistants carrière, analyse de CV et "
                "suivi de candidatures.\n\nRevenez découvrir votre nouvel espace et "
                "avancez plus efficacement dans votre recherche.",
            )
        return (
            "Du nouveau sur HuntzenJobs",
            "Cela fait peut-être un moment que vous n’avez pas ouvert HuntzenJobs. "
            "Depuis votre dernière visite, nous avons amélioré les outils qui vous "
            "accompagnent dans votre recherche d’emploi.\n\n"
            "Vous pouvez maintenant retrouver des offres adaptées à votre recherche, "
            "travailler votre CV et préparer vos candidatures avec nos assistants "
            "carrière, depuis un seul espace.\n\n"
            "Votre compte vous attend, vous pouvez reprendre simplement là où vous "
            "vous étiez arrêté.\n\nL’équipe HuntzenJobs",
        )
    if campaign_type == "service-update":
        return (
            "HuntzenJobs has evolved: discover your new job space",
            "HuntzenJobs has evolved to help you search more effectively with improved "
            "job search, career assistants, CV analysis and application tracking.\n\n"
            "Come back to discover your new space and move forward more effectively in "
            "your search.",
        )
    return (
        "What’s new on HuntzenJobs",
        "It may have been a while since you last opened HuntzenJobs. Since your last "
        "visit, we have improved the tools that support your job search.\n\n"
        "You can now find jobs that match your search, work on your CV and prepare "
        "applications with our career assistants, all in one place.\n\n"
        "Your account is ready whenever you are. Simply pick up where you left "
        "off.\n\nThe HuntzenJobs team",
    )


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


def _email_shell(
    *, title: str, content: str, footer: str, logo_url: str,
    brand_name: str = "HuntzenJobs",
    style_body: bool = True,
) -> str:
    footer_row = (
        f'<tr><td style="padding:20px 32px;background:#f8fafc;color:#64748b;'
        f'font-size:12px;line-height:1.6">{footer}</td></tr>'
        if footer
        else ""
    )
    body_attributes = (
        ' style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#111827"'
        if style_body
        else ""
    )
    return f"""<!doctype html>
<html><body{body_attributes}>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="padding:26px 32px;background:#071426"><img src="{logo_url}" width="180" alt="{brand_name}" style="display:block;width:180px;max-width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:32px"><h1 style="font-size:28px;line-height:1.2;margin:0 0 20px">{title}</h1>{content}</td></tr>
{footer_row}
</table></td></tr></table></body></html>"""


def _editable_email_shell(
    *,
    title: str,
    content: str,
    footer: str,
    app_url: str,
    style_body: bool = True,
) -> str:
    """Rend l'identité HuntzenJobs des nouvelles campagnes éditables."""
    footer_row = (
        f'<tr><td style="padding:20px 34px;background:#f4f7fa;color:#64748b;'
        f'font-size:12px;line-height:1.6;text-align:center">{footer}</td></tr>'
        if footer
        else ""
    )
    body_attributes = (
        ' style="margin:0;background:#f5f7f9;font-family:Arial,sans-serif;color:#243247"'
        if style_body
        else ""
    )
    wordmark_url = f"{app_url.rstrip('/')}/dashboard"
    return f"""<!doctype html>
<html><body{body_attributes}>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f7f9" style="background:#f5f7f9;font-family:Arial,Helvetica,sans-serif;color:#243247"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #e1e7ec;border-radius:12px;overflow:hidden">
<tr><td style="padding:24px 32px 18px"><a href="{wordmark_url}" title="HuntzenJobs" style="display:inline-block;color:#101b2d;text-decoration:none;font-size:22px;line-height:1;font-weight:800;letter-spacing:-0.6px"><span style="color:#101b2d">Huntzen</span><span style="color:#06bcd4">Jobs</span></a></td></tr>
<tr><td style="padding:0 32px"><div style="height:2px;line-height:2px;background:#06c5df">&nbsp;</div></td></tr>
<tr><td style="padding:30px 32px 34px"><h1 style="color:#101b2d;font-size:25px;line-height:1.3;letter-spacing:-0.3px;margin:0 0 22px">{title}</h1>{content}</td></tr>
{footer_row}
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
        footer = (
            f'<a href="{preferences_url}" style="color:#94a3b8;text-decoration:underline">Se désabonner</a>'
        )
        if campaign_type == "service-update":
            subject = "HuntZen a évolué : découvrez votre nouvel espace emploi"
            title = "Votre recherche d’emploi prend un nouvel élan"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">HuntZen a évolué pour vous aider à chercher plus efficacement : recherche d’offres améliorée, assistants carrière, analyse de CV et suivi de candidatures.</p>
<p style="font-size:16px;line-height:1.7">Revenez découvrir votre nouvel espace et avancez plus efficacement dans votre recherche.</p>
<p style="margin:28px 0"><a href="{application_base}/dashboard" style="display:inline-block;background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Découvrir les nouveautés</a></p>"""
        else:
            subject = "Votre prochaine opportunité vous attend sur HuntZen"
            title = "Prêt à relancer votre recherche d’emploi ?"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">Donnez un nouvel élan à votre recherche avec un accompagnement adapté à chaque étape.</p>
<p style="font-size:16px;line-height:1.7">Retrouvez vos assistants carrière, les offres adaptées à votre profil et les outils pour renforcer vos candidatures.</p>
<p style="margin:28px 0"><a href="{application_base}/pricing" style="display:inline-block;background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Découvrir les abonnements</a></p>"""
    else:
        greeting = f"Hello {safe_name}," if safe_name else "Hello,"
        footer = (
            f'<a href="{preferences_url}" style="color:#94a3b8;text-decoration:underline">Unsubscribe</a>'
        )
        if campaign_type == "service-update":
            subject = "HuntZen has evolved: discover your new job space"
            title = "Give your job search new momentum"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">HuntZen has evolved to help you search more effectively with improved job search, career assistants, CV analysis and application tracking.</p>
<p style="font-size:16px;line-height:1.7">Come back to discover your new space and move forward more effectively in your search.</p>
<p style="margin:28px 0"><a href="{application_base}/dashboard" style="display:inline-block;background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Discover what’s new</a></p>"""
        else:
            subject = "Your next opportunity is waiting on HuntZen"
            title = "Ready to restart your job search?"
            content = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
<p style="font-size:16px;line-height:1.7">Give your job search new momentum with guidance tailored to every step.</p>
<p style="font-size:16px;line-height:1.7">Return to your career assistants, tailored job listings and tools that strengthen your applications.</p>
<p style="margin:28px 0"><a href="{application_base}/pricing" style="display:inline-block;background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Discover subscriptions</a></p>"""

    return {
        "subject": subject,
        "html": _email_shell(
            title=title,
            content=content,
            footer=footer,
            logo_url=f"{application_base}/logo.png",
            brand_name="HuntZen",
        ),
        "headers": {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    }


def render_editable_campaign_email(
    *,
    campaign_type: CampaignType,
    editor_mode: Literal["simple", "html"],
    subject: str,
    content: str,
    language: str | None,
    first_name: str | None,
    app_url: str,
    preferences_token: str,
    preferences_base_url: str | None = None,
) -> RenderedCampaignEmail:
    """Rend le contenu gelé avec les liens propres au destinataire."""
    if campaign_type not in CAMPAIGN_TEMPLATE_VERSIONS:
        raise ValueError("Unknown campaign type")
    application_base = app_url.rstrip("/")
    public_base = (preferences_base_url or app_url).rstrip("/")
    encoded_token = quote(preferences_token, safe="")
    preferences_url = f"{public_base}/api/marketing/preferences?token={encoded_token}"
    unsubscribe_url = f"{public_base}/api/marketing/unsubscribe?token={encoded_token}"
    safe_name = escape((first_name or "").strip())

    if editor_mode == "html":
        content = validate_campaign_html(content)
        rendered_html = (
            content.replace("{{first_name}}", safe_name)
            .replace("{{app_url}}", application_base)
        )
        footer_text = "Gérer mes communications" if bool(
            language and language.casefold().startswith("fr")
        ) else "Manage my email preferences"
        mandatory_footer = (
            '<div style="display:block!important;opacity:1!important;visibility:visible!important;'
            'padding:20px 24px!important;background:#f8fafc!important;color:#64748b!important;'
            'font-size:12px!important;line-height:1.6!important;text-align:center!important">'
            f'<a href="{preferences_url}" style="display:inline!important;opacity:1!important;'
            'visibility:visible!important;color:#475569!important;text-decoration:underline!important;'
            f'font-size:12px!important">{footer_text}</a></div>'
        )
        body_end = re.search(r"</body\s*>", rendered_html, re.I)
        if body_end:
            rendered_html = (
                rendered_html[:body_end.start()]
                + mandatory_footer
                + rendered_html[body_end.start():]
            )
        else:
            rendered_html += mandatory_footer
    else:
        is_french = bool(language and language.casefold().startswith("fr"))
        greeting = (
            f"Bonjour {safe_name}," if is_french and safe_name else
            "Bonjour," if is_french else
            f"Hello {safe_name}," if safe_name else
            "Hello,"
        )
        paragraphs = "".join(
            f'<p style="font-size:16px;line-height:1.7">{escape(paragraph).replace(chr(10), "<br>")}</p>'
            for paragraph in re.split(r"\n\s*\n", content.strip())
            if paragraph.strip()
        )
        is_service = campaign_type == "service-update"
        cta_text = (
            "Découvrir les nouveautés" if is_french and is_service else
            "Accéder à mon espace" if is_french else
            "Discover what’s new" if is_service else
            "Open my account"
        )
        cta_path = "/dashboard"
        body = f"""
<p style="font-size:16px;line-height:1.7">{greeting}</p>
{paragraphs}
<p style="margin:28px 0"><a href="{application_base}{cta_path}" style="display:inline-block;background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">{cta_text}</a></p>"""
        footer_text = "Se désabonner" if is_french else "Unsubscribe"
        footer = (
            f'<a href="{preferences_url}" style="color:#94a3b8;text-decoration:underline">'
            f"{footer_text}</a>"
        )
        if is_service:
            rendered_html = _email_shell(
                title=escape(subject),
                content=body,
                footer=footer,
                logo_url=f"{application_base}/logo.png",
            )
        else:
            rendered_html = _editable_email_shell(
                title=escape(subject),
                content=body,
                footer=footer,
                app_url=application_base,
            )

    return {
        "subject": subject,
        "html": rendered_html,
        "headers": {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    }


def default_campaign_html_template(
    campaign_type: CampaignType,
    app_url: str,
) -> str:
    """Construit le point de départ HTML sans lien technique éditable."""
    subject, main_text = default_campaign_editor_content(campaign_type, "fr")
    is_service = campaign_type == "service-update"
    if is_service:
        paragraphs = "".join(
            f'<p style="font-size:16px;line-height:1.7;color:#344256">{escape(paragraph)}</p>'
            for paragraph in main_text.split("\n\n")
        )
        content = f"""
<p style="font-size:16px;line-height:1.7">Bonjour {{{{first_name}}}},</p>
{paragraphs}
<p style="margin:28px 0 0"><a href="{{{{app_url}}}}/dashboard" style="display:inline-block;background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:15px 24px;border-radius:10px">Découvrir les nouveautés</a></p>"""
        return _email_shell(
            title=escape(subject),
            content=content,
            footer="",
            logo_url=f"{app_url.rstrip('/')}/logo.png",
            style_body=False,
        )
    else:
        content = """
<p style="font-size:16px;line-height:1.7;color:#344256;margin:0 0 18px">Bonjour {{first_name}},</p>
<p style="font-size:16px;line-height:1.7;color:#344256;margin:0 0 18px">Cela fait peut-être un moment que vous n’avez pas ouvert HuntzenJobs. Depuis votre dernière visite, nous avons amélioré les outils qui vous accompagnent dans votre recherche d’emploi.</p>
<p style="font-size:16px;line-height:1.7;color:#344256;margin:0 0 18px">Vous pouvez maintenant retrouver <a href="{{app_url}}/jobs" style="color:#087f95;text-decoration:underline">des offres adaptées à votre recherche</a>, <a href="{{app_url}}/cv-analysis" style="color:#087f95;text-decoration:underline">travailler votre CV</a> et préparer vos candidatures avec <a href="{{app_url}}/assistant" style="color:#087f95;text-decoration:underline">nos assistants carrière</a>, depuis un seul espace.</p>
<p style="font-size:16px;line-height:1.7;color:#344256;margin:0 0 24px">Votre compte vous attend, vous pouvez reprendre simplement là où vous vous étiez arrêté.</p>
<p style="margin:0 0 24px"><a href="{{app_url}}/dashboard" style="display:inline-block;background:#06c5df;color:#071426;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">Accéder à mon espace</a></p>
<p style="font-size:14px;line-height:1.6;color:#526277;margin:0 0 26px">Vous souhaitez comparer les possibilités ? <a href="{{app_url}}/pricing" style="color:#087f95;text-decoration:underline;font-weight:700">Voir les formules</a>.</p>
<p style="font-size:15px;line-height:1.7;color:#344256;margin:0">À bientôt,<br><strong>L’équipe HuntzenJobs</strong></p>"""
    return _editable_email_shell(
        title=escape(subject),
        content=content,
        footer="",
        app_url="{{app_url}}",
        style_body=False,
    )


def campaign_request_content(
    campaign_type: CampaignType,
    request: CampaignSendRequest,
) -> tuple[Literal["simple", "html"], str, str, str]:
    """Normalise le contenu envoyé ou restaure le modèle par défaut."""
    if request.subject is None:
        subject, content = default_campaign_editor_content(campaign_type, "fr")
        editor_mode: Literal["simple", "html"] = "simple"
    else:
        subject = request.subject
        editor_mode = request.editor_mode
        if editor_mode == "simple":
            content = request.main_text or ""
        else:
            content = request.html_template or ""
    content_hash = campaign_content_hash(
        editor_mode=editor_mode,
        subject=subject,
        content=content,
    )
    return editor_mode, subject, content, content_hash


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
