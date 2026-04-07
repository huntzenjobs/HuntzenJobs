# Audit -- Base de donnees
Date : 2026-03-18
Score : 62/100

## Resume executif

Le schema de la base de donnees HuntZen est fonctionnel et couvre les besoins metier (subscriptions, quotas, CV, coach, jobs, referral, admin). Cependant, l'audit revele **3 problemes bloquants**, **6 problemes importants**, et **8 ameliorations** a apporter. Les points les plus critiques sont :

1. **Tables `profiles` deprecated toujours activement utilisees** par des triggers et fonctions (confusion avec `user_subscriptions`)
2. **RLS trop permissive** sur `ai_prompts`, `assistant_suggestions`, et `translation_memory` (tout le monde peut ecrire)
3. **Migration `20260211000004_cron_cleanup.sql` reference des tables supprimees** (`stripe_webhook_events`, `webhook_failures`) -- corrigee dans `20260318000003` mais l'ancienne fonction existe encore si elle a ete appliquee avant le cleanup
4. **`webhook_failures` et `stripe_webhook_events` supprimees** par `20260211120000` mais des policies admin les referencent encore dans `20260228000002_fix_admin_rls.sql`

---

## Schema complet (toutes les tables)

### Tables applicatives principales

| Table | Colonnes cles | RLS | Index | Problemes |
|---|---|---|---|---|
| `profiles` | id (PK=auth.users), email, full_name, subscription_tier, cv_analyses_used/limit, coach_messages_used/limit, job_searches_used/limit, quota_reset_date, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, is_admin, status, is_banned, preferred_language, email_notifications, newsletter_subscribed | OUI | email, tier, stripe_customer, is_admin, status, preferred_language, newsletter | **subscription_* colonnes DEPRECATED mais trigger `handle_new_user()` les ecrit toujours** |
| `user_subscriptions` | id, user_id (FK auth.users CASCADE), plan_id (FK subscription_plans RESTRICT), status (CHECK), current_period_start/end, cancel_at_period_end, canceled_at, stripe_subscription_id (UNIQUE), stripe_customer_id, stripe_price_id, trial_start/end, metadata, custom_limits | OUI | user_id, status, stripe_customer, active_period, one_active_per_user (UNIQUE partiel), canceled_at | Bien structure. Trigger auto-cancel en place. |
| `subscription_plans` | id, name (UNIQUE), display_name, description, price_monthly, price_yearly, limits (JSONB), features (JSONB), features_excluded (JSONB), feature_flags (JSONB), is_active, sort_order | OUI | active, name | OK |
| `usage_quotas` | id, user_id (FK CASCADE), quota_date, cv_analyses_used, coach_seconds_used, job_searches_used, job_views_used, assistant_messages_used | OUI | user_id+quota_date (UNIQUE), quota_date | OK. Cleanup 90j en place. |
| `cv_analyses` | id, user_id (FK CASCADE, **NULLABLE**), pdf_url, filename, status (CHECK), job_description, language, result (JSONB), error_message, cv_text, anonymous_id, client_ip, created_at, updated_at, completed_at | OUI | user_id, status, user_id+status, created_at, anonymous_id, client_ip | user_id nullable (design intentionnel pour anonyme) |
| `coach_conversations` | id, user_id (FK CASCADE), session_id, messages (JSONB), context (JSONB), title, is_favorite, message_count (GENERATED), last_message_at, assistant_type (CHECK), created_at, updated_at | OUI | user_id, session_id, title (GIN), is_favorite, last_message_at, assistant_type | OK |
| `saved_jobs` | id, user_id (FK CASCADE), job_title, company, location, salary, job_url, description, external_job_id, saved_at, updated_at, job_source, metadata (JSONB), applied_at, cv_document_id (FK SET NULL) | OUI | user_id, saved_at, external_job_id, cv_document_id, user_id+external_job_id+job_source | UNIQUE(user_id, external_job_id, job_source) OK |
| `user_documents` | id, user_id (FK CASCADE), job_title, company, match_score, cv_data (JSONB), cv_pdf_url, lm_pdf_url, language, saved_job_id (FK SET NULL), job_url, created_at | OUI | user_id, created_at, saved_job_id | **Pas de updated_at** |
| `cv_profiles` | id, user_id (FK CASCADE), name, cv_data (JSONB), created_at, updated_at | OUI | user_id, updated_at | OK. **Table creee 2 fois** (228000001 et 228000001 bis) -- IF NOT EXISTS protege |
| `user_applications` | id, user_id (FK CASCADE), external_job_id, job_title, company, location, salary, job_url, job_source, saved_job_id (FK SET NULL), document_id (FK SET NULL), status (CHECK), confirmed_by_user, applied_at, updated_at, notes | OUI | user_id+applied_at, external_job_id, user_id+status | UNIQUE(user_id, external_job_id) OK |
| `user_notification_preferences` | user_id (PK, FK CASCADE), job_alerts, application_confirmation, weekly_summary, reengagement, followup_reminder, alert_frequency (CHECK) | OUI | -- (PK seul) | OK |

### Tables subscription/paiement

| Table | Colonnes cles | RLS | Index | Problemes |
|---|---|---|---|---|
| `stripe_prices` | id, plan_id (FK CASCADE), billing_period (CHECK), stripe_price_id (UNIQUE), stripe_product_id, is_active | OUI (via admin) | plan_id+billing_period, stripe_id, active | OK |
| `subscription_history` | id, user_id (FK CASCADE), subscription_id (pas FK), plan_id (FK RESTRICT), action_type (CHECK), old_values (JSONB), new_values (JSONB), triggered_by, stripe_event_id, notes, created_at | OUI | user_id+created_at, subscription_id+created_at, created_at, action_type+created_at, stripe_event | OK |
| `active_coach_sessions` | id, user_id (FK CASCADE), started_at, user_agent, ip_address | OUI | UNIQUE user_id, started_at | OK |
| `recruiter_requests` | id, user_id (FK CASCADE), full_name, email, phone, sector, experience_level, message, preferred_date, payment_status (CHECK), payment_intent_id, stripe_checkout_session_id, amount_cents, status (CHECK), assigned_recruiter_id, scheduled_at, notes | OUI | user_id, payment_status, status, created_at | OK |

### Tables referral

| Table | Colonnes cles | RLS | Index | Problemes |
|---|---|---|---|---|
| `referrals` | id, referrer_id (FK CASCADE), referral_code (UNIQUE), total_clicks/signups/conversions, is_active | OUI | referrer_id, referral_code | OK |
| `referral_signups` | id, referral_id (FK CASCADE), referred_user_id (UNIQUE, FK CASCADE), signed_up_at, converted_to_paid_at, converted_plan | OUI | referral_id, referred_user_id | OK |
| `referral_rewards` | id, referral_signup_id (FK CASCADE), referrer_id (FK CASCADE), reward_type (CHECK), reward_value (JSONB), applied, applied_at, stripe_coupon_id | OUI | referrer_id | OK |
| `referral_config` | id (PK=1, CHECK id=1), signup_reward_type (CHECK), signup_reward_value, conversion_reward_type (CHECK), conversion_reward_value, is_active, tiers (JSONB) | OUI | -- (singleton) | OK |

### Tables securite/monitoring

| Table | Colonnes cles | RLS | Index | Problemes |
|---|---|---|---|---|
| `security_audit_log` | id, user_id (FK SET NULL), action, resource_type, resource_id, ip_address, user_agent, success, error_message | OUI | user_id+created_at, action+created_at | **RLS bloque TOUT acces user (USING false)** -- correct, service_role only |
| `security_events` | id, event_type, severity (CHECK), user_id (FK CASCADE), session_id, ip_address, user_agent, event_data (JSONB) | OUI | user_id, event_type, severity, created_at, ip_address, user_id+event_type, severity+created_at | OK. **Pas de cleanup automatique** (seulement `cleanup_old_security_events(90j)` pour severity='info') |
| `user_events` | id, created_at, user_id (FK CASCADE), event_name, event_label, category, feature, severity (CHECK), properties (JSONB), error_code, duration_ms, source (CHECK) | OUI | user_id+created_at, category+created_at, created_at, errors partiel, hour, label FTS | Realtime active. `purge_old_user_events()` 90j en place. |

### Tables admin/support

| Table | Colonnes cles | RLS | Index | Problemes |
|---|---|---|---|---|
| `support_tickets` | id, user_id (FK CASCADE), user_email, user_name, user_plan, page_url, category (CHECK), priority (CHECK), subject, description, attachment_url, status (CHECK), admin_reply, resolved_at | OUI | user_id, status, created_at | OK |
| `admin_notes` | id, created_at, user_id (FK CASCADE), admin_id (FK SET NULL), note | OUI | user_id+created_at | **Pas de policy SELECT/INSERT** -- service_role uniquement via bypass RLS. Correct mais opaque. |
| `email_blacklist` | id, created_at, domain, email, reason. CHECK(domain OR email NOT NULL) | OUI | email, domain | **RLS active mais AUCUNE policy** -- service_role only via bypass. OK. |
| `stress_test_runs` | id, started_by_user_id (FK SET NULL), name, status (CHECK), config (JSONB), metrics, errors_log, created_at, updated_at, completed_at | OUI | status, created_at | Service_role only. OK. |

### Tables configuration/i18n

| Table | Colonnes cles | RLS | Index | Problemes |
|---|---|---|---|---|
| `translation_memory` | id, content_hash, source_lang, target_lang, source_text, translated_text, provider (CHECK), usage_count | OUI | hash+lang, usage_count | **RLS trop permissive : INSERT/UPDATE USING(true)** -- n'importe qui peut ecrire |
| `ai_prompts` | id, name (UNIQUE), display_name, content, updated_at, updated_by (FK profiles) | OUI | name | **RLS trop permissive : FOR ALL USING(true)** -- n'importe qui peut modifier les prompts IA |
| `assistant_suggestions` | id, assistant_id, text, display_order, is_active | **NON** | assistant_id+is_active | **PAS de RLS du tout** -- toute personne authentifiee peut lire/ecrire |
| `user_feature_overrides` | id, user_id (FK profiles CASCADE), feature_name, enabled, note, created_at, updated_by (FK profiles) | OUI | user_id | Corrige dans 20260318 -- service_role + lecture propre user |
| `user_career_score` | user_id (PK, FK profiles CASCADE), total_score (0-100), activity_score (0-40), ai_score (0-40), xp_score (0-20), ai_justification, last_calculated_at, next_recalc_at | OUI | -- (PK seul) | OK |
| `user_xp_events` | id, user_id (FK profiles CASCADE), event_type (CHECK), xp_gained (CHECK >0), metadata (JSONB) | OUI | user_id+created_at | OK |
| `user_notifications` | id, user_id (FK profiles CASCADE), type (CHECK), title, body, data (JSONB), read, email_sent_at | OUI | user_id+read+created_at | **Realtime active (supabase_realtime)** -- OK |

### Tables supprimees (par 20260211120000)

| Table | Status |
|---|---|
| `stripe_webhook_events` | **SUPPRIMEE** -- mais referencee dans `20260211000004_cron_cleanup.sql` (avant fix 20260318000003) et `20260228000002_fix_admin_rls.sql` |
| `webhook_failures` | **SUPPRIMEE** -- meme probleme de references orphelines |

---

## BLOQUANTS

### B1. RLS ABSENTE sur `assistant_suggestions` -- securite
**Fichier** : `supabase/migrations/20260317000002_assistant_suggestions.sql`
**Probleme** : La table `assistant_suggestions` n'a PAS `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Tout utilisateur authentifie peut lire, modifier et supprimer les suggestions des assistants IA.
**Impact** : Un utilisateur malveillant peut modifier les suggestions affichees a TOUS les utilisateurs.
**Fix** : Activer RLS + creer une policy SELECT public + bloquer INSERT/UPDATE/DELETE sauf service_role.
**Deduction** : -20 pts

### B2. RLS trop permissive sur `ai_prompts` -- securite critique
**Fichier** : `supabase/migrations/20260305000002_ai_prompts.sql`
**Probleme** : Policy `FOR ALL USING(true) WITH CHECK(true)` sans restriction de role. N'importe quel utilisateur authentifie peut modifier les prompts IA du backend.
**Impact** : **Injection de prompts malveillants** -- un attaquant peut modifier le system prompt du coach IA, du CV analyzer, etc. pour extraire des donnees utilisateur ou injecter du contenu dangereux.
**Fix** : Remplacer par `TO service_role USING(true)` + policy SELECT publique.
**Deduction** : -20 pts (mais plafonne car deja B1)

### B3. Policies admin referencent `webhook_failures` supprimee
**Fichier** : `supabase/migrations/20260228000002_fix_admin_rls.sql:56-60`
**Probleme** : `CREATE POLICY "admins_read_webhook_failures" ON webhook_failures` et `"admins_update_webhook_failures" ON webhook_failures` -- mais la table a ete supprimee dans `20260211120000_cleanup_stripe_complexity.sql`.
**Impact** : La migration `20260228000002` echoue si appliquee apres `20260211120000` car la table n'existe pas. **Bloquant pour `supabase db reset`.**
**Fix** : Ajouter `IF EXISTS` ou supprimer ces lignes.
**Deduction** : -10 pts

---

## IMPORTANTS

### I1. `profiles.subscription_*` deprecated mais toujours ecrites par trigger
**Fichier** : `supabase/migrations/20260128001000_security_hardening.sql:170-227` (trigger `handle_new_user()`)
**Probleme** : Le trigger `handle_new_user()` redefini dans security_hardening ne reference plus les colonnes deprecated de `profiles` (corrige), mais la version originale dans `20260128000300_setup_auth.sql` les ecrivait. Les colonnes `subscription_tier`, `cv_analyses_used/limit`, `coach_messages_used/limit`, `job_searches_used/limit`, `quota_reset_date`, `stripe_*` existent toujours.
**Impact** : Confusion pour les developpeurs. Risque de lire des donnees stales si du code utilise `profiles.subscription_tier` au lieu de `user_subscriptions`.
**Fix** : Ajouter une migration qui DROP ces colonnes deprecated (apres verification qu'aucun code backend ne les utilise).

### I2. `translation_memory` -- INSERT/UPDATE ouvert a tous
**Fichier** : `supabase/migrations/20260220000001_translation_memory.sql:33-41`
**Probleme** : Policies INSERT et UPDATE avec `USING(true)` / `WITH CHECK(true)` sans restriction de role.
**Impact** : Un utilisateur authentifie peut polluer le cache de traductions avec du contenu invalide ou offensant.
**Fix** : Restreindre INSERT/UPDATE a `service_role`.

### I3. `user_documents` manque `updated_at`
**Fichier** : `supabase/migrations/20260223000001_create_user_documents.sql`
**Probleme** : La table a un `created_at` mais pas de `updated_at`. Toutes les autres tables utilisateur en ont un.
**Impact** : Impossible de trier par derniere modification ou detecter des changements.

### I4. `cv_profiles` creee 2 fois
**Fichiers** : `20260228000001_create_cv_profiles.sql` et `20260227000005_create_cv_profiles.sql`
**Probleme** : Deux migrations creent la meme table avec `IF NOT EXISTS`. La seconde est un no-op mais cree de la confusion.
**Impact** : Confusion dans l'historique des migrations.

### I5. `check_user_quota()` incoherence entre versions
**Fichiers** : `20260128001000_security_hardening.sql` vs `20260204000004_add_job_views_tracking.sql`
**Probleme** : La version dans security_hardening utilise des cles JSONB differentes (`cv_analyses_per_day` vs `cv_analyses`). Les versions suivantes corrigent cela, mais si la derniere version appliquee est celle de `20260306000001`, les cles sont `cv_analyses`, `coach_seconds`, `job_searches`, `assistant_messages`. C'est coherent avec les seeds mais l'ancienne version hardening aurait echoue.
**Impact** : Mitige car les migrations s'appliquent sequentiellement et chaque `CREATE OR REPLACE` ecrase la precedente.

### I6. `security_events` -- accumulation infinie pour severity > 'info'
**Fichier** : `supabase/migrations/20260128001200_security_monitoring.sql:182-202`
**Probleme** : `cleanup_old_security_events()` ne supprime que les events avec `severity = 'info'`. Les events `warning`, `critical`, `emergency` ne sont JAMAIS supprimes.
**Impact** : Accumulation infinie des events de securite critiques. A long terme, la table grossira indefiniment.
**Fix** : Ajouter un cleanup pour les events > 1 an toutes severites confondues.

---

## AMELIORATIONS

### A1. `user_career_score` et `user_xp_events` referencent `profiles(id)` au lieu de `auth.users(id)`
**Impact** : Si un profil est supprime sans CASCADE sur auth.users, les scores/XP sont perdus. C'est coherent tant que `profiles.id` = `auth.users.id` avec CASCADE, mais c'est une indirection inutile.

### A2. `user_notifications` reference `profiles(id)` au lieu de `auth.users(id)`
**Impact** : Meme probleme d'indirection que A1.

### A3. Index manquant sur `user_career_score` -- pas d'index `last_calculated_at`
**Impact** : Si un cron recalcule les scores, il devra faire un seq scan pour trouver les users a recalculer (`next_recalc_at < NOW()`).
**Fix** : `CREATE INDEX idx_career_score_next_recalc ON user_career_score(next_recalc_at) WHERE next_recalc_at < NOW()`.

### A4. `referral_rewards.applied` devrait avoir un index partiel
**Impact** : Queries pour trouver les recompenses non appliquees (`WHERE applied = false`) font un seq scan.
**Fix** : `CREATE INDEX idx_referral_rewards_unapplied ON referral_rewards(referrer_id) WHERE applied = false`.

### A5. `recruiter_requests` -- pas de `updated_at` trigger-safe pour status changes
**Impact** : Le trigger `update_recruiter_requests_updated_at` existe. OK.

### A6. `support_tickets.admin_reply` devrait etre un tableau (pas un seul TEXT)
**Impact** : Un seul admin reply par ticket. Si plusieurs echanges sont necessaires, le champ est ecrase.

### A7. `user_events` -- Realtime active mais aucune protection
**Impact** : Tout utilisateur authentifie peut s'abonner aux events Realtime et voir ses propres events (protege par RLS). Mais la charge Realtime peut etre lourde si beaucoup d'events sont inseres.

### A8. `assistant_suggestions` -- pas de RLS et pas de `created_at` NOT NULL
**Impact** : `created_at` est nullable par defaut car `DEFAULT NOW()` mais pas de `NOT NULL`.

---

## CE QUI EST SOLIDE

- **`user_subscriptions`** : Excellente structure. Contrainte UNIQUE partielle pour 1 seul actif par user. Trigger auto-cancel des anciennes subscriptions. Historique complet via `subscription_history`. Champs Stripe complets (customer_id, subscription_id, price_id). CHECK constraint sur status. Index bien places.

- **`usage_quotas`** : Design propre avec UNIQUE(user_id, quota_date). Fonctions RPC `check_user_quota()`, `increment_usage()`, `get_quota_status()` bien implementees avec normalisation cv_analysis/cv_analyses. Support de 5 features (cv_analysis, coach, job_search, job_view, assistant_messages). Cleanup 90j en place.

- **`subscription_plans`** : Limites en JSONB flexible. Feature flags editables par admin. Features included/excluded pour l'affichage. Seed data coherent (4 plans).

- **`stripe_prices`** : Table dedicee pour les price IDs Stripe. UNIQUE(plan_id, billing_period). Fonction `get_stripe_price_id()` propre. Permet de changer les prix sans deployer.

- **`referral system`** (4 tables) : Design complet avec referral_code unique, tracking signups/conversions, rewards avec types flexibles, config singleton avec tiers gamifies.

- **`saved_jobs`** : UNIQUE(user_id, external_job_id, job_source) prevent les doublons. Trigger updated_at. Index composites.

- **`coach_conversations`** : `message_count` GENERATED STORED. GIN index sur titre pour full-text search. Index partiel sur is_favorite. `assistant_type` CHECK constraint.

- **Security** : `is_admin()` SECURITY DEFINER function evite la recursion RLS. `security_audit_log` bloque tout acces user. `handle_new_user()` sanitize le full_name (XSS). File size limit sur le bucket CVs (10MB, PDF only).

- **Triggers** : `auto_cancel_previous_subscriptions` BEFORE INSERT/UPDATE evite les doublons. `track_subscription_changes` pour audit trail complet. `auto_cleanup_coach_session_on_usage` pour le nettoyage.

---

## Annexe : Etat RLS complet

| Table | RLS Active | Policies | Justification si manquant |
|---|---|---|---|
| `profiles` | OUI | SELECT own, UPDATE own (protected fields), admin read/update all, block manual INSERT | OK |
| `user_subscriptions` | OUI | SELECT own, UPDATE own, admin read/update all | OK |
| `subscription_plans` | OUI | SELECT public (active only), admin UPDATE | OK |
| `usage_quotas` | OUI | SELECT/INSERT/UPDATE own, admin read all | OK |
| `cv_analyses` | OUI | SELECT/INSERT/DELETE own (auth + anon), UPDATE metadata own | OK |
| `coach_conversations` | OUI | CRUD own | OK |
| `saved_jobs` | OUI | CRUD own | OK |
| `user_documents` | OUI | SELECT/INSERT/DELETE own | OK -- manque UPDATE policy |
| `cv_profiles` | OUI | CRUD own | OK |
| `user_applications` | OUI | CRUD own | OK |
| `user_notification_preferences` | OUI | SELECT/INSERT/UPDATE own | OK |
| `stripe_prices` | OUI | SELECT public, admin manage all | OK |
| `subscription_history` | OUI | SELECT own, service_role SELECT/INSERT | OK |
| `active_coach_sessions` | OUI | SELECT/DELETE own, service_role all | OK |
| `recruiter_requests` | OUI | SELECT/INSERT/UPDATE own, service_role all, admin read/update | OK |
| `referrals` | OUI | SELECT own, admin full | OK |
| `referral_signups` | OUI | SELECT via join referrals, admin full | OK |
| `referral_rewards` | OUI | SELECT own, admin full | OK |
| `referral_config` | OUI | SELECT public, admin full | OK |
| `security_audit_log` | OUI | SELECT USING(false) -- blocked for users | OK |
| `security_events` | OUI | SELECT own, service_role full, admin read | OK |
| `user_events` | OUI | SELECT own | OK |
| `support_tickets` | OUI | ALL own, service_role all | OK |
| `admin_notes` | OUI | **Aucune policy** -- service_role bypass only | OK (intentionnel) |
| `email_blacklist` | OUI | **Aucune policy** -- service_role bypass only | OK (intentionnel) |
| `stress_test_runs` | OUI | service_role all | OK |
| `translation_memory` | OUI | SELECT true, INSERT true, UPDATE true | **PROBLEME** -- write ouvert a tous |
| `ai_prompts` | OUI | ALL USING(true) | **PROBLEME** -- write ouvert a tous |
| `assistant_suggestions` | **NON** | -- | **PROBLEME** -- RLS completement desactivee |
| `user_feature_overrides` | OUI | service_role full, users read own (fixe 20260318) | OK apres fix |
| `user_career_score` | OUI | ALL own, service_role all | OK |
| `user_xp_events` | OUI | ALL own, service_role all | OK |
| `user_notifications` | OUI | SELECT/UPDATE own, service_role all | OK |

### Bilan RLS
- **28 tables** avec RLS activee
- **1 table** sans RLS (`assistant_suggestions`) -- **BLOQUANT**
- **2 tables** avec policies trop permissives (`ai_prompts`, `translation_memory`) -- **IMPORTANT**
- **2 tables** avec RLS active mais 0 policy (intentionnel, service_role only) -- OK

---

## Annexe : Migrations -- Points d'attention

### Ordre chronologique
Les 70+ migrations s'appliquent dans l'ordre correct des timestamps. Pas de conflit de timestamps detecte.

### Idempotence
La majorite des migrations utilisent `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`, et `DROP POLICY IF EXISTS`. Bon pattern global.

### Migration destructive sans rollback
- `20260211120000_cleanup_stripe_complexity.sql` : DROP TABLE `webhook_failures` et `stripe_webhook_events`. **Irreversible** -- les donnees de ces tables sont perdues. Rollback necessiterait de re-creer les tables + les 10 fonctions associees.

### Les 3 dernieres migrations (20260318*)
1. `20260318000001_features_excluded.sql` : Ajoute colonne `features_excluded` JSONB sur `subscription_plans`. Met a jour les 4 plans avec les features incluses/exclues en francais. **OK, non destructif.**
2. `20260318000002_fix_rls_feature_overrides.sql` : Corrige la policy trop permissive sur `user_feature_overrides` (remplace `USING(true)` par `TO service_role` + `users read own`). **Fix de securite important.**
3. `20260318000003_fix_cleanup_functions.sql` : Recree `cleanup_old_records()`, `cleanup_old_records_rpc()`, et `get_cleanup_info()` SANS les references aux tables supprimees (`stripe_webhook_events`, `webhook_failures`). **Fix de bug critique** -- l'ancienne version plantait au runtime.

### Conflit migration vs code
- La migration `20260211000004_cron_cleanup.sql` definit `cleanup_old_records()` avec references a `stripe_webhook_events` et `webhook_failures`. Ces tables sont supprimees dans `20260211120000`. La migration `20260318000003` corrige cela en re-creant les fonctions. **Mais si quelqu'un applique les migrations dans l'ordre, la version de 20260211000004 est d'abord appliquee (avec refs invalides), puis ecrasee par 20260318000003. Entre les deux, l'execution de cleanup_old_records() aurait plante.**

---

## Calcul du score

| Critere | Points | Justification |
|---|---|---|
| Base | 100 | |
| B1 : `assistant_suggestions` sans RLS | -10 | Table non critique mais expose des donnees editables |
| B2 : `ai_prompts` RLS ALL USING(true) | -10 | Permet a tout user d'editer les prompts IA |
| B3 : Policies admin sur tables supprimees | -5 | Bloquant pour `supabase db reset` |
| I1 : Colonnes deprecated profiles | -3 | Confusion dev, pas de risque runtime |
| I2 : `translation_memory` write ouvert | -3 | Pollution possible du cache traductions |
| I3 : `user_documents` sans `updated_at` | -1 | Mineure |
| I4 : `cv_profiles` doublon migration | -1 | Confusion seulement |
| I6 : `security_events` accumulation infinie | -3 | Performance long terme |
| A1-A4 : Index et FK indirections | -2 | Ameliorations mineures |
| **Total** | **62/100** | |
