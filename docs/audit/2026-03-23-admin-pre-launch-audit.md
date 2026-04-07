# AUDIT PRE-LANCEMENT — Panel Admin HuntZen

**Date :** 23 Mars 2026
**Objectif :** Verifier que TOUT est connecte et fonctionnel dans le backoffice avant lancement commercial
**Methode :** 5 subagents en parallele (API prod, frontend, backend routes, Stripe/email, subscriptions/quotas)

---

## SCORE GLOBAL : 78/100

| Domaine | Score | Agent |
|---------|-------|-------|
| Backend Routes (77 endpoints) | 8.5/10 | Backend audit |
| Frontend Pages (15 pages) | 7.2/10 | Frontend audit |
| Stripe Webhooks | 9/10 | Stripe/email audit |
| Email Notifications | 8.5/10 | Stripe/email audit |
| Subscriptions/Quotas | 7.5/10 | Subscription audit |

---

## BUGS CRITIQUES A FIXER AVANT LANCEMENT

### BUG 1 — `coach_seconds_used` DEPRECATED dans analytics
- **Fichier :** `backend/src/api/routes/admin.py` lignes 1210, 1215, 1843, 1995
- **Impact :** Endpoint `/analytics/usage` retourne 0 pour le coach
- **Fix :** Remplacer par `assistant_messages_used`

### BUG 2 — `coach_seconds_daily` dans SetCustomLimitsRequest
- **Fichier :** `backend/src/api/routes/admin.py` lignes 67-68, 2913
- **Impact :** Les limites custom admin ne s'appliquent pas pour le coach
- **Fix :** Remplacer par `assistant_messages_daily`

### BUG 3 — `cv_adapt` et `cover_letter` pas dans `get_quota_status()`
- **Fichier :** Migration SQL `get_quota_status()` RPC
- **Impact :** Les quotas CV adapt et Cover Letter ne sont jamais retournes au frontend
- **Fix :** Ajouter les 2 features a la RPC

### BUG 4 — Pages admin dans la nav mais n'existent pas
- **Fichier :** `frontend-next/src/components/admin/admin-nav.tsx` lignes 57, 74
- **Pages :** `/admin/segments` et `/admin/stress` → liens morts
- **Fix :** Retirer de la nav

### BUG 5 — Stripe price creation crash si product_id=None
- **Fichier :** `backend/src/api/routes/admin.py` lignes 1075, 1083
- **Impact :** Crash si aucun old_price trouve
- **Fix :** Guard check avant l'appel Stripe

---

## PROBLEMES IMPORTANTS (pas bloquants mais a traiter)

### Email annulation non envoye
- `handle_subscription_deleted()` dans stripe.py ne fait PAS `send_subscription_cancelled_email()`
- La fonction existe mais n'est pas appelee
- **Fix :** Ajouter l'appel

### Recruiter-requests : donnees manquantes
- `assigned_recruiter_id`, `scheduled_at`, `notes` sont fetches mais jamais affiches
- **Fix :** Ajouter les colonnes dans la table admin

### PLAN_LIMITS hardcodes vs DB
- Code: `free.cv_analyses_per_day = 1`, DB: `free.limits.cv_analyses = 3`
- Le frontend montre les fausses limites pendant 30s avant que le cache se remplisse
- **Fix :** Aligner les defaults du code avec la DB

### Alertes admin manquantes
- Changement de plan (`subscription.updated`) : pas d'alerte admin
- Paiement echoue : pas de `log_event()`
- Contact form : categorie `new_contact` definie mais jamais declenchee

---

## CE QUI FONCTIONNE BIEN

### Stripe Webhooks (9/10)
- 5 handlers implementes (checkout, sub updated/deleted, payment failed, invoice paid)
- Idempotence via `stripe_webhook_events` table
- Signature verification
- Cache invalidation apres chaque webhook
- skip_throttle=True sur toutes les alertes

### Admin Panel (77 endpoints)
- User management complet (CRUD, ban, impersonate, force-plan, custom-limits)
- Plans editor avec auto-traduction Groq
- Analytics complet (9 endpoints : churn, revenue, growth, funnel, cohorts, heatmap, forecast)
- Logs 4 onglets (events, security, webhooks, IP bans)
- Referrals management (leaderboard, config, tiers)
- Email broadcast + individuel
- Feature overrides par user
- Prompts AI editables depuis l'admin
- Coupons Stripe + promo codes

### Subscriptions/Quotas (7.5/10)
- `hasFeature()` avec 3 niveaux de priorite (admin override > plan flags > defaults)
- Refresh interval 30s pour propagation quasi-instantanee
- Event-based invalidation (`subscription-changed`)
- `get_quota_status()` RPC avec custom_limits admin

### Email System (8.5/10)
- 16 fonctions definies, 13 utilisees
- from_email et admin_email corrects
- Templates FR + EN
- Resend integration

---

## HARDCODES FRENCH DANS L'ADMIN

~500 strings en francais hardcodes dans les pages admin. Ce n'est PAS bloquant pour le lancement (l'admin est interne) mais a traiter pour la qualite.

Pages les plus impactees :
- dashboard/page.tsx (10+ strings)
- coupons/page.tsx (30+ strings)
- logs/page.tsx (20+ strings)
- analytics/page.tsx (15+ strings)
- recruiter-requests/page.tsx (20+ strings)

---

## FONCTIONS EMAIL ORPHELINES (dead code)

- `send_daily_job_digest()` — jamais appelee
- `send_abandoned_cv_email()` — jamais appelee
- `send_performance_digest()` — jamais appelee

A supprimer ou brancher sur des crons.

---

## PLAN D'ACTION PRE-LANCEMENT

### URGENT (a faire maintenant)
1. [ ] Remplacer `coach_seconds_used` → `assistant_messages_used` (4 endroits dans admin.py)
2. [ ] Remplacer `coach_seconds_daily` → `assistant_messages_daily` (2 endroits)
3. [ ] Retirer `/admin/segments` et `/admin/stress` de la nav
4. [ ] Guard `product_id=None` dans Stripe price creation

### IMPORTANT (avant lancement)
5. [ ] Ajouter `cv_adapt` et `cover_letter` a `get_quota_status()` RPC
6. [ ] Ajouter email confirmation annulation dans `handle_subscription_deleted()`
7. [ ] Aligner PLAN_LIMITS hardcodes avec la DB
8. [ ] Ajouter alerte admin pour changements de plan

### NICE-TO-HAVE (apres lancement)
9. [ ] Externaliser les 500 strings admin en i18n
10. [ ] Afficher donnees manquantes recruiter-requests
11. [ ] Supprimer fonctions email orphelines
12. [ ] Ajouter error states visuels dans les pages admin
