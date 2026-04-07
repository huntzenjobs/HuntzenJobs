# Support Chat Bubble — Design Spec
**Date:** 2026-03-12
**Status:** Approved
**Scope:** Dashboard only (authenticated users)

---

## Problem / Context

HuntZen has no support channel. Users who encounter bugs, need help, or want to give feedback have no in-product way to reach the team. The profile page even has an incomplete "Notre équipe support est là..." text. This feature adds a production-grade support widget that handles both self-service FAQ and tracked ticket submission.

---

## What We're Building

A floating support bubble (bottom-right, `fixed` position) visible in all dashboard pages. Opens a 400×560px panel with two tabs:

1. **FAQ Chatbot** — site-specific hybrid bot (static JSON first, Groq AI fallback with strict guardrail)
2. **Ticket Support** — pre-filled form that creates a tracked ticket, emails `huntzenproject@gmail.com`, and notifies the user

Admin counterpart: new `/admin/support` page integrated into existing admin section.

---

## Architecture

### Frontend (Next.js)

```
components/support/
  support-bubble.tsx        # Fixed FAB button + unread badge
  support-widget.tsx        # Animated panel, Tab logic
  support-chatbot.tsx       # Tab 1: FAQ + AI chat
  support-ticket-form.tsx   # Tab 2: Ticket creation form
  support-ticket-list.tsx   # Tab 2: User's own tickets list

components/admin/support/
  support-tickets-table.tsx # Admin ticket list with filters
  ticket-detail-drawer.tsx  # Sheet drawer: view + reply

app/(dashboard)/layout.tsx  # MODIFIED: add <SupportBubble /> — NOTE: layout.tsx is a server component; SupportBubble must have 'use client' at top. Next.js handles the client/server boundary automatically at component level.
app/admin/support/page.tsx  # New admin page
components/admin/admin-nav.tsx  # MODIFIED: add Support nav item

hooks/use-support.ts            # User-facing support operations
hooks/admin/use-admin-support.ts # Admin support operations

public/support-faq.json         # Static FAQ data (~50 Q/R)
```

### Backend (FastAPI)

**New file:** `backend/src/api/routes/support.py`

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/support/tickets` | user | Create ticket, email admin, notify user |
| `GET /api/support/tickets/me` | user | List user's own tickets |
| `POST /api/support/chatbot` | user | Hybrid FAQ + AI response |
| `GET /api/admin/support/tickets` | admin | All tickets with filters/pagination |
| `PATCH /api/admin/support/tickets/{id}` | admin | Update status + send reply |

**Reused code (do NOT duplicate):**
- Auth: use `CurrentUserDep` / `AdminUserDep` type aliases from `backend/src/api/deps.py` as function parameters — follow the exact pattern in `career_score.py` (NOT raw `get_current_user()` calls)
- Email: add 2 functions to `backend/src/services/email.py` → `send_support_ticket_notification()` + `send_support_ticket_reply()`
- Notifications: `create_notification()` from `backend/src/services/notifications.py`
- Supabase client pattern: same as `backend/src/api/routes/career_score.py`
- LLM: Groq client already configured in env
- Frontend API calls: use `process.env.NEXT_PUBLIC_BACKEND_URL` (consistent with `use-career-score.ts`, `use-cv-analysis.ts` — NOT `NEXT_PUBLIC_API_URL`)

**Modified:** `backend/src/api/routes/__init__.py` — register `support_router`

### Database (Supabase)

**New migration:** `supabase/migrations/20260312000001_support_tickets.sql`

```sql
CREATE TABLE support_tickets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email      TEXT NOT NULL,
  user_name       TEXT,
  user_plan       TEXT,
  page_url        TEXT,
  category        TEXT CHECK (category IN ('bug','question','suggestion')) NOT NULL,
  priority        TEXT CHECK (priority IN ('low','normal','urgent')) DEFAULT 'normal',
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  attachment_url  TEXT,  -- Supabase Storage path in 'support-attachments' bucket
  status          TEXT CHECK (status IN ('open','in_progress','resolved','closed')) DEFAULT 'open',
  admin_reply     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS: users see only their own tickets
-- service_role: full access (backend bypass)
-- Index: user_id, status, created_at (for admin list queries)

-- Storage bucket to create in migration:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', false);
-- RLS on storage: authenticated users can insert into their own folder (user_id/filename)
-- Upload flow: frontend uploads DIRECTLY to Supabase Storage using user session token
--   (same pattern as avatar-upload.tsx), then sends storage path in ticket POST body.
--   Backend generates a signed URL for admin preview.
```

---

## UX Flows

### User Flow — FAQ Chatbot

1. Click bubble → panel opens (scaleIn animation)
2. Welcome message with user's first name + 4-6 quick chip questions
3. User clicks chip or types question
4. Fuzzy match against `support-faq.json` using **Fuse.js** (new dependency to add: `npm install fuse.js` — ~25KB, no transitive deps; `threshold: 0.3` maps to a confidence score ≥ 0.7 → FAQ badge green)
5. If score < 0.7 → POST `/api/support/chatbot` → Groq with strict system prompt
6. If off-topic → guardrail message + "ouvrir un ticket →" link switches to Ticket tab
7. Markdown rendered answers with optional internal links

### User Flow — Ticket

1. Click "Ticket Support" tab
2. Pre-filled: name, email, plan, current page URL (read-only)
3. User fills: category (bug/question/suggestion), priority, subject, description
4. Optional: attach screenshot (< 5MB, image/* or PDF) — uploaded directly to Supabase Storage `support-attachments` bucket from the browser, path sent in ticket body
5. Submit → spinner → success card with ticket number
6. Ticket appears in "Mes tickets récents" list with status badge

### Admin Flow

1. `/admin/support` shows tickets table: ID, user, subject, category, priority, status, date
2. Filter tabs: Open / In Progress / Resolved / All
3. Click row → Sheet drawer (right panel):
   - User info snapshot (email, plan, page, timestamp)
   - Full description + attachment preview (backend generates signed URL via `supabase.storage.from_('support-attachments').create_signed_url(path, expires_in=3600)`, returned in GET ticket response)
   - Status dropdown (open → in_progress → resolved → closed)
   - Reply textarea + "Envoyer la réponse" button
4. On reply send:
   - Email to user (with reply content)
   - In-app notification via existing `create_notification()`
   - `log_security_event("admin_support_reply")`

---

## Chatbot Guardrail

**System prompt (strict):**
```
Tu es l'assistant support de HuntZen, une plateforme d'aide à la recherche d'emploi.
Tu réponds UNIQUEMENT aux questions concernant les fonctionnalités du site HuntZen :
CV, coach IA, recherche d'emploi, candidatures, abonnements, compte utilisateur.

Si une question ne concerne pas HuntZen ou ses fonctionnalités, réponds EXACTEMENT :
"HORS_SUJET"

Contexte des fonctionnalités disponibles :
[FAQ_CONTENT injecté]
```

If AI response = "HORS_SUJET" → frontend shows guardrail message with ticket link.

---

## Email Templates (2 new)

**`send_support_ticket_notification()`** → to `settings.admin_email` (already points to `huntzenproject@gmail.com` via env var — follow `send_recruiter_request_notification()` pattern exactly)
```
Sujet: [Support] Nouveau ticket #42 — Bug — URGENT
Corps: User: Wissem (Pro) | Email | Page: /jobs
       Sujet: Upload CV ne fonctionne pas
       Description: [...]
       Lien admin: https://app.huntzenjobs.com/admin/support
```

**`send_support_ticket_reply()`** → to user
```
Sujet: Réponse à votre ticket #42
Corps: Bonjour Wissem,
       Voici notre réponse à votre demande "Upload CV ne fonctionne pas" :
       [admin_reply]
```

---

## Notification Types

Add to existing `user_notifications` table types:
- `support_ticket_received` — confirmation when ticket created
- `support_ticket_reply` — when admin responds

**CRITICAL:** Also add both types to the `VALID_TYPES` set in `backend/src/services/notifications.py`. Without this, `create_notification()` silently returns `None` for unknown types (confirmed in source). This is a required code change, not just a DB schema change.

---

## Guards & Validation

**Ticket form (frontend):**
- Subject: 5-150 chars
- Description: 20-2000 chars
- Attachment: < 5MB, image/* | application/pdf only

**Chatbot (backend):**
- Max question length: 500 chars
- Rate limit: `@limiter.limit("10/minute")` decorator on `POST /api/support/chatbot` — IP-based (consistent with existing pattern in `cv.py`, `jobs.py`). Frontend shows "Trop de demandes, réessayez dans une minute" on HTTP 429.
- HORS_SUJET detection: exact string match on AI response prefix

**Admin (backend):**
- `get_current_admin()` dependency on all admin endpoints
- Admin reply logged via `log_security_event()`

---

## Files Summary

| File | Action |
|------|--------|
| `frontend-next/src/components/support/support-bubble.tsx` | Create |
| `frontend-next/src/components/support/support-widget.tsx` | Create |
| `frontend-next/src/components/support/support-chatbot.tsx` | Create |
| `frontend-next/src/components/support/support-ticket-form.tsx` | Create |
| `frontend-next/src/components/support/support-ticket-list.tsx` | Create |
| `frontend-next/src/components/admin/support/support-tickets-table.tsx` | Create |
| `frontend-next/src/components/admin/support/ticket-detail-drawer.tsx` | Create |
| `frontend-next/src/app/admin/support/page.tsx` | Create |
| `frontend-next/src/hooks/use-support.ts` | Create |
| `frontend-next/src/hooks/admin/use-admin-support.ts` | Create |
| `frontend-next/public/support-faq.json` | Create (~50 Q/R) |
| `frontend-next/src/app/(dashboard)/layout.tsx` | Modify |
| `frontend-next/src/components/admin/admin-nav.tsx` | Modify |
| `backend/src/api/routes/support.py` | Create |
| `backend/src/api/routes/__init__.py` | Modify |
| `backend/src/services/email.py` | Modify (+2 functions) |
| `backend/src/services/notifications.py` | Modify (add 2 types to VALID_TYPES set) |
| `supabase/migrations/20260312000001_support_tickets.sql` | Create (incl. storage bucket) |

---

## Verification Checklist

- [ ] Widget visible bottom-right in all dashboard pages
- [ ] FAQ chips return instant answers with FAQ badge
- [ ] Off-topic question → guardrail message + ticket link
- [ ] Ticket form pre-fills user data correctly
- [ ] Ticket submit → email received at huntzenproject@gmail.com
- [ ] Ticket visible in /admin/support
- [ ] Admin reply → user receives email + in-app notification
- [ ] Attachment upload works (image/PDF, <5MB)
- [ ] Widget closes on Escape key and outside click
- [ ] Mobile (<640px): widget opens as full-screen bottom sheet overlay (not 400×560px fixed panel)
- [ ] Chatbot at 11th request within 60s returns HTTP 429 → UI shows "Trop de demandes, réessayez dans une minute"
- [ ] Admin reply triggers in-app notification visible in NotificationCenter (not just email)
- [ ] Ticket submit → email received at huntzenproject@gmail.com (verify `settings.admin_email` env var resolves correctly in deployed env before launch)
