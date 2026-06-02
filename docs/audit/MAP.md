# MAP — HuntZen Codebase
Date : 2026-03-18
Cartographie complete du code (composants UI, endpoints backend, tables Supabase).

## Resume
- Pages frontend : 51 (45 pages + 6 route handlers)
- Composants UI : 119 fichiers
- Endpoints backend : 157
- Tables Supabase : 36
- Variables d'env : 42 (settings.py)
- Integrations tierces : 12
- Cles de traduction FR : 722 feuilles / 33 cles de premier niveau

---

## SECTION 1 — Pages Frontend (App Router)

### Pages (page.tsx)

| Chemin fichier | Route URL | Auth requise | Metadata | Loading.tsx | Error.tsx |
|----------------|-----------|:------------:|:--------:|:-----------:|:---------:|
| `app/page.tsx` | `/` | non | oui (layout) | non | oui (root) |
| `app/login/page.tsx` | `/login` | non | non | non | oui (root) |
| `app/signup/page.tsx` | `/signup` | non | non | non | oui (root) |
| `app/forgot-password/page.tsx` | `/forgot-password` | non | non | non | oui (root) |
| `app/reset-password/page.tsx` | `/reset-password` | non | non | non | oui (root) |
| `app/auth/recovery/page.tsx` | `/auth/recovery` | non | non | non | oui (root) |
| `app/pricing/page.tsx` | `/pricing` | non | oui (layout) | non | oui (root) |
| `app/about/page.tsx` | `/about` | non | oui (layout) | non | oui (root) |
| `app/blog/page.tsx` | `/blog` | non | non | non | oui (root) |
| `app/faq/page.tsx` | `/faq` | non | oui | non | oui (root) |
| `app/privacy/page.tsx` | `/privacy` | non | oui (layout) | non | oui (root) |
| `app/terms/page.tsx` | `/terms` | non | oui (layout) | non | oui (root) |
| `app/temoignages/page.tsx` | `/temoignages` | non | oui | non | oui (root) |
| `app/maintenance/page.tsx` | `/maintenance` | non | oui | non | oui (root) |
| `app/offline/page.tsx` | `/offline` | non | non | non | oui (root) |
| `app/payment/success/page.tsx` | `/payment/success` | non | non | non | oui (root) |
| `app/payment/cancel/page.tsx` | `/payment/cancel` | non | non | non | oui (root) |
| `app/(dashboard)/assistant/page.tsx` | `/assistant` | non (freemium) | oui (layout) | oui | non |
| `app/(dashboard)/candidatures/page.tsx` | `/candidatures` | non (freemium) | non | oui (parent) | non |
| `app/(dashboard)/cv-analysis/page.tsx` | `/cv-analysis` | non (freemium) | oui (layout) | oui | non |
| `app/(dashboard)/documents/page.tsx` | `/documents` | non (freemium) | non | oui (parent) | non |
| `app/(dashboard)/expat/page.tsx` | `/expat` | non (freemium) | non | oui (parent) | non |
| `app/(dashboard)/jobs/page.tsx` | `/jobs` | non (freemium) | oui (layout) | oui | non |
| `app/(dashboard)/profile/page.tsx` | `/profile` | oui (middleware) | non | oui (parent) | non |
| `app/(dashboard)/recruiter-contact/page.tsx` | `/recruiter-contact` | non (freemium) | non | oui | non |
| `app/(dashboard)/recruiter-contact/success/page.tsx` | `/recruiter-contact/success` | non (freemium) | non | non | non |
| `app/(dashboard)/referral/page.tsx` | `/referral` | non (freemium) | non | oui (parent) | non |
| `app/(dashboard)/salons/page.tsx` | `/salons` | non (freemium) | oui (layout) | oui | non |
| `app/(dashboard)/saved-jobs/page.tsx` | `/saved-jobs` | oui (middleware) | non | oui | non |
| `app/admin/page.tsx` | `/admin` | oui (middleware) | oui (layout) | non | non |
| `app/admin/analytics/page.tsx` | `/admin/analytics` | oui (middleware) | non | non | non |
| `app/admin/coupons/page.tsx` | `/admin/coupons` | oui (middleware) | non | non | non |
| `app/admin/dashboard/page.tsx` | `/admin/dashboard` | oui (middleware) | non | non | non |
| `app/admin/live/page.tsx` | `/admin/live` | oui (middleware) | non | non | non |
| `app/admin/logs/page.tsx` | `/admin/logs` | oui (middleware) | non | non | non |
| `app/admin/plans/page.tsx` | `/admin/plans` | oui (middleware) | non | non | non |
| `app/admin/prompts/page.tsx` | `/admin/prompts` | oui (middleware) | non | non | non |
| `app/admin/recruiter-requests/page.tsx` | `/admin/recruiter-requests` | oui (middleware) | non | non | non |
| `app/admin/referrals/page.tsx` | `/admin/referrals` | oui (middleware) | non | non | non |
| `app/admin/segments/page.tsx` | `/admin/segments` | oui (middleware) | non | non | non |
| `app/admin/stress/page.tsx` | `/admin/stress` | oui (middleware) | non | non | non |
| `app/admin/suggestions/page.tsx` | `/admin/suggestions` | oui (middleware) | non | non | non |
| `app/admin/support/page.tsx` | `/admin/support` | oui (middleware) | non | non | non |
| `app/admin/users/page.tsx` | `/admin/users` | oui (middleware) | oui | non | non |

Note: middleware.ts protege `/dashboard`, `/profile`, `/saved-jobs`, `/admin`. Les routes (dashboard) sont accessibles sans auth (freemium) sauf `/profile` et `/saved-jobs`.

### Route Handlers (route.ts)

| Chemin fichier | Route URL | Type |
|----------------|-----------|------|
| `app/auth/callback/route.ts` | `/auth/callback` | Auth callback Supabase |
| `app/api/cron/job-alerts/route.ts` | `/api/cron/job-alerts` | Cron (CRON_SECRET) |
| `app/api/cron/reset-quotas/route.ts` | `/api/cron/reset-quotas` | Cron (CRON_SECRET) |
| `app/api/cron/retention-notifications/route.ts` | `/api/cron/retention-notifications` | Cron (CRON_SECRET) |
| `app/api/cron/weekly-summary/route.ts` | `/api/cron/weekly-summary` | Cron (CRON_SECRET) |
| `app/api/security-alerts/route.ts` | `/api/security-alerts` | Security alerting |
| `app/api/translate/route.ts` | `/api/translate` | Translation proxy |

---

## SECTION 2 — Composants UI par categorie

### components/admin/
- admin-nav.tsx
- admin-search-dialog.tsx
- plans/plan-card-editor.tsx
- plans/stripe-price-dialog.tsx
- support/support-tickets-table.tsx
- support/ticket-detail-drawer.tsx
- users/broadcast-notification-dialog.tsx
- users/force-plan-dialog.tsx
- users/send-email-dialog.tsx
- users/user-actions-menu.tsx
- users/user-detail-drawer.tsx
- users/users-table.tsx

### components/assistant/
- bot-selector.tsx

### components/auth/
- auth-layout.tsx
- unlock-overlay.tsx

### components/career-score/
- career-score-card.tsx

### components/coach/
- chat-message.tsx
- coach-timer.tsx
- conversation-list-item.tsx
- export-dialog.tsx
- history-sidebar.tsx
- queue-waiting-indicator.tsx
- quick-questions-drawer.tsx
- welcome-screen.tsx

### components/cv/
- actionable-suggestions.tsx
- analysis-type-card.tsx
- cv-comparison.tsx
- cv-history-drawer.tsx
- cv-info-panel.tsx
- cv-upload-async-wizard.tsx
- cv-upload-async.tsx
- processing-steps.tsx
- results-accordion.tsx
- score-breakdown-v2.tsx
- score-ring.tsx
- upload-zone-compact.tsx
- wizard/step1-upload.tsx
- wizard/step2-analysis-type.tsx
- wizard/step3-results.tsx
- wizard-container.tsx
- wizard-steps.tsx

### components/cv-builder/
- cv-builder-wizard.tsx
- steps/step-education.tsx
- steps/step-experiences.tsx
- steps/step-personal-info.tsx
- steps/step-skills.tsx
- steps/step-summary.tsx
- types.ts

### components/documents/
- document-edit-dialog.tsx
- document-preview-dialog.tsx

### components/freemium/
- conversion-popups.tsx
- feature-lock.tsx
- pricing-modal.tsx
- upgrade-banner.tsx
- usage-counter.tsx
- usage-modal.tsx

### components/jobs/
- advanced-filters-modal.tsx
- apply-modal.tsx
- blurred-job-card.tsx
- gradient-job-card.tsx
- insider-finder-drawer.tsx
- job-details-modal.tsx
- jobs-placeholder.tsx
- recruiter-finder-drawer.tsx
- search-form-inline.tsx
- search-loading-modal.tsx

### components/landing/
- pricing-section.tsx

### components/layout/
- footer.tsx
- navigation-loader.tsx
- presence-tracker.tsx
- sidebar.tsx
- site-banner.tsx

### components/notifications/
- notification-bell.tsx
- notification-center.tsx

### components/profile/
- avatar-upload.tsx
- notifications-section.tsx
- profile-form.tsx
- settings-section.tsx
- subscription-card.tsx
- user-profile-widget.tsx

### components/recruiter/
- faq-section.tsx
- hero-section.tsx
- process-steps.tsx
- recruiter-contact-modal.tsx
- recruiter-email-finder.tsx
- testimonials-section.tsx

### components/referral/
- referral-friends-list.tsx
- referral-progress-bar.tsx
- referral-tier-card.tsx

### components/salons/
- featured-events-carousel.tsx

### components/seo/
- breadcrumbs.tsx
- internal-links.tsx
- structured-data.tsx

### components/support/
- support-bubble.tsx
- support-chatbot.tsx
- support-ticket-form.tsx
- support-ticket-list.tsx
- support-widget.tsx

### components/theme/
- theme-toggle.tsx

### components/ui/ (34 primitives shadcn/Radix)
- accordion.tsx
- adaptive-logo.tsx
- alert-dialog.tsx
- alert.tsx
- autocomplete-input.tsx
- avatar.tsx
- badge.tsx
- button.tsx
- card.tsx
- checkbox.tsx
- command.tsx
- dialog.tsx
- dropdown-menu.tsx
- expandable-textarea.tsx
- input.tsx
- label.tsx
- optimized-image.tsx
- popover.tsx
- progress.tsx
- radio-group.tsx
- select.tsx
- separator.tsx
- sheet.tsx
- skeleton-loader.tsx
- skeleton.tsx
- skip-link.tsx
- sonner.tsx
- switch.tsx
- tabs.tsx
- textarea.tsx
- tooltip.tsx
- visually-hidden.tsx

### Fichiers racine components/
- error-boundary.tsx
- landing-header.tsx
- language-switcher.tsx
- providers.tsx

---

## SECTION 3 — Endpoints Backend

Prefixes definis dans `routes/__init__.py`. Colonnes Auth: `H` = Header Authorization optionnel, `D` = Depends(get_current_user), `A` = AdminUserDep, `C` = CRON_SECRET, `-` = aucune auth.

### auth.py (prefix: aucun)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/auth/test-debug` | - | non | auth.py:24 |
| GET | `/api/auth/me` | H | 60/min | auth.py:84 |
| POST | `/api/auth/welcome` | H | non | auth.py:336 |

### coach.py (prefix: `/api/coach`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/coach/chat` | H | 30/min | coach.py:125 |
| POST | `/api/coach/training-recommendations` | H | non | coach.py:245 |
| POST | `/api/coach/career-plan` | H | non | coach.py:274 |
| POST | `/api/coach/new-session` | D | non | coach.py:304 |
| DELETE | `/api/coach/session/{session_id}` | D | non | coach.py:311 |
| POST | `/api/coach/sync-time` | D | non | coach.py:318 |

### assistant.py (prefix: `/api/assistant`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/assistant/job-scout` | H | non | assistant.py:148 |
| POST | `/api/assistant/cv-analyzer` | H | non | assistant.py:217 |
| POST | `/api/assistant/cv-adapter` | H | non | assistant.py:286 |
| POST | `/api/assistant/interview-sim` | H | non | assistant.py:355 |
| POST | `/api/assistant/attach-cv` | H | non | assistant.py:458 |
| POST | `/api/assistant/new-session` | H | non | assistant.py:591 |
| DELETE | `/api/assistant/session/{session_id}` | H | non | assistant.py:598 |

### jobs.py (prefix: `/api/jobs`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/jobs/search` | H | 50/min | jobs.py:175 |
| GET | `/api/jobs/search` | H | 10/min | jobs.py:256 |
| POST | `/api/jobs/analyze-query` | - | non | jobs.py:313 |
| GET | `/api/jobs/market-insights` | - | non | jobs.py:331 |
| POST | `/api/jobs/description` | - | 15/min | jobs.py:363 |
| POST | `/api/jobs/track-view` | H | non | jobs.py:431 |
| POST | `/api/jobs/find-recruiter` | H | non | jobs.py:463 |

### cv_analysis.py (prefix: `/api/cv-analysis`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/cv-analysis/async` | H | non | cv_analysis.py:125 |
| GET | `/api/cv-analysis/status/{cv_id}` | H | non | cv_analysis.py:192 |
| GET | `/api/cv-analysis/list` | H | non | cv_analysis.py:234 |
| POST | `/api/cv-analysis/callback` | - | non | cv_analysis.py:288 |

### cv_adapter.py (prefix: `/api/cv-adapter`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/cv-adapter/adapt` | H | non | cv_adapter.py:173 |
| POST | `/api/cv-adapter/adapt/pdf` | H | non | cv_adapter.py:268 |
| POST | `/api/cv-adapter/adapt/upload` | H | non | cv_adapter.py:359 |
| POST | `/api/cv-adapter/quick-adapt` | H | non | cv_adapter.py:501 |
| POST | `/api/cv-adapter/generate-pdf` | H | non | cv_adapter.py:536 |
| GET | `/api/cv-adapter/templates` | - | non | cv_adapter.py:569 |
| POST | `/api/cv-adapter/generate-cover-letter` | H | non | cv_adapter.py:586 |
| POST | `/api/cv-adapter/generate-cover-letter/json` | H | non | cv_adapter.py:651 |
| POST | `/api/cv-adapter/generate-cover-letter/pdf-from-data` | H | non | cv_adapter.py:712 |
| POST | `/api/cv-adapter/preview` | H | non | cv_adapter.py:742 |

### stripe.py (prefix: `/api/stripe`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/stripe/create-checkout-session` | H | non | stripe.py:20 |
| POST | `/api/stripe/webhook` | - (signature) | non | stripe.py:86 |
| POST | `/api/stripe/cancel-subscription` | H | non | stripe.py:117 |
| POST | `/api/stripe/reactivate-subscription` | H | non | stripe.py:182 |
| POST | `/api/stripe/create-portal-session` | H | non | stripe.py:245 |

### subscription.py (prefix: `/api/subscription`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/subscription/sync-cache` | D | non | subscription.py:28 |
| GET | `/api/subscription/current` | D | non | subscription.py:94 |
| POST | `/api/subscription/coach-session` | D | non | subscription.py:165 |

### branding.py (prefix: `/api/branding`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/branding/chat` | H | 30/min | branding.py:42 |
| POST | `/api/branding/new-session` | H | non | branding.py:91 |
| DELETE | `/api/branding/session/{session_id}` | H | non | branding.py:98 |

### insider_finder.py (prefix: `/api/insider-finder`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/insider-finder/find` | H | non | insider_finder.py:42 |

### recruiter_finder.py (prefix: `/api/recruiter-finder`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/recruiter-finder/find` | H | non | recruiter_finder.py:137 |

### recruiter.py (prefix: `/api/recruiter`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/recruiter/request` | H | non | recruiter.py:99 |
| POST | `/api/recruiter/create-payment` | H | non | recruiter.py:153 |
| GET | `/api/recruiter/status/{request_id}` | H | non | recruiter.py:232 |
| POST | `/api/recruiter/webhook` | - | non | recruiter.py:274 |

### events.py (prefix: `/api/job-fairs`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/job-fairs/search` | - | non | events.py:14 |
| POST | `/api/job-fairs/search` | - | non | events.py:47 |
| GET | `/api/job-fairs/regions` | - | non | events.py:80 |
| GET | `/api/job-fairs/sectors` | - | non | events.py:103 |
| GET | `/api/job-fairs/event-types` | - | non | events.py:124 |

### documents.py (prefix: `/api/documents`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/documents` | H | non | documents.py:61 |
| POST | `/api/documents` | H | non | documents.py:78 |
| DELETE | `/api/documents/{document_id}` | H | non | documents.py:113 |
| PATCH | `/api/documents/{document_id}` | H | non | documents.py:128 |
| POST | `/api/documents/mark-applied` | H | non | documents.py:157 |

### referrals.py (prefix: `/api/referrals`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/referrals/my-code` | H | non | referrals.py:30 |
| POST | `/api/referrals/track-click` | - | non | referrals.py:67 |
| POST | `/api/referrals/register` | H | non | referrals.py:98 |
| GET | `/api/referrals/boost-status` | H | non | referrals.py:146 |
| POST | `/api/referrals/apply-tier-reward` | H | non | referrals.py:254 |

### saved_jobs.py (prefix: aucun)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/saved-jobs` | H | non | saved_jobs.py:51 |
| POST | `/api/saved-jobs` | H | non | saved_jobs.py:79 |
| POST | `/api/saved-jobs/apply-click/{external_job_id}` | H | non | saved_jobs.py:138 |
| DELETE | `/api/saved-jobs/{external_job_id}` | H | non | saved_jobs.py:167 |

### applications.py (prefix: aucun)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/applications` | H | non | applications.py:55 |
| POST | `/api/applications` | H | non | applications.py:75 |
| PATCH | `/api/applications/{application_id}` | H | non | applications.py:139 |
| DELETE | `/api/applications/{application_id}` | H | non | applications.py:190 |

### notifications.py (prefix: aucun)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/notifications/send-job-alerts` | C | non | notifications.py:88 |
| POST | `/api/notifications/send-weekly-summary` | C | non | notifications.py:146 |
| GET | `/api/notifications/preferences` | H | non | notifications.py:217 |
| PATCH | `/api/notifications/preferences` | H | non | notifications.py:255 |

### career_score.py (prefix: `/api/career-score`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/career-score` | H | non | career_score.py:265 |
| POST | `/api/career-score/calculate` | H | non | career_score.py:297 |
| POST | `/api/career-score/xp-event` | H | non | career_score.py:348 |

### coupons.py (prefix: `/api/coupons`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/coupons/generate-for-trigger` | - | non | coupons.py:76 |

### stats.py (prefix: `/api/stats`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/stats/plan-distribution` | - | non | stats.py:35 |

### cron.py (prefix: `/api/cron`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/cron/retention-notifications` | C | non | cron.py:33 |
| POST | `/api/cron/purge-events` | C | non | cron.py:98 |

### support.py (prefix: `/api/support`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/support/tickets` | H | non | support.py:54 |
| GET | `/api/support/tickets/me` | H | non | support.py:131 |
| POST | `/api/support/chatbot` | - | 10/min | support.py:158 |
| GET | `/api/support/admin/support/tickets` | A | non | support.py:218 |
| PATCH | `/api/support/admin/support/tickets/{ticket_id}` | A | non | support.py:293 |

### queue.py (prefix: `/api/queue`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/queue/status/{job_id}` | H | non | queue.py:17 |
| GET | `/api/queue/all-stats` | - | non | queue.py:57 |

### presence.py (prefix: `/api/presence`, `/api/track`, `/api/banner`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/presence/heartbeat` | D | non | presence.py:61 |
| GET | `/api/presence/admin/live` | A | non | presence.py:172 |
| POST | `/api/track/event` | H | non | presence.py:207 |
| GET | `/api/banner` | - | non | presence.py:252 |
| POST | `/api/admin/banner` | A | non | presence.py:268 |
| GET | `/api/admin/maintenance` | A | non | presence.py:293 |
| POST | `/api/admin/maintenance/enable` | A | non | presence.py:307 |
| POST | `/api/admin/maintenance/disable` | A | non | presence.py:320 |

### stress.py (prefix: `/api/admin/stress`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/admin/stress/scenarios` | A | non | stress.py:85 |
| POST | `/api/admin/stress/run` | A | non | stress.py:91 |
| DELETE | `/api/admin/stress/run/{run_id}` | A | non | stress.py:161 |
| GET | `/api/admin/stress/stream/{run_id}` | A | non | stress.py:226 |
| GET | `/api/admin/stress/runs` | A | non | stress.py:258 |
| GET | `/api/admin/stress/runs/{run_id}` | A | non | stress.py:277 |

### suggestions.py (prefix: `/api/assistant`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/assistant/suggestions` | - | non | suggestions.py:14 |

### public_plans.py (prefix: `/api/public`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/public/plans` | - | non | public_plans.py:22 |

### health.py (prefix: `/api/health`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/health/webhooks` | - | non | health.py:26 |
| GET | `/api/health/ping` | - | non | health.py:156 |
| GET | `/api/health/pool` | - | non | health.py:171 |

### pages.py (prefix: aucun)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/` | - | non | pages.py:17 |
| GET | `/coach` | - | non | pages.py:30 |
| GET | `/jobs` | - | non | pages.py:42 |
| GET | `/cv` | - | non | pages.py:54 |
| GET | `/events` | - | non | pages.py:66 |
| GET | `/cv-adapter` | - | non | pages.py:78 |
| GET | `/health` | - | non | pages.py:90 |

### static_data.py (prefix: aucun)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| GET | `/api/countries` | - | non | static_data.py:39 |
| GET | `/api/cities/search` | - | non | static_data.py:53 |
| GET | `/api/cities/{country_name}` | - | non | static_data.py:108 |
| GET | `/api/contract-types` | - | non | static_data.py:158 |

### admin_cleanup.py (prefix: `/api/admin`)

| Methode | Chemin complet | Auth | Rate limit | Fichier:ligne |
|---------|---------------|:----:|:----------:|---------------|
| POST | `/api/admin/sync-subscriptions/{user_id}` | A | non | admin_cleanup.py:24 |

### admin.py (prefix: `/api/admin`) — 72 endpoints

Tous les endpoints admin necessitent `AdminUserDep`. Aucun rate limit.

| Methode | Chemin complet | Fichier:ligne |
|---------|---------------|---------------|
| GET | `/api/admin/users` | admin.py:114 |
| GET | `/api/admin/users/{user_id}` | admin.py:205 |
| PATCH | `/api/admin/users/{user_id}/suspend` | admin.py:287 |
| PATCH | `/api/admin/users/{user_id}/reactivate` | admin.py:320 |
| POST | `/api/admin/users/{user_id}/reset-password` | admin.py:350 |
| DELETE | `/api/admin/users/{user_id}` | admin.py:398 |
| POST | `/api/admin/users/{user_id}/force-plan` | admin.py:437 |
| GET | `/api/admin/plans` | admin.py:500 |
| PATCH | `/api/admin/plans/{plan_id}/limits` | admin.py:512 |
| PATCH | `/api/admin/plans/{plan_id}/features` | admin.py:570 |
| PATCH | `/api/admin/plans/{plan_id}/wording` | admin.py:644 |
| PATCH | `/api/admin/plans/{plan_id}/price` | admin.py:698 |
| POST | `/api/admin/plans/{plan_id}/stripe-price` | admin.py:746 |
| GET | `/api/admin/stats` | admin.py:840 |
| GET | `/api/admin/analytics/churn` | admin.py:883 |
| GET | `/api/admin/analytics/usage` | admin.py:909 |
| GET | `/api/admin/analytics/revenue` | admin.py:947 |
| GET | `/api/admin/analytics/subscriptions` | admin.py:1003 |
| GET | `/api/admin/analytics/usage-heatmap` | admin.py:1026 |
| GET | `/api/admin/analytics/growth` | admin.py:1461 |
| GET | `/api/admin/analytics/mrr-trend` | admin.py:1499 |
| GET | `/api/admin/analytics/funnel` | admin.py:1734 |
| GET | `/api/admin/analytics/cohorts` | admin.py:1781 |
| GET | `/api/admin/analytics/mrr-forecast` | admin.py:1829 |
| GET | `/api/admin/events` | admin.py:1063 |
| GET | `/api/admin/logs/security` | admin.py:1128 |
| GET | `/api/admin/logs/users/{user_id}` | admin.py:1196 |
| GET | `/api/admin/logs/webhooks` | admin.py:1211 |
| POST | `/api/admin/logs/webhooks/{failure_id}/retry` | admin.py:1237 |
| POST | `/api/admin/logs/webhooks/{failure_id}/resolve` | admin.py:1436 |
| GET | `/api/admin/referrals/leaderboard` | admin.py:1287 |
| GET | `/api/admin/referrals/stats` | admin.py:1309 |
| GET | `/api/admin/referrals/config` | admin.py:1321 |
| PATCH | `/api/admin/referrals/config` | admin.py:1338 |
| POST | `/api/admin/referrals/grant-reward/{signup_id}` | admin.py:1350 |
| GET | `/api/admin/recruiter-requests` | admin.py:1376 |
| PATCH | `/api/admin/recruiter-requests/{request_id}/status` | admin.py:1406 |
| POST | `/api/admin/users/{user_id}/reset-usage` | admin.py:1543 |
| GET | `/api/admin/segments/at-risk` | admin.py:1566 |
| GET | `/api/admin/segments/about-to-churn` | admin.py:1625 |
| GET | `/api/admin/segments/never-converted` | admin.py:1669 |
| POST | `/api/admin/users/{user_id}/send-email` | admin.py:1902 |
| POST | `/api/admin/users/bulk-email` | admin.py:1936 |
| GET | `/api/admin/health` | admin.py:2000 |
| GET | `/api/admin/users/{user_id}/payments` | admin.py:2048 |
| POST | `/api/admin/users/{user_id}/impersonate` | admin.py:2086 |
| GET | `/api/admin/users/{user_id}/feature-overrides` | admin.py:2134 |
| POST | `/api/admin/users/{user_id}/feature-overrides` | admin.py:2154 |
| DELETE | `/api/admin/users/{user_id}/feature-overrides/{feature_name}` | admin.py:2180 |
| GET | `/api/admin/prompts` | admin.py:2235 |
| GET | `/api/admin/prompts/{name}` | admin.py:2262 |
| PUT | `/api/admin/prompts/{name}` | admin.py:2272 |
| GET | `/api/admin/coupons` | admin.py:2311 |
| POST | `/api/admin/coupons` | admin.py:2338 |
| DELETE | `/api/admin/coupons/{coupon_id}` | admin.py:2372 |
| POST | `/api/admin/users/{user_id}/apply-coupon` | admin.py:2387 |
| POST | `/api/admin/users/{user_id}/ban` | admin.py:2424 |
| POST | `/api/admin/users/{user_id}/unban` | admin.py:2453 |
| POST | `/api/admin/users/{user_id}/force-signout` | admin.py:2476 |
| PUT | `/api/admin/users/{user_id}/email` | admin.py:2494 |
| GET | `/api/admin/users/{user_id}/notes` | admin.py:2517 |
| POST | `/api/admin/users/{user_id}/add-note` | admin.py:2530 |
| POST | `/api/admin/users/{user_id}/grant-days` | admin.py:2552 |
| POST | `/api/admin/users/{user_id}/set-custom-limits` | admin.py:2609 |
| POST | `/api/admin/users/{user_id}/retry-job` | admin.py:2646 |
| GET | `/api/admin/users/{user_id}/events` | admin.py:2678 |
| GET | `/api/admin/search` | admin.py:2698 |
| GET | `/api/admin/export/users` | admin.py:2719 |
| POST | `/api/admin/broadcast-notification` | admin.py:2757 |
| POST | `/api/admin/ban-ip` | admin.py:2846 |
| DELETE | `/api/admin/ban-ip/{ip:path}` | admin.py:2867 |
| GET | `/api/admin/banned-ips` | admin.py:2886 |
| POST | `/api/admin/blacklist-email` | admin.py:2912 |
| GET | `/api/admin/blacklisted-emails` | admin.py:2934 |
| GET | `/api/admin/suggestions` | admin.py:2964 |
| POST | `/api/admin/suggestions` | admin.py:2982 |
| PATCH | `/api/admin/suggestions/{suggestion_id}` | admin.py:3012 |
| DELETE | `/api/admin/suggestions/{suggestion_id}` | admin.py:3038 |

---

## SECTION 4 — Tables Supabase

36 tables creees dans 74+ migrations SQL.

| Table | Colonnes principales | RLS | Index |
|-------|---------------------|:---:|-------|
| `coach_conversations` | id, user_id, session_id, role, content, title, is_favorite, assistant_type | oui | user_id, session_id, title (GIN), is_favorite, last_message, assistant_type |
| `subscription_plans` | id, name, display_name, price_monthly, price_yearly, is_active, limits (JSONB), features (JSONB), wording (JSONB) | oui | is_active, name |
| `user_subscriptions` | id, user_id, plan_id, plan_name, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, canceled_at | oui | user_id, status, stripe_customer, active_period, unique(active per user), canceled_at |
| `usage_quotas` | id, user_id, quota_date, job_searches, cv_analyses, assistant_messages, coach_minutes | oui | user_id+date, date |
| `cv_analyses` | id, user_id, anonymous_id, client_ip, filename, status, score, analysis_result (JSONB), cv_text | oui | user_id, status, user+status, created_at, anonymous_id, client_ip |
| `profiles` | id, email, full_name, avatar_url, is_admin, status, subscription_tier (DEPRECATED), stripe_customer_id (DEPRECATED), preferred_language, notification_preferences | oui | email, tier, stripe_customer, is_admin, status, preferred_language, newsletter |
| `security_audit_log` | id, user_id, action, details, ip_address, created_at | oui | user_id+created_at, action+created_at |
| `security_events` | id, user_id, event_type, severity, ip_address, details, created_at | oui | user_id, event_type, severity, created_at, ip_address, user+type, severity+created |
| `saved_jobs` | id, user_id, external_job_id, title, company, location, url, source, saved_at, applied_at, cv_document_id | oui | user_id, saved_at, external_id, user+ext+source |
| `recruiter_requests` | id, user_id, company_name, job_title, message, payment_status, status, stripe_session_id | oui | user_id, payment_status, status, created_at |
| `webhook_failures` | id, stripe_event_id, event_type, error_message, raw_payload, resolved, created_at | non | event_id, event_type, created_at, resolved |
| `stripe_webhook_events` | id, stripe_event_id, event_type, processed_at | non | event_id, event_type, created_at |
| `stripe_prices` | id, plan_id, stripe_price_id, billing_period, amount_cents, currency, is_active | non | plan+period, stripe_id, is_active |
| `subscription_history` | id, user_id, subscription_id, action_type, old_plan, new_plan, stripe_event_id, metadata | oui | user, subscription, created, action_type, stripe_event |
| `active_coach_sessions` | id, user_id, session_id, started_at, total_seconds, is_active | oui | unique(user), started_at |
| `translation_memory` | id, source_hash, source_text, target_lang, translated_text, usage_count | oui | hash+lang, usage |
| `user_documents` | id, user_id, type, title, content (JSONB), saved_job_id, created_at | oui | user_id, created_at, saved_job_id |
| `referrals` | id, referrer_id, referral_code, total_signups, converted_signups | oui | referrer_id, code |
| `referral_signups` | id, referral_id, referred_user_id, signed_up_at, converted_to_paid_at | oui | referral_id, referred_user |
| `referral_rewards` | id, referrer_id, reward_type, reward_value, description, granted_at | oui | referrer_id |
| `referral_config` | id, reward_per_signup, reward_type, min_signups_for_reward, tiers (JSONB) | oui | (single row) |
| `cv_profiles` | id, user_id, data (JSONB), updated_at | oui | user_id, updated_at |
| `user_feature_overrides` | id, user_id, feature_name, feature_value, expires_at | oui | user_id |
| `ai_prompts` | id, name, content, description, updated_by, updated_at | oui | name |
| `user_applications` | id, user_id, external_job_id, company_name, job_title, status, applied_at, notes | oui | user_id+applied_at, external_job, user+status |
| `user_notification_preferences` | id, user_id, email_job_alerts, email_weekly_summary, email_tips, push_enabled | oui | (user_id PK-like) |
| `user_career_score` | id, user_id, score, level, total_xp, ai_analysis, updated_at | oui | (user_id unique) |
| `user_xp_events` | id, user_id, event_type, xp_amount, description, created_at | oui | user_id+created_at |
| `user_notifications` | id, user_id, type, title, message, read, data (JSONB), created_at | oui | user_id+unread (Realtime enabled) |
| `support_tickets` | id, user_id, subject, message, category, status, admin_response, priority | oui | user_id, status, created_at |
| `user_events` | id, user_id, category, label, value, error, metadata (JSONB), created_at | oui | user+created, category+created, created, errors, hour, label_fts |
| `admin_notes` | id, user_id, admin_id, note, created_at | oui | user_id |
| `email_blacklist` | id, email, domain, reason, created_at | oui | email, domain |
| `stress_test_runs` | id, scenario, status, config (JSONB), results (JSONB), created_at | oui | status, created_at |
| `assistant_suggestions` | id, assistant_id, label, prompt, is_active, sort_order | non | assistant_id+is_active |

Note: table `plan_feature_flags` et `features_excluded` creees par migrations 20260317/20260318 ajoutent des colonnes/config aux plans, pas de tables separees principales.

---

## SECTION 5 — Variables d'environnement

Source: `backend/src/config/settings.py` (Settings Pydantic)

| Variable | Service/Usage | Obligatoire | Valeur par defaut |
|----------|--------------|:-----------:|-------------------|
| `APP_NAME` | Application | non | "HuntZen" |
| `APP_VERSION` | Application | non | "3.0.0" |
| `DEBUG` | Application | non | false |
| `ENVIRONMENT` | Application | non | "development" |
| `SENTRY_DSN` | Monitoring Sentry | non | "" |
| `HOST` | Server | non | "0.0.0.0" |
| `PORT` | Server | non | 8000 |
| `RELOAD` | Server | non | true |
| `WORKERS` | Server (Gunicorn) | non | 1 |
| `GROQ_API_KEY` | LLM Groq (SecretStr) | non | "" |
| `SERPAPI_KEY` | Job search SerpAPI (SecretStr) | non | "" |
| `ADZUNA_APP_ID` | Job search Adzuna | non | "" |
| `ADZUNA_API_KEY` | Job search Adzuna (SecretStr) | non | "" |
| `RAPIDAPI_KEY` | RapidAPI/JSearch (SecretStr) | non | "" |
| `CLIENT_ID` | France Travail OAuth2 | non | "" |
| `CLIENT_SECRET` | France Travail OAuth2 | non | "" |
| `HUNTER_API_KEY` | Hunter.io recruiter finder (SecretStr) | non | "" |
| `APOLLO_API_KEY` | Apollo.io recruiter finder (SecretStr) | non | "" |
| `SUPABASE_URL` | Supabase project URL | non | "" |
| `SUPABASE_KEY` | Supabase anon key (SecretStr) | non | "" |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (SecretStr) | non | "" |
| `SUPABASE_POOLER_URL` | Supabase connection pooler | non | "" |
| `DB_POOL_SIZE` | Connection pool size | non | 20 |
| `DB_POOL_TIMEOUT` | Pool timeout (sec) | non | 30 |
| `STRIPE_SECRET_KEY` | Stripe payments (SecretStr) | non | "" |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable | non | "" |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook (SecretStr) | non | "" |
| `RECRUITER_CONTACT_PRICE_ID` | Stripe price ID (50 EUR) | non | "" |
| `FRONTEND_URL` | Frontend URL(s) comma-separated | non | "http://localhost:3000" |
| `RESEND_API_KEY` | Resend email (SecretStr) | non | "" |
| `FROM_EMAIL` | Email sender | non | "HuntzenJobs <no-reply@huntzenjobs.com>" |
| `ADMIN_EMAIL` | Admin notification email | non | "admin@huntzenjobs.com" |
| `DEFAULT_LANGUAGE` | Agent default lang | non | "en" |
| `MAX_SEARCH_RESULTS` | Max jobs per search | non | 100 |
| `CACHE_TTL_SECONDS` | Cache TTL | non | 3600 |
| `LLM_MODEL_FAST` | Fast LLM model | non | "meta-llama/llama-4-scout-17b-16e-instruct" |
| `LLM_MODEL_POWERFUL` | Powerful LLM model | non | "llama-3.3-70b-versatile" |
| `LLM_TEMPERATURE` | LLM temperature | non | 0.3 |
| `LLM_MAX_TOKENS` | LLM max tokens | non | 2048 |
| `CORS_ORIGINS` | CORS allowed origins | non | "*" |
| `RATE_LIMIT_PER_MINUTE` | Global rate limit | non | 60 |
| `REDIS_URL` | Redis cache URL | non | "" |
| `LANGCHAIN_TRACING_V2` | LangSmith tracing | non | false |
| `LANGCHAIN_ENDPOINT` | LangSmith endpoint | non | "https://api.smith.langchain.com" |
| `LANGCHAIN_API_KEY` | LangSmith key (SecretStr) | non | "" |
| `LANGCHAIN_PROJECT` | LangSmith project | non | "HuntZen" |
| `CACHE_ENABLED` | Enable distributed cache | non | true |
| `CACHE_DEFAULT_TTL` | Default cache TTL (sec) | non | 300 |

### Variables supplementaires (frontend .env / non dans settings.py)

| Variable | Service/Usage |
|----------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend Supabase |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_BACKEND_URL` | Backend API URL |
| `CRON_SECRET` | Cron endpoints auth |
| `ELEVENLABS_API_KEY` | Voice (non active) |
| `ELEVENLABS_AGENT_ID` | Voice (non active) |
| `MODAL_CALLBACK_SECRET` | Modal Labs callback |
| `FASTAPI_CALLBACK_URL` | Modal Labs callback |

---

## SECTION 6 — Integrations tierces

| Service | Usage dans le code | Variable d'env principale | Feature flag |
|---------|-------------------|--------------------------|:------------:|
| **Groq** | LLM inference (Llama 3.3 70B + Llama 4 Scout) | `GROQ_API_KEY` | non |
| **Supabase** | PostgreSQL + Auth + Realtime + Storage | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | non |
| **Stripe** | Paiements, abonnements, webhooks | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | non |
| **Adzuna** | Agregation offres d'emploi | `ADZUNA_APP_ID` + `ADZUNA_API_KEY` | implicite (cle vide = desactive) |
| **SerpAPI** | Agregation offres d'emploi Google Jobs | `SERPAPI_KEY` | implicite (cle vide = desactive) |
| **France Travail** | Offres d'emploi FR (API Emploi Store) | `CLIENT_ID` + `CLIENT_SECRET` | implicite |
| **RemoteOK** | Offres d'emploi remote (scraping) | aucune | toujours actif |
| **Hunter.io** | Recherche emails recruteurs | `HUNTER_API_KEY` | implicite |
| **Apollo.io** | Enrichissement contacts recruteurs | `APOLLO_API_KEY` | implicite (non branche UI) |
| **Resend** | Emails transactionnels | `RESEND_API_KEY` | non |
| **Sentry** | Error tracking (frontend + backend) | `SENTRY_DSN` | implicite |
| **Modal Labs** | Processing CV PDF asynchrone | `MODAL_CALLBACK_SECRET` | non |
| **Redis (Upstash/Railway)** | Cache distribue + ARQ queue broker | `REDIS_URL` | `CACHE_ENABLED` |
| **LangSmith** | Tracing LLM (debug) | `LANGCHAIN_API_KEY` | `LANGCHAIN_TRACING_V2` |
| **ElevenLabs** | Voice bot (NON ACTIVE) | `ELEVENLABS_API_KEY` | `ENABLE_INTERVIEW_SIMULATOR=false` |
| **RapidAPI / JSearch** | Salary estimates | `RAPIDAPI_KEY` | implicite |

---

## SECTION 7 — Fichiers de traduction

```
- Cles FR (total feuilles) : 722
- Cles EN (total feuilles) : 678
- Cles de premier niveau en FR : advancedFilters, applyModal, auth, coachFeedback, cta, ctaFinal,
  cv, dashboard, error, features, featuresGrid, footer, gradientJobCard, hero, howItWorks,
  jobDetails, nav, offline, painPoints, payment, pricing, pricingModal, pricingPlans, profile,
  progression, retention, searchForm, sidebar, stats, team, tools, trustBar, upgradeBanner
  (33 cles)
- Cles de premier niveau en EN : identiques aux FR (33 cles)
- Cles presentes en FR manquantes en EN : aucune (cles de premier niveau identiques)
- Cles presentes en EN manquantes en FR : aucune
- Ecart feuilles FR vs EN : 44 cles feuilles en plus en FR (722 vs 678)
- Langues supplementaires : es.json (668 feuilles), pt.json (668 feuilles)
```

Note: L'ecart de 44 cles feuilles entre FR (722) et EN (678) indique des sous-cles presentes en FR mais absentes en EN. Les fichiers ES et PT ont chacun 668 cles feuilles, soit 54 de moins que FR.
