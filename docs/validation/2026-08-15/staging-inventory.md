# Inventaire production et préproduction

**Date du snapshot :** 11 août 2026
**Branche de travail :** `codex/stripe-stabilization`
**Commit de base :** `3f2c297`
**Confidentialité :** aucune valeur de secret n'est conservée dans ce document.

## Résumé

Une préproduction isolée existe désormais sur Supabase, Railway, Redis et Vercel, sans copie des données de production ni secret Stripe Live/Resend. La branche Supabase persistante a reçu les 124 migrations locales et son journal local/distant est identique. Le backend Railway staging démarre avec Supabase/Redis staging et répond sur son endpoint de santé. Le frontend Vercel a été construit dans le Custom Environment `staging` et répond derrière Deployment Protection. Le worker ARQ staging est en cours de validation. Le domaine `staging.huntzenjobs.com` résout chez OVH, possède un certificat Vercel valide et sert le frontend staging.

## Plateformes

| Service | Production observée | Staging observé | État / preuve |
|---|---|---|---|
| Supabase | Projet HuntZen `ngiakfikbuyugqfqtfwp`, région Europe Ouest, PostgreSQL 17 | Branche persistante `staging`, ref `cxkpbciubsvopgxakgbj`, sans copie des données | 124 migrations présentes ; historique local/distant identique et lint DB sans erreur ni warning. URL de site et callback Auth limités à `staging.huntzenjobs.com`; Google OAuth staging dédié activé et testé. Le statut Dashboard historique reste rouge malgré le journal SQL aligné et ne se laisse pas réinitialiser par les overrides CLI 2.84.2 et 2.113.0. |
| Stripe | Mode Live, un endpoint Railway actif | Sandbox Test HuntZen, catalogue dédié, endpoint webhook staging distinct | Trois produits et six prix récurrents EUR ont été créés en Test puis mappés uniquement dans Supabase staging. Clés Test et secret webhook sont injectés masqués dans Railway staging. L'ancienne clé Test visible pendant l'audit a été tournée immédiatement. Aucun objet Live modifié. |
| Railway | Backend public version `3.0.0`, health `ok`; services backend, ARQ et stress observés `Online` après bascule Supabase | Environnement `staging`; backend `ravishing-reprieve` branché sur `Pre-production`/`backend`, domaine `ravishing-reprieve-staging.up.railway.app` | Déploiement actif, `/api/health/ping` retourne `200`. Variables limitées à Supabase staging, Redis staging et valeurs non financières. Stripe Live, Resend et Modal sont absents/désactivés. |
| Vercel | Projet `frontend-next` de l'équipe `huntzen-jobs`; déploiement production et aliases apex/www `Ready` après bascule | Custom Environment `staging`; déploiement `dpl_HbHp2XKwFdjKwVcZmNZ7eH1jqhMf`; domaine `staging.huntzenjobs.com` | Build Next.js réussi, certificat TLS valide et alias staging actif. Supabase et backend pointent uniquement vers staging. |
| Redis / ARQ | Redis production Railway observé `Online` | Redis dédié `Redis-SU2L` `Online`; service ARQ `respectful-rebirth` sur `Pre-production`/`backend` | Le service worker staging utilise désormais `/backend/railway.worker.toml`, sans healthcheck HTTP et avec un seul réplica ; le redéploiement Railway est réussi. Le code distant reste toutefois ancien et n'annonce pas encore `stripe_effect_outbox_task`. |
| Modal | Deux applications déployées : traitement CV et extraction PDF | Aucun environnement nommé staging | CLI Modal authentifiée et inventaire en lecture seule. Le candidat local impose proxy auth, activation explicite, payload strict, URL Supabase signée et plafonds de conteneurs ; 11 tests passent. Aucun déploiement Modal existant n'a été modifié. |
| Sentry | Organisation `huntzen`, projet historique `javascript-nextjs` | Projet séparé `huntzen-staging` (plateforme FastAPI) | DSN injecté uniquement dans le backend et le worker Railway staging ainsi que dans le Custom Environment Vercel `staging`. Le frontend local utilise `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging`; l'injection d'une erreur contrôlée attend la publication du candidat local. |
| Resend | Configuration production historique non copiée | Barrière email staging implémentée localement, aucune clé active sur Railway | En environnement non-production, tous les destinataires sont redirigés vers `delivered@resend.dev` et les champs `cc`/`bcc` sont supprimés. Une clé staging temporaire a été créée puis immédiatement retirée de Railway et révoquée tant que le candidat protégé n'est pas publié. |

## Crons configurés dans le code

Le frontend Vercel déclare neuf crons. Le nouveau cron Stripe `/api/cron/stripe-effects` est prévu chaque minute. Il ne doit pas être activé en production avant que la migration outbox, le worker ARQ, Redis et les alertes dead-letter aient été validés ensemble en staging.

## Migrations du lot Stripe

- `20260810000001_restore_stripe_webhook_idempotency.sql`
- `20260810000002_stripe_effect_outbox.sql`

Ces migrations sont locales et non appliquées en production au moment du snapshot. Elles ajoutent le journal webhook atomique, les tokens de claim, l'outbox, les réservations Checkout et les RPC transactionnelles. Elles ont été exécutées sur PostgreSQL staging réel. Les RPC Stripe critiques sont refusées à `anon` et accordées à `service_role`, et l'outbox a sa RLS active.

La reconstruction a aussi révélé et corrigé trois incohérences historiques : tables cache créées uniquement par un ancien bootstrap Python, suppression prématurée des tables webhook, et duplication de la migration `cv_profiles`. Le défaut PostgreSQL de remplacement de `extend_subscription_days` avec retrait d'un paramètre par défaut a également été corrigé.

Toutes les tables publiques ont désormais la RLS. `stripe_payments`, `recruiter_cache`, `user_sessions`, `user_subscriptions`, `usage_quotas` et `profiles` ne sont plus accessibles à `anon`; `authenticated` ne peut plus muter abonnements ni quotas, et ses mises à jour de profil sont limitées aux colonnes d'interface sûres. Les RPC webhook, maintenance et outbox critiques sont refusées à `anon` et accordées à `service_role`. Le schéma de `recruiter_cache` est désormais aligné avec le service backend et l'upsert est dédupliqué par `company_slug`. Les 46 anciennes fonctions `SECURITY DEFINER` ont été classées et aucune n'est désormais exécutable par `anon`. Deux RPC privilégiées restent accessibles à `authenticated` : `is_admin`, indispensable aux policies mais liée strictement à `auth.uid()`, et `log_security_event`, avec identité vérifiée, allowlist, sévérité et payload bornés. Les JWT historiquement stockés dans `security_events.session_id` sont supprimés par migration et le frontend n'en transmet plus.

## Domaine personnalisé

- Add-on Supabase `Custom Domain` activé le 11 août 2026 sur le projet production.
- Coût confirmé dans le Dashboard : 10 USD/mois hors taxes, au prorata horaire.
- Nom validé par Wissem : `auth.huntzenjobs.com`.
- Le CNAME OVH `auth.huntzenjobs.com` vers `ngiakfikbuyugqfqtfwp.supabase.co` est créé et résout publiquement.
- Les deux TXT Supabase de propriété et de validation TLS sont créés chez OVH et résolvent publiquement.
- Le certificat est actif et le domaine est activé pour le trafic Supabase.
- Le callback Google `https://auth.huntzenjobs.com/auth/v1/callback` est enregistré et une connexion OAuth réelle a abouti sur `/jobs` avec une session authentifiée.
- Vercel production et les services Railway concernés utilisent désormais `https://auth.huntzenjobs.com`; leurs états ont été relus après la bascule.
- L'enregistrement OVH `A staging.huntzenjobs.com 76.76.21.21` est créé et résout publiquement.
- Vercel a émis le certificat TLS et l'alias `https://staging.huntzenjobs.com` pointe vers le déploiement staging.
- Supabase staging utilise cette URL comme Site URL et autorise `https://staging.huntzenjobs.com/auth/callback`.
- Un client Google OAuth Web séparé, limité au callback de la branche Supabase staging, est activé. Une connexion réelle a créé exactement un utilisateur, un profil, un abonnement `free` actif et un quota initial.
- Le premier essai a révélé un second trigger d'inscription legacy exécuté sans droits par `supabase_auth_admin`. La migration forward `20260812025700_remove_duplicate_auth_signup_trigger.sql` supprime ce trigger et sa fonction redondante ; le même parcours Google réussit après correction.

## Risques et rollback

- Risque : grants RPC ou RLS incorrects. Contrôle : tests négatifs `anon`/`authenticated`, tests positifs `service_role`.
- Risque : cron actif sans worker/Redis. Contrôle : déployer le worker avant d'activer le cron et surveiller les lignes pending/dead.
- Risque : double endpoint ou mauvais signing secret Stripe. Contrôle : un endpoint par environnement et replay Stripe CLI signé.
- Risque : migration additive difficile à retirer après production. Rollback : couper d'abord cron/worker, conserver les tables pour l'audit et utiliser uniquement une image backend compatible avec les nouvelles RPC. L'image legacy ne doit pas être redéployée après suppression des anciennes signatures webhook, car elle perdrait l'idempotence. Un rollback forward compatible doit être préparé et testé en staging avant la production.
- Risque : secrets production copiés en staging. Contrôle : clés Stripe Test, projet Supabase séparé, Redis et Sentry séparés, tests négatifs d'isolation.

## Blocages actuels

1. Publier le lot `codex/stripe-stabilization` sur une branche distante autorisée. Le backend Railway actuel exécute encore le code distant `Pre-production`, pas les correctifs locaux non commités.
2. Publier la version worker qui contient `stripe_effect_outbox_task`, redéployer `respectful-rebirth` puis vérifier la tâche dans les logs. Le fichier worker dédié et le réplica unique sont déjà actifs.
3. Rejouer les événements Stripe Test et exécuter les E2E billing après publication du candidat local ; l'endpoint staging est prêt mais pointe encore vers l'ancien code distant.
4. Publier la barrière email non-production, recréer ensuite une clé Resend `sending_access` staging et vérifier une livraison uniquement vers `delivered@resend.dev`.
5. Publier le correctif Storage CV déjà appliqué sur staging, puis valider le parcours URL signée avec Modal staging avant tout test CV complet.
6. Traiter les 43 vulnérabilités npm signalées au build (dont 4 critiques) et les avertissements React/ESLint prioritaires avant le Go/No-Go.
7. Résoudre la divergence Git : `Pre-production` diverge de `Production` et ne contient pas encore le lot `codex/stripe-stabilization`. Aucun commit manuel n'est autorisé par les règles du dépôt.

## Validation locale avant staging

- Backend billing : 99 tests Stripe/recruteur/promo/réconciliation réussis.
- Ruff ciblé : aucune erreur sur les fichiers Python du lot.
- Frontend : 274 tests Vitest réussis.
- TypeScript : `npx tsc --noEmit` réussi.
- Build Next.js : réussi avec injection temporaire des variables locales, sans les copier dans le worktree.
- ESLint : aucune erreur bloquante, mais avertissements historiques présents, notamment sur les dépendances de hooks pricing.
- Suite backend racine : non exploitable en l'état ; `npm run test:backend` cible l'ancien arbre `tests/` avec le Python système et échoue à l'import de `main`. Ce défaut de CI est distinct de la suite canonique backend du lot et doit être corrigé avant Go final.
- PostgreSQL local : indisponible car le daemon Docker n'est pas actif. La chaîne a cependant été appliquée sur la base PostgreSQL staging réelle ; 119 migrations sont enregistrées.
- Lint PostgreSQL staging : zéro erreur au niveau `error`. Le contrôle catalogue confirme zéro table publique sans RLS et zéro fonction `SECURITY DEFINER` exécutable par `anon`.
- RLS admin vérifiée sous rôle `authenticated`; appels techniques vérifiés avec le format `request.jwt.claims` PostgREST actuel; usurpation d'un autre UUID refusée.
- Les deux paramètres PostgREST du cron cleanup ont été alignés sur leurs signatures (`p_retention_days`, `p_days_old`).
- Dette restante : les événements pré-authentification (échec login/OAuth) doivent passer par une route serveur rate-limitée; la RPC `anon` ne sera pas rouverte.
- Storage CV staging : bucket privé, aucun privilège `anon` sur `cv_analyses`, trois policies Storage propriétaires `authenticated` uniquement et quatre tests unitaires du chemin privé/signé verts.
- Auth staging : Google OAuth réel vert après correction du trigger legacy ; invariant couvert par un test unitaire de migration et confirmé dans le catalogue PostgreSQL (un seul trigger sur `auth.users`).
- Sentry staging : projet séparé créé, health backend toujours à 200 après ajout du DSN ; 4 tests prouvent le tag `staging` sur client/serveur/edge et le masquage Replay de tout texte, saisie et média. Le test d'ingestion réel reste ouvert jusqu'au déploiement du candidat qui contient cette configuration.
- Resend staging : 2 tests unitaires de sécurité email et 83 tests email/Stripe/recruteur réussis ; Ruff ciblé vert. Aucun secret Resend n'est actif sur Railway tant que cette barrière locale n'est pas publiée.
- Groq : Sentry production a exposé l'ancien modèle Llama 4 Scout retiré. Le candidat aligne maintenant les noms documentés `FAST_MODEL`/`PRIMARY_MODEL` avec Pydantic et utilise les remplaçants officiels `openai/gpt-oss-20b`/`openai/gpt-oss-120b`. Deux tests de configuration et Ruff sont verts ; aucun environnement distant n'a été modifié.

## Versions d'outillage

- Supabase CLI locale : `2.84.2`, dernière proposée : `2.113.0`.
- Vercel CLI globale : `48.9.0`; les opérations staging ont été faites avec la version éphémère `58.9.4`.
- Railway CLI : `4.25.1`.
- Modal client : `1.3.2`.

Les CLI Supabase et Vercel doivent être mises à jour et revérifiées avant les mutations de plateforme, sans modifier les dépendances applicatives. Mise à jour Vercel recommandée : `npm i -g vercel@latest` ou `pnpm add -g vercel@latest`.
