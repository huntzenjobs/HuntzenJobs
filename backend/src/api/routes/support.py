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
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from src.api.deps import AdminUserDep, CurrentUserDep, get_supabase_client
from src.api.middleware import limiter
from src.config.settings import get_settings
from src.services.email import send_support_ticket_notification, send_support_ticket_reply
from src.services.notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SupportTicketCreate(BaseModel):
    category: str = Field(..., pattern="^(bug|question|suggestion)$")
    priority: str = Field(default="normal", pattern="^(low|normal|urgent)$")
    subject: str = Field(..., min_length=5, max_length=150)
    description: str = Field(..., min_length=20, max_length=2000)
    attachment_url: str | None = None
    page_url: str | None = None


class AdminTicketUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(open|in_progress|resolved|closed)$")
    admin_reply: str | None = None


class ChatbotRequest(BaseModel):
    question: str = Field(..., max_length=500)


# ---------------------------------------------------------------------------
# User endpoints
# ---------------------------------------------------------------------------

@router.post("/tickets")
async def create_ticket(
    payload: SupportTicketCreate,
    current_user: CurrentUserDep,
):
    """Create a support ticket, email admin, send in-app notification to user."""
    supabase = get_supabase_client()
    user_id = current_user["id"]
    user_email = current_user.get("email", "")
    user_name = current_user.get("user_metadata", {}).get("full_name") or current_user.get("user_metadata", {}).get("name")

    # Get user plan from profiles / subscriptions
    user_plan = None
    try:
        sub = supabase.rpc("get_user_current_subscription", {"p_user_id": user_id}).execute()
        if sub.data:
            user_plan = sub.data.get("plan_name")
    except Exception:
        pass

    # Insert ticket
    try:
        result = supabase.table("support_tickets").insert({
            "user_id": user_id,
            "user_email": user_email,
            "user_name": user_name,
            "user_plan": user_plan or "freemium",
            "page_url": payload.page_url,
            "category": payload.category,
            "priority": payload.priority,
            "subject": payload.subject,
            "description": payload.description,
            "attachment_url": payload.attachment_url,
        }).execute()
    except Exception as e:
        logger.error(f"Failed to create support ticket for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la création du ticket")

    ticket = result.data[0] if result.data else {}
    ticket_id = ticket.get("id", "")
    short_id = str(ticket_id)[:8].upper()

    # Email admin (non-blocking)
    try:
        send_support_ticket_notification(
            ticket_id=short_id,
            subject=payload.subject,
            category=payload.category,
            priority=payload.priority,
            user_name=user_name or "",
            user_email=user_email,
            user_plan=user_plan or "freemium",
            page_url=payload.page_url or "",
            description=payload.description,
        )
    except Exception as e:
        logger.error(f"Failed to send ticket notification email: {e}")

    # In-app notification (non-blocking)
    try:
        create_notification(
            supabase_client=supabase,
            user_id=user_id,
            type="support_ticket_received",
            title=f"Ticket #{short_id} reçu",
            body=f"Votre demande '{payload.subject}' a bien été reçue. Nous vous répondrons rapidement.",
        )
    except Exception as e:
        logger.error(f"Failed to create ticket confirmation notification: {e}")

    return {
        "ticket_id": ticket_id,
        "short_id": short_id,
        "status": "open",
    }


@router.get("/tickets/me")
async def get_my_tickets(current_user: CurrentUserDep):
    """List the authenticated user's own tickets (most recent first)."""
    supabase = get_supabase_client()
    user_id = current_user["id"]

    try:
        result = (
            supabase.table("support_tickets")
            .select("id, category, priority, subject, status, admin_reply, created_at, updated_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
    except Exception as e:
        logger.error(f"Failed to fetch tickets for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors du chargement des tickets")

    tickets = result.data or []
    # Add short ID for display
    for t in tickets:
        t["short_id"] = str(t["id"])[:8].upper()

    return {"tickets": tickets}


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
            model_name="llama-3.3-70b-versatile",
            api_key=settings.get_groq_key(),
            temperature=0.1,
            max_tokens=400,
        )

        from langchain_core.messages import HumanMessage, SystemMessage
        response = llm.invoke([
            SystemMessage(content=guardrail_prompt),
            HumanMessage(content=payload.question),
        ])

        answer = response.content.strip()

        if answer.startswith("HORS_SUJET") or answer == "HORS_SUJET":
            return {"type": "guardrail"}

        return {"type": "ai", "answer": answer}

    except Exception as e:
        logger.error(f"Chatbot error: {e}")
        raise HTTPException(status_code=500, detail="Service temporairement indisponible")


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

    query = supabase.table("support_tickets").select(
        "id, user_id, user_email, user_name, user_plan, page_url, "
        "category, priority, subject, description, attachment_url, "
        "status, admin_reply, resolved_at, created_at, updated_at"
    )

    if status_filter and status_filter != "all":
        query = query.eq("status", status_filter)
    if category:
        query = query.eq("category", category)
    if priority:
        query = query.eq("priority", priority)
    if search:
        query = query.or_(f"subject.ilike.%{search}%,user_email.ilike.%{search}%,description.ilike.%{search}%")

    offset = (page - 1) * page_size
    query = query.order("created_at", desc=True).range(offset, offset + page_size - 1)

    try:
        result = query.execute()
    except Exception as e:
        logger.error(f"Admin ticket list failed: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors du chargement des tickets")

    tickets = result.data or []

    # Generate signed URLs for attachments
    for ticket in tickets:
        if ticket.get("attachment_url"):
            try:
                signed = supabase.storage.from_("support-attachments").create_signed_url(
                    ticket["attachment_url"], expires_in=3600
                )
                ticket["attachment_signed_url"] = signed.get("signedURL") or signed.get("signedUrl")
            except Exception:
                ticket["attachment_signed_url"] = None

        ticket["short_id"] = str(ticket["id"])[:8].upper()

    # Stats for header cards
    try:
        stats_result = supabase.table("support_tickets").select("status", count="exact").execute()
        all_tickets = stats_result.data or []
        open_count = sum(1 for t in all_tickets if t.get("status") == "open")
        in_progress_count = sum(1 for t in all_tickets if t.get("status") == "in_progress")
        resolved_count = sum(1 for t in all_tickets if t.get("status") == "resolved")
        total = len(all_tickets)
        resolved_pct = round(resolved_count / total * 100) if total > 0 else 0
    except Exception:
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


@router.patch("/admin/support/tickets/{ticket_id}")
async def admin_update_ticket(
    ticket_id: str,
    payload: AdminTicketUpdate,
    current_admin: AdminUserDep,
):
    """Admin: update ticket status and/or send a reply to the user."""
    supabase = get_supabase_client()
    admin_id = current_admin["id"]

    # Get existing ticket
    try:
        existing = supabase.table("support_tickets").select("*").eq("id", ticket_id).single().execute()
    except Exception:
        raise HTTPException(status_code=404, detail="Ticket introuvable")

    ticket = existing.data
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket introuvable")

    # Build update payload
    update_data: dict = {"updated_at": datetime.now(UTC).isoformat()}
    if payload.status:
        update_data["status"] = payload.status
        if payload.status == "resolved":
            update_data["resolved_at"] = datetime.now(UTC).isoformat()
    if payload.admin_reply:
        update_data["admin_reply"] = payload.admin_reply

    try:
        supabase.table("support_tickets").update(update_data).eq("id", ticket_id).execute()
    except Exception as e:
        logger.error(f"Failed to update ticket {ticket_id}: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour du ticket")

    short_id = str(ticket_id)[:8].upper()

    # If a reply was provided, email the user and notify in-app
    if payload.admin_reply:
        try:
            send_support_ticket_reply(
                user_email=ticket["user_email"],
                user_name=ticket.get("user_name") or "",
                ticket_id=short_id,
                ticket_subject=ticket["subject"],
                admin_reply=payload.admin_reply,
            )
        except Exception as e:
            logger.error(f"Failed to send reply email for ticket {ticket_id}: {e}")

        try:
            create_notification(
                supabase_client=supabase,
                user_id=ticket["user_id"],
                type="support_ticket_reply",
                title=f"Réponse à votre ticket #{short_id}",
                body=f"Notre équipe a répondu à votre demande : {ticket['subject']}",
            )
        except Exception as e:
            logger.error(f"Failed to create reply notification for ticket {ticket_id}: {e}")

    # Log admin action
    try:
        supabase.rpc("log_security_event", {
            "p_event_type": "admin_support_reply",
            "p_severity": "info",
            "p_user_id": admin_id,
            "p_event_data": {
                "ticket_id": ticket_id,
                "new_status": payload.status,
                "has_reply": bool(payload.admin_reply),
            }
        }).execute()
    except Exception:
        pass

    return {"ticket_id": ticket_id, "updated": True}
