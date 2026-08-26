"""
ARQ Task Functions — HuntZen
Tâches async exécutées par les workers ARQ.

Couverture :
- coach_task          → CareerCoachAgent (5 sous-agents Groq)
- assistant_task      → Multi-assistant (Nova/Maria/Sofia/Lucas/Jeff)
- cv_adapt_task       → CVAdapterAgent (adaptation CV pour une offre)
- cover_letter_task   → CVAdapterAgent (génération lettre de motivation JSON)
- expat_refresh_task  → Ingest Expadation (scraping hebdomadaire)

CV Analysis (Modal pipeline) n'est pas ici : il a déjà son propre système async.
"""
import asyncio
import json
import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from time import monotonic
from typing import Any
from weakref import WeakValueDictionary

from arq import Retry

from src.utils.ai_capacity import (
    GLOBAL_AI_SYNC_LIMIT,
    decrement_global_ai_active,
    increment_global_ai_active,
)

# Semaphore global : max 5 appels Groq simultanés par worker ARQ
_groq_semaphore = asyncio.Semaphore(5)
_SESSION_LOCK_TTL_SECONDS = 125
_SESSION_LOCK_WAIT_SECONDS = 0
_SESSION_RETRY_DEFER_SECONDS = 5
_SESSION_DB_TIMEOUT_SECONDS = 10
_local_session_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()

logger = logging.getLogger(__name__)


async def _commit_quota_reservation(
    reservation_id: str,
    user_id: str,
) -> None:
    """Finalise une réservation depuis un worker sans import circulaire global."""
    from src.api.routes.cv_adapter import _commit_quota_reservation as commit

    await commit(reservation_id, user_id)


async def _release_quota_reservation(reservation_id: str) -> None:
    """Libère une réservation depuis un worker en échec définitif."""
    from src.api.routes.cv_adapter import _release_quota_reservation as release

    await release(reservation_id)


async def _release_final_failed_reservation(
    ctx: dict,
    reservation_id: str | None,
) -> None:
    """Conserve la réservation pendant les retries, puis la libère au dernier."""
    if reservation_id and int(ctx.get("job_try", 30)) >= 30:
        await _release_quota_reservation(reservation_id)


@asynccontextmanager
async def _global_ai_execution_slot():
    """Partage le même plafond cross-replicas entre HTTP et jobs ARQ."""
    try:
        active = await increment_global_ai_active()
    except Exception as exc:
        logger.warning("Global AI capacity unavailable, deferring job: %s", exc)
        raise Retry(defer=_SESSION_RETRY_DEFER_SECONDS) from exc

    if active > GLOBAL_AI_SYNC_LIMIT:
        await decrement_global_ai_active()
        raise Retry(defer=_SESSION_RETRY_DEFER_SECONDS)

    try:
        async with _groq_semaphore:
            yield
    finally:
        await decrement_global_ai_active()


@asynccontextmanager
async def _session_execution_lock(user_id: str | None, session_id: str):
    """Sérialise un échange par session, entre réplicas si Redis est disponible."""
    owner_key = user_id or "legacy"
    lock_key = f"assistant:session:{owner_key}:{session_id}"

    try:
        from src.utils.cache import get_redis

        redis = await get_redis()
    except Exception as exc:
        logger.warning("Session lock Redis unavailable, using local fallback: %s", exc)
        redis = None

    if redis is not None:
        try:
            redis_lock = redis.lock(
                lock_key,
                timeout=_SESSION_LOCK_TTL_SECONDS,
                blocking_timeout=_SESSION_LOCK_WAIT_SECONDS,
            )
            acquired = await redis_lock.acquire()
        except Exception as exc:
            logger.warning("Session lock Redis acquisition failed, using local fallback: %s", exc)
        else:
            if not acquired:
                raise Retry(defer=_SESSION_RETRY_DEFER_SECONDS)
            try:
                yield
            finally:
                try:
                    await redis_lock.release()
                except Exception as exc:
                    logger.warning("Session lock Redis release failed: %s", exc)
            return

    local_lock = _local_session_locks.get(lock_key)
    if local_lock is None:
        local_lock = asyncio.Lock()
        _local_session_locks[lock_key] = local_lock

    if local_lock.locked():
        raise Retry(defer=_SESSION_RETRY_DEFER_SECONDS)

    await local_lock.acquire()
    try:
        yield
    finally:
        local_lock.release()
        if _local_session_locks.get(lock_key) is local_lock:
            _local_session_locks.pop(lock_key, None)


async def _run_db_call(function: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Exécute le client Supabase synchrone hors de l'event loop ARQ."""
    return await asyncio.wait_for(
        asyncio.to_thread(function, *args, **kwargs),
        timeout=_SESSION_DB_TIMEOUT_SECONDS,
    )


# ─── Coach ────────────────────────────────────────────────────────────────────

async def coach_task(
    ctx: dict,
    message: str,
    session_id: str,
    language: str = "fr",
    user_id: str | None = None,
    assistant_type: str = "career-coach",
    cv_context: str = "",
) -> dict:
    """Traite un message coach via Groq (CareerCoachAgent)."""
    from src.api.deps import get_coach_agent, get_session_history, update_session_history

    async with _session_execution_lock(user_id, session_id):
        agent = get_coach_agent()
        history = await _run_db_call(get_session_history, session_id, user_id=user_id)
        enriched_message = f"{message}{cv_context}" if cv_context else message

        async with _global_ai_execution_slot():
            result = await agent.run(
                message=enriched_message,
                history=history,
                language=language,
                deep_analysis=True,
            )

        if result.get("success"):
            result.setdefault("agent", "career-coach")
            await _run_db_call(
                update_session_history,
                session_id,
                message,
                result["response"],
                user_id=user_id,
                assistant_type=assistant_type,
            )

    return result


# ─── Multi-Assistant (Nova, Maria, Sofia, Lucas, Jeff) ────────────────────────

async def assistant_task(
    ctx: dict,
    message: str,
    session_id: str,
    assistant_type: str,  # "job-scout" | "cv-analyzer" | "cv-adapter" | "interview-sim"
    language: str = "fr",
    history: list | None = None,
    user_id: str | None = None,
    cv_text: str | None = None,
    job_description: str | None = None,
) -> dict:
    """
    Traite un message multi-assistant via Groq.
    assistant_type détermine quel agent utiliser.
    """
    from src.api.deps import (
        get_cv_adapter_agent,
        get_cv_agent,
        get_interview_sim_agent,
        get_scout_conversational_agent,
        get_session_history,
        update_session_history,
    )

    agent: Any
    if assistant_type == "job-scout":
        agent = get_scout_conversational_agent()
    elif assistant_type == "cv-analyzer":
        agent = get_cv_agent()
    elif assistant_type == "cv-adapter":
        agent = get_cv_adapter_agent()
    elif assistant_type == "interview-sim":
        agent = get_interview_sim_agent()
    else:
        return {"success": False, "error": f"Unknown assistant_type: {assistant_type}"}

    async with _session_execution_lock(user_id, session_id):
        session_history = history
        if session_history is None:
            session_history = await _run_db_call(
                get_session_history,
                session_id,
                user_id=user_id,
            )

        enriched_message = message
        if cv_text:
            enriched_message += f"\n\n[CV FOURNI]\n{cv_text}\n[FIN DU CV]"
        if job_description:
            enriched_message += (
                f"\n\n[OFFRE FOURNIE]\n{job_description}\n[FIN DE L'OFFRE]"
            )

        async with _global_ai_execution_slot():
            result = await agent.run(
                message=enriched_message,
                history=session_history,
                language=language,
            )

        if result.get("success"):
            result.setdefault("agent", assistant_type)
            await _run_db_call(
                update_session_history,
                session_id,
                message,
                result["response"],
                user_id=user_id,
                assistant_type=assistant_type,
            )

    return result


# ─── CV Adapter ───────────────────────────────────────────────────────────────

async def cv_adapt_task(
    ctx: dict,
    cv_text: str,
    job_description: str,
    language: str = "fr",
    template: str = "ats",
    user_id: str | None = None,
    quota_reservation_id: str | None = None,
) -> dict:
    """Adapte un CV pour une offre d'emploi (CVAdapterAgent)."""
    from src.api.deps import get_cv_adapter_main

    agent = get_cv_adapter_main()

    try:
        async with _global_ai_execution_slot():
            result = await agent.run(
                cv_text=cv_text,
                job_description=job_description,
                language=language,
                template=template,
            )
    except Retry:
        await _release_final_failed_reservation(ctx, quota_reservation_id)
        raise
    except Exception:
        await _release_final_failed_reservation(ctx, quota_reservation_id)
        raise

    try:
        if result.get("success") and quota_reservation_id:
            if not user_id:
                raise ValueError("Une réservation de quota exige un propriétaire")
            await _commit_quota_reservation(quota_reservation_id, user_id)
        elif result.get("success") and user_id:
            from src.api.routes.cv_adapter import _record_quota_usage

            await _record_quota_usage(user_id, "cv_adapt")
        elif quota_reservation_id:
            await _release_quota_reservation(quota_reservation_id)
    except Exception:
        await _release_final_failed_reservation(ctx, quota_reservation_id)
        raise

    return result


# ─── Cover Letter ─────────────────────────────────────────────────────────────

async def cover_letter_task(
    ctx: dict,
    cv_text: str | None = None,
    job_description: str = "",
    language: str = "fr",
    company_name: str | None = None,
    job_title: str | None = None,
    cv_data: dict | None = None,
    user_id: str | None = None,
    quota_reservation_id: str | None = None,
) -> dict:
    """Génère une lettre de motivation JSON (CVAdapterAgent)."""
    from src.api.deps import get_cv_adapter_main

    del job_title  # Compatibilité avec les tâches déjà placées dans la file.
    if cv_data is None:
        if not cv_text:
            raise ValueError("Les données du CV sont requises")
        try:
            parsed_cv_data = json.loads(cv_text)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError("Les données du CV en file sont invalides") from exc
        if not isinstance(parsed_cv_data, dict):
            raise ValueError("Les données du CV en file doivent être un objet JSON")
        cv_data = parsed_cv_data

    agent = get_cv_adapter_main()

    try:
        async with _global_ai_execution_slot():
            result = await agent.generate_cover_letter(
                cv_data=cv_data,
                job_description=job_description,
                language=language,
                company_name=company_name or "",
            )
    except Retry:
        await _release_final_failed_reservation(ctx, quota_reservation_id)
        raise
    except Exception:
        await _release_final_failed_reservation(ctx, quota_reservation_id)
        raise

    try:
        if result.get("success") and quota_reservation_id:
            if not user_id:
                raise ValueError("Une réservation de quota exige un propriétaire")
            await _commit_quota_reservation(quota_reservation_id, user_id)
        elif result.get("success") and user_id:
            from src.api.routes.cv_adapter import _record_quota_usage

            await _record_quota_usage(user_id, "cover_letter")
        elif quota_reservation_id:
            await _release_quota_reservation(quota_reservation_id)
    except Exception:
        await _release_final_failed_reservation(ctx, quota_reservation_id)
        raise

    return result


# ─── Expadation Refresh ───────────────────────────────────────────────────────

async def expat_refresh_task(ctx: dict) -> dict:
    """ARQ task — rafraîchit la base documentaire Expadation (scraping hebdomadaire)."""
    from src.services.expat.ingest import ingest_all

    try:
        result = await ingest_all()
        logger.info(f"[expat_refresh] Ingestion terminée : {result}")
        return {"success": True, "result": result}
    except Exception as exc:
        logger.error(f"[expat_refresh] Échec de l'ingestion : {exc}", exc_info=True)
        return {"success": False, "error": str(exc)}


async def stripe_effect_outbox_task(ctx: dict) -> dict[str, int]:
    """Vider jusqu'à trois lots Stripe sans dépasser le timeout ARQ."""
    from src.api.deps import get_supabase_client
    from src.services.stripe_outbox import process_stripe_effects

    supabase = get_supabase_client()
    batch_size = 4
    effect_timeout_seconds = 20
    started_at = monotonic()
    budget_seconds = 90
    totals = {"claimed": 0, "succeeded": 0, "retried": 0, "dead": 0}
    for batch_index in range(3):
        if batch_index > 0 and monotonic() - started_at >= budget_seconds:
            logger.warning("[stripe_outbox] Worker time budget reached")
            break
        summary = await process_stripe_effects(
            supabase,
            limit=batch_size,
            effect_timeout_seconds=effect_timeout_seconds,
        )
        for key in totals:
            totals[key] += summary[key]
        if summary["claimed"] < batch_size:
            break
    return totals


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

# ─── Expiry notifications ─────────────────────────────────────────────────────

async def notify_expiring_plans(ctx: dict) -> dict:
    """
    Tâche quotidienne : envoie un email J-7 et J-1 aux users dont le plan
    admin_granted expire bientôt. Appelée via cron POST /api/cron/notify-expiring-plans.
    """
    from datetime import UTC, datetime, timedelta

    from src.api.deps import get_supabase_client
    from src.services.email import send_expiring_plan_email, send_expiring_plan_tomorrow_email

    supabase = get_supabase_client()
    now = datetime.now(UTC)

    def _get_plan_name(plan_id: str) -> str:
        plan_res = supabase.table("subscription_plans").select(
            "display_name"
        ).eq("id", plan_id).maybe_single().execute()
        return (plan_res.data or {}).get("display_name", "Pro")

    sent = 0

    try:
        # ── J-7 : plan expire dans 7 jours ──
        j7_start = now + timedelta(days=7)
        j7_end = now + timedelta(days=8)
        rows_j7 = supabase.table("user_subscriptions").select(
            "user_id, plan_id, current_period_end, profiles!inner(email, language)"
        ).eq("status", "active").like("stripe_subscription_id", "admin_granted%").gte(
            "current_period_end", j7_start.isoformat()
        ).lt(
            "current_period_end", j7_end.isoformat()
        ).execute()

        for row in (rows_j7.data or []):
            profile = row.get("profiles") or {}
            email = profile.get("email")
            if not email:
                continue
            send_expiring_plan_email(
                user_email=email,
                plan_name=_get_plan_name(row["plan_id"]),
                language=profile.get("language", "fr"),
            )
            sent += 1

        # ── J-1 : plan expire demain ──
        j1_start = now + timedelta(days=1)
        j1_end = now + timedelta(days=2)
        rows_j1 = supabase.table("user_subscriptions").select(
            "user_id, plan_id, current_period_end, profiles!inner(email, language)"
        ).eq("status", "active").like("stripe_subscription_id", "admin_granted%").gte(
            "current_period_end", j1_start.isoformat()
        ).lt(
            "current_period_end", j1_end.isoformat()
        ).execute()

        for row in (rows_j1.data or []):
            profile = row.get("profiles") or {}
            email = profile.get("email")
            if not email:
                continue
            send_expiring_plan_tomorrow_email(
                user_email=email,
                plan_name=_get_plan_name(row["plan_id"]),
                language=profile.get("language", "fr"),
            )
            sent += 1

        return {"success": True, "emails_sent": sent}
    except Exception as e:
        return {"success": False, "error": str(e)}
