"""
Branding Memory — persistance et utilitaires du profil branding.
=================================================================
Service de persistance du profil branding utilisateur :
- Nettoyage et normalisation du profil
- Merge incrémental des mises à jour LLM
- Calcul du score de complétion et de l'état courant
- Construction du contexte injecté dans le prompt
- Chargement / sauvegarde / suppression de session (Supabase)
- Hydratation initiale depuis un CV structuré

Adapté depuis la branche brand-agent (commit ~2026-03) au code actuel.
# TODO: brancher branding_memory dans l'agent (backend/src/agents/branding/main_agent.py)
#       — voir load_branding_session / save_branding_turn / build_branding_context
"""

from __future__ import annotations

import logging
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

from supabase import Client

from src.models.schemas import BrandingProfileMemory

logger = logging.getLogger(__name__)

BRANDING_ASSISTANT_TYPE = "branding"

BRANDING_STATES = [
    "discovery",
    "goals",
    "voice_preferences",
    "audience_topics",
    "content_generation",
]

_TEXT_FIELDS = (
    "professional_identity",
    "current_context",
    "primary_goal",
)
_LIST_FIELDS = (
    "target_audience",
    "content_pillars",
    "content_boundaries",
    "platforms",
    "format_preferences",
)


# ═══════════════════════════════════════════════════════════════════════════════
# Utilitaires internes
# ═══════════════════════════════════════════════════════════════════════════════


def _clean_text(value: Any) -> str | None:
    """Nettoie une valeur texte (None si vide après strip)."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    return value or None


def _clean_list(values: Any) -> list[str]:
    """Déduplique et nettoie une liste de chaînes (préserve l'ordre)."""
    if not values:
        return []
    if isinstance(values, str):
        values = [values]
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in values:
        text = _clean_text(item)
        if not text:
            continue
        key = text.casefold()
        if key not in seen:
            seen.add(key)
            cleaned.append(text)
    return cleaned


# ═══════════════════════════════════════════════════════════════════════════════
# Logique de profil
# ═══════════════════════════════════════════════════════════════════════════════


def normalize_branding_profile(
    profile: dict[str, Any] | BrandingProfileMemory | None,
) -> dict[str, Any]:
    """Normalise n'importe quelle forme de profil vers la structure canonique."""
    if isinstance(profile, BrandingProfileMemory):
        data = profile.model_dump()
    else:
        data = deepcopy(profile or {})

    normalized: dict[str, Any] = BrandingProfileMemory().model_dump()

    for field in _TEXT_FIELDS:
        normalized[field] = _clean_text(data.get(field))

    for field in _LIST_FIELDS:
        normalized[field] = _clean_list(data.get(field))

    voice_preferences = data.get("voice_preferences") or {}
    normalized["voice_preferences"] = (
        {
            str(k): v.strip() if isinstance(v, str) else v
            for k, v in voice_preferences.items()
            if v not in (None, "", [], {})
        }
        if isinstance(voice_preferences, dict)
        else {}
    )

    normalized["current_state"] = determine_branding_state(
        {**normalized, "current_state": _clean_text(data.get("current_state")) or "discovery"}
    )
    normalized["profile_completion"] = calculate_profile_completion(normalized)
    normalized["ready_for_generation"] = (
        normalized["current_state"] == "content_generation"
        and normalized["profile_completion"] >= 70
    )
    return normalized


def calculate_profile_completion(
    profile: dict[str, Any] | BrandingProfileMemory | None,
) -> int:
    """Calcule un score de complétion stable (0-100) du profil branding."""
    data = profile.model_dump() if isinstance(profile, BrandingProfileMemory) else (profile or {})
    score = 0
    if _clean_text(data.get("professional_identity")):
        score += 20
    if _clean_text(data.get("current_context")):
        score += 10
    if _clean_text(data.get("primary_goal")):
        score += 20
    if data.get("voice_preferences"):
        score += 20
    if _clean_list(data.get("content_boundaries")):
        score += 10
    if _clean_list(data.get("target_audience")):
        score += 10
    if _clean_list(data.get("content_pillars")):
        score += 5
    if _clean_list(data.get("platforms")):
        score += 3
    if _clean_list(data.get("format_preferences")):
        score += 2
    return max(0, min(100, score))


def determine_branding_state(
    profile: dict[str, Any] | BrandingProfileMemory | None,
) -> str:
    """Détermine l'état branding suivant en fonction de la mémoire courante."""
    data = profile.model_dump() if isinstance(profile, BrandingProfileMemory) else (profile or {})

    if not _clean_text(data.get("professional_identity")) or not _clean_text(
        data.get("current_context")
    ):
        return "discovery"
    if not _clean_text(data.get("primary_goal")):
        return "goals"
    if not data.get("voice_preferences") or not _clean_list(data.get("content_boundaries")):
        return "voice_preferences"
    if (
        not _clean_list(data.get("target_audience"))
        or not _clean_list(data.get("content_pillars"))
        or not _clean_list(data.get("platforms"))
    ):
        return "audience_topics"
    return "content_generation"


def merge_branding_profile(
    existing: dict[str, Any] | BrandingProfileMemory | None,
    updates: dict[str, Any] | None,
) -> tuple[dict[str, Any], list[str]]:
    """Fusionne les mises à jour extraites dans le profil branding persistant.

    Returns:
        (profil_fusionné, liste_des_champs_mis_à_jour)
    """
    merged = normalize_branding_profile(existing)
    updates = updates or {}
    updated_fields: list[str] = []

    for field in _TEXT_FIELDS:
        new_value = _clean_text(updates.get(field))
        if new_value and new_value != merged.get(field):
            merged[field] = new_value
            updated_fields.append(field)

    for field in _LIST_FIELDS:
        new_values = _clean_list(updates.get(field))
        if new_values:
            combined = _clean_list([*merged.get(field, []), *new_values])
            if combined != merged.get(field, []):
                merged[field] = combined
                updated_fields.append(field)

    voice_updates = updates.get("voice_preferences") or {}
    if isinstance(voice_updates, dict):
        cleaned_voice = {
            str(k): v.strip() if isinstance(v, str) else v
            for k, v in voice_updates.items()
            if v not in (None, "", [], {})
        }
        if cleaned_voice:
            merged_voice = dict(merged.get("voice_preferences", {}))
            merged_voice_updated = {**merged_voice, **cleaned_voice}
            if merged_voice != merged_voice_updated:
                merged["voice_preferences"] = merged_voice_updated
                updated_fields.append("voice_preferences")

    state_override = _clean_text(updates.get("current_state"))
    if state_override in BRANDING_STATES:
        merged["current_state"] = state_override

    merged["current_state"] = determine_branding_state(merged)
    merged["profile_completion"] = calculate_profile_completion(merged)
    merged["ready_for_generation"] = (
        merged["current_state"] == "content_generation" and merged["profile_completion"] >= 70
    )

    return merged, updated_fields


def build_branding_context(
    profile: dict[str, Any] | BrandingProfileMemory | None,
) -> str:
    """Génère le bloc de contexte compact injecté dans le prompt système."""
    data = normalize_branding_profile(profile)
    parts = [
        f"[STATE] {data['current_state']}",
        f"[PROFILE_COMPLETION] {data['profile_completion']}%",
    ]
    if data.get("professional_identity"):
        parts.append(f"- Identité pro: {data['professional_identity']}")
    if data.get("current_context"):
        parts.append(f"- Contexte actuel: {data['current_context']}")
    if data.get("primary_goal"):
        parts.append(f"- Objectif principal: {data['primary_goal']}")
    if data.get("target_audience"):
        parts.append(f"- Audience cible: {', '.join(data['target_audience'])}")
    if data.get("content_pillars"):
        parts.append(f"- Piliers de contenu: {', '.join(data['content_pillars'])}")
    if data.get("platforms"):
        parts.append(f"- Plateformes: {', '.join(data['platforms'])}")
    if data.get("format_preferences"):
        parts.append(f"- Formats préférés: {', '.join(data['format_preferences'])}")
    if data.get("voice_preferences"):
        voice = "; ".join(f"{k}: {v}" for k, v in data["voice_preferences"].items())
        parts.append(f"- Préférences de ton: {voice}")
    if data.get("content_boundaries"):
        parts.append(f"- À éviter: {', '.join(data['content_boundaries'])}")
    return "\n".join(parts)


def hydrate_branding_profile_from_cv(
    cv_structured: dict[str, Any] | None,
    existing: dict[str, Any] | BrandingProfileMemory | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Initialise la mémoire branding depuis les données structurées d'un CV.

    Returns:
        (profil_fusionné, liste_des_champs_mis_à_jour)
    """
    cv_structured = cv_structured or {}

    role = _clean_text(cv_structured.get("current_role"))
    years_experience = cv_structured.get("years_experience")
    summary = _clean_text(cv_structured.get("summary"))
    skills = _clean_list(cv_structured.get("key_skills"))[:5]
    education = _clean_list(cv_structured.get("education"))[:2]

    professional_identity = summary or role
    current_context_parts: list[str] = []
    if role:
        current_context_parts.append(f"Rôle actuel ou récent: {role}")
    if isinstance(years_experience, int) and years_experience > 0:
        current_context_parts.append(f"Expérience: {years_experience} ans")
    if education:
        current_context_parts.append(f"Formation: {education[0]}")

    updates = {
        "professional_identity": professional_identity,
        "current_context": (
            " • ".join(current_context_parts) if current_context_parts else None
        ),
        "content_pillars": skills,
        "current_state": "goals" if (professional_identity or current_context_parts) else None,
    }

    return merge_branding_profile(existing, updates)


# ═══════════════════════════════════════════════════════════════════════════════
# Persistance Supabase
# ═══════════════════════════════════════════════════════════════════════════════


def load_branding_session(
    supabase: Client,
    user_id: str,
    session_id: str,
) -> dict[str, Any]:
    """Charge l'historique de conversation et le profil branding d'une session.

    Priorité : table branding_profiles > contexte coach_conversations > profil vide.
    """
    conversation_res = (
        supabase.table("coach_conversations")
        .select("id, messages, context")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .eq("assistant_type", BRANDING_ASSISTANT_TYPE)
        .limit(1)
        .execute()
    )
    profile_res = (
        supabase.table("branding_profiles")
        .select("*")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    )

    conversation = conversation_res.data[0] if conversation_res.data else None
    profile_row = profile_res.data[0] if profile_res.data else None

    profile_source = profile_row or (
        (conversation or {}).get("context") or {}
    ).get("branding_profile")
    profile = normalize_branding_profile(profile_source)

    return {
        "conversation_id": conversation.get("id") if conversation else None,
        "messages": (
            (conversation.get("messages") or [])[-20:] if conversation else []
        ),
        "branding_profile": profile,
    }


def save_branding_turn(
    supabase: Client,
    *,
    user_id: str,
    session_id: str,
    user_message: str,
    assistant_response: str,
    branding_profile: dict[str, Any],
    existing_messages: list[dict[str, Any]] | None = None,
    conversation_id: str | None = None,
) -> None:
    """Persiste un tour de conversation branding et le profil mis à jour."""
    now = datetime.now(UTC).isoformat()
    messages = list(existing_messages or [])
    messages.append({"role": "user", "content": user_message, "timestamp": now})
    messages.append({"role": "assistant", "content": assistant_response, "timestamp": now})
    if len(messages) > 50:
        messages = messages[-50:]

    title = next(
        (
            msg.get("content", "")[:60].strip()
            for msg in messages
            if msg.get("role") == "user" and msg.get("content")
        ),
        "Nouvelle session branding",
    )

    conversation_payload = {
        "user_id": user_id,
        "session_id": session_id,
        "assistant_type": BRANDING_ASSISTANT_TYPE,
        "messages": messages,
        "title": title,
        "context": {
            "current_state": branding_profile.get("current_state", "discovery"),
            "profile_completion": branding_profile.get("profile_completion", 0),
            "ready_for_generation": branding_profile.get("ready_for_generation", False),
            "branding_profile": branding_profile,
        },
    }

    if conversation_id:
        conversation_res = (
            supabase.table("coach_conversations")
            .update(conversation_payload)
            .eq("id", conversation_id)
            .execute()
        )
        conversation_data = (
            conversation_res.data[0] if conversation_res.data else {"id": conversation_id}
        )
    else:
        conversation_res = (
            supabase.table("coach_conversations").insert(conversation_payload).execute()
        )
        conversation_data = conversation_res.data[0] if conversation_res.data else {}

    profile_payload = {
        "user_id": user_id,
        "session_id": session_id,
        "conversation_id": conversation_data.get("id") or conversation_id,
        "current_state": branding_profile.get("current_state", "discovery"),
        "professional_identity": branding_profile.get("professional_identity"),
        "current_context": branding_profile.get("current_context"),
        "primary_goal": branding_profile.get("primary_goal"),
        "target_audience": branding_profile.get("target_audience", []),
        "content_pillars": branding_profile.get("content_pillars", []),
        "voice_preferences": branding_profile.get("voice_preferences", {}),
        "content_boundaries": branding_profile.get("content_boundaries", []),
        "platforms": branding_profile.get("platforms", []),
        "format_preferences": branding_profile.get("format_preferences", []),
        "profile_completion": branding_profile.get("profile_completion", 0),
        "ready_for_generation": branding_profile.get("ready_for_generation", False),
    }
    supabase.table("branding_profiles").upsert(
        profile_payload, on_conflict="user_id,session_id"
    ).execute()
    logger.info(
        "[branding_memory] session saved",
        extra={
            "user_id": user_id,
            "session_id": session_id,
            "state": branding_profile.get("current_state"),
            "completion": branding_profile.get("profile_completion"),
        },
    )


def delete_branding_session(
    supabase: Client,
    user_id: str,
    session_id: str,
) -> None:
    """Supprime la conversation branding et le profil d'une session utilisateur."""
    supabase.table("branding_profiles").delete().eq("user_id", user_id).eq(
        "session_id", session_id
    ).execute()
    supabase.table("coach_conversations").delete().eq("user_id", user_id).eq(
        "session_id", session_id
    ).eq("assistant_type", BRANDING_ASSISTANT_TYPE).execute()
    logger.info(
        "[branding_memory] session deleted",
        extra={"user_id": user_id, "session_id": session_id},
    )
