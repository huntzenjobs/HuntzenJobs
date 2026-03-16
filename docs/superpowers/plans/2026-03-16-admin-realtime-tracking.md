# Admin HuntZen — Centre de Contrôle Temps Réel & Gestion Complète

> **Pour reprendre en nouvelle session :** Lis ce fichier.

**Goal:** Transformer l'admin HuntZen en centre de contrôle complet : tracking temps réel, gestion totale, communication en masse, sécurité avancée.

**Branche active :** `feature/admin-realtime-tracking` (PR #112 ouverte)

---

## PHASE A — ✅ COMPLÈTE (commitée sur la branche)

Tout A1→A7 fait. Migrations appliquées en prod. LangSmith fonctionnel.

---

## PHASE B — Page /admin/live (EN COURS)

### ✅ B1 — Backend SSE + Banner + Maintenance
- `presence.py` : `presence_router` heartbeat + `GET /api/presence/admin/live` SSE + banner + maintenance
- `__init__.py` : `banner_router` enregistré
- `requirements.txt` : `sse-starlette>=1.6.1` ajouté
- **PAS encore committé**

### ⬜ B2 — Hooks frontend (À FAIRE EN PREMIER)
- [ ] `frontend-next/src/hooks/use-presence.ts`
  - `usePresence(page, feature?)` → setInterval 30s → POST `/api/presence/heartbeat`
  - `return () => clearInterval(interval)` sur unmount
  - Dépendances : `[page, feature, user?.id]`
- [ ] `frontend-next/src/hooks/admin/use-admin-live.ts`
  - `new EventSource(BACKEND_URL + '/api/presence/admin/live', { withCredentials: true })`
  - Passer le token en query param : `/api/presence/admin/live?token=xxx` (SSE ne supporte pas les headers)
  - Retourne : `{ presence: { total, by_page, by_feature }, connected }`
  - Reconnexion auto (EventSource natif)
- [ ] `frontend-next/src/hooks/admin/use-admin-events.ts`
  - Supabase Realtime côté client (clé anon — pas service_role)
  - Subscribe sur `user_events` INSERT
  - Retourne `{ events: UserEvent[], connected }` (max 50 en mémoire)

**IMPORTANT pour SSE auth :** le backend doit accepter le token en query param (pas en header — SSE ne supporte pas). Modifier `GET /api/presence/admin/live` pour lire `?token=xxx`.

### ⬜ B3 — Page /admin/live (À FAIRE)
- [ ] `frontend-next/src/app/admin/live/page.tsx`
  - Section 1 "En ce moment" : compteurs via `useAdminLive()`
  - Section 2 "Fil d'événements" : stream via `useAdminEvents()`
  - Section 3 "Santé" : polling `/api/health` + toggle maintenance

### ⬜ B4 — Dashboard enrichi (À FAIRE)
- [ ] `frontend-next/src/app/admin/dashboard/page.tsx`
  - Card "X actifs maintenant" cliquable → `/admin/live`

### ⬜ B5 — Banner site-wide (À FAIRE)
- [ ] `frontend-next/src/components/layout/site-banner.tsx`
- [ ] Appel dans root layout (RSC, fetch côté serveur)

### ⬜ B6 — Mode maintenance (À FAIRE)
- [ ] `frontend-next/src/middleware.ts` — si 503 → redirect `/maintenance`
- [ ] Page `/maintenance`

---

## PHASE C — Gestion utilisateurs (À FAIRE)
(voir plan original pour le détail)

## PHASE D — Outils & sécurité (À FAIRE)
(voir plan original pour le détail)

---

## NOTES IMPORTANTES

1. **SSE auth** : EventSource ne supporte pas les headers → passer token en `?token=xxx` dans l'URL
2. **Supabase Realtime** : utiliser clé anon (pas service_role) côté frontend
3. **`events_router`** : déjà pris (job-fairs) → utiliser `presence_router`, `tracking_router`, `banner_router`
4. **`sse-starlette`** : ajouté dans requirements.txt mais pas encore déployé
5. **Branche** : `feature/admin-realtime-tracking`, PR #112
