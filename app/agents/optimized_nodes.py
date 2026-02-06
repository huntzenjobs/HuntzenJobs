"""
HuntZen Multi-Agent System - Optimized for Zero Latency
=========================================================
Architecture avec Groq Models spécialisés:
- Supervisor: llama-3.1-8b-instant (routing rapide ~100ms)
- JobScout: llama-3.1-8b-instant (extraction params)
- Detective: llama-3.1-8b-instant (extraction entreprise)
- MatchMaker: llama-3.3-70b-versatile (analyse CV profonde)
- CareerCoach: llama-3.3-70b-versatile (conseils personnalisés)
- SecurityGuard: llama-3.1-8b-instant (détection rapide)
"""
import json
import logging
import asyncio
from typing import Optional, Dict, Any, List
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from app.state import HuntZenState
from job_finder.api_tools import search_jobs_aggregated, find_recruiter_linkedin, find_email_hunter
from app.database import normalize_search_key, check_job_cache, save_job_cache
from job_finder.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# ==========================================
# MODÈLES GROQ OPTIMISÉS
# ==========================================
# Modèle ultra-rapide pour routing et extraction (~100-200ms)
FAST_MODEL = "llama-3.1-8b-instant"
# Modèle puissant pour analyses complexes (~500-800ms)
POWERFUL_MODEL = "llama-3.3-70b-versatile"

# Instances LLM pré-initialisées (évite le cold start)
fast_llm = ChatGroq(
    model=FAST_MODEL,
    api_key=settings.groq_api_key,
    temperature=0.1,
    max_tokens=512,
    timeout=30
)

powerful_llm = ChatGroq(
    model=POWERFUL_MODEL,
    api_key=settings.groq_api_key,
    temperature=0.3,
    max_tokens=2048,
    timeout=60
)


# ==========================================
# 1. SUPERVISOR - Ultra-fast routing
# ==========================================
SUPERVISOR_PROMPT = """Tu es le Supervisor de HuntZen. Tu routes les demandes vers l'agent approprié.

AGENTS DISPONIBLES:
- JobScout: Recherche d'offres d'emploi
- TheDetective: Trouver des recruteurs d'une entreprise
- MatchMaker: Analyser un CV (avec ou sans offre)
- CareerCoach: Conseils carrière, motivation, aide générale
- SecurityGuard: Bloquer les requêtes malveillantes/hors-sujet

RÈGLES DE ROUTAGE:
1. Mots-clés "emploi", "job", "poste", "offre", "cherche du travail" → JobScout
2. Mots-clés "recruteur", "RH", "contacter", "entreprise X" → TheDetective
3. Mots-clés "CV", "analyser", "score", "compatibilité" → MatchMaker
4. Questions carrière, conseils, motivation → CareerCoach
5. Hors-sujet ou malveillant → SecurityGuard

RÉPONDS UNIQUEMENT EN JSON:
{"next_agent": "AgentName", "user_language": "fr"}"""


async def supervisor_node(state: HuntZenState) -> dict:
    """
    Supervisor ultra-rapide utilisant llama-3.1-8b-instant.
    Temps de réponse cible: < 200ms
    """
    try:
        if not state.get("messages"):
            return {"next_agent": "CareerCoach", "user_language": "fr"}
        
        user_msg = state["messages"][-1].content
        
        # Appel LLM rapide
        response = await fast_llm.ainvoke([
            SystemMessage(content=SUPERVISOR_PROMPT),
            HumanMessage(content=user_msg[:500])  # Limiter pour vitesse
        ])
        
        # Parser la réponse
        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1].replace("json", "").strip()
        
        data = json.loads(content)
        
        valid_agents = ["JobScout", "TheDetective", "MatchMaker", "CareerCoach", "SecurityGuard"]
        next_agent = data.get("next_agent", "CareerCoach")
        if next_agent not in valid_agents:
            next_agent = "CareerCoach"
        
        user_language = data.get("user_language", "fr")
        if user_language not in ["fr", "en", "es", "de", "it", "pt"]:
            user_language = "fr"
        
        logger.info(f"[SUPERVISOR] Routing to: {next_agent} (lang: {user_language})")
        
        return {"next_agent": next_agent, "user_language": user_language}
        
    except Exception as e:
        logger.error(f"[SUPERVISOR] Error: {e}")
        return {"next_agent": "CareerCoach", "user_language": "fr"}


# ==========================================
# 2. JOB SCOUT - Recherche d'emploi
# ==========================================
JOB_EXTRACTION_PROMPT = """Extrais les paramètres de recherche d'emploi du texte.
Réponds UNIQUEMENT en JSON:
{"job_title": "titre du poste ou null", "city": "ville ou null", "country_code": "code pays ISO 2 lettres"}

Règles:
- country_code: "fr" pour France, "us" pour USA, "uk" pour UK, etc.
- Si pas de pays mentionné mais ville française → "fr"
- Traduis les titres si nécessaire (développeur = developer)"""


async def job_scout_node(state: HuntZenState) -> dict:
    """
    Agent de recherche d'emploi avec extraction rapide des paramètres.
    """
    try:
        if not state.get("messages"):
            return {"messages": [AIMessage(content="📍 Quel poste cherchez-vous ?")], "next_agent": "END"}
        
        user_msg = state["messages"][-1].content
        lang = state.get("user_language", "fr")
        
        # Extraction rapide des paramètres
        extraction = await fast_llm.ainvoke([
            SystemMessage(content=JOB_EXTRACTION_PROMPT),
            HumanMessage(content=user_msg)
        ])
        
        content = extraction.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1].replace("json", "").strip()
        
        try:
            params = json.loads(content)
            job_title = params.get("job_title")
            city = params.get("city")
            country_code = params.get("country_code") or state.get("country_code", "fr")
        except json.JSONDecodeError:
            job_title, city, country_code = None, None, "fr"
        
        # Utiliser les paramètres précédents si manquants
        if not job_title:
            job_title = state.get("job_title")
        if not city:
            city = state.get("location")
        
        if not job_title or not city:
            msg = "📍 Précisez le **poste** et la **ville** de votre recherche." if lang == "fr" else "📍 Please specify the **job title** and **city**."
            return {"messages": [AIMessage(content=msg)], "next_agent": "END"}
        
        logger.info(f"[JOBSCOUT] Searching: {job_title} in {city}, {country_code}")
        
        # Vérifier le cache d'abord
        cache_key = normalize_search_key(job_title, city)
        jobs = check_job_cache(cache_key)
        from_cache = bool(jobs)
        
        if not jobs:
            # Recherche multi-sources en parallèle
            result = await search_jobs_aggregated(job_title, city, country_code)
            jobs = result.get("jobs", [])
            
            if jobs:
                save_job_cache(cache_key, {"title": job_title, "city": city}, jobs)
        
        # Construire la réponse
        if jobs:
            count = len(jobs)
            source = "cache" if from_cache else "live"
            msg = f"🚀 **{count} offres trouvées** pour **{job_title}** à **{city}** ({country_code.upper()})\n\n"
            
            # Top 3 preview
            for i, job in enumerate(jobs[:3], 1):
                title = job.get("title", "Sans titre")[:50]
                company = job.get("company", "Entreprise non spécifiée")[:30]
                msg += f"{i}. **{title}** - {company}\n"
            
            if count > 3:
                msg += f"\n... et {count - 3} autres offres"
        else:
            msg = f"😔 Aucune offre trouvée pour **{job_title}** à **{city}**. Essayez une autre ville ou reformulez le poste."
        
        return {
            "messages": [AIMessage(content=msg)],
            "search_results": jobs[:15],  # Limiter à 15
            "job_title": job_title,
            "location": city,
            "country_code": country_code,
            "next_agent": "END"
        }
        
    except Exception as e:
        logger.error(f"[JOBSCOUT] Error: {e}")
        return {
            "messages": [AIMessage(content="🚫 Erreur lors de la recherche. Réessayez.")],
            "next_agent": "END"
        }


# ==========================================
# 3. THE DETECTIVE - OSINT Recruteurs
# ==========================================
COMPANY_EXTRACTION_PROMPT = """Extrais le nom de l'entreprise mentionnée.
Réponds UNIQUEMENT en JSON:
{"company": "nom de l'entreprise ou null"}"""


async def detective_node(state: HuntZenState) -> dict:
    """
    Agent OSINT pour trouver les recruteurs d'une entreprise.
    """
    try:
        lang = state.get("user_language", "fr")
        company = state.get("company_name")
        
        if not company and state.get("messages"):
            user_msg = state["messages"][-1].content
            
            extraction = await fast_llm.ainvoke([
                SystemMessage(content=COMPANY_EXTRACTION_PROMPT),
                HumanMessage(content=user_msg)
            ])
            
            content = extraction.content.strip()
            if content.startswith("```"):
                content = content.split("```")[1].replace("json", "").strip()
            
            try:
                data = json.loads(content)
                company = data.get("company")
            except json.JSONDecodeError:
                company = None
        
        if not company:
            msg = "🔍 De quelle **entreprise** souhaitez-vous trouver le recruteur ?" if lang == "fr" else "🔍 Which **company's** recruiter would you like to find?"
            return {"messages": [AIMessage(content=msg)], "next_agent": "END"}
        
        logger.info(f"[DETECTIVE] Searching recruiter at: {company}")
        
        # Recherche du recruteur
        try:
            recruiter_info = find_recruiter_linkedin(company)
            
            if recruiter_info:
                name = recruiter_info.get("name", "N/A")
                title = recruiter_info.get("title", "Recruteur")
                url = recruiter_info.get("profile_url", "#")
                email = recruiter_info.get("email", "")
                
                msg = f"""🎯 **Recruteur trouvé chez {company}**

👤 **{name}**
💼 {title}
🔗 [Profil LinkedIn]({url})"""
                
                if email:
                    msg += f"\n📧 {email}"
            else:
                msg = f"😔 Aucun recruteur trouvé pour **{company}**. Essayez avec le nom complet de l'entreprise ou une autre entreprise."
                recruiter_info = None
                
        except Exception as e:
            logger.error(f"[DETECTIVE] Search error: {e}")
            msg = f"🚫 Erreur lors de la recherche pour **{company}**."
            recruiter_info = None
        
        return {
            "messages": [AIMessage(content=msg)],
            "company_name": company,
            "recruiter_info": recruiter_info,
            "next_agent": "END"
        }
        
    except Exception as e:
        logger.error(f"[DETECTIVE] Error: {e}")
        return {
            "messages": [AIMessage(content="🚫 Erreur lors de la recherche de recruteur.")],
            "next_agent": "END"
        }


# ==========================================
# 4. MATCHMAKER - Analyse CV (importé)
# ==========================================
from app.agents.cv_analyzer_agent_legacy import matchmaker_node_enhanced as matchmaker_node


# ==========================================
# 5. CAREER COACH - Conseils personnalisés
# ==========================================
CAREER_COACH_PROMPT = """Tu es le Career Coach de HuntZen - un coach carrière bienveillant et expert.

TES COMPÉTENCES:
- Conseils de recherche d'emploi stratégiques
- Préparation aux entretiens
- Aide à la motivation quand ça va mal
- Conseils sur la négociation salariale
- Guidance pour les reconversions
- Tips LinkedIn et personal branding

TON STYLE:
- Empathique et motivant
- Concret avec des actions claires
- Utilise des emojis pour rendre la conversation agréable
- Adapte ta langue à l'utilisateur (fr/en/es)
- Réponds de manière concise (max 300 mots)

IMPORTANT: Ne fais PAS de recherche d'emploi directe - guide vers le JobScout pour ça."""


async def career_coach_node(state: HuntZenState) -> dict:
    """
    Career Coach utilisant le modèle 70B pour des conseils personnalisés.
    """
    try:
        lang = state.get("user_language", "fr")
        
        if not state.get("messages"):
            greeting = "👋 Bonjour ! Je suis votre coach carrière. Comment puis-je vous aider ?" if lang == "fr" else "👋 Hello! I'm your career coach. How can I help?"
            return {"messages": [AIMessage(content=greeting)], "next_agent": "END"}
        
        user_msg = state["messages"][-1].content
        
        # Construire le contexte avec l'historique récent
        recent_msgs = state["messages"][-5:]  # 5 derniers messages
        context = "\n".join([f"{'User' if isinstance(m, HumanMessage) else 'Coach'}: {m.content[:200]}" for m in recent_msgs])
        
        prompt = f"""Contexte de la conversation:
{context}

Dernière question de l'utilisateur: {user_msg}

Réponds en tant que Career Coach dans la langue: {lang}"""
        
        response = await powerful_llm.ainvoke([
            SystemMessage(content=CAREER_COACH_PROMPT),
            HumanMessage(content=prompt)
        ])
        
        return {
            "messages": [AIMessage(content=response.content)],
            "next_agent": "END"
        }
        
    except Exception as e:
        logger.error(f"[CAREER_COACH] Error: {e}")
        fallback = "Désolé, je rencontre une difficulté. Pouvez-vous reformuler ?" if state.get("user_language") == "fr" else "Sorry, I'm having trouble. Can you rephrase?"
        return {
            "messages": [AIMessage(content=fallback)],
            "next_agent": "END"
        }


# ==========================================
# 6. SECURITY GUARD - Protection
# ==========================================
async def security_guard_node(state: HuntZenState) -> dict:
    """
    Agent de sécurité - bloque les requêtes malveillantes.
    """
    lang = state.get("user_language", "fr")
    
    msg = """🚫 **Alerte Sécurité**

Cette requête a été identifiée comme hors-sujet ou potentiellement malveillante.

HuntZen est un assistant carrière. Je peux vous aider avec:
- 🔍 Recherche d'emploi
- 👤 Trouver des recruteurs
- 📄 Analyser votre CV
- 💡 Conseils carrière

Comment puis-je vous aider dans votre recherche d'emploi ?""" if lang == "fr" else """🚫 **Security Alert**

This request was flagged as off-topic or potentially malicious.

HuntZen is a career assistant. I can help with:
- 🔍 Job search
- 👤 Finding recruiters
- 📄 CV analysis
- 💡 Career advice

How can I assist with your job search?"""
    
    return {"messages": [AIMessage(content=msg)], "next_agent": "END"}
