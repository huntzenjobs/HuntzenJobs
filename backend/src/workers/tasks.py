"""
ARQ Task Functions — HuntZen
Tâches async exécutées par les workers ARQ.

Couverture :
- coach_task        → CareerCoachAgent (5 sous-agents Groq)
- assistant_task    → Multi-assistant (Nova/Maria/Sofia/Lucas/Jeff)
- cv_adapt_task     → CVAdapterAgent (adaptation CV pour une offre)
- cover_letter_task → CVAdapterAgent (génération lettre de motivation JSON)

CV Analysis (Modal pipeline) n'est pas ici : il a déjà son propre système async.
"""
import asyncio

# Semaphore global : max 5 appels Groq simultanés par worker ARQ
_groq_semaphore = asyncio.Semaphore(5)


# ─── Coach ────────────────────────────────────────────────────────────────────

async def coach_task(ctx: dict, message: str, session_id: str, language: str = "fr") -> dict:
    """Traite un message coach via Groq (CareerCoachAgent)."""
    from src.api.deps import get_coach_agent, get_session_history, update_session_history

    agent = get_coach_agent()
    history = get_session_history(session_id)

    async with _groq_semaphore:
        result = await agent.run(
            message=message,
            history=history,
            language=language,
            deep_analysis=True,
        )

    if result.get("success"):
        update_session_history(session_id, message, result["response"])

    return result


# ─── Multi-Assistant (Nova, Maria, Sofia, Lucas, Jeff) ────────────────────────

async def assistant_task(
    ctx: dict,
    message: str,
    session_id: str,
    assistant_type: str,  # "job-scout" | "cv-analyzer" | "cv-adapter" | "interview-sim"
    language: str = "fr",
    history: list | None = None,
    cv_text: str | None = None,
    job_description: str | None = None,
) -> dict:
    """
    Traite un message multi-assistant via Groq.
    assistant_type détermine quel agent utiliser.
    """
    from src.api.deps import (
        get_job_scout_conversational_agent,
        get_cv_analyzer_conversational_agent,
        get_cv_adapter_agent,
        get_interview_sim_agent,
    )

    history = history or []

    if assistant_type == "job-scout":
        agent = get_job_scout_conversational_agent()
    elif assistant_type == "cv-analyzer":
        agent = get_cv_analyzer_conversational_agent()
    elif assistant_type == "cv-adapter":
        agent = get_cv_adapter_agent()
    elif assistant_type == "interview-sim":
        agent = get_interview_sim_agent()
    else:
        return {"success": False, "error": f"Unknown assistant_type: {assistant_type}"}

    async with _groq_semaphore:
        kwargs = dict(message=message, history=history, language=language)
        if cv_text:
            kwargs["cv_text"] = cv_text
        if job_description:
            kwargs["job_description"] = job_description
        result = await agent.run(**kwargs)

    return result


# ─── CV Adapter ───────────────────────────────────────────────────────────────

async def cv_adapt_task(
    ctx: dict,
    cv_text: str,
    job_description: str,
    language: str = "fr",
) -> dict:
    """Adapte un CV pour une offre d'emploi (CVAdapterAgent)."""
    from src.api.deps import get_cv_adapter_main

    agent = get_cv_adapter_main()

    async with _groq_semaphore:
        result = await agent.run(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
            template="ats",
        )

    return result


# ─── Cover Letter ─────────────────────────────────────────────────────────────

async def cover_letter_task(
    ctx: dict,
    cv_text: str,
    job_description: str,
    language: str = "fr",
    company_name: str | None = None,
    job_title: str | None = None,
) -> dict:
    """Génère une lettre de motivation JSON (CVAdapterAgent)."""
    from src.api.deps import get_cv_adapter_main

    agent = get_cv_adapter_main()

    async with _groq_semaphore:
        result = await agent.generate_cover_letter(
            cv_text=cv_text,
            job_description=job_description,
            language=language,
            company_name=company_name,
            job_title=job_title,
        )

    return result


# ─── Branding ────────────────────────────────────────────────────────────────

async def branding_task(
    ctx: dict,
    message: str,
    session_id: str,
    language: str = "fr",
    branding_state: dict | None = None,
) -> dict:
    """Traite un message branding via Groq (BrandingAgent)."""
    from src.api.deps import get_branding_agent, get_session_history, update_session_history

    agent = get_branding_agent()
    history = get_session_history(session_id)

    async with _groq_semaphore:
        result = await agent.run(
            message=message,
            history=history,
            language=language,
            branding_state=branding_state,
        )

    if result.get("success"):
        update_session_history(session_id, message, result["response"])

    return result


# ─── Lifecycle ────────────────────────────────────────────────────────────────

async def startup(ctx: dict) -> None:
    """Startup du worker ARQ : initialiser le pool DB."""
    from app.database import init_connection_pool_async
    await init_connection_pool_async()


async def shutdown(ctx: dict) -> None:
    """Shutdown du worker ARQ : fermer DB pool et Redis."""
    from app.database import close_connection_pool
    from src.utils.cache import close_redis
    await close_connection_pool()
    await close_redis()
