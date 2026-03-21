"""
CV Analyzer Agent - Intégré au système multi-agent HuntZen
Utilise:
- Marker pour conversion PDF → Markdown (haute qualité)
- Groq llama-3.3-70b pour l'analyse approfondie des CVs
"""
import asyncio
import json
import os
import tempfile
from typing import Any

from groq import Groq
from job_finder.config import get_settings
from langchain_core.messages import AIMessage
from langchain_groq import ChatGroq

settings = get_settings()

# Modèles Groq optimisés pour différentes tâches
POWERFUL_MODEL = "llama-3.3-70b-versatile"  # Pour analyses complexes
FAST_MODEL = "llama-3.1-8b-instant"  # Pour tâches rapides

# Client Groq direct pour JSON mode
groq_client = Groq(api_key=settings.groq_api_key)

# LLM LangChain pour compatibilité avec le reste du système
cv_analyzer_llm = ChatGroq(
    model=POWERFUL_MODEL,
    api_key=settings.groq_api_key,
    temperature=0.1,
    max_tokens=4096
)

fast_llm = ChatGroq(
    model=FAST_MODEL,
    api_key=settings.groq_api_key,
    temperature=0.1,
    max_tokens=1024
)

# ==========================================
# MARKER PDF CONVERTER (Lazy Loading)
# ==========================================
_marker_models = None

def get_marker_models():
    """Lazy loading des modèles Marker pour éviter le cold start."""
    global _marker_models
    if _marker_models is None:
        from marker.models import create_model_dict
        print("[CV_ANALYZER] Chargement des modèles Marker...")
        _marker_models = create_model_dict()
        print("[CV_ANALYZER] Modèles Marker chargés ✓")
    return _marker_models


def extract_text_from_pdf_marker(pdf_path: str) -> str:
    """
    Extrait le texte d'un PDF avec Marker (haute qualité).
    """
    models = get_marker_models()

    from marker.converters.pdf import PdfConverter
    converter = PdfConverter(artifact_dict=models)
    rendered = converter(pdf_path)
    return rendered.markdown


async def extract_text_from_pdf_bytes(content: bytes) -> str:
    """
    Extrait le texte d'un PDF depuis des bytes.
    Utilise un fichier temporaire pour Marker.
    """
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Exécuter dans un thread pour ne pas bloquer l'event loop
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, extract_text_from_pdf_marker, tmp_path)
        return text
    finally:
        os.unlink(tmp_path)


CV_ANALYSIS_PROMPT = """Tu es un expert en recrutement (Technical Recruiter) spécialisé dans le matching de profils.
Ton rôle est d'analyser un CV et de le comparer à une offre d'emploi.

CONSIGNES :
1. Analyse la structure du CV pour bien distinguer les rubriques.
2. Évalue le matching sur une échelle de 0 à 100%.
3. Identifie les "Hard Skills" manquantes.
4. Propose 3 suggestions concrètes pour améliorer le CV par rapport à ce poste.

FORMAT DE SORTIE (JSON UNIQUEMENT) :
{
  "score_matching": 85,
  "points_forts": ["Point 1", "Point 2"],
  "points_faibles": ["Point 1", "Point 2"],
  "competences_manquantes": ["Skill 1", "Skill 2"],
  "suggestions_amelioration": ["Suggestion 1", "Suggestion 2", "Suggestion 3"],
  "verdict": "Résumé en 2-3 phrases"
}"""


ATS_ANALYSIS_PROMPT = """Tu es un expert ATS (Applicant Tracking System) spécialisé dans l'optimisation de CVs.

ANALYSE LE CV SELON CES CRITÈRES (score /100):

1. FORMAT (20 pts):
   - Sections claires (Expérience, Formation, Compétences)
   - Longueur appropriée (1-2 pages)
   - Contact présent

2. MOTS-CLÉS (30 pts):
   - Termes techniques pertinents
   - Verbes d'action (géré, développé, implémenté)
   - Résultats quantifiés (%, €, chiffres)

3. EXPÉRIENCE (25 pts):
   - Titres de poste clairs
   - Noms d'entreprises
   - Dates présentes
   - Responsabilités décrites

4. COMPÉTENCES (15 pts):
   - Compétences techniques listées
   - Soft skills mentionnées
   - Langues
   - Outils/Logiciels

5. FORMATION (10 pts):
   - Diplômes listés
   - Certifications mentionnées

FORMAT DE SORTIE (JSON UNIQUEMENT) :
{
  "score_ats": 75,
  "details": {
    "format": 18,
    "keywords": 22,
    "experience": 20,
    "skills": 10,
    "education": 5
  },
  "points_forts": ["Point 1", "Point 2"],
  "ameliorations": ["Amélioration 1", "Amélioration 2"],
  "formations_suggerees": [
    {"nom": "Formation X", "plateforme": "Coursera", "raison": "Pour X"}
  ]
}"""


async def analyze_cv_with_job(cv_text: str, job_description: str, language: str = "fr") -> dict[str, Any]:
    """
    Analyse un CV contre une offre d'emploi spécifique.
    Utilise Groq direct avec JSON mode pour garantir un output structuré.
    """
    try:
        user_content = f"Offre d'emploi :\n{job_description}\n\nContenu du CV :\n{cv_text}"

        # Utiliser le client Groq direct avec response_format JSON
        loop = asyncio.get_event_loop()
        completion = await loop.run_in_executor(
            None,
            lambda: groq_client.chat.completions.create(
                model=POWERFUL_MODEL,
                messages=[
                    {"role": "system", "content": CV_ANALYSIS_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
        )

        result = json.loads(completion.choices[0].message.content)
        result["success"] = True
        result["type"] = "job_matching"

        return result

    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": "Erreur de parsing JSON",
            "raw_response": str(e)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


async def analyze_cv_ats(cv_text: str, language: str = "fr") -> dict[str, Any]:
    """
    Analyse ATS d'un CV seul (sans offre d'emploi).
    Utilise Groq direct avec JSON mode.
    """
    try:
        user_content = f"CV à analyser:\n{cv_text}"

        # Utiliser le client Groq direct avec response_format JSON
        loop = asyncio.get_event_loop()
        completion = await loop.run_in_executor(
            None,
            lambda: groq_client.chat.completions.create(
                model=POWERFUL_MODEL,
                messages=[
                    {"role": "system", "content": ATS_ANALYSIS_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
        )

        result = json.loads(completion.choices[0].message.content)
        result["success"] = True
        result["type"] = "ats_score"

        return result

    except json.JSONDecodeError:
        return {
            "success": False,
            "error": "Erreur de parsing JSON"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


async def extract_cv_info(cv_text: str) -> dict[str, Any]:
    """
    Extraction rapide des informations clés d'un CV.
    Utilise le modèle 8B pour la vitesse avec JSON mode.
    """
    try:
        user_content = f"CV:\n{cv_text[:3000]}"  # Limiter pour la vitesse

        loop = asyncio.get_event_loop()
        completion = await loop.run_in_executor(
            None,
            lambda: groq_client.chat.completions.create(
                model=FAST_MODEL,
                messages=[
                    {"role": "system", "content": """Extrais les informations clés du CV. Réponds UNIQUEMENT en JSON:
{"nom": "Nom complet", "titre_actuel": "Titre poste", "annees_experience": 5, "competences_cles": ["Skill 1"], "langues": ["Français"], "localisation": "Ville"}"""},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
        )

        return json.loads(completion.choices[0].message.content)

    except Exception:
        return {
            "nom": "Non détecté",
            "titre_actuel": "Non détecté",
            "annees_experience": 0,
            "competences_cles": [],
            "langues": [],
            "localisation": "Non détecté"
        }


async def matchmaker_node_enhanced(state: dict) -> dict:
    """
    Nœud MatchMaker amélioré pour le graph LangGraph.
    Intègre l'analyse CV dans le système multi-agent.
    """

    cv_text = state.get("cv_text")
    job_description = state.get("job_description")
    language = state.get("user_language", "fr")

    if not cv_text:
        msg = "📄 **CV requis.** Veuillez uploader votre CV pour l'analyse." if language == "fr" else "📄 **CV required.** Please upload your CV for analysis."
        return {"messages": [AIMessage(content=msg)], "next_agent": "END"}

    # Déterminer le type d'analyse
    if job_description:
        # Analyse compatibilité CV vs Job
        result = await analyze_cv_with_job(cv_text, job_description, language)

        if result.get("success"):
            score = result.get("score_matching", 0)
            emoji = "🎯" if score >= 70 else "📊" if score >= 50 else "⚠️"

            msg = f"""{emoji} **Score de Compatibilité: {score}%**

✅ **Points Forts:**
{chr(10).join(f"• {p}" for p in result.get('points_forts', []))}

❌ **Points à Améliorer:**
{chr(10).join(f"• {p}" for p in result.get('points_faibles', []))}

🎯 **Compétences Manquantes:**
{chr(10).join(f"• {c}" for c in result.get('competences_manquantes', []))}

💡 **Suggestions:**
{chr(10).join(f"{i+1}. {s}" for i, s in enumerate(result.get('suggestions_amelioration', [])))}

📝 **Verdict:** {result.get('verdict', '')}"""
        else:
            msg = f"❌ Erreur lors de l'analyse: {result.get('error', 'Erreur inconnue')}"
    else:
        # Analyse ATS seule
        result = await analyze_cv_ats(cv_text, language)

        if result.get("success"):
            score = result.get("score_ats", 0)
            emoji = "🌟" if score >= 80 else "📊" if score >= 60 else "⚠️"

            details = result.get("details", {})
            msg = f"""{emoji} **Score ATS: {score}/100**

📋 **Détails:**
• Format: {details.get('format', 0)}/20
• Mots-clés: {details.get('keywords', 0)}/30
• Expérience: {details.get('experience', 0)}/25
• Compétences: {details.get('skills', 0)}/15
• Formation: {details.get('education', 0)}/10

✅ **Points Forts:**
{chr(10).join(f"• {p}" for p in result.get('points_forts', []))}

🔧 **Améliorations Suggérées:**
{chr(10).join(f"• {a}" for a in result.get('ameliorations', []))}

🎓 **Formations Recommandées:**
{chr(10).join(f"• {f['nom']} ({f.get('plateforme', 'N/A')}) - {f.get('raison', '')}" for f in result.get('formations_suggerees', []))}"""
        else:
            msg = f"❌ Erreur lors de l'analyse ATS: {result.get('error', 'Erreur inconnue')}"

    return {
        "messages": [AIMessage(content=msg)],
        "match_score": result,
        "next_agent": "END"
    }
