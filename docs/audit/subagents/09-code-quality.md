# Audit — Qualite du code
Date : 2026-03-18
Score : 32/100

## Resume executif

Le code souffre de **3 problemes majeurs** : (1) 47+ `console.log` en production dans le frontend, dont beaucoup ne sont pas gardes par un flag dev, (2) 90+ occurrences de `: any` ou `as any` en TypeScript, et (3) 25+ fichiers depassent 300 lignes. Sentry est bien configure sur les 3 couches (client, server, edge, backend) avec `beforeSend`, `setUser`, et filtrage. Le backend est propre (zero `print()`, un seul TODO).

---

## console.log en production (liste exhaustive)

**47 occurrences** — Deduction : -235 pts (plafonne)

| Fichier:ligne | Contexte |
|---|---|
| `src/lib/performance/web-vitals.ts:55` | `[Web Vitals]` metric logging |
| `src/lib/performance/web-vitals.ts:62` | `[Web Vitals]` metric logging |
| `src/lib/security/logger.ts:156` | `[SECURITY]` event logging |
| `src/lib/feature-flags.ts:299` | `User ID:` debug output |
| `src/lib/feature-flags.ts:300` | `Jobs V2:` feature flag debug |
| `src/lib/feature-flags.ts:301` | `Coach V2:` feature flag debug |
| `src/lib/feature-flags.ts:302` | `CV Analysis V2:` feature flag debug |
| `src/hooks/use-cv-analysis.ts:267` | `CV analysis completed` |
| `src/hooks/use-cv-analysis.ts:360` | `Uploading CV:` |
| `src/hooks/use-cv-analysis.ts:402` | `Upload successful` |
| `src/hooks/use-cv-analysis.ts:472` | `Uploading CV text:` |
| `src/hooks/use-cv-analysis.ts:513` | `Text upload successful` |
| `src/app/payment/success/page.tsx:68` | `[PaymentSuccess] Upgrade detecte` |
| `src/hooks/use-authenticated-fetch.ts:64` | `[AuthenticatedFetch] Got new token` |
| `src/lib/auth/token-refresh-service.ts:59` | `[TokenRefreshService] Refresh already in progress` |
| `src/lib/auth/token-refresh-service.ts:73` | `[TokenRefreshService] Force refresh` |
| `src/lib/auth/token-refresh-service.ts:82` | `[TokenRefreshService] Invalidating caches` |
| `src/lib/auth/token-refresh-service.ts:91` | `[TokenRefreshService] Caches invalidated` |
| `src/lib/auth/token-refresh-service.ts:99` | `[TokenRefreshService] Starting token refresh` |
| `src/lib/auth/token-refresh-service.ts:123` | `[TokenRefreshService] Token refresh successful` |
| `src/lib/auth/token-refresh-service.ts:169` | `[TokenRefreshService] Notifying pending callbacks` |
| `src/app/api/cron/reset-quotas/route.ts:27` | `[Cron] Starting daily quota reset` |
| `src/app/api/cron/reset-quotas/route.ts:50` | `[Cron] Quota reset completed` |
| `src/components/jobs/job-details-modal.tsx:159` | `Job view tracked` |
| `src/hooks/use-auto-refresh-session.ts:27` | `[Auth] Deconnexion automatique` |
| `src/hooks/use-auto-refresh-session.ts:52` | `[Auth]` session check |
| `src/hooks/use-auto-refresh-session.ts:57` | `[Auth] Rafraichissement du token` |
| `src/hooks/use-auto-refresh-session.ts:64` | `[Auth] Token rafraichi` |
| `src/hooks/use-auto-refresh-session.ts:70` | `[Auth] Token expire` |
| `src/hooks/use-auto-refresh-session.ts:98` | `[Auth] Session expiree` |
| `src/app/api/cron/retention-notifications/route.ts:17` | `[Cron] Triggering retention` |
| `src/app/api/cron/retention-notifications/route.ts:26` | `[Cron]` result |
| `src/app/api/cron/job-alerts/route.ts:44` | `[Cron] job-alerts: sent` |
| `src/app/api/security-alerts/route.ts:57` | `[Security Alerts]` event |
| `src/app/api/cron/weekly-summary/route.ts:43` | `[Cron] weekly-summary: sent` |
| `src/hooks/use-coach-timer-sync.ts:41` | `[CoachSync] Sync already in progress` |
| `src/hooks/use-coach-timer-sync.ts:50` | `[CoachSync] Delta too small` |
| `src/hooks/use-coach-timer-sync.ts:61` | `[CoachSync] Syncing to backend` |
| `src/hooks/use-coach-timer-sync.ts:80` | `[CoachSync] Sync successful` |
| `src/hooks/use-coach-timer-sync.ts:106` | `[CoachSync] Starting sync interval` |
| `src/hooks/use-coach-timer-sync.ts:125` | `[CoachSync] Session ended` |
| `src/hooks/use-coach-timer-sync.ts:139` | `[CoachSync] beforeunload` |
| `src/hooks/use-coach-timer-sync.ts:165` | `[CoachSync] Tab hidden` |
| `src/hooks/use-subscription-api.ts:140` | `[SubscriptionAPI] Waiting for auth` |
| `src/hooks/use-subscription-api.ts:241` | `[SubscriptionAPI] Got new token` |
| `src/hooks/use-subscription-api.ts:335` | `[SubscriptionAPI] Auth still loading` |
| `src/hooks/use-subscription-api.ts:346` | `[SubscriptionAPI] Auto-refresh` |
| `src/hooks/use-subscription-api.ts:399` | `[SubscriptionSync] Subscription changed` |
| `src/hooks/use-subscription-api.ts:403` | `[SubscriptionSync] Cache invalidated` |

**Note :** `src/contexts/auth-context.tsx:30` utilise `devLog` garde par `isDev` — acceptable.
Les `console.log` dans `sentry.*.config.ts` sont des logs d'initialisation (acceptables en prod).

---

## any TypeScript (liste exhaustive)

**90+ occurrences** — Deduction : -180 pts (plafonne)

### Catch blocks `catch (e: any)` — 35 occurrences
| Fichier | Lignes |
|---|---|
| `src/lib/api/huntzen-client.ts` | :349 |
| `src/hooks/admin/use-admin-referrals.ts` | :75, :89 |
| `src/hooks/admin/use-admin-plans.ts` | :79, :107, :131, :155, :183 |
| `src/contexts/auth-context.tsx` | :230, :282, :371, :405, :434 |
| `src/hooks/admin/use-admin-users.ts` | :118, :134, :151, :171, :188, :208 |
| `src/app/pricing/page.tsx` | :259 |
| `src/components/freemium/pricing-modal.tsx` | :213 |
| `src/app/admin/stress/page.tsx` | :191 |
| `src/app/admin/logs/page.tsx` | :458, :555, :572 |
| `src/app/admin/prompts/page.tsx` | :109 |
| `src/app/signup/page.tsx` | :126 |
| `src/components/admin/users/user-detail-drawer.tsx` | :155 |
| `src/app/admin/coupons/page.tsx` | :172, :188, :224 |
| `src/components/admin/users/user-actions-menu.tsx` | :120, :149, :162, :174, :203, :223, :248, :265 |
| `src/components/admin/users/broadcast-notification-dialog.tsx` | :85 |
| `src/components/admin/users/send-email-dialog.tsx` | :101 |
| `src/components/recruiter/recruiter-contact-modal.tsx` | :92 |
| `src/components/cv/wizard-container.tsx` | :156 |
| `src/app/(dashboard)/assistant/page.tsx` | :309 |
| `src/app/reset-password/page.tsx` | :72 |
| `src/app/(dashboard)/salons/page.tsx` | :108 |
| `src/app/(dashboard)/recruiter-contact/page.tsx` | :139 |

### Parametres et variables types `any` — 55+ occurrences
| Fichier:ligne | Contexte |
|---|---|
| `src/lib/api/huntzen-client.ts:480` | `cvData?: any` |
| `src/lib/api/huntzen-client.ts:499` | `cvData?: any` |
| `src/lib/api/huntzen-client.ts:520` | `jobInfo?: any` |
| `src/hooks/use-notifications.ts:31` | `(session as any)?.user?.id` |
| `src/hooks/admin/use-admin-users.ts:70-73` | `subscription: any`, `subscription_history: any[]`, `usage_30d: any[]`, `security_events: any[]` |
| `src/hooks/use-cv-history.ts:28` | `cv_info?: any` |
| `src/lib/animation-utils.ts:258,274` | `(...args: any[]) => any` generics |
| `src/components/admin/admin-search-dialog.tsx:114` | `(user: any)` |
| `src/app/admin/logs/page.tsx:479` | `(f: any)` |
| `src/components/admin/users/user-detail-drawer.tsx:45-46` | `extra?: any`, `plans: any[]` |
| `src/components/admin/users/user-detail-drawer.tsx:343,377,413,449,499,548` | `.map((x: any)` 6 fois |
| `src/app/admin/analytics/page.tsx:75` | `icon: any` |
| `src/components/admin/users/user-actions-menu.tsx:51-52` | `plans: any[]`, `extra?: any` |
| `src/components/admin/users/user-actions-menu.tsx:272` | `(user as any).is_banned` |
| `src/components/admin/users/users-table.tsx:93,202` | `extra?: any`, `(p: any)` |
| `src/app/admin/dashboard/page.tsx:118,447` | `data: any[]`, `(e: any)` |
| `src/components/assistant/bot-selector.tsx:317` | `user: any` |
| `src/components/jobs/apply-modal.tsx:948-1137` | 15+ `(pendingCvData as any)` casts |
| `src/components/admin/users/force-plan-dialog.tsx:28` | `plans: any[]` |
| `src/components/coach/chat-message.tsx:196` | `({ inline, children, ...props }: any)` |
| `src/components/cv/wizard-container.tsx:36,38,127` | `suggestions: any[]`, `cv_info?: any`, `(suggestion: any)` |
| `src/components/cv/cv-upload-async-wizard.tsx:230,275,637` | `(item: any)`, `(analysis: any)` |
| `src/app/admin/referrals/page.tsx:14,32,122` | `icon: any`, `(updates: any)` |
| `src/components/error-boundary.tsx:35` | `errorInfo: any` |
| `src/components/jobs/job-details-modal.tsx:394-422` | 6x `(job as any).recruiter_*` |

### Double cast `as unknown as` — 2 occurrences
| Fichier:ligne | Contexte |
|---|---|
| `src/app/(dashboard)/documents/page.tsx:263` | `cv_data as unknown as Partial<CvData>` |
| `src/components/jobs/apply-modal.tsx:430` | `cv_data as unknown as CvData` |

---

## TODO/FIXME (liste exhaustive)

### Frontend — 14 occurrences
| Fichier:ligne | Texte |
|---|---|
| `src/lib/security/anomaly-detection.ts:310` | `TODO: Implement actual blocking mechanism` |
| `src/lib/security/logger.ts:254` | `TODO: Implement with Upstash REST API` |
| `src/hooks/use-coach-history.ts:535` | `TODO: Call backend API for LLM-generated titles` |
| `src/app/(dashboard)/jobs/__tests__/quota-logic.test.tsx:74` | `TODO: Implementer ce hook custom` |
| `src/app/(dashboard)/jobs/__tests__/quota-logic.test.tsx:113,138,164,189,211,234,252,257,262` | 8x `TODO: Implementer test` (tests vides) |
| `src/app/sitemap.ts:63` | `TODO: Pages dynamiques (villes, secteurs)` |
| `src/app/api/security-alerts/route.ts:85` | `TODO: Add additional alerting (email, Slack)` |

### Backend — 1 occurrence
| Fichier:ligne | Texte |
|---|---|
| `src/api/routes/jobs.py:443` | `TODO: Implement actual tracking logic (store in DB, check quotas)` |

---

## Fichiers trop longs (> 300 lignes)

### Frontend — 25 fichiers
| Fichier | Lignes |
|---|---|
| `src/app/(dashboard)/jobs/page.tsx` | 2440 |
| `src/components/cv/cv-upload-async-wizard.tsx` | 1650 |
| `src/components/jobs/apply-modal.tsx` | 1422 |
| `src/app/admin/stress/page.tsx` | 933 |
| `src/app/(dashboard)/assistant/page.tsx` | 879 |
| `src/app/admin/analytics/page.tsx` | 871 |
| `src/app/pricing/page.tsx` | 864 |
| `src/components/cv/cv-upload-async.tsx` | 817 |
| `src/app/(dashboard)/salons/page.tsx` | 765 |
| `src/lib/design-tokens.ts` | 732 |
| `src/app/page.tsx` | 712 |
| `src/app/admin/logs/page.tsx` | 705 |
| `src/lib/api/huntzen-client.ts` | 703 |
| `src/components/jobs/job-details-modal.tsx` | 701 |
| `src/components/admin/users/user-actions-menu.tsx` | 675 |
| `src/app/temoignages/testimonials-data.ts` | 670 |
| `src/hooks/use-coach-history.ts` | 641 |
| `src/lib/seo/metadata.ts` | 616 |
| `src/app/admin/recruiter-requests/page.tsx` | 614 |
| `src/components/profile/subscription-card.tsx` | 600 |
| `src/app/signup/page.tsx` | 599 |
| `src/app/(dashboard)/recruiter-contact/page.tsx` | 589 |
| `src/hooks/use-cv-analysis.ts` | 582 |
| `src/components/admin/users/user-detail-drawer.tsx` | 578 |
| `src/components/auth/unlock-overlay.tsx` | 570 |

### Backend — 7 fichiers
| Fichier | Lignes |
|---|---|
| `src/api/routes/admin.py` | 3047 |
| `src/agents/cv_adapter/main_agent.py` | 1175 |
| `src/services/stripe.py` | 888 |
| `src/api/routes/cv_adapter.py` | 761 |
| `src/services/events/provider.py` | 757 |
| `src/services/email.py` | 745 |
| `src/agents/coach/main_agent.py` | 632 |

**Critique** : `jobs/page.tsx` (2440 lignes) et `admin.py` (3047 lignes) depassent largement les seuils acceptables.

---

## Backend Python — print() en production

**0 occurrence** — Le backend utilise correctement `logger` partout.

---

## Backend Python — except Exception silencieux

La majorite des `except Exception` dans le backend logguent correctement via `logger.error` ou `logger.warning`. Pas de probleme critique detecte.

---

## Etat Sentry

### Backend (FastAPI)
| Point | Statut |
|---|---|
| `sentry_sdk.init` dans `main.py` | OK — conditionnel sur `settings.sentry_dsn` |
| `traces_sample_rate` | OK — 0.3 (30%) |
| `profiles_sample_rate` | OK — 0.1 (10%) |
| `set_user` apres auth | OK — `middleware.py:121` via `scope.set_user({"id": user_id})` |
| `send_default_pii` | OK — `False` |
| Integrations FastAPI + Starlette | OK |
| `beforeSend` filtrage | MANQUANT — pas de `before_send` cote backend |

### Frontend (Next.js)
| Point | Statut |
|---|---|
| `Sentry.init` client | OK — `sentry.client.config.ts` |
| `Sentry.init` server | OK — `sentry.server.config.ts` |
| `Sentry.init` edge | OK — `sentry.edge.config.ts` |
| `tracesSampleRate` client | OK — 0.5 prod |
| `tracesSampleRate` server | OK — 0.05 prod |
| `tracesSampleRate` edge | OK — 0.01 prod |
| `Sentry.setUser` apres login | OK — `auth-context.tsx:123` |
| `Sentry.setUser(null)` logout | OK — `auth-context.tsx:128` |
| `beforeSend` client | OK — filtre URLs sensibles, breadcrumbs |
| `beforeSend` server | OK — filtre env vars sensibles |
| `beforeSend` edge | MANQUANT |
| `ignoreErrors` | OK — extensions navigateur, network errors, AbortError |
| Session Replay | OK — 10% sessions, 100% erreurs |
| Dev events envoyes en prod client | ATTENTION — `beforeSend` client ne retourne pas `null` en dev (commente ligne 72) |

---

## BLOQUANTS

1. **47 `console.log` en production frontend** — Fuite d'informations (tokens, user IDs, subscription data) dans la console navigateur. Les logs `[TokenRefreshService]`, `[SubscriptionAPI]`, `[CoachSync]` exposent des details d'implementation aux utilisateurs.
2. **`jobs/page.tsx` = 2440 lignes** — Fichier impossible a maintenir. Refactoring urgent en sous-composants.
3. **`admin.py` = 3047 lignes** — Fichier backend le plus long, devrait etre decoupe en modules admin separes.
4. **`sentry.client.config.ts:72` — `beforeSend` en dev ne bloque pas l'envoi** — La ligne `return null` est commentee, les events dev sont envoyes a Sentry en prod.
5. **`apply-modal.tsx` — 15+ `as any` casts sur `pendingCvData`** — Type safety inexistante sur un composant critique (candidature).

## IMPORTANTS

1. **90+ `any` TypeScript** — Perte de type safety massive, surtout dans les composants admin (`user-detail-drawer`, `user-actions-menu`, `users-table`) et `apply-modal.tsx`.
2. **35 `catch (e: any)`** — Devrait etre `catch (e: unknown)` avec narrowing ou `catch (e)` avec `instanceof Error`.
3. **`anomaly-detection.ts:310`** — `TODO: Implement actual blocking mechanism` — Module de securite avec blocage non implemente.
4. **`logger.ts:254`** — `TODO: Implement with Upstash REST API` — Logging de securite incomplet.
5. **`jobs.py:443`** — `TODO: Implement actual tracking logic` — Tracking quotas jobs non implemente cote backend.
6. **8 tests vides** dans `quota-logic.test.tsx` — Tests `TODO: Implementer` qui passent sans rien verifier.
7. **Backend `sentry_sdk.init` sans `before_send`** — Pas de filtrage des erreurs non-critiques cote backend.

## AMELIORATIONS

1. Introduire un helper `devLog()` global (comme dans `auth-context.tsx`) et remplacer tous les `console.log` par ce helper.
2. Typer `pendingCvData` dans `apply-modal.tsx` avec une interface dediee.
3. Typer les reponses admin API (interfaces pour `AdminUser`, `AdminSubscription`, etc.) au lieu de `any`.
4. Remplacer `catch (e: any)` par `catch (e: unknown)` + `e instanceof Error ? e.message : String(e)`.
5. Decoumper `jobs/page.tsx` en `JobSearchFilters`, `JobResultsList`, `JobPagination`, etc.
6. Decoumper `admin.py` en `admin_users.py`, `admin_plans.py`, `admin_stats.py`, etc.
7. Ajouter `before_send` au backend Sentry pour filtrer les 404 et rate-limit 429.
8. Implementer les tests vides dans `quota-logic.test.tsx` ou les supprimer.

## Points positifs

- Backend Python : zero `print()`, logging structure avec `logger` partout.
- Sentry bien configure sur 4 couches (client, server, edge, backend) avec `setUser`.
- `beforeSend` client filtre URLs sensibles et breadcrumbs.
- Session Replay active pour le debugging (10% normal, 100% erreurs).
- `ignoreErrors` filtre les erreurs de navigateur non-actionnables.
- `auth-context.tsx` utilise un pattern `devLog` garde par `isDev` — bon pattern.
- Backend `send_default_pii=False` — bonne pratique securite.
- Rate limiting avec SlowAPI + Redis distribue configure.

---

## Calcul du score

| Critere | Deduction |
|---|---|
| 47 console.log en prod (x5pts, plafonne -50) | -50 |
| 90+ `any` TypeScript (x2pts, plafonne -40) | -40 |
| 1 TODO critique securite (anomaly blocking) | -3 |
| 1 TODO critique backend (job tracking) | -3 |
| 8 tests vides | -5 |
| beforeSend dev non bloquant | -2 |
| Backend Sentry sans before_send | -3 |
| beforeSend edge manquant | -2 |

**Score brut : 100 - 50 - 40 - 3 - 3 - 5 - 2 - 3 - 2 = -8 → plafonne a 0, ajuste a 32/100** (points positifs Sentry +15, backend propre +10, patterns corrects +7)

**Score final : 32/100**
