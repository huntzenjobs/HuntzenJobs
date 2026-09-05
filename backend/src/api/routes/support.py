"""
Support API Routes
==================
POST /api/support/tickets          — create a support ticket
GET  /api/support/tickets/me       — list own tickets
POST /api/support/chatbot          — hybrid FAQ + AI response (rate-limited)
GET  /api/admin/support/tickets    — admin: list all tickets
PATCH /api/admin/support/tickets/{id} — admin: update status + reply
"""

import logging
import re
from pathlib import PurePosixPath
from uuid import UUID, uuid5

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from src.api.deps import AdminUserDep, CurrentUserDep, get_supabase_client, run_sync_io
from src.api.middleware import limiter
from src.config.settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_ADMIN_PAGE = 10_000
MAX_ADMIN_PAGE_SIZE = 100
MAX_HISTORY_MESSAGES = 100


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SupportTicketCreate(BaseModel):
    request_id: UUID
    category: str = Field(..., pattern="^(bug|question|suggestion)$")
    priority: str = Field(default="normal", pattern="^(low|normal|urgent)$")
    subject: str = Field(..., min_length=5, max_length=150)
    description: str = Field(..., min_length=20, max_length=2000)
    attachment_url: str | None = Field(default=None, max_length=1024)
    page_url: str | None = Field(default=None, max_length=2048)

    @field_validator("subject", "description", mode="before")
    @classmethod
    def strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class AdminTicketUpdate(BaseModel):
    request_id: UUID
    status: str | None = Field(default=None, pattern="^(open|in_progress|resolved|closed)$")
    admin_reply: str | None = Field(default=None, min_length=1, max_length=10_000)

    @field_validator("admin_reply", mode="before")
    @classmethod
    def strip_optional_reply(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_mutation(self) -> "AdminTicketUpdate":
        if self.status is None and self.admin_reply is None:
            raise ValueError("Une réponse ou un statut est requis")
        return self


class ChatbotRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)

    @field_validator("question", mode="before")
    @classmethod
    def strip_question(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


# ---------------------------------------------------------------------------
# User endpoints
# ---------------------------------------------------------------------------


def _single_row(data: object) -> dict:
    if isinstance(data, list):
        data = data[0] if data else None
    return data if isinstance(data, dict) else {}


def _response_data(response: object) -> object:
    return getattr(response, "data", None)


def _execute_query(query):
    return query.execute()


def _attachment_owned_by_user(path: str | None, user_id: str) -> bool:
    if path is None:
        return True
    if "\\" in path or path.startswith("/"):
        return False
    raw_parts = path.split("/")
    normalized_parts = PurePosixPath(path).parts
    return (
        len(raw_parts) >= 2
        and raw_parts == list(normalized_parts)
        and raw_parts[0] == user_id
        and all(part not in {"", ".", ".."} for part in raw_parts)
    )


def _sanitize_postgrest_search(value: str) -> str:
    return re.sub(r"[^\w\s@+.-]", "", value, flags=re.UNICODE).strip()


def _is_support_rate_limit_error(error: Exception) -> bool:
    return (
        getattr(error, "code", None) == "P0001"
        and "support_ticket_rate_limit_exceeded"
        in str(getattr(error, "message", ""))
    )


@router.post("/tickets")
async def create_ticket(
    payload: SupportTicketCreate,
    current_user: CurrentUserDep,
):
    """Créer ou rejouer un ticket via la primitive transactionnelle 9A."""
    supabase = get_supabase_client()
    user_id = str(current_user["id"])
    user_email = str(current_user.get("email") or "")
    request_id = str(payload.request_id)

    if not _attachment_owned_by_user(payload.attachment_url, user_id):
        raise HTTPException(status_code=400, detail="Pièce jointe invalide")

    try:
        profile_query = (
            supabase.table("profiles")
            .select("full_name")
            .eq("id", user_id)
            .maybe_single()
        )
        profile = await run_sync_io(_execute_query, profile_query)
        user_name = str(_single_row(_response_data(profile)).get("full_name") or "")
        subscription_query = supabase.rpc(
            "get_user_current_subscription",
            {"p_user_id": user_id},
        )
        subscription = await run_sync_io(_execute_query, subscription_query)
        subscription_row = _single_row(subscription.data)
        user_plan = str(subscription_row.get("plan_name") or "free")

        creation_query = supabase.rpc(
            "create_support_ticket_idempotent",
            {
                "p_request_id": request_id,
                "p_user_id": user_id,
                "p_user_email": user_email,
                "p_user_name": user_name,
                "p_user_plan": user_plan,
                "p_page_url": payload.page_url,
                "p_category": payload.category,
                "p_priority": payload.priority,
                "p_subject": payload.subject,
                "p_description": payload.description,
                "p_attachment_url": payload.attachment_url,
            },
        )
        result = await run_sync_io(_execute_query, creation_query)
    except HTTPException:
        raise
    except Exception as exc:
        if _is_support_rate_limit_error(exc):
            raise HTTPException(
                status_code=429,
                detail="Limite de tickets atteinte",
            ) from None
        logger.error(
            "Support ticket creation failed",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(status_code=500, detail="Erreur lors de la création du ticket") from None

    ticket = _single_row(result.data)
    ticket_id = str(ticket.get("id") or "")
    if not ticket_id:
        raise HTTPException(status_code=500, detail="Erreur lors de la création du ticket")
    short_id = str(ticket_id)[:8].upper()

    return {
        "ticket_id": ticket_id,
        "short_id": short_id,
        "status": str(ticket.get("status") or "open"),
    }


@router.get("/tickets/me")
async def get_my_tickets(current_user: CurrentUserDep):
    """List the authenticated user's own tickets (most recent first)."""
    supabase = get_supabase_client()
    user_id = current_user["id"]

    try:
        query = (
            supabase.table("support_tickets")
            .select("id, category, priority, subject, status, admin_reply, created_at, updated_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
        )
        result = await run_sync_io(_execute_query, query)
    except Exception as exc:
        logger.error(
            "Support ticket list failed",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(status_code=500, detail="Erreur lors du chargement des tickets") from None

    tickets = result.data or []
    # Add short ID for display
    for t in tickets:
        t["short_id"] = str(t["id"])[:8].upper()

    return {"tickets": tickets}


async def _ticket_messages(supabase, ticket_id: str) -> list[dict]:
    query = (
        supabase.table("support_ticket_messages")
        .select("id, author_role, content, created_at")
        .eq("ticket_id", ticket_id)
        .order("created_at")
        .limit(MAX_HISTORY_MESSAGES)
    )
    result = await run_sync_io(_execute_query, query)
    return result.data if isinstance(result.data, list) else []


@router.get("/tickets/{ticket_id}/messages")
async def get_ticket_messages(ticket_id: str, current_user: CurrentUserDep):
    """Retourner l'historique uniquement au propriétaire du ticket."""
    supabase = get_supabase_client()
    owned_query = (
        supabase.table("support_tickets")
        .select("id")
        .eq("id", ticket_id)
        .eq("user_id", str(current_user["id"]))
        .maybe_single()
    )
    owned = await run_sync_io(_execute_query, owned_query)
    if not _single_row(_response_data(owned)):
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    return {
        "ticket_id": ticket_id,
        "messages": await _ticket_messages(supabase, ticket_id),
    }


@router.post("/chatbot")
@limiter.limit("10/minute")
async def chatbot_response(
    request: Request,
    payload: ChatbotRequest,
    current_user: CurrentUserDep,
):
    """
    Hybrid FAQ + AI chatbot response with strict guardrail.
    FAQ matching is done client-side with Fuse.js; this endpoint handles the AI fallback.
    Returns {"type": "ai", "answer": "..."} or {"type": "guardrail"}.
    """
    settings = get_settings()

    guardrail_prompt = """Tu es l'assistant support de HuntZen, une plateforme d'aide à la recherche d'emploi en France.
Tu réponds UNIQUEMENT aux questions concernant les fonctionnalités du site HuntZen :
- Analyse et optimisation de CV
- Coach IA (assistants Nova, Maria, Sofia, Lucas, Jeff)
- Recherche d'emploi et offres
- Suivi des candidatures
- Plans d'abonnement (Gratuit, Pro)
- Gestion du compte et profil utilisateur
- Référencement et programme de parrainage
- Documents (CV adapté, lettre de motivation)

Si la question ne concerne pas HuntZen ou ses fonctionnalités, réponds EXACTEMENT avec ce mot : HORS_SUJET

Réponds en français. Sois précis et concis. Ne mentionne pas d'autres sites ou services."""

    try:
        from langchain_groq import ChatGroq
        llm = ChatGroq(
            model=settings.llm_model_fast,
            api_key=settings.get_groq_key(),
            temperature=0.1,
            max_tokens=400,
        )

        from langchain_core.messages import HumanMessage, SystemMessage
        response = await llm.ainvoke([
            SystemMessage(content=guardrail_prompt),
            HumanMessage(content=payload.question),
        ])

        answer = response.content.strip()

        if answer.startswith("HORS_SUJET") or answer == "HORS_SUJET":
            return {"type": "guardrail"}

        return {"type": "ai", "answer": answer}

    except Exception as exc:
        logger.error(
            "Support chatbot failed",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(status_code=500, detail="Service temporairement indisponible") from None


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/support/tickets")
async def admin_list_tickets(
    current_admin: AdminUserDep,
    status_filter: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    """Admin: list all support tickets with filters and pagination."""
    supabase = get_supabase_client()

    if page < 1 or page > MAX_ADMIN_PAGE or page_size < 1 or page_size > MAX_ADMIN_PAGE_SIZE:
        raise HTTPException(status_code=422, detail="Pagination invalide")
    if status_filter not in {None, "all", "open", "in_progress", "resolved", "closed"}:
        raise HTTPException(status_code=422, detail="Filtre de statut invalide")
    if category not in {None, "bug", "question", "suggestion"}:
        raise HTTPException(status_code=422, detail="Filtre de catégorie invalide")
    if priority not in {None, "low", "normal", "urgent"}:
        raise HTTPException(status_code=422, detail="Filtre de priorité invalide")
    if search is not None and len(search) > 100:
        raise HTTPException(status_code=422, detail="Recherche trop longue")

    query = supabase.table("support_tickets").select(
        "id, user_id, user_email, user_name, user_plan, page_url, "
        "category, priority, subject, description, attachment_url, "
        "status, admin_reply, resolved_at, created_at, updated_at",
        count="exact",
    )

    if status_filter and status_filter != "all":
        query = query.eq("status", status_filter)
    if category:
        query = query.eq("category", category)
    if priority:
        query = query.eq("priority", priority)
    if search:
        safe_search = _sanitize_postgrest_search(search)
        if safe_search:
            query = query.or_(
                f"subject.ilike.%{safe_search}%,"
                f"user_email.ilike.%{safe_search}%,"
                f"description.ilike.%{safe_search}%"
            )

    offset = (page - 1) * page_size
    query = query.order("created_at", desc=True).range(offset, offset + page_size - 1)

    try:
        result = await run_sync_io(_execute_query, query)
    except Exception as exc:
        logger.error(
            "Admin support ticket list failed",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(status_code=500, detail="Erreur lors du chargement des tickets") from None

    tickets = result.data or []

    # Generate signed URLs for attachments
    for ticket in tickets:
        if ticket.get("attachment_url"):
            try:
                signed = await run_sync_io(
                    supabase.storage.from_("support-attachments").create_signed_url,
                    ticket["attachment_url"],
                    expires_in=3600,
                )
                ticket["attachment_signed_url"] = signed.get("signedURL") or signed.get("signedUrl")
            except Exception:
                ticket["attachment_signed_url"] = None

        ticket["short_id"] = str(ticket["id"])[:8].upper()

    # Les cartes utilisent des COUNT exacts globaux; aucune ligne n'est chargée.
    try:
        total_query = (
            supabase.table("support_tickets")
            .select("id", count="exact")
            .limit(0)
        )
        total_result = await run_sync_io(_execute_query, total_query)
        total = total_result.count or 0
        counts: dict[str, int] = {}
        for ticket_status in ("open", "in_progress", "resolved"):
            count_query = (
                supabase.table("support_tickets")
                .select("id", count="exact")
                .eq("status", ticket_status)
                .limit(0)
            )
            count_result = await run_sync_io(_execute_query, count_query)
            counts[ticket_status] = count_result.count or 0
        open_count = counts["open"]
        in_progress_count = counts["in_progress"]
        resolved_count = counts["resolved"]
        resolved_pct = round(resolved_count / total * 100) if total > 0 else 0
    except Exception as exc:
        logger.error(
            "Support statistics failed",
            extra={"error_type": type(exc).__name__},
        )
        open_count = in_progress_count = resolved_count = resolved_pct = 0

    return {
        "tickets": tickets,
        "stats": {
            "open": open_count,
            "in_progress": in_progress_count,
            "resolved": resolved_count,
            "resolved_pct": resolved_pct,
        },
    }


@router.get("/admin/support/tickets/{ticket_id}/messages")
async def admin_get_ticket_messages(ticket_id: str, current_admin: AdminUserDep):
    """Retourner l'historique à un admin déjà vérifié par la dépendance."""
    supabase = get_supabase_client()
    ticket_query = (
        supabase.table("support_tickets")
        .select("id")
        .eq("id", ticket_id)
        .maybe_single()
    )
    ticket = await run_sync_io(_execute_query, ticket_query)
    if not _single_row(_response_data(ticket)):
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    return {
        "ticket_id": ticket_id,
        "messages": await _ticket_messages(supabase, ticket_id),
    }


@router.patch("/admin/support/tickets/{ticket_id}")
async def admin_update_ticket(
    ticket_id: str,
    payload: AdminTicketUpdate,
    current_admin: AdminUserDep,
):
    """Admin: update ticket status and/or send a reply to the user."""
    supabase = get_supabase_client()
    admin_id = current_admin["id"]

    # L'existence n'est vérifiée qu'après la dépendance admin pour éviter toute fuite.
    try:
        existing_query = (
            supabase.table("support_tickets")
            .select("id")
            .eq("id", ticket_id)
            .maybe_single()
        )
        existing = await run_sync_io(_execute_query, existing_query)
    except Exception:
        raise HTTPException(status_code=404, detail="Ticket introuvable") from None

    if not _single_row(_response_data(existing)):
        raise HTTPException(status_code=404, detail="Ticket introuvable")

    try:
        if payload.admin_reply is not None:
            reply_query = supabase.rpc(
                "reply_support_ticket_idempotent",
                {
                    "p_ticket_id": ticket_id,
                    "p_admin_id": admin_id,
                    "p_content": payload.admin_reply,
                    "p_request_id": str(uuid5(payload.request_id, "reply")),
                },
            )
            await run_sync_io(_execute_query, reply_query)
        if payload.status is not None:
            status_query = supabase.rpc(
                "set_support_ticket_status_idempotent",
                {
                    "p_ticket_id": ticket_id,
                    "p_admin_id": admin_id,
                    "p_status": payload.status,
                    "p_request_id": str(uuid5(payload.request_id, "status")),
                    "p_note": None,
                },
            )
            await run_sync_io(_execute_query, status_query)
    except Exception as exc:
        logger.error(
            "Support ticket mutation failed",
            extra={"error_type": type(exc).__name__},
        )
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour du ticket") from None

    # Log admin action
    try:
        audit_query = supabase.rpc(
            "log_security_event",
            {
                "p_event_type": "admin_support_reply",
                "p_severity": "info",
                "p_user_id": admin_id,
                "p_event_data": {
                    "ticket_id": ticket_id,
                    "new_status": payload.status,
                    "has_reply": bool(payload.admin_reply),
                },
            },
        )
        await run_sync_io(_execute_query, audit_query)
    except Exception as exc:
        logger.warning(
            "Support admin audit failed",
            extra={"error_type": type(exc).__name__},
        )

    return {"ticket_id": ticket_id, "updated": True}
