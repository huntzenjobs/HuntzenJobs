# Inventaire production et préproduction

**Date du snapshot :** 14 août 2026
**Branche de travail :** `codex/stripe-stabilization`
**Commit distant backend testé :** `072aa7db68b535fd336ca0f0fb2f58a90d049921`
**Révision candidate validée en CI :** `072aa7db68b535fd336ca0f0fb2f58a90d049921`
**Confidentialité :** aucune valeur de secret n'est conservée dans ce document.

## Résumé

Une préproduction isolée existe désormais sur Supabase, Railway, Redis, Vercel et Modal, sans copie des données de production ni secret Stripe Live. La branche Supabase persistante a reçu les 128 migrations locales et son journal local/distant est identique. Le backend Railway et le worker ARQ servent le candidat exact `072aa7d`; le frontend Vercel est `READY` sur le même code frontend validé et Modal reste tagué `840bdfa`, aucun de ces deux composants n'étant touché par les derniers commits backend. La CI canonique du candidat passe entièrement, y compris l'image Docker. Le frontend staging et le backend répondent `200`. Le domaine `staging.huntzenjobs.com` possède un certificat Vercel valide. La livraison email staging est verte via l'expéditeur sandbox et le sink Resend ; le transfert des domaines reste un gate de marque avant production. Le timeout réel Modal est prouvé ; l'alerte budget reste à configurer. À 50 VU, une relance sur un candidat applicativement équivalent pour le chemin public a reproduit 0,88 % de timeouts malgré des p95/p99 rapides.

## Plateformes

| Service | Production observée | Staging observé | État / preuve |
|---|---|---|---|
| Supabase | Projet HuntZen `ngiakfikbuyugqfqtfwp`, région Europe Ouest, PostgreSQL 17 | Branche persistante `staging`, ref `cxkpbciubsvopgxakgbj`, sans copie des données | 128 migrations présentes ; historique local/distant identique et lint DB sans erreur ni warning. Vercel utilise une clé `sb_publishable`; backend et worker utilisent uniquement la clé nommée `staging_backend_20260814`, l'ancienne clé serveur ayant été supprimée. Le mot de passe PostgreSQL/pooler a été tourné une seconde fois puis propagé à Railway et Modal. Les 8 tests RLS/ACL avec deux identités synthétiques passent. |
| Stripe | Mode Live, un endpoint Railway actif | Sandbox Test HuntZen, catalogue dédié, endpoint webhook staging distinct | Un seul endpoint Test est actif sur l'URL canonique `https://api-staging.huntzenjobs.com/api/stripe/webhook`, avec les cinq événements requis. L'E2E synthétique Checkout/paiement/ledger/impayé/résiliation/réactivation est vert. Le dry-run final contient 1 abonnement synchronisé, 0 divergence active et 5 abonnements annulés historiques. Deux fixtures génériques actives ont été annulées en Test. Aucun objet Live modifié. |
| Railway | Backend public version `3.0.0`, health `ok` | Environnement `staging`; backend `ravishing-reprieve` (`3b0649c3-ba80-48fe-beed-92d8c62c6b0e`), worker `respectful-rebirth` (`9a3dc9d5-6197-4709-9d50-0960d5a9bef4`) | Backend et worker issus de l'archive exacte `072aa7d`, tous deux `SUCCESS`. Backend à 2 réplicas, runtime `/health` `200` avec Redis `ok`; la fausse section autoscaling ignorée par Railway a été retirée et son absence est testée. Le worker charge sept fonctions. Le palier final 10 VU produit 618 requêtes, 0 erreur, p95 109,34 ms et p99 155,18 ms. La relance 50 VU sur `3acb81c` reste rouge à 0,88 % de timeouts sans saturation CPU/mémoire ni 5xx Railway. |
| Vercel | Projet `frontend-next` de l'équipe `huntzen-jobs` | Custom Environment `staging`; déploiement `dpl_F2kGBLdMXpPHxxU8Eaj2PPDWNQR3`; domaine `staging.huntzenjobs.com` | Le déploiement est `READY`, aliasé et protégé par SSO. `CRON_SECRET` sensible est synchronisé avec Railway ; deux appels authentifiés au cron outbox passent et le second est dédupliqué. Next.js 16.3.1/React 19.2.8/Serwist 9.5.12 sont actifs ; le worker ne met en cache aucune API, réponse authentifiée ou origine externe, ne contient aucun chunk `_next`, n'émet aucun cookie et son précache est borné à 12 ressources publiques. |
| Redis / ARQ | Redis production Railway observé `Online` | Redis dédié `Redis-SU2L` `Online`; service ARQ `respectful-rebirth`, un seul réplica | Le cron minute produit un `job_id` stable et le second appel de la fenêtre est dédupliqué. Le replay final traite l'effet restant en 3,51 s avec `claimed=1`, `succeeded=1`, `retried=0`, `dead=0`. L'outbox finit avec zéro effet actif et zéro dead-letter ; neuf fixtures historiques sont conservées en `superseded` avec un motif explicite. |
| Modal | Deux applications historiques déployées | Environnement `staging` séparé ; application canonique `huntzen-cv-processor-staging` (`ap-YwrHEsOHrHU6OjULV692NK`), version `v4`, tag `840bdfa`, secret staging, Proxy Token et clé Groq dédiée expirant le 11 novembre 2026 | Texte et PDF privé signé passent à `completed`; PDF corrompu à `failed`; PDF >10 Mio est refusé avant traitement. Deux replays réels d'une ligne `completed` la laissent strictement inchangée. Une sonde éphémère sans secret ni donnée a été annulée par Modal exactement au timeout configuré de 10 s. Après déploiement, le proxy authentifié renvoie `422` sur un payload vide et les nouveaux logs ne contiennent plus l'avertissement d'interface Modal bloquante. Toutes les données synthétiques sont nettoyées. |
| Sentry | Organisation `huntzen`, projet historique `javascript-nextjs` | Projet séparé `huntzen-staging` | DSN injecté uniquement en staging. Le passage contrôlé en dead-letter a exécuté l'appel Sentry depuis le worker ; les logs ne montrent aucune erreur d'envoi. |
| Resend | L'ancien compte contient déjà `huntzenjobs.com`, `.fr`, `.co` et `.eu` vérifiés | Barrière email staging publiée ; clé `sending_access` et expéditeur `HuntZen Staging <onboarding@resend.dev>` sur backend et worker | Les wrappers applicatifs backend et worker livrent réellement vers `delivered@resend.dev`. Aucun email client n'est envoyé. Le transfert des quatre domaines exige toujours Resend Pro avant l'expéditeur de marque ; abonnement autorisé mais paiement reporté jusqu'à disponibilité de la carte du responsable. |
| GitHub Actions | Workflow historique dupliqué et permissif | Workflow canonique unique `CI/CD Pipeline` | Run [`31828914989`](https://github.com/huntzenjobs/HuntzenJobs/actions/runs/31828914989) vert sur le SHA exact `072aa7d` : Backend, Frontend et image backend. Node 24, Ruff 0.16.3 et actions compatibles Node 24 sont verrouillés ; aucun échec n'est masqué et aucun test Playwright n'est exécuté. |

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

1. Dès que la carte du responsable est disponible, souscrire Resend Pro puis revendiquer uniquement les quatre domaines HuntZen via OVH, sans suppression préalable ; remplacer ensuite l'expéditeur sandbox staging par l'expéditeur de marque et revalider vers `delivered@resend.dev` uniquement.
2. Configurer l'alerte budget Modal dans le Dashboard authentifié ; timeout réel, normal, corrompu, trop lourd et replay durable sont validés.
3. Le palier Railway 50 VU reste non reproductible : la relance du candidat exact atteint 0,88 % de timeouts pour un seuil `< 0,5 %`, malgré p95 115 ms et p99 133 ms. Conserver 10 VU comme capacité strictement démontrée et diagnostiquer la couche réseau/proxy avant une nouvelle montée.
4. Rejouer immédiatement avant production le préflight `user_notifications`. Au snapshot du 14 août : 21 lignes, 49 152 octets avec index, 0 notification `payment_failed`, 0 doublon, 0 verrou en attente et index forward absent ; la création non concurrente est donc de faible risque sur ce volume observé.

## Validation locale avant staging

- Backend : 192 tests réussis et 12 tests PostgreSQL staging ignorés en CI faute de variables staging ; 7 warnings historiques. La suite comprend la sécurité et la durabilité Modal, les contrats de démarrage Gunicorn/Railway, de journalisation du health ping, l'indépendance des alertes admin outbox et le contrat CI.
- Ruff canonique : aucune erreur sur `backend/src`, `backend/tests` et `scripts/deployment`, avec Ruff verrouillé en `0.16.3`.
- Frontend : 320 tests Vitest réussis dans 34 fichiers.
- TypeScript : `npx tsc --noEmit` réussi.
- Build Next.js : réussi avec injection temporaire des variables locales, sans les copier dans le worktree.
- ESLint : 0 erreur et exactement 102 warnings historiques ; la commande échoue désormais dès qu'un avertissement supplémentaire est introduit.
- CI distante : le workflow unique utilise les vrais répertoires, installe les dépendances verrouillées, publie les rapports JUnit et construit réellement l'image backend. Le run `31828914989` est vert sur `072aa7d` : Backend, Frontend et image backend réussissent, avec TypeScript, ESLint, build Next.js 16/Turbopack, Ruff et Docker verts.
- PostgreSQL local : indisponible car le daemon Docker n'est pas actif. La chaîne a cependant été appliquée sur la base PostgreSQL staging réelle ; 128 migrations sont enregistrées et alignées avec le dépôt.
- Lint PostgreSQL staging : zéro erreur au niveau `error`. Le contrôle catalogue confirme zéro table publique sans RLS et zéro fonction `SECURITY DEFINER` exécutable par `anon`.
- RLS admin vérifiée sous rôle `authenticated`; appels techniques vérifiés avec le format `request.jwt.claims` PostgREST actuel; usurpation d'un autre UUID refusée.
- Les deux paramètres PostgREST du cron cleanup ont été alignés sur leurs signatures (`p_retention_days`, `p_days_old`).
- Dette restante : les événements pré-authentification (échec login/OAuth) doivent passer par une route serveur rate-limitée; la RPC `anon` ne sera pas rouverte.
- Storage CV staging : bucket privé, aucun privilège `anon` sur `cv_analyses`, trois policies Storage propriétaires `authenticated` uniquement et quatre tests unitaires du chemin privé/signé verts.
- Modal staging : application et secrets séparés, proxy auth réel vérifié, texte et PDF signé synthétiques `completed`, PDF corrompu `failed`, callbacks et nettoyages verts. La version `v4` taguée `840bdfa` répond `422` au payload vide et utilise le spawn asynchrone sans nouvel `AsyncUsageWarning`.
- Auth staging : Google OAuth réel vert après correction du trigger legacy ; invariant couvert par un test unitaire de migration et confirmé dans le catalogue PostgreSQL (un seul trigger sur `auth.users`).
- Sentry staging : projet séparé créé ; 4 tests prouvent le tag `staging` et le masquage Replay. Un dead-letter contrôlé a déclenché l'appel Sentry du worker sans erreur d'envoi observée.
- Resend staging : 2 tests unitaires de sécurité email et les suites email/Stripe/recruteur réussissent ; Ruff ciblé vert. La clé staging est active sur backend et worker, l'expéditeur sandbox est forcé et deux livraisons réelles via le wrapper applicatif atteignent le sink Resend. Le transfert du domaine ne bloque plus les tests staging, seulement l'expéditeur de marque avant production.
- Groq : Sentry production a exposé l'ancien modèle Llama 4 Scout retiré. Le candidat aligne maintenant les noms documentés `FAST_MODEL`/`PRIMARY_MODEL` avec Pydantic et utilise les remplaçants officiels `openai/gpt-oss-20b`/`openai/gpt-oss-120b`. Une clé dédiée à Modal/Railway staging a été créée avec expiration au 11 novembre 2026 ; aucune clé production n'a été réutilisée.
- Alignement staging : Vercel `READY` sur `dpl_F2kGBLdMXpPHxxU8Eaj2PPDWNQR3`; backend Railway `3b0649c3-ba80-48fe-beed-92d8c62c6b0e` et worker `9a3dc9d5-6197-4709-9d50-0960d5a9bef4` sur `072aa7d`; Modal canonique inchangé et tagué `840bdfa`. Health `200`, Redis `ok`, zéro 5xx observé et tâche outbox présente.
- Stripe Test : CLI mise à jour et authentifiée sans clé Live ; un seul endpoint canonique actif. Les cinq types d'événements ont été émis en ordre inversé. Les payloads génériques étrangers au modèle HuntZen sont refusés/classés en échec sans créer de droits ; `invoice.payment_failed` et un `invoice.paid` sans projection applicable sont finalisés.
- Stripe Test E2E : un compte Supabase synthétique a créé un Checkout Starter via l'API réelle. Paiement Test, projection, ledger, résiliation idempotente, réactivation et impayé ont été vérifiés. L'ordre `subscription.updated(past_due)` avant `invoice.payment_failed` a produit un test rouge, puis les migrations forward `20260813224640` et `20260814083310` ont rendu le test vert avec deux effets et une notification unique par facture. Les objets synthétiques ont été nettoyés.
- Rotation Supabase staging : backend, worker et Vercel utilisent les clés modernes ; les clés API JWT legacy sont désactivées et la signature HS256 précédente est révoquée. Un compte synthétique créé via la clé secrète moderne s'est connecté via la clé publique moderne, puis a été supprimé.
- Capacité publique staging : sur le candidat final `072aa7d`, 10 VU produit 618 requêtes à 40,63 RPS, 0 erreur, p95 109,34 ms, p99 155,18 ms et max 178,11 ms. Sur `3acb81c`, 50 VU produit 2 589 requêtes à 169,60 RPS, p95 115,11 ms et p99 132,99 ms, mais 23 timeouts (0,88 %). La limite strictement reproductible reste donc 10 VU sur `/api/health/ping`.
- Dépendances frontend : migration achevée vers Next.js 16.3.1, React 19.2.8 et Serwist 9.5.12 ; tests, types, lint et builds Vercel/standalone sont verts. `npm audit` retourne zéro vulnérabilité.

## Versions d'outillage

- Modal CLI locale : `1.5.4`.
- Vercel CLI globale : `59.0.0`.
- Railway CLI globale : `5.38.0`.
- Stripe CLI globale : `1.50.0`.
- Supabase CLI locale : `2.114.0`.

Les CLI Supabase, Stripe et Vercel ont été mises à jour avant les dernières opérations staging.
