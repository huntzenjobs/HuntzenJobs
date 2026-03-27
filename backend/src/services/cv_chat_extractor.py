"""
CV Chat Extractor
=================
Extrait les données structurées d'un CV texte pour le contexte chat.
Utilise Groq JSON mode (rapide, ~1s) pour structurer les infos clés.
"""
import json
import logging
from typing import Any

from groq import Groq

from src.config.settings import settings

logger = logging.getLogger(__name__)


async def extract_cv_structured(cv_text: str) -> dict[str, Any]:
    """
    Extrait les données structurées d'un CV via Groq JSON mode.
    Utilisé pour enrichir le contexte du chat — pas pour l'analyse complète.

    Args:
        cv_text: Texte brut du CV (premiers 3000 chars utilisés)

    Returns:
        Dict structuré avec name, current_role, years_experience, key_skills, etc.
    """
    try:
        client = Groq(api_key=settings.get_groq_key())

        prompt = f"""Extrais les informations clés de ce CV. Retourne UNIQUEMENT du JSON valide.

CV (extrait):
{cv_text[:3000]}

Structure JSON attendue:
{{
  "name": "Prénom Nom (ou 'Candidat' si non trouvé)",
  "current_role": "Poste actuel ou dernier poste occupé",
  "years_experience": 0,
  "key_skills": ["skill1", "skill2", "skill3"],
  "education": ["Diplôme — École (année)"],
  "experiences": [
    {{"company": "Entreprise", "role": "Poste", "period": "2020-2023"}}
  ],
  "languages": ["Français", "Anglais"],
  "summary": "Résumé en 1 phrase du profil candidat"
}}"""

        response = client.chat.completions.create(
            model=settings.llm_model_fast,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=1024,
        )

        structured = json.loads(response.choices[0].message.content)
        logger.info(
            f"[CVChatExtractor] Structured: {structured.get('name')} / {structured.get('current_role')}"
        )
        return structured

    except Exception as e:
        logger.warning(f"[CVChatExtractor] Extraction failed, returning minimal data: {e}")
        return {
            "name": "Candidat",
            "current_role": "Non spécifié",
            "years_experience": 0,
            "key_skills": [],
            "education": [],
            "experiences": [],
            "languages": [],
            "summary": "CV partagé",
        }
