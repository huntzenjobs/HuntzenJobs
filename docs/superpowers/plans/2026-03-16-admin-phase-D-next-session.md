# Admin HuntZen — Phase D suite & finalisation (prochaine session)

**Branche active :** `feature/admin-realtime-tracking` (PR #112 → base: Production)

---

## ÉTAT ACTUEL

- Phase A : ✅ complète
- Phase B : ✅ complète (5/5 vérifiés : card actifs, SiteBanner, PresenceTracker, middleware 503, page /maintenance)
- Phase C : ✅ complète (11 endpoints backend, drawer activité, actions menu, Cmd+K, CSV)
- Phase D : partiellement faite — voici ce qui RESTE à faire :

---

## IMPORTANT : utilise des sous-agents en parallèle

Lance **2-3 agents en parallèle** (subagent_type=general-purpose) pour lire les fichiers
existants et comprendre les patterns avant de coder. Explore backend, frontend et DB
simultanément. Ne code jamais sans avoir lu les fichiers cibles.

---

## CE QUI A DÉJÀ ÉTÉ FAIT EN PHASE D

- ✅ **D2** — `backend/src/services/abuse_detection.py` créé (sliding window Redis, is_rate_limited, is_suspect)
  + appelé dans `presence.py` heartbeat (10 req/min, fail-open)
- ✅ **D4** — `GET /api/admin/analytics/usage-heatmap` dans `admin.py`
  + onglet "Heatmap" dans `frontend-next/src/app/admin/analytics/page.tsx`
- ✅ **D5** — `POST /api/admin/logs/webhooks/{id}/retry` dans `admin.py`
  + bouton "Retry" dans `frontend-next/src/app/admin/logs/page.tsx`
- ✅ **D6** — `purge_old_user_events()` dans `backend/src/services/user_events.py`
  + `POST /api/cron/purge-events` dans `backend/src/api/routes/cron.py`

---

## CE QUI RESTE À FAIRE

### D1 — Broadcast notification par segment (partiellement couvert)

Le `POST /api/admin/users/bulk-email` existe déjà (segments: at-risk, about-to-churn, never-converted, all-paying).

**Reste à faire :**
- [ ] `POST /api/admin/broadcast-notification` dans `admin.py`
  - Insère une notification in-app via `create_notification()` pour tous les users d'un segment
  - Segments : `all`, `paying`, `free`, `at-risk`
  - Utilise `src/services/notifications.py` → `create_notification(supabase, uid, type, title, body)`
- [ ] Bouton "Broadcast" dans `/admin/users` (à côté du filtre segment)

### D3 — Ban IP + liste noire emails

**Reste à faire (backend `admin.py`) :**
- [ ] `POST /api/admin/ban-ip` — stocke IP dans Redis set `banned_ips` (TTL configurable)
- [ ] `DELETE /api/admin/ban-ip/{ip}` — supprime du set
- [ ] `GET /api/admin/banned-ips` — liste les IPs bannies (Redis smembers)
- [ ] `POST /api/admin/blacklist-email` — stocke email dans Redis set `blacklisted_emails`
- [ ] `GET /api/admin/blacklisted-emails` — liste

**Middleware FastAPI (`backend/src/api/middleware.py` ou dans `app.py`) :**
- Checker IP de la requête contre Redis `banned_ips`
- Si présente → retourner 403

**Frontend (`/admin/security` ou nouvel onglet dans `/admin/logs`) :**
- Formulaire pour ajouter/supprimer une IP/email de la liste noire

---

## FICHIERS CLÉS (ne pas relire depuis zéro, déjà connus)

| Fichier | Rôle |
|---------|------|
| `backend/src/api/routes/admin.py` | 2400+ lignes — ajouter D1/D3 à la fin |
| `backend/src/api/routes/presence.py` | Heartbeat avec rate limiting déjà branché |
| `backend/src/services/abuse_detection.py` | `is_rate_limited()`, `is_suspect()` — réutiliser |
| `backend/src/services/notifications.py` | `create_notification()` — réutiliser pour D1 |
| `backend/src/api/routes/cron.py` | Cron purge déjà ajouté |
| `frontend-next/src/app/admin/logs/page.tsx` | Bouton Retry déjà ajouté |
| `frontend-next/src/app/admin/analytics/page.tsx` | Onglet Heatmap déjà ajouté |

## PATTERNS IMPORTANTS

- Railway utilise `pyproject.toml` (pas `requirements.txt`)
- SSE auth via query param `?token=xxx` (pas header)
- `events_router` déjà pris (job-fairs) → ne pas réutiliser ce nom
- `cmdk` déjà installé v1.1.1
- Sentry : `new_scope()` pas `push_scope()` (déprécié)
- `AdminUserDep` → pattern : `admin: AdminUserDep` sans `= None`
- Tous les endpoints admin loggent via `_log_admin_action(supabase, admin["id"], ...)`
- Redis via `from src.utils.cache import get_redis` (async)
- **Ne jamais committer `docs/plans/`** (local uniquement)
- **Pas de `Co-Authored-By`** dans les messages de commit

## VÉRIFICATION AVANT DE COMMITTER

1. Lire chaque fichier modifié avec un sous-agent avant de le modifier
2. Vérifier les conflits de routes FastAPI (`/users/export` vs `/users/{user_id}` — bug déjà corrigé)
3. Tester que `AdminUserDep` n'a pas de `= None` par défaut

## POUR MERGER LA PR

La PR #112 est feature-complete sur Phase A/B/C/D (sauf D1 broadcast et D3 ban IP).
Si D1/D3 sont considérés optionnels → merger PR #112 puis ouvrir une PR séparée.
