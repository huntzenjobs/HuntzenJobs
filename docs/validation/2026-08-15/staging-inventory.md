# Inventaire production et préproduction

**Date du snapshot :** 14 août 2026
**Branche de travail :** `codex/stripe-stabilization`
**Commit distant testé :** `798b97e`
**Confidentialité :** aucune valeur de secret n'est conservée dans ce document.

## Résumé

Une préproduction isolée existe désormais sur Supabase, Railway, Redis, Vercel et Modal, sans copie des données de production ni secret Stripe Live. La branche Supabase persistante a reçu les 128 migrations locales et son journal local/distant est identique. Backend, worker ARQ, frontend et Modal sont publiés depuis `798b97e`; le frontend staging et le backend répondent `200`. Le domaine `staging.huntzenjobs.com` possède un certificat Vercel valide. La livraison email reste bloquée par le transfert Resend et le gate de charge publique n'est pas reproductible à 50 VU.

## Plateformes

| Service | Production observée | Staging observé | État / preuve |
|---|---|---|---|
| Supabase | Projet HuntZen `ngiakfikbuyugqfqtfwp`, région Europe Ouest, PostgreSQL 17 | Branche persistante `staging`, ref `cxkpbciubsvopgxakgbj`, sans copie des données | 128 migrations présentes ; historique local/distant identique et lint DB sans erreur ni warning. Vercel utilise une clé `sb_publishable`; backend et worker utilisent uniquement la clé nommée `staging_backend_20260814`, l'ancienne clé serveur ayant été supprimée. Le mot de passe PostgreSQL/pooler a été tourné une seconde fois puis propagé à Railway et Modal. Les 8 tests RLS/ACL avec deux identités synthétiques passent. |
| Stripe | Mode Live, un endpoint Railway actif | Sandbox Test HuntZen, catalogue dédié, endpoint webhook staging distinct | Un seul endpoint Test est actif. L'E2E synthétique Checkout/paiement/ledger/impayé/résiliation/réactivation est vert. Le dry-run final contient 1 abonnement synchronisé, 0 divergence active et 5 abonnements annulés historiques. Deux fixtures génériques actives ont été annulées en Test. Aucun objet Live modifié. |
| Railway | Backend public version `3.0.0`, health `ok` | Environnement `staging`; backend `ravishing-reprieve` (`8874ad4d-9597-44d3-a899-38b3ea3603f2`), worker `respectful-rebirth` (`5138356a-521c-4c2b-8aeb-f2656a04155f`) | `798b97e` est publié par upload contrôlé sur les deux services avec `WORKERS=2`. Deux workers démarrent, le socket Gunicorn est accessible et le worker charge l'outbox. 10 VU est vert ; 50 VU reste intermittent et hors seuil malgré un essai réversible à quatre workers. |
| Vercel | Projet `frontend-next` de l'équipe `huntzen-jobs` | Custom Environment `staging`; déploiement `dpl_DcKUobLbxgMitiw4hiLjr5eZmded`; domaine `staging.huntzenjobs.com` | Le déploiement de `798b97e` est `Ready`, aliasé et répond `200`. La clé navigateur a été corrigée en `sb_publishable`; aucun secret serveur n'est exposé au client. |
| Redis / ARQ | Redis production Railway observé `Online` | Redis dédié `Redis-SU2L` `Online`; service ARQ `respectful-rebirth`, un seul réplica | Le cron minute produit un `job_id` stable et le second appel de la fenêtre est dédupliqué. Le worker charge `stripe_effect_outbox_task`; une injection contrôlée a produit 5 retries et 1 dead-letter avec appel Sentry. |
| Modal | Deux applications historiques déployées | Environnement `staging` séparé ; application `huntzen-cv-processor-staging`, tag `798b97e`, secret staging, Proxy Token et clé Groq dédiée expirant le 11 novembre 2026 | Texte et PDF privé signé passent à `completed`; PDF corrompu à `failed`; PDF >10 Mio à HTTP 400. Deux replays réels d'une ligne `completed` la laissent strictement inchangée. Toutes les données synthétiques sont nettoyées. |
| Sentry | Organisation `huntzen`, projet historique `javascript-nextjs` | Projet séparé `huntzen-staging` | DSN injecté uniquement en staging. Le passage contrôlé en dead-letter a exécuté l'appel Sentry depuis le worker ; les logs ne montrent aucune erreur d'envoi. |
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

1. Dès que la carte du responsable est disponible, souscrire Resend Pro puis revendiquer uniquement les quatre domaines HuntZen via OVH, sans suppression préalable ; vérifier ensuite une livraison vers `delivered@resend.dev` uniquement.
2. Exécuter le timeout Modal réel contrôlé et créer l'alerte budget ; normal, corrompu, trop lourd et replay durable sont validés.
3. Planifier la migration majeure Next.js/`next-pwa` : l'audit production est passé de 30 vulnérabilités dont 1 critique à 18 sans critique, mais 15 high transitives exigent une migration majeure et non un `audit fix --force`.
4. Diagnostiquer les timeouts Railway/proxy qui rendent 50 VU non reproductible avant de revendiquer ce palier.
5. Avant production, exécuter le préflight doublons/volumétrie de `user_notifications` car l'index unique forward est créé sans `CONCURRENTLY`.

## Validation locale avant staging

- Backend : 179 tests unitaires réussis, dont 18 sur la sécurité et la durabilité Modal.
- Ruff ciblé : aucune erreur sur les fichiers Python du lot.
- Frontend : 302 tests Vitest réussis.
- TypeScript : `npx tsc --noEmit` réussi.
- Build Next.js : réussi avec injection temporaire des variables locales, sans les copier dans le worktree.
- ESLint : aucune erreur bloquante, mais avertissements historiques présents, notamment sur les dépendances de hooks pricing.
- Suite backend racine : non exploitable en l'état ; `npm run test:backend` cible l'ancien arbre `tests/` avec le Python système et échoue à l'import de `main`. Ce défaut de CI est distinct de la suite canonique backend du lot et doit être corrigé avant Go final.
- PostgreSQL local : indisponible car le daemon Docker n'est pas actif. La chaîne a cependant été appliquée sur la base PostgreSQL staging réelle ; 128 migrations sont enregistrées et alignées avec le dépôt.
- Lint PostgreSQL staging : zéro erreur au niveau `error`. Le contrôle catalogue confirme zéro table publique sans RLS et zéro fonction `SECURITY DEFINER` exécutable par `anon`.
- RLS admin vérifiée sous rôle `authenticated`; appels techniques vérifiés avec le format `request.jwt.claims` PostgREST actuel; usurpation d'un autre UUID refusée.
- Les deux paramètres PostgREST du cron cleanup ont été alignés sur leurs signatures (`p_retention_days`, `p_days_old`).
- Dette restante : les événements pré-authentification (échec login/OAuth) doivent passer par une route serveur rate-limitée; la RPC `anon` ne sera pas rouverte.
- Storage CV staging : bucket privé, aucun privilège `anon` sur `cv_analyses`, trois policies Storage propriétaires `authenticated` uniquement et quatre tests unitaires du chemin privé/signé verts.
- Modal staging : application et secrets séparés, proxy auth réel vérifié, texte et PDF signé synthétiques `completed`, PDF corrompu `failed`, callbacks et nettoyages verts.
- Auth staging : Google OAuth réel vert après correction du trigger legacy ; invariant couvert par un test unitaire de migration et confirmé dans le catalogue PostgreSQL (un seul trigger sur `auth.users`).
- Sentry staging : projet séparé créé ; 4 tests prouvent le tag `staging` et le masquage Replay. Un dead-letter contrôlé a déclenché l'appel Sentry du worker sans erreur d'envoi observée.
- Resend staging : 2 tests unitaires de sécurité email et 83 tests email/Stripe/recruteur réussis ; Ruff ciblé vert. La clé staging est active sur le worker, mais la livraison est bloquée proprement en retry jusqu'au transfert du domaine.
- Groq : Sentry production a exposé l'ancien modèle Llama 4 Scout retiré. Le candidat aligne maintenant les noms documentés `FAST_MODEL`/`PRIMARY_MODEL` avec Pydantic et utilise les remplaçants officiels `openai/gpt-oss-20b`/`openai/gpt-oss-120b`. Une clé dédiée à Modal/Railway staging a été créée avec expiration au 11 novembre 2026 ; aucune clé production n'a été réutilisée.
- Alignement staging : Vercel, Modal et les deux services Railway sont publiés depuis `798b97e`; frontend `Ready`, backend et worker `SUCCESS`, health `200`, tâche outbox présente.
- Stripe Test : CLI mise à jour et authentifiée sans clé Live ; un seul endpoint canonique actif. Les cinq types d'événements ont été émis en ordre inversé. Les payloads génériques étrangers au modèle HuntZen sont refusés/classés en échec sans créer de droits ; `invoice.payment_failed` et un `invoice.paid` sans projection applicable sont finalisés.
- Stripe Test E2E : un compte Supabase synthétique a créé un Checkout Starter via l'API réelle. Paiement Test, projection, ledger, résiliation idempotente, réactivation et impayé ont été vérifiés. L'ordre `subscription.updated(past_due)` avant `invoice.payment_failed` a produit un test rouge, puis les migrations forward `20260813224640` et `20260814083310` ont rendu le test vert avec deux effets et une notification unique par facture. Les objets synthétiques ont été nettoyés.
- Rotation Supabase staging : backend, worker et Vercel utilisent les clés modernes ; les clés API JWT legacy sont désactivées et la signature HS256 précédente est révoquée. Un compte synthétique créé via la clé secrète moderne s'est connecté via la clé publique moderne, puis a été supprimé.
- Capacité publique staging : 10 VU vert à 0 erreur ; 50 VU intermittent (timeouts ou p99 hors seuil) avec deux workers et encore rouge à 0,56 % avec quatre workers. La limite stable démontrée est 10 VU sur `/api/health/ping`.
- Dépendances frontend : Sentry, DOMPurify, next-intl, UUID, PostCSS et Next 14 ont été mis à jour dans leurs lignes compatibles. Tests, types, lint et build staging sont verts ; l'audit production ne contient plus de vulnérabilité critique.

## Versions d'outillage

- Modal CLI locale : `1.5.4`.
- Vercel CLI globale : `59.0.0`.
- Railway CLI globale : `5.38.0`.
- Stripe CLI globale : `1.50.0`.
- Supabase CLI locale : `2.114.0`.

Les CLI Supabase, Stripe et Vercel ont été mises à jour avant les dernières opérations staging.
