"""Préférences marketing publiques accessibles par jeton signé."""

from html import escape
from urllib.parse import parse_qs
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from src.api.deps import get_supabase_client
from src.api.middleware import limiter
from src.config.settings import get_settings
from src.services.bulk_email import decode_preference_token

router = APIRouter()


def _user_id_from_token(token: str) -> str:
    settings = get_settings()
    if not settings.get_jwt_secret():
        raise HTTPException(status_code=503, detail="Configuration indisponible")
    try:
        claims = decode_preference_token(token=token, secret=settings.get_jwt_secret())
        return str(UUID(str(claims["sub"])))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré") from exc


def _preference_page(*, token: str, subscribed: bool, message: str | None = None) -> str:
    safe_token = escape(token, quote=True)
    state = "activées" if subscribed else "désactivées"
    feedback = f'<p style="color:#0f766e">{escape(message)}</p>' if message else ""
    return f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Préférences HuntZen</title></head>
<body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#111827">
<main style="max-width:560px;margin:64px auto;padding:32px;background:white;border-radius:18px">
<h1>Vos communications HuntZen</h1>{feedback}
<p>Les communications sur les nouveautés et offres HuntZen sont actuellement <strong>{state}</strong>.</p>
<form method="post" action="/api/marketing/preferences?token={safe_token}" style="display:inline-block;margin-right:8px">
<button name="subscribed" value="true" style="padding:12px 18px">Les accepter</button></form>
<form method="post" action="/api/marketing/preferences?token={safe_token}" style="display:inline-block">
<button name="subscribed" value="false" style="padding:12px 18px">Les refuser</button></form>
</main></body></html>"""


@router.get("/preferences", response_class=HTMLResponse)
@limiter.limit("10/minute")
async def show_preferences(
    request: Request,
    token: str = Query(min_length=20, max_length=4096),
) -> HTMLResponse:
    """Affiche la préférence actuelle sans la modifier."""
    user_id = _user_id_from_token(token)
    result = (
        get_supabase_client()
        .table("profiles")
        .select("newsletter_subscribed")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    return HTMLResponse(
        _preference_page(
            token=token,
            subscribed=bool(result.data.get("newsletter_subscribed")),
        )
    )


@router.post("/preferences", response_class=HTMLResponse)
@limiter.limit("10/minute")
async def save_preferences(
    request: Request,
    token: str = Query(min_length=20, max_length=4096),
) -> HTMLResponse:
    """Applique le choix explicite envoyé par le formulaire public."""
    user_id = _user_id_from_token(token)
    form = parse_qs((await request.body()).decode("utf-8"))
    raw_value = (form.get("subscribed") or [""])[0].casefold()
    if raw_value not in {"true", "false"}:
        raise HTTPException(status_code=400, detail="Choix invalide")
    subscribed = raw_value == "true"
    result = get_supabase_client().rpc(
        "set_newsletter_preference_for_user",
        {"p_user_id": user_id, "p_subscribed": subscribed},
    ).execute()
    if result.data is not True:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    return HTMLResponse(
        _preference_page(
            token=token,
            subscribed=subscribed,
            message="Votre choix a bien été enregistré.",
        )
    )


@router.post("/unsubscribe")
@limiter.limit("10/minute")
async def unsubscribe(
    request: Request,
    token: str = Query(min_length=20, max_length=4096),
) -> dict[str, bool]:
    """Désabonnement en un clic, idempotent pour les clients email."""
    user_id = _user_id_from_token(token)
    get_supabase_client().rpc(
        "set_newsletter_preference_for_user",
        {"p_user_id": user_id, "p_subscribed": False},
    ).execute()
    return {"ok": True, "subscribed": False}
