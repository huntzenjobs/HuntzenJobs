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
| Railway | Backend public version `3.0.0`, health `ok`; services backend, ARQ et stress observés `Online` après bascule Supabase | Environnement `staging`; backend `ravishing-reprieve`, domaine `ravishing-reprieve-staging.up.railway.app` | Le commit exact `c039692` est déployé et `/api/health/ping` retourne `200`. Stripe Test, Resend staging et Modal staging sont configurés ; `MODAL_ENABLED=true` après ajout de la clé Groq dédiée. Aucun secret Stripe Live ou Modal production n'est utilisé. |
| Vercel | Projet `frontend-next` de l'équipe `huntzen-jobs`; déploiement production et aliases apex/www `Ready` après bascule | Custom Environment `staging`; déploiement `dpl_HbHp2XKwFdjKwVcZmNZ7eH1jqhMf`; domaine `staging.huntzenjobs.com` | Build Next.js réussi, certificat TLS valide et alias staging actif. Supabase et backend pointent uniquement vers staging. |
| Redis / ARQ | Redis production Railway observé `Online` | Redis dédié `Redis-SU2L` `Online`; service ARQ `respectful-rebirth`, un seul réplica | Le worker staging utilise `/backend/railway.worker.toml`; le candidat `c039692` a été publié et `stripe_effect_outbox_task` s'exécute. Les effets Resend restent en retry contrôlé jusqu'au transfert du domaine. |
| Modal | Deux applications historiques déployées : traitement CV et extraction PDF | Environnement `staging` séparé ; application `huntzen-cv-processor-staging`, secret staging, Proxy Token et clé Groq dédiée expirant le 11 novembre 2026 | Les applications historiques n'ont pas été modifiées. Le probe sans credential retourne `401`; le Proxy Token atteint la validation du payload (`422` sur payload vide). Un CV texte entièrement synthétique est passé à `completed`, avec résultat JSON persisté, callback Railway réussi et aucune erreur Modal ; la ligne synthétique a ensuite été supprimée. |
| Sentry | Organisation `huntzen`, projet historique `javascript-nextjs` | Projet séparé `huntzen-staging` (plateforme FastAPI) | DSN injecté uniquement dans le backend et le worker Railway staging ainsi que dans le Custom Environment Vercel `staging`. Le frontend local utilise `NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging`; l'injection d'une erreur contrôlée attend la publication du candidat local. |
| Resend | L'ancien compte contient déjà `huntzenjobs.com`, `.fr`, `.co` et `.eu` vérifiés | Barrière email staging publiée et clé `sending_access` installée sur le worker Railway staging | La clé est acceptée, mais les envois restent en retry car `huntzenjobs.com` n'est pas encore revendiqué dans la nouvelle équipe. Le transfert des quatre domaines exige Resend Pro ; abonnement autorisé mais paiement reporté jusqu'à disponibilité de la carte du responsable. Aucun email client n'a été envoyé. |

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

1. Confirmer que le frontend Vercel staging sert le même SHA candidat que le backend et le worker Railway staging.
2. Rejouer les événements Stripe Test restants, y compris ordre inversé, doublons et finalisation partielle, puis exécuter les derniers E2E billing.
3. Exécuter la réconciliation Stripe en dry-run et exiger zéro divergence critique.
4. Dès que la carte du responsable est disponible, souscrire Resend Pro puis revendiquer uniquement les quatre domaines HuntZen via OVH, sans suppression préalable ; vérifier ensuite une livraison vers `delivered@resend.dev` uniquement.
5. Valider encore le chemin PDF privé signé Modal : PDF synthétique normal/corrompu, dépassement taille, timeout et replay ; tourner la clé Groq staging avant le 11 novembre 2026.
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
- Modal staging : application et secrets séparés, proxy auth réel vérifié, backend Railway `c039692` à `200`, premier E2E texte synthétique `completed` avec callback réussi ; donnée synthétique nettoyée après preuve.
- Auth staging : Google OAuth réel vert après correction du trigger legacy ; invariant couvert par un test unitaire de migration et confirmé dans le catalogue PostgreSQL (un seul trigger sur `auth.users`).
- Sentry staging : projet séparé créé, health backend toujours à 200 après ajout du DSN ; 4 tests prouvent le tag `staging` sur client/serveur/edge et le masquage Replay de tout texte, saisie et média. Le test d'ingestion réel reste ouvert jusqu'au déploiement du candidat qui contient cette configuration.
- Resend staging : 2 tests unitaires de sécurité email et 83 tests email/Stripe/recruteur réussis ; Ruff ciblé vert. La clé staging est active sur le worker, mais la livraison est bloquée proprement en retry jusqu'au transfert du domaine.
- Groq : Sentry production a exposé l'ancien modèle Llama 4 Scout retiré. Le candidat aligne maintenant les noms documentés `FAST_MODEL`/`PRIMARY_MODEL` avec Pydantic et utilise les remplaçants officiels `openai/gpt-oss-20b`/`openai/gpt-oss-120b`. Une clé dédiée à Modal/Railway staging a été créée avec expiration au 11 novembre 2026 ; aucune clé production n'a été réutilisée.

## Versions d'outillage

- Modal CLI locale : `1.5.4`.
- Vercel CLI globale : `58.10.0`.
- Railway CLI globale : `5.38.0`.
- Supabase CLI locale : `2.84.2`, dernière proposée : `2.113.0`.

La CLI Supabase doit être mise à jour et revérifiée avant une nouvelle mutation de base, sans modifier les dépendances applicatives.
