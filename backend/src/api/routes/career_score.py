"""
Career Score API Routes
=======================
GET  /api/career-score          — retourne le score en cache (ou calcule si absent)
POST /api/career-score/calculate — force le recalcul complet (Activity + AI + XP)
POST /api/career-score/xp-event  — enregistre un événement XP

Career Score /100 =
  Activity Score  (40pts max) — données réelles DB
  AI Score        (40pts max) — appel LLM (Groq / Llama 3.3 70B)
  XP Score        (20pts max) — gamification events
"""

import json
import logging
import os
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from langchain_groq import ChatGroq
from pydantic import BaseModel

from src.api.deps import CurrentUserDep, get_supabase_client
from src.config.settings import get_settings
from src.services.notifications import create_notification
from src.services.user_events import log_event

logger = logging.getLogger(__name__)
router = APIRouter()

# XP par type d'événement
XP_TABLE = {
    "cv_analysis": 10,
    "application": 5,
    "interview_sim": 20,
    "job_search": 2,
    "profile_complete": 15,
    "referral_validated": 25,
}

# Cache TTL : 24h
SCORE_CACHE_HOURS = 24


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class XPEventRequest(BaseModel):
    event_type: str
    metadata: dict | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_prompt() -> str:
    prompt_path = os.path.join(
        os.path.dirname(__file__), "../../../../prompts/career_score_advisor.txt"
    )
    try:
        with open(prompt_path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        logger.warning("[career_score] Prompt file not found, using fallback")
        return (
            "Évalue ce profil candidat et attribue un score d'employabilité (0-40). "
            "Réponds uniquement en JSON: {\"ai_score\": <int>, \"justification\": \"<string>\"}"
        )


def _calculate_activity_score(supabase, user_id: str) -> int:
    """
    Calcule le Activity Score (0-40) depuis les tables existantes.
    +10 pts : CV analysé au moins 1 fois
    +10 pts : Profil complété à 80%+
    +10 pts : Au moins une candidature envoyée
    +10 pts : Simulation entretien faite
    """
    score = 0

    try:
        # CV analysé ?
        quota_res = (
            supabase.table("usage_quotas")
            .select("cv_analyses_used")
            .eq("user_id", user_id)
            .order("quota_date", desc=True)
            .limit(1)
            .execute()
        )
        cv_analyses = sum(
            r.get("cv_analyses_used", 0) or 0
            for r in (quota_res.data or [])
        )
        if cv_analyses > 0:
            score += 10

        # Profil complété (≥4 champs sur 5) ?
        profile_res = (
            supabase.table("profiles")
            .select("full_name, title, bio, avatar_url, cv_url")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if profile_res.data:
            p = profile_res.data
            filled = sum(
                1
                for f in ["full_name", "title", "bio", "avatar_url", "cv_url"]
                if p.get(f)
            )
            if filled >= 4:
                score += 10

        # Candidature envoyée ?
        apps_res = (
            supabase.table("user_applications")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        if (apps_res.count or 0) > 0:
            score += 10

        # Simulation entretien ?
        assistant_res = (
            supabase.table("usage_quotas")
            .select("assistant_messages_used")
            .eq("user_id", user_id)
            .order("quota_date", desc=True)
            .limit(7)
            .execute()
        )
        assistant_total = sum(
            r.get("assistant_messages_used", 0) or 0
            for r in (assistant_res.data or [])
        )
        if assistant_total > 0:
            score += 10

    except Exception as e:
        logger.error(f"[career_score] activity_score error for {user_id}: {e}")

    return score


def _calculate_xp_score(supabase, user_id: str) -> tuple[int, int]:
    """
    Retourne (xp_score plafonné à 20, total_xp brut).
    xp_score = min(20, total_xp // 10)
    """
    try:
        xp_res = (
            supabase.table("user_xp_events")
            .select("xp_gained")
            .eq("user_id", user_id)
            .limit(500)
            .execute()
        )
        total_xp = sum(r.get("xp_gained", 0) for r in (xp_res.data or []))
        return min(20, total_xp // 10), total_xp
    except Exception as e:
        logger.error(f"[career_score] xp_score error for {user_id}: {e}")
        return 0, 0


def _calculate_ai_score(supabase, user_id: str) -> tuple[int, str]:
    """
    Appelle le LLM pour scorer l'employabilité (0-40).
    Retourne (ai_score, justification).
    Fallback : (0, "") si pas de CV ou erreur.
    """
    try:
        # Récupère profil (champs existants uniquement)
        profile_res = (
            supabase.table("profiles")
            .select("full_name, title, bio")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        profile = profile_res.data or {}

        # Récupère cv_text + ats_score depuis cv_analyses (source correcte)
        cv_res = (
            supabase.table("cv_analyses")
            .select("cv_text, ats_score")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        cv_data = cv_res.data[0] if cv_res.data else {}
        cv_text = cv_data.get("cv_text") or ""
        ats_score = cv_data.get("ats_score") or 0

        # Pas de CV ni bio → fallback sans LLM call
        if not cv_text and not profile.get("bio"):
            return 0, ""

        prompt_template = _load_prompt()
        prompt = prompt_template.format(
            full_name=profile.get("full_name") or "Non renseigné",
            sector=profile.get("title") or "Non renseigné",
            years_experience="Non renseigné",
            skills="Non renseigné",
            ats_score=ats_score,
            cv_summary=(cv_text or profile.get("bio") or "")[:500],
        )

        settings = get_settings()
        llm = ChatGroq(
            model=settings.llm_model_powerful,
            api_key=settings.get_groq_key(),
            temperature=0.1,
            max_tokens=200,
        )
        response = llm.invoke(prompt)
        content = response.content.strip()

        # Extrait le JSON
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        parsed = json.loads(content)
        ai_score = max(0, min(40, int(parsed.get("ai_score", 0))))
        justification = str(parsed.get("justification", ""))
        return ai_score, justification

    except Exception as e:
        logger.error(f"[career_score] ai_score LLM error for {user_id}: {e}")
        return 0, ""


def _upsert_score(supabase, user_id: str, activity: int, ai: int, xp: int, justification: str) -> dict:
    """Sauvegarde le score calculé en cache (user_career_score)."""
    total = activity + ai + xp
    now = datetime.now(UTC)
    next_recalc = now + timedelta(hours=SCORE_CACHE_HOURS)

    payload = {
        "user_id": user_id,
        "total_score": total,
        "activity_score": activity,
        "ai_score": ai,
        "xp_score": xp,
        "ai_justification": justification,
        "last_calculated_at": now.isoformat(),
        "next_recalc_at": next_recalc.isoformat(),
    }
    supabase.table("user_career_score").upsert(payload, on_conflict="user_id").execute()
    return payload


# ---------------------------------------------------------------------------
# GET /api/career-score
# ---------------------------------------------------------------------------

@router.get("")
async def get_career_score(current_user: CurrentUserDep):
    """Retourne le Career Score depuis le cache, ou calcule si absent/expiré."""
    supabase = get_supabase_client()
    user_id = current_user["id"]

    try:
        cached = (
            supabase.table("user_career_score")
            .select("*")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if cached.data:
            next_recalc = cached.data.get("next_recalc_at", "")
            is_fresh = next_recalc and datetime.fromisoformat(
                next_recalc.replace("Z", "+00:00")
            ) > datetime.now(UTC)
            if is_fresh:
                return cached.data
    except Exception as e:
        logger.warning(f"[career_score] cache read error for {user_id}: {e}")

    # Cache absent ou expiré → calcul complet
    return await _do_calculate(user_id, supabase)


# ---------------------------------------------------------------------------
# POST /api/career-score/calculate
# ---------------------------------------------------------------------------

@router.post("/calculate")
async def calculate_career_score(current_user: CurrentUserDep):
    """Force le recalcul complet du Career Score (Activity + AI + XP)."""
    supabase = get_supabase_client()
    user_id = current_user["id"]
    return await _do_calculate(user_id, supabase)


async def _do_calculate(user_id: str, supabase) -> dict:
    activity_score = _calculate_activity_score(supabase, user_id)
    xp_score, total_xp = _calculate_xp_score(supabase, user_id)
    ai_score, justification = _calculate_ai_score(supabase, user_id)

    result = _upsert_score(supabase, user_id, activity_score, ai_score, xp_score, justification)

    # Notif si score > 60 (milestone)
    total = result["total_score"]
    if total >= 60:
        create_notification(
            supabase,
            user_id,
            "career_progress",
            "Ton profil devient vraiment intéressant !",
            f"Ton Career Score est à {total}/100. Ton profil devient vraiment intéressant pour les recruteurs.",
            {"score": total},
        )

    logger.info(
        f"[career_score] user={user_id} "
        f"activity={activity_score} ai={ai_score} xp={xp_score} total={total}"
    )

    # Tracking événement (best-effort)
    log_event(
        supabase,
        event_name="career_score_calculated",
        event_label=f"Un utilisateur a calculé son score carrière — {total}/100",
        category="action",
        user_id=user_id,
        feature="career_score",
        severity="info",
        properties={"score": total, "activity": activity_score, "ai": ai_score, "xp": xp_score},
    )

    return result


# ---------------------------------------------------------------------------
# POST /api/career-score/xp-event
# ---------------------------------------------------------------------------

@router.post("/xp-event", status_code=status.HTTP_201_CREATED)
async def record_xp_event(body: XPEventRequest, current_user: CurrentUserDep):
    """Enregistre un événement XP (cv_analysis, application, interview_sim, etc.)."""
    if body.event_type not in XP_TABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"event_type must be one of: {', '.join(XP_TABLE.keys())}",
        )

    supabase = get_supabase_client()
    user_id = current_user["id"]
    xp_gained = XP_TABLE[body.event_type]

    try:
        supabase.table("user_xp_events").insert({
            "user_id": user_id,
            "event_type": body.event_type,
            "xp_gained": xp_gained,
            "metadata": body.metadata or {},
        }).execute()

        # Invalide le cache pour forcer recalcul au prochain GET
        # -1s pour éviter la race condition (now() == next_recalc_at → cache vu comme "frais")
        supabase.table("user_career_score").update(
            {"next_recalc_at": (datetime.now(UTC) - timedelta(seconds=1)).isoformat()}
        ).eq("user_id", user_id).execute()

        logger.info(f"[career_score] xp_event={body.event_type} +{xp_gained}xp user={user_id}")
        return {"ok": True, "event_type": body.event_type, "xp_gained": xp_gained}

    except Exception as e:
        logger.error(f"[career_score] xp_event error for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to record XP event") from None
